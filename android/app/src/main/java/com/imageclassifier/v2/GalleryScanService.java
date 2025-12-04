package com.imageclassifier.v2;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Log;
import android.graphics.BitmapFactory;
import android.graphics.Bitmap;
import android.graphics.Matrix;
import java.io.ByteArrayOutputStream;

import androidx.exifinterface.media.ExifInterface;

import java.io.InputStream;
import java.io.IOException;
import java.io.FileInputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import com.imageclassifier.v2.database.ImageDataService;
import com.imageclassifier.v2.database.ImageDatabaseHelper;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import java.io.OutputStream;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * 原生相册扫描服务
 * 实现漏斗式处理：目录扫描 -> 文件比对 -> 截图检测 -> 远端缓存查询 -> 远程推理
 */
public class GalleryScanService {
    private static final String TAG = "GalleryScanService";
    
    private final ReactApplicationContext reactContext;
    private final Context context;
    private final ImageDataService imageDataService;
    private final MediaStoreModule mediaStoreModule;
    private final ExecutorService executorService;
    private final Handler mainHandler;
    
    // 扫描状态
    private String currentScanId = null;
    private int totalFoundThisPhase = 0; // 当前阶段需要处理的图片总数（阶段级变量）
    private int processedThisPhase = 0; // 当前阶段已处理的图片数量（阶段级变量）
    
    // 全局扫描统计变量（在整个扫描任务期间共享，所有阶段都会使用）
    private int totalImagesToBeClassified = 0; // 这次扫描任务一共需要分类的图片总数
                                                      // 在startScan中计算后，在整个扫描任务结束前都不会发生变化
    private int imagesClassified = 0; // 目前已经分类成功的图片数量（整个扫描过程累加）
                                            // 在各个阶段（截图检测、缓存查询、远程推理）中累加
    
    public GalleryScanService(ReactApplicationContext reactContext) {
        this.reactContext = reactContext;
        this.context = reactContext.getApplicationContext();
        this.imageDataService = new ImageDataService(context);
        this.mediaStoreModule = new MediaStoreModule(reactContext);
        this.executorService = Executors.newFixedThreadPool(Runtime.getRuntime().availableProcessors());
        this.mainHandler = new Handler(Looper.getMainLooper());
    }
    
    /**
     * 扫描启动结果
     */
    public static class ScanStartResult {
        public String scanId;
        public int totalImagesToBeClassified;
        
        public ScanStartResult(String scanId, int totalImagesToBeClassified) {
            this.scanId = scanId;
            this.totalImagesToBeClassified = totalImagesToBeClassified;
        }
    }
    
    /**
     * 启动扫描
     * 同步执行阶段1（目录扫描）和阶段2（文件比对），返回总数量
     * 然后在后台线程执行后续阶段（截图检测、缓存查询、远程推理）
     * 
     * @param scanPaths 扫描路径列表（相对路径，如 "DCIM/Camera"）
     * @param compareLimit 文件比对限制（0表示不限制）
     *                     用于阶段2：限制参与文件比对的图片数量
     *                     用途：性能优化，在扫描大量图片时只比对最新的图片
     *                     逻辑：按时间排序后取最新的N张进行比对
     *                     示例：compareLimit=100 表示只比对最新的100张图片（快速测试）
     *                           compareLimit=1000 表示只比对最新的1000张图片（正常使用）
     *                           compareLimit=0 表示比对所有图片（完整扫描）
     * @param remoteApiUrl 远程推理API地址
     * @param cacheApiUrl 远端缓存API地址
     * @return 扫描启动结果（包含scanId和totalImagesToBeClassified）
     */
    public ScanStartResult startScan(List<String> scanPaths, int compareLimit, String remoteApiUrl, String cacheApiUrl) {
        currentScanId = "scan_" + System.currentTimeMillis();
        
        // 重置扫描状态计数器
        totalFoundThisPhase = 0;
        processedThisPhase = 0;
        totalImagesToBeClassified = 0;
        imagesClassified = 0;
        
        // 阶段1: 目录扫描（扫描所有图片，不限制）
        Log.d(TAG, "阶段1: 开始目录扫描");
        List<ImageInfo> allImages = scanDirectories(scanPaths);
        totalFoundThisPhase = allImages.size();
        Log.d(TAG, "阶段1完成: 发现 " + totalFoundThisPhase + " 张图片");
        
        // 阶段2: 文件比对
        Log.d(TAG, "阶段2: 开始文件比对");
        ComparisonResult comparisonResult = compareWithDatabase(allImages, compareLimit);
        List<ImageInfo> newImages = comparisonResult.newImages;
        List<String> deletedUris = comparisonResult.deletedUris;
        
        Log.d(TAG, "阶段2完成: 新增 " + newImages.size() + " 张，删除 " + deletedUris.size() + " 张");
        
        // 删除已删除的图片
        if (!deletedUris.isEmpty()) {
            imageDataService.removeImagesByUris(deletedUris);
        }
        
        // 查询数据库中分类为NA的照片（上次遗留下来没有分类完成的照片）
        List<Map<String, Object>> naImagesMap = imageDataService.getImagesByCategory("NA");
        int naCount = naImagesMap != null ? naImagesMap.size() : 0;
        
        // 🔥 将 NA 分类的图片转换为 ImageInfo 列表（用于缓存查询阶段）
        List<ImageInfo> naImages = new ArrayList<>();
        if (naImagesMap != null && !naImagesMap.isEmpty()) {
            for (Map<String, Object> imageMap : naImagesMap) {
                ImageInfo imageInfo = new ImageInfo();
                imageInfo.uri = (String) imageMap.get("uri");
                imageInfo.fileName = (String) imageMap.get("fileName");
                imageInfo.path = (String) imageMap.get("path");
                // id 字段在数据库中可能是 String 或 Long，需要转换为 String
                Object idObj = imageMap.get("id");
                if (idObj != null) {
                    imageInfo.id = idObj instanceof String ? (String) idObj : String.valueOf(idObj);
                }
                naImages.add(imageInfo);
            }
            Log.d(TAG, "查询到 " + naCount + " 张 NA 分类图片，将在缓存查询阶段处理");
        }
        
        // 计算总数量：新增照片 + 数据库中分类为NA的照片
        totalImagesToBeClassified = newImages.size() + naCount;
        
        Log.d(TAG, "总数量计算: 新增 " + newImages.size() + " 张 + NA分类 " + naCount + " 张 = 总计 " + totalImagesToBeClassified + " 张");
        
        // 在后台线程执行后续扫描阶段
        // 注意：newImages 进入完整流程（截图检测 -> 缓存查询 -> 远程推理）
        //      naImages 只进入缓存查询阶段（跳过截图检测）
        final List<ImageInfo> finalNaImages = naImages; // 需要在 lambda 中使用，需要 final
        executorService.execute(() -> {
            try {
                performScan(currentScanId, newImages, finalNaImages, remoteApiUrl, cacheApiUrl);
            } catch (Exception e) {
                Log.e(TAG, "扫描过程发生错误", e);
                sendErrorEvent(currentScanId, "扫描失败: " + e.getMessage());
            }
        });
        
        return new ScanStartResult(currentScanId, totalImagesToBeClassified);
    }
    
    /**
     * 执行扫描流程（后续阶段）
     * 从阶段3开始：截图检测 -> 远端缓存查询 -> 远程推理
     * @param scanId 扫描ID
     * @param newImages 新增图片（需要完整流程：截图检测 -> 缓存查询 -> 远程推理）
     * @param naImages NA分类图片（只需要缓存查询 -> 远程推理，跳过截图检测）
     * @param remoteApiUrl 远程推理API地址
     * @param cacheApiUrl 缓存查询API地址
     */
    private void performScan(String scanId, List<ImageInfo> newImages, List<ImageInfo> naImages,
                            String remoteApiUrl, String cacheApiUrl) {
        long scanStartTime = System.currentTimeMillis();
        Log.d(TAG, "开始后续扫描阶段: " + scanId + ", 新增图片: " + newImages.size() + " 张, NA分类图片: " + (naImages != null ? naImages.size() : 0) + " 张");
        
        try {
            // 阶段3a: 截图检测（只处理新增图片，NA分类图片跳过此阶段）
            List<ImageInfo> naImagesAfterScreenshot = new ArrayList<>();
            if (!newImages.isEmpty()) {
                // 注意：进度事件在 detectScreenshots 函数内部发送（开始和完成事件）
                naImagesAfterScreenshot = detectScreenshots(newImages, remoteApiUrl);
                Log.d(TAG, "阶段3a完成: 检测完成，剩余待处理: " + naImagesAfterScreenshot.size() + " 张");
                
                // 等待一小段时间，确保阶段3a的完成事件先被处理（避免事件顺序混乱）
                try {
                    Thread.sleep(50); // 50ms延迟，确保事件顺序
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            } else {
                Log.d(TAG, "阶段3a: 没有新增图片，跳过截图检测");
            }
            
            // 阶段3b: 远端缓存查询
            // 合并新增图片（经过截图检测后）和 NA 分类图片一起进行缓存查询
            List<ImageInfo> imagesForCacheQuery = new ArrayList<>();
            imagesForCacheQuery.addAll(naImagesAfterScreenshot);
            if (naImages != null && !naImages.isEmpty()) {
                imagesForCacheQuery.addAll(naImages);
                Log.d(TAG, "合并 NA 分类图片到缓存查询: " + naImages.size() + " 张");
            }
            
            if (imagesForCacheQuery.isEmpty()) {
                Log.d(TAG, "扫描完成: 没有图片需要缓存查询");
                completeScan(scanId);
                return;
            }
            
            // 注意：进度事件在 queryRemoteCache 函数内部发送（开始和完成事件）
            CacheResult cacheResult = queryRemoteCache(imagesForCacheQuery, cacheApiUrl);
            Log.d(TAG, "阶段3b完成: 缓存命中 " + cacheResult.hitCount + " 张");
            
            // 等待一小段时间，确保阶段3b的完成事件先被处理（避免事件顺序混乱）
            try {
                Thread.sleep(50); // 50ms延迟，确保事件顺序
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            
            // 阶段3c: 远程推理
            // 注意：进度事件在 performRemoteInference 函数内部发送，确保消息能正确显示
            RemoteInferenceResult inferenceResult = performRemoteInference(cacheResult.naImages, remoteApiUrl);
            Log.d(TAG, "阶段3c完成: 推理成功 " + inferenceResult.successCount + " 张");
            
            // 扫描完成
            completeScan(scanId);
            
        } catch (Exception e) {
            Log.e(TAG, "扫描过程发生错误", e);
            sendErrorEvent(scanId, "扫描失败: " + e.getMessage());
        }
    }
    
    /**
     * 阶段1: 目录扫描
     * 扫描所有图片，不限制数量
     */
    private List<ImageInfo> scanDirectories(List<String> scanPaths) {
        List<ImageInfo> images = new ArrayList<>();
        
        try {
            ContentResolver contentResolver = context.getContentResolver();
            String[] projection = new String[]{
                MediaStore.Images.Media._ID,
                MediaStore.Images.Media.DISPLAY_NAME,
                MediaStore.Images.Media.SIZE,
                MediaStore.Images.Media.DATE_TAKEN,
                MediaStore.Images.Media.DATE_MODIFIED,
                MediaStore.Images.Media.DATE_ADDED,
                MediaStore.Images.Media.WIDTH,
                MediaStore.Images.Media.HEIGHT,
                MediaStore.Images.Media.MIME_TYPE,
                MediaStore.Images.Media.DATA,
                MediaStore.Images.Media.RELATIVE_PATH
            };
            
            String sortOrder = MediaStore.Images.Media.DATE_TAKEN + " DESC";
            Cursor cursor = contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,
                null,
                sortOrder
            );
            
            if (cursor != null) {
                while (cursor.moveToNext()) {
                    
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID));
                    String displayName = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME));
                    long size = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE));
                    long dateTaken = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN));
                    long dateModified = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED));
                    long dateAdded = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED));
                    int width = cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH));
                    int height = cursor.getInt(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT));
                    String mimeType = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE));
                    String path = cursor.getString(cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA));
                    
                    int relativePathColumn = cursor.getColumnIndex(MediaStore.Images.Media.RELATIVE_PATH);
                    String relativePath = relativePathColumn >= 0 ? cursor.getString(relativePathColumn) : null;
                    
                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        id
                    );
                    
                    ImageInfo imageInfo = new ImageInfo();
                    imageInfo.id = String.valueOf(id);
                    
                    // 构建拼装URI：优先使用绝对路径（path），如果没有则使用相对路径（relativePath）
                    // 与MediaStoreModule保持一致
                    String filePath = null;
                    if (path != null && !path.isEmpty()) {
                        filePath = path;
                    } else if (relativePath != null && !relativePath.isEmpty()) {
                        filePath = relativePath;
                    }
                    
                    // 使用辅助函数构建拼装URI
                    imageInfo.uri = buildCombinedUri(contentUri.toString(), filePath);
                    
                    imageInfo.fileName = displayName;
                    imageInfo.path = path;
                    imageInfo.relativePath = relativePath;
                    imageInfo.size = size;
                    imageInfo.dateTaken = dateTaken;
                    imageInfo.dateModified = dateModified * 1000; // 转换为毫秒
                    imageInfo.dateAdded = dateAdded * 1000; // 转换为毫秒
                    imageInfo.width = width;
                    imageInfo.height = height;
                    imageInfo.mimeType = mimeType;
                    
                    // 🔍 调试日志：记录尺寸为 0 的情况
                    if (width <= 0 || height <= 0) {
                        Log.w(TAG, "⚠️ MediaStore尺寸为0: fileName=" + displayName + ", width=" + width + ", height=" + height + ", uri=" + contentUri);
                    }
                    
                    // 路径过滤（如果指定了扫描路径）
                    if (scanPaths == null || scanPaths.isEmpty() || isPathMatched(imageInfo, scanPaths)) {
                        images.add(imageInfo);
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            Log.e(TAG, "目录扫描失败", e);
        }
        
        return images;
    }
    
    /**
     * 检查路径是否匹配扫描路径
     */
    private boolean isPathMatched(ImageInfo imageInfo, List<String> scanPaths) {
        if (scanPaths == null || scanPaths.isEmpty()) {
            return true;
        }
        
        String imagePath = imageInfo.relativePath != null ? imageInfo.relativePath : imageInfo.path;
        if (imagePath == null) {
            return false;
        }
        
        for (String scanPath : scanPaths) {
            if (imagePath.startsWith(scanPath) || imagePath.contains(scanPath)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 阶段2: 文件比对
     * 
     * compareLimit的作用：
     * - 当扫描到大量图片（如几万张）时，比对所有图片会很慢
     * - compareLimit限制只比对最新的N张图片（按时间排序）
     * - 这样可以快速识别新增的图片，而忽略旧图片的比对
     * - 用户通常只关心新增的图片，所以这个优化是合理的
     */
    private ComparisonResult compareWithDatabase(List<ImageInfo> scannedImages, int compareLimit) {
        ComparisonResult result = new ComparisonResult();
        result.newImages = new ArrayList<>();
        result.deletedUris = new ArrayList<>();
        
        try {
            // 获取数据库中的现有URI
            Set<String> existingUris = getExistingImageUris();
            
            // 限制比对数量（如果设置了限制）
            // 注意：scannedImages已经按DATE_TAKEN DESC排序，所以最新的在前面
            List<ImageInfo> imagesToCompare = scannedImages;
            if (compareLimit > 0 && scannedImages.size() > compareLimit) {
                // 只比对最新的compareLimit张图片（已经按时间倒序排列）
                imagesToCompare = new ArrayList<>(scannedImages.subList(0, compareLimit));
                Log.d(TAG, "比对限制生效: 扫描到 " + scannedImages.size() + " 张，只比对最新的 " + compareLimit + " 张");
            }
            
            // 找出新增的图片
            Set<String> currentUris = new HashSet<>();
            for (ImageInfo image : imagesToCompare) {
                currentUris.add(image.uri);
                if (!existingUris.contains(image.uri)) {
                    result.newImages.add(image);
                }
            }
            
            // 找出删除的图片
            for (String existingUri : existingUris) {
                if (!currentUris.contains(existingUri)) {
                    result.deletedUris.add(existingUri);
                }
            }
            
            result.newCount = result.newImages.size();
            result.deletedCount = result.deletedUris.size();
            
        } catch (Exception e) {
            Log.e(TAG, "文件比对失败", e);
        }
        
        return result;
    }
    
    /**
     * 从数据库获取所有现有图片URI
     */
    private Set<String> getExistingImageUris() {
        Set<String> uris = new HashSet<>();
        
        try {
            // 使用ImageDataService查询
            List<String> uriList = imageDataService.getImageUris();
            uris.addAll(uriList);
        } catch (Exception e) {
            Log.e(TAG, "获取现有URI失败", e);
        }
        
        return uris;
    }
    
    /**
     * 阶段3a: 截图检测
     * 包含EXIF数据提取和截图检测
     * 使用批量保存优化性能
     * @param images 待检测的图片列表
     * @param baseApiUrl API基础URL（用于位置信息获取，可为null）
     * @return 分类为NA的图片列表（需要继续处理的图片）
     */
    private List<ImageInfo> detectScreenshots(List<ImageInfo> images, String baseApiUrl) {
        // 初始化阶段级统计变量
        processedThisPhase = 0;
        totalFoundThisPhase = images.size();
        Log.d(TAG, "阶段3a开始: 截图检测，待处理图片: " + totalFoundThisPhase + " 张");
        
        // 发送阶段开始进度事件
        if (totalFoundThisPhase > 0) {
            sendProgressEvent("screenshot_detection", 0, totalFoundThisPhase, currentScanId);
        }
        
        List<ImageInfo> naImages = new ArrayList<>();
        
        // 批量处理（每批100张，与JS层保持一致）
        int batchSize = 100;
        List<ImageDataWithExif> batchSaveData = new ArrayList<>();
        
        // 🔥 统计信息：跟踪尺寸获取情况
        int bitmapFactoryFallbackCount = 0; // 使用BitmapFactory降级方案的图片数量
        int noDimensionsCount = 0; // 最终仍然没有尺寸的图片数量
        
        for (int i = 0; i < images.size(); i++) {
            ImageInfo image = images.get(i);
            
            try {
                // 1. 提取EXIF数据（包括GPS坐标）
                ExifData exifData = extractExifData(image.uri);
                
                // 🔥 新增：如果EXIF没有尺寸，使用BitmapFactory作为降级方案
                if (exifData.dimensions == null || exifData.dimensions.width <= 0 || exifData.dimensions.height <= 0) {
                    ImageDimensions bitmapDimensions = getImageDimensionsWithBitmapFactory(image);
                    if (bitmapDimensions != null) {
                        exifData.dimensions = bitmapDimensions;
                        bitmapFactoryFallbackCount++;
                    } else {
                        // BitmapFactory也失败了，记录但没有详细日志（避免日志过多）
                        noDimensionsCount++;
                    }
                }
                
                // 注意：GPS位置查找（根据GPS坐标查找城市信息）保留在JS层实现
                // JS层在后续处理时会调用 enrichLocationInfoWithCity 来补充城市信息
                // 原生层只负责提取GPS坐标，不进行城市查找
                
                // 2. 使用EXIF数据优化截图检测
                boolean isScreenshot = isScreenshot(image, exifData);
                
                // 3. 收集数据，准备批量保存
                // 确定分类和置信度
                String category = isScreenshot ? "screenshot" : "NA";
                double confidence = isScreenshot ? 1.0 : 0.0;
                
                // 统计（只有分类有差异）
                if (isScreenshot) {
                    // 分类成功，累加计数器
                    imagesClassified++;
                } else {
                    naImages.add(image);
                }
                
                // 处理计数累加（每处理一张图片就累加）
                processedThisPhase++;
                
                // 数据存储逻辑统一（只有category和confidence值不同）
                ImageDataWithExif imageData = new ImageDataWithExif();
                imageData.image = image;
                imageData.category = category;
                imageData.confidence = confidence;
                imageData.exifData = exifData;
                batchSaveData.add(imageData);
                
                // 🔥 优化：定期保持线程活跃（每处理10张图片）
                // 1. 检查线程是否被中断
                if (Thread.currentThread().isInterrupted()) {
                    Log.w(TAG, "扫描线程被中断，停止处理");
                    break;
                }
                
                // 2. 短暂睡眠让线程进入可调度状态（比 Thread.yield() 更可靠）
                if (i % 10 == 0) {
                    SystemClock.sleep(1); // 1ms睡眠，让系统有机会调度
                }
                
                // 3. 更频繁的进度更新（每20张图片更新一次，而不是每100张）
                if (i % 20 == 0 && i > 0) {
                    sendProgressEvent("screenshot_detection", processedThisPhase, totalFoundThisPhase, currentScanId);
                }
                
                // 4. 批量保存（每批100张或最后一张）
                if (batchSaveData.size() >= batchSize || i == images.size() - 1) {
                    if (!batchSaveData.isEmpty()) {
                        batchSaveImages(batchSaveData, baseApiUrl);
                        batchSaveData.clear();
                    }
                    
                    // 发送进度更新（每处理一个批次就更新一次，与JS层保持一致）
                    sendProgressEvent("screenshot_detection", processedThisPhase, totalFoundThisPhase, currentScanId);
                }
                
            } catch (Exception e) {
                Log.e(TAG, "处理图片失败: " + image.uri, e);
                // 出错时也保存为NA
                naImages.add(image);
                ImageDataWithExif imageData = new ImageDataWithExif();
                imageData.image = image;
                imageData.category = "NA";
                imageData.confidence = 0.0;
                imageData.exifData = null;
                batchSaveData.add(imageData);
                // 处理计数累加（即使出错也算处理了）
                processedThisPhase++;
            }
        }
        
        // 保存最后剩余的批次（如果还有）
        if (!batchSaveData.isEmpty()) {
            batchSaveImages(batchSaveData, baseApiUrl);
        }
        
        // 🔥 输出统计信息
        Log.i(TAG, "📊 截图检测阶段统计: 总处理=" + images.size() + 
              ", BitmapFactory降级=" + bitmapFactoryFallbackCount + 
              ", 无尺寸=" + noDimensionsCount + 
              ", 剩余待处理=" + naImages.size());
        
        return naImages;
    }
    
    /**
     * 批量保存图片数据
     */
    /**
     * 批量保存图片数据到数据库
     * @param imageDataList 图片数据列表
     */
    private void batchSaveImages(List<ImageDataWithExif> imageDataList) {
        batchSaveImages(imageDataList, null);
    }
    
    /**
     * 批量保存图片数据到数据库（带位置信息获取）
     * @param imageDataList 图片数据列表
     * @param baseApiUrl API基础URL（用于位置信息获取，可为null）
     */
    private void batchSaveImages(List<ImageDataWithExif> imageDataList, String baseApiUrl) {
        try {
            List<Map<String, Object>> saveDataList = new ArrayList<>();
            
            for (ImageDataWithExif item : imageDataList) {
                Map<String, Object> imageData = new HashMap<>();
                imageData.put("uri", item.image.uri);
                imageData.put("fileName", item.image.fileName);
                imageData.put("category", item.category);
                imageData.put("confidence", item.confidence);
                // timestamp 使用图片的创建时间（优先 dateTaken，否则 dateModified 或 dateAdded）
                long timestamp = item.image.dateTaken > 0 ? item.image.dateTaken : 
                                 (item.image.dateModified > 0 ? item.image.dateModified : item.image.dateAdded);
                imageData.put("timestamp", timestamp);
                
                // 优先使用EXIF中的拍摄时间，如果没有则使用MediaStore的时间（如果有效）
                if (item.exifData != null && item.exifData.hasTakenTime && item.exifData.takenTime > 0) {
                    imageData.put("takenAt", item.exifData.takenTime);
                } else if (item.image.dateTaken > 0) {
                    // 只有当 dateTaken 有效时才设置，否则不设置（保持 null）
                    imageData.put("takenAt", item.image.dateTaken);
                }
                // 如果都没有有效时间，不设置 takenAt（保持 null），与 JS 层保持一致
                
                imageData.put("size", item.image.size);
                imageData.put("mimeType", item.image.mimeType);
                
                // 优先使用EXIF中的尺寸，如果没有则使用MediaStore的尺寸
                int finalWidth = 0;
                int finalHeight = 0;
                String dimensionSource = "unknown";
                if (item.exifData != null && item.exifData.dimensions != null) {
                    finalWidth = item.exifData.dimensions.width;
                    finalHeight = item.exifData.dimensions.height;
                    dimensionSource = "exifData.dimensions";
                } else {
                    finalWidth = item.image.width;
                    finalHeight = item.image.height;
                    dimensionSource = "MediaStore";
                }
                
                imageData.put("width", finalWidth);
                imageData.put("height", finalHeight);
                
                // 🔥 同时保存 imageDimensions 字段（JS层使用此字段）
                if (finalWidth > 0 && finalHeight > 0) {
                    Map<String, Object> imageDimensions = new HashMap<>();
                    imageDimensions.put("width", finalWidth);
                    imageDimensions.put("height", finalHeight);
                    imageData.put("imageDimensions", imageDimensions);
                }
                
                // 🔍 只记录有问题的情况（尺寸为0）
                if (finalWidth <= 0 || finalHeight <= 0) {
                    Log.w(TAG, "⚠️ 保存时尺寸为0: fileName=" + item.image.fileName + 
                          ", width=" + finalWidth + ", height=" + finalHeight + 
                          ", hasExifDimensions=" + (item.exifData != null && item.exifData.dimensions != null) +
                          ", MediaStoreWidth=" + item.image.width + ", MediaStoreHeight=" + item.image.height);
                }
                
                // GPS信息
                if (item.exifData != null && item.exifData.hasGPS && item.exifData.gps != null) {
                    imageData.put("latitude", item.exifData.gps.latitude);
                    imageData.put("longitude", item.exifData.gps.longitude);
                    if (item.exifData.gps.altitude != null) {
                        imageData.put("altitude", item.exifData.gps.altitude);
                    }
                }
                
                saveDataList.add(imageData);
            }
            
            // 如果有API URL，尝试批量获取位置信息并补全到saveDataList中
            if (baseApiUrl != null && !baseApiUrl.isEmpty()) {
                batchGetLocationInfo(baseApiUrl, saveDataList);
            }
            
            // 批量保存到数据库
            if (!saveDataList.isEmpty()) {
                imageDataService.writeImageDetailedInfo(saveDataList);
                Log.d(TAG, "批量保存完成: " + saveDataList.size() + " 张图片");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "批量保存图片失败", e);
        }
    }
    
    /**
     * 批量获取位置信息并补全到图片数据列表中（简化版本，仅调用远程API）
     * 直接修改传入的saveDataList，为有GPS坐标但没有位置信息的图片补全位置信息
     * @param baseApiUrl API基础URL
     * @param saveDataList 即将被存储的图片信息列表（会被直接修改，补全位置信息）
     */
    private void batchGetLocationInfo(String baseApiUrl, List<Map<String, Object>> saveDataList) {
        if (baseApiUrl == null || baseApiUrl.isEmpty() || saveDataList.isEmpty()) {
            return;
        }
        
        try {
            // 构建API URL
            String apiUrl = baseApiUrl;
            if (!apiUrl.endsWith("/")) {
                apiUrl += "/";
            }
            apiUrl += "api/v1/location/nearby-cities";
            
            // 找出有GPS坐标但没有位置信息的图片
            List<Map<String, Object>> imagesNeedingLocation = new ArrayList<>();
            for (Map<String, Object> imageData : saveDataList) {
                // 检查是否有GPS坐标
                Object latitudeObj = imageData.get("latitude");
                Object longitudeObj = imageData.get("longitude");
                if (latitudeObj == null || longitudeObj == null) {
                    continue;
                }
                
                // 检查是否已有位置信息
                Object city = imageData.get("city");
                Object country = imageData.get("country");
                if (city == null || country == null) {
                    imagesNeedingLocation.add(imageData);
                }
            }
            
            if (imagesNeedingLocation.isEmpty()) {
                return;
            }
            
            // 为每张图片查询位置信息（逐个查询，获取失败则留给JS层处理）
            for (Map<String, Object> imageData : imagesNeedingLocation) {
                Object latitudeObj = imageData.get("latitude");
                Object longitudeObj = imageData.get("longitude");
                
                if (latitudeObj == null || longitudeObj == null) {
                    continue;
                }
                
                double latitude;
                double longitude;
                try {
                    latitude = latitudeObj instanceof Number ? ((Number) latitudeObj).doubleValue() : Double.parseDouble(latitudeObj.toString());
                    longitude = longitudeObj instanceof Number ? ((Number) longitudeObj).doubleValue() : Double.parseDouble(longitudeObj.toString());
                } catch (Exception e) {
                    Log.w(TAG, "解析GPS坐标失败: " + imageData.get("uri"), e);
                    continue;
                }
                
                try {
                    Map<String, String> location = getLocationInfoFromApi(apiUrl, latitude, longitude);
                    if (location != null && !location.isEmpty()) {
                        // 直接将位置信息添加到imageData中
                        imageData.put("city", location.get("city"));
                        imageData.put("country", location.get("country"));
                        if (location.containsKey("province")) {
                            imageData.put("province", location.get("province"));
                        }
                    }
                } catch (Exception e) {
                    // 获取失败，不添加位置信息，留给JS层处理
                    Log.d(TAG, "获取位置信息失败: " + imageData.get("uri") + ", " + e.getMessage());
                }
            }
            
        } catch (Exception e) {
            Log.e(TAG, "批量获取位置信息失败", e);
        }
    }
    
    /**
     * 从API获取单个坐标的位置信息
     * @param apiUrl API完整URL
     * @param latitude 纬度
     * @param longitude 经度
     * @return 位置信息Map，包含city、country、province，如果获取失败返回null
     */
    private Map<String, String> getLocationInfoFromApi(String apiUrl, double latitude, double longitude) throws Exception {
        // 构建查询URL
        String queryUrl = apiUrl + "?latitude=" + latitude + "&longitude=" + longitude + "&limit=10&max_distance_km=50";
        
        URL url = new URL(queryUrl);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(5000); // 5秒连接超时
        connection.setReadTimeout(5000); // 5秒读取超时
        
        try {
            int responseCode = connection.getResponseCode();
            if (responseCode != HttpURLConnection.HTTP_OK) {
                throw new Exception("HTTP错误: " + responseCode);
            }
            
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            reader.close();
            
            // 解析JSON响应
            JSONArray citiesArray = new JSONArray(response.toString());
            
            if (citiesArray.length() == 0) {
                return null;
            }
            
            // 按人口排序，选择人口最多的城市
            JSONObject mainCity = null;
            int maxPopulation = 0;
            for (int i = 0; i < citiesArray.length(); i++) {
                JSONObject city = citiesArray.getJSONObject(i);
                int population = city.optInt("population", 0);
                if (population > maxPopulation) {
                    maxPopulation = population;
                    mainCity = city;
                }
            }
            
            if (mainCity == null) {
                return null;
            }
            
            // 提取城市信息
            String cityName = mainCity.optString("name_zh", mainCity.optString("name", ""));
            // 标准化城市名称：移除"市"后缀
            if (cityName.endsWith("市")) {
                cityName = cityName.substring(0, cityName.length() - 1);
            }
            
            Map<String, String> location = new HashMap<>();
            location.put("city", cityName);
            location.put("country", "中国"); // 默认中国
            location.put("province", mainCity.optString("name_zh", mainCity.optString("name", "")));
            
            return location;
            
        } finally {
            connection.disconnect();
        }
    }
    
    /**
     * 图片数据与EXIF数据组合类（用于批量保存）
     */
    private static class ImageDataWithExif {
        public ImageInfo image;
        public String category;
        public double confidence;
        public ExifData exifData;
    }
    
    /**
     * URI处理辅助函数
     */
    
    /**
     * 构建拼装URI格式：contentUri||filePath
     * 与JS层保持一致，JS层使用这种格式存储到数据库
     * @param contentUri Content URI字符串（如：content://media/external/images/media/123）
     * @param filePath 文件路径（绝对路径或相对路径），可以为null
     * @return 拼装后的URI字符串
     */
    private String buildCombinedUri(String contentUri, String filePath) {
        if (filePath != null && !filePath.isEmpty()) {
            return contentUri + "||" + filePath;
        }
        return contentUri;
    }
    
    /**
     * 解析拼装URI，提取contentUri部分
     * @param combinedUri 拼装URI（contentUri||filePath格式）或普通URI
     * @return contentUri字符串
     */
    private String extractContentUri(String combinedUri) {
        if (combinedUri == null || combinedUri.isEmpty()) {
            return null;
        }
        
        int separatorIndex = combinedUri.indexOf("||");
        if (separatorIndex >= 0) {
            // 提取contentUri部分（分隔符之前的部分）
            return combinedUri.substring(0, separatorIndex);
        }
        
        // 如果没有分隔符，检查是否是content:// URI
        if (combinedUri.startsWith("content://")) {
            return combinedUri;
        }
        
        return null;
    }
    
    /**
     * 解析拼装URI，提取filePath部分
     * @param combinedUri 拼装URI（contentUri||filePath格式）或普通URI
     * @return filePath字符串，如果没有则返回null
     */
    private String extractFilePath(String combinedUri) {
        if (combinedUri == null || combinedUri.isEmpty()) {
            return null;
        }
        
        int separatorIndex = combinedUri.indexOf("||");
        if (separatorIndex >= 0) {
            // 提取filePath部分（分隔符之后的部分）
            return combinedUri.substring(separatorIndex + 2);
        }
        
        return null;
    }
    
    /**
     * 将文件路径转换为file:// URI
     * @param filePath 文件路径（绝对路径或相对路径）
     * @return file:// URI字符串，如果路径无效则返回null
     */
    private String buildFileUri(String filePath) {
        if (filePath == null || filePath.isEmpty()) {
            return null;
        }
        
        // 如果已经是file:// URI，直接返回
        if (filePath.startsWith("file://")) {
            return filePath;
        }
        
        // 构建file:// URI
        return "file://" + filePath;
    }
    
    /**
     * 从拼装URI中提取file:// URI
     * @param combinedUri 拼装URI（contentUri||filePath格式）
     * @return file:// URI字符串，如果无法提取则返回null
     */
    private String extractFileUri(String combinedUri) {
        String filePath = extractFilePath(combinedUri);
        if (filePath != null) {
            return buildFileUri(filePath);
        }
        return null;
    }
    
    private ExifData extractExifData(String uriString) {
        ExifData exifData = new ExifData();
        exifData.uri = uriString;
        exifData.hasGPS = false;
        exifData.hasTakenTime = false;
        
        InputStream inputStream = null;
        try {
            // 使用辅助函数提取contentUri
            String contentUriString = extractContentUri(uriString);
            if (contentUriString == null) {
                Log.w(TAG, "无法提取contentUri: " + uriString);
                return exifData;
            }
            
            Uri uri = Uri.parse(contentUriString);
            ContentResolver contentResolver = context.getContentResolver();
            
            // Android 10+ 需要使用setRequireOriginal获取原始图片（包含完整EXIF）
            Uri originalUri = uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    originalUri = MediaStore.setRequireOriginal(uri);
                } catch (Exception e) {
                    Log.w(TAG, "无法获取原始图片，使用普通URI: " + e.getMessage());
                }
            }
            
            inputStream = contentResolver.openInputStream(originalUri);
            if (inputStream == null) {
                Log.w(TAG, "无法打开图片流: " + uriString);
                return exifData;
            }
            
            ExifInterface exif = new ExifInterface(inputStream);
            
            // 提取拍摄时间
            String dateTimeOriginal = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
            String dateTime = exif.getAttribute(ExifInterface.TAG_DATETIME);
            String dateTimeDigitized = exif.getAttribute(ExifInterface.TAG_DATETIME_DIGITIZED);
            
            if (dateTimeOriginal != null) {
                exifData.takenTime = parseExifDateTime(dateTimeOriginal);
                exifData.hasTakenTime = exifData.takenTime > 0;
            } else if (dateTime != null) {
                exifData.takenTime = parseExifDateTime(dateTime);
                exifData.hasTakenTime = exifData.takenTime > 0;
            } else if (dateTimeDigitized != null) {
                exifData.takenTime = parseExifDateTime(dateTimeDigitized);
                exifData.hasTakenTime = exifData.takenTime > 0;
            }
            
            // 提取GPS信息
            float[] latLong = new float[2];
            boolean hasGPS = exif.getLatLong(latLong);
            
            if (hasGPS) {
                exifData.gps = new GpsInfo();
                exifData.gps.latitude = latLong[0];
                exifData.gps.longitude = latLong[1];
                
                // 提取GPS高度
                double altitude = exif.getAltitude(0);
                if (altitude != 0) {
                    exifData.gps.altitude = altitude;
                }
                
                exifData.hasGPS = true;
            }
            
            // 提取图片尺寸（如果EXIF中有，优先使用EXIF的）
            int imageWidth = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0);
            int imageHeight = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0);
            if (imageWidth > 0 && imageHeight > 0) {
                exifData.dimensions = new ImageDimensions();
                exifData.dimensions.width = imageWidth;
                exifData.dimensions.height = imageHeight;
            }
            // 如果EXIF没有尺寸，不记录日志（避免日志过多，会在阶段结束时统计）
            
        } catch (IOException e) {
            Log.w(TAG, "读取EXIF失败: " + uriString, e);
        } catch (Exception e) {
            Log.w(TAG, "提取EXIF信息失败: " + uriString, e);
        } finally {
            if (inputStream != null) {
                try {
                    inputStream.close();
                } catch (IOException e) {
                    // 忽略关闭错误
                }
            }
        }
        
        return exifData;
    }
    
    /**
     * 解析EXIF日期时间格式 (yyyy:MM:dd HH:mm:ss) 为时间戳
     * EXIF日期时间字符串已经是拍摄时的本地时间，直接解析，不做时区转换
     */
    private long parseExifDateTime(String dateTimeStr) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
            // 不设置时区，使用系统默认时区直接解析（EXIF时间已经是本地时间）
            Date date = sdf.parse(dateTimeStr);
            return date != null ? date.getTime() : 0;
        } catch (Exception e) {
            Log.w(TAG, "解析EXIF日期失败: " + dateTimeStr);
            return 0;
        }
    }
    
    /**
     * 使用 BitmapFactory 获取图片尺寸（降级方案）
     * 当 EXIF 和 MediaStore 都没有尺寸时使用
     * @param image 图片信息
     * @return 图片尺寸，如果获取失败返回 null
     */
    private ImageDimensions getImageDimensionsWithBitmapFactory(ImageInfo image) {
        ImageDimensions dimensions = null;
        
        try {
            // 优先使用绝对路径
            String filePath = image.path;
            
            // 如果没有绝对路径，尝试从拼装URI中提取
            if (filePath == null || filePath.isEmpty()) {
                String uriString = image.uri;
                if (uriString != null && uriString.contains("||")) {
                    // 从拼装URI中提取文件路径（格式：content://...||/storage/...）
                    String[] parts = uriString.split("\\|\\|");
                    if (parts.length > 1) {
                        filePath = parts[1];
                    }
                }
            }
            
            if (filePath != null && !filePath.isEmpty()) {
                BitmapFactory.Options options = new BitmapFactory.Options();
                options.inJustDecodeBounds = true; // 只解码边界，不加载完整图片到内存
                BitmapFactory.decodeFile(filePath, options);
                
                if (options.outWidth > 0 && options.outHeight > 0) {
                    dimensions = new ImageDimensions();
                    dimensions.width = options.outWidth;
                    dimensions.height = options.outHeight;
                    // 不记录成功日志，避免日志过多（统计信息会在阶段结束时输出）
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "⚠️ BitmapFactory获取尺寸失败: " + image.fileName, e);
        }
        
        return dimensions;
    }
    
    /**
     * 压缩图片到指定大小（与 JS 层保持一致：1024x1024，质量 90%）
     * @param imageInputStream 原始图片输入流
     * @param maxSize 最大尺寸（宽或高的最大值），默认 1024
     * @param quality JPEG 压缩质量（0-100），默认 90
     * @return 压缩后的图片字节数组
     */
    private byte[] compressImage(InputStream imageInputStream, int maxSize, int quality) throws IOException {
        // 读取原始图片
        Bitmap originalBitmap = BitmapFactory.decodeStream(imageInputStream);
        if (originalBitmap == null) {
            throw new IOException("无法解码图片");
        }
        
        try {
            int originalWidth = originalBitmap.getWidth();
            int originalHeight = originalBitmap.getHeight();
            
            // 计算缩放比例，保持宽高比
            float scale = Math.min((float) maxSize / originalWidth, (float) maxSize / originalHeight);
            
            // 如果图片已经小于目标尺寸，不需要缩放
            if (scale >= 1.0f) {
                Log.d(TAG, "📷 图片尺寸 " + originalWidth + "x" + originalHeight + " 已小于 " + maxSize + "，无需压缩");
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                originalBitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream);
                return outputStream.toByteArray();
            }
            
            // 计算新尺寸
            int newWidth = Math.round(originalWidth * scale);
            int newHeight = Math.round(originalHeight * scale);
            
            Log.d(TAG, "📷 压缩图片: " + originalWidth + "x" + originalHeight + " -> " + newWidth + "x" + newHeight);
            
            // 缩放图片
            Bitmap scaledBitmap = Bitmap.createScaledBitmap(originalBitmap, newWidth, newHeight, true);
            
            try {
                // 压缩为 JPEG
                ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
                scaledBitmap.compress(Bitmap.CompressFormat.JPEG, quality, outputStream);
                byte[] compressedData = outputStream.toByteArray();
                
                Log.d(TAG, "✅ 压缩完成: 原始大小约 " + (originalWidth * originalHeight * 3 / 1024) + " KB -> 压缩后 " + (compressedData.length / 1024) + " KB");
                
                return compressedData;
            } finally {
                // 释放缩放后的 Bitmap
                if (scaledBitmap != originalBitmap) {
                    scaledBitmap.recycle();
                }
            }
        } finally {
            // 释放原始 Bitmap
            originalBitmap.recycle();
        }
    }
    
    /**
     * 检测是否为截图（使用EXIF数据优化）
     */
    private boolean isScreenshot(ImageInfo image, ExifData exifData) {
        // 规则0: 如果有GPS信息，直接判断不是截图（截图通常不会有GPS信息）
        if (exifData != null && exifData.hasGPS) {
            return false;
        }
        
        String fileName = image.fileName != null ? image.fileName.toLowerCase() : "";
        String path = (image.relativePath != null ? image.relativePath : image.path);
        path = path != null ? path.toLowerCase() : "";
        
        // 规则1: 文件名包含截图关键词
        if (fileName.contains("screenshot") || fileName.contains("截图") || fileName.contains("screen")) {
            return true;
        }
        
        // 规则2: 路径包含截图关键词
        if (path.contains("screenshot") || path.contains("截图")) {
            return true;
        }
        
        // 规则3: 宽高比 <= 0.5（手机竖屏比例）
        // 优先使用EXIF中的尺寸，如果没有则使用MediaStore的尺寸
        int width = image.width;
        int height = image.height;
        if (exifData != null && exifData.dimensions != null) {
            width = exifData.dimensions.width;
            height = exifData.dimensions.height;
        }
        
        if (width > 0 && height > 0) {
            double aspectRatio = (double) width / height;
            if (aspectRatio <= 0.5) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * 阶段3b: 远端缓存查询
     * 注意：当缓存命中并分类成功时，需要累加 imagesClassified 计数器
     * 优化：按100张图片分批处理，每批：计算Hash -> 远程查询 -> 保存结果
     */
    private CacheResult queryRemoteCache(List<ImageInfo> naImages, String cacheApiUrl) {
        // 初始化阶段级统计变量
        processedThisPhase = 0;
        totalFoundThisPhase = naImages.size();
        Log.d(TAG, "阶段3b开始: 远端缓存查询，待处理图片: " + totalFoundThisPhase + " 张");
        
        // 发送阶段开始进度事件
        if (totalFoundThisPhase > 0) {
            sendProgressEvent("cache_check", 0, totalFoundThisPhase, currentScanId);
        }
        
        CacheResult result = new CacheResult();
        result.hitImages = new ArrayList<>();
        result.naImages = new ArrayList<>();
        result.hitCount = 0;
        
        if (cacheApiUrl == null || cacheApiUrl.isEmpty() || naImages.isEmpty()) {
            // 没有缓存API或没有待处理图片，直接返回
            result.naImages = naImages;
            return result;
        }
        
        try {
            // 按100张图片分批处理
            int batchSize = 100;
            int totalBatches = (naImages.size() + batchSize - 1) / batchSize;
            
            for (int batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                // 🔥 优化：定期保持线程活跃
                // 1. 检查线程是否被中断
                if (Thread.currentThread().isInterrupted()) {
                    Log.w(TAG, "扫描线程被中断，停止处理");
                    break;
                }
                
                // 2. 短暂睡眠让线程进入可调度状态（比 Thread.yield() 更可靠）
                if (batchIndex > 0) {
                    SystemClock.sleep(5); // 5ms睡眠，让系统有机会调度
                }
                
                int startIndex = batchIndex * batchSize;
                int endIndex = Math.min(startIndex + batchSize, naImages.size());
                List<ImageInfo> batchImages = naImages.subList(startIndex, endIndex);
                
                Log.d(TAG, "处理批次 " + (batchIndex + 1) + "/" + totalBatches + "，图片数量: " + batchImages.size());
                
                // 步骤1: 计算当前批次的Hash
                Map<String, List<String>> hashToUriMap = new HashMap<>(); // Hash -> URI列表的MAP（支持一个Hash对应多个URI）
                Map<String, String> uriToHashMap = new HashMap<>(); // URI -> Hash的MAP
                
                // 提取URI列表
                List<String> uriList = new ArrayList<>();
                for (ImageInfo image : batchImages) {
                    String contentUri = extractContentUri(image.uri);
                    if (contentUri != null) {
                        uriList.add(contentUri);
                    } else {
                        uriList.add(image.uri);
                    }
                }
                
                // 调用MediaStoreModule的批量计算方法
                List<MediaStoreModule.HashResult> hashResults = mediaStoreModule.batchCalculateHashesInternal(uriList);
                
                // 构建Hash到URI的MAP和URI到Hash的MAP
                for (int i = 0; i < hashResults.size() && i < batchImages.size(); i++) {
                    MediaStoreModule.HashResult hashResult = hashResults.get(i);
                    ImageInfo image = batchImages.get(i);
                    String imageUri = image.uri;
                    
                    if (hashResult.success && hashResult.hash != null && !hashResult.hash.isEmpty()) {
                        String hash = hashResult.hash;
                        
                        // 构建Hash到URI的MAP（支持一个Hash对应多个URI）
                        hashToUriMap.computeIfAbsent(hash, k -> new ArrayList<>()).add(imageUri);
                        uriToHashMap.put(imageUri, hash);
                    } else {
                        // 哈希计算失败，直接加入未命中列表
                        result.naImages.add(image);
                        processedThisPhase++;
                    }
                }
                
                // 从hashToUriMap的keySet获取去重后的哈希值列表用于查询
                List<String> validHashes = new ArrayList<>(hashToUriMap.keySet());
                
                if (validHashes.isEmpty()) {
                    Log.d(TAG, "批次 " + (batchIndex + 1) + " 没有有效的哈希值，跳过缓存查询");
                    continue;
                }
                
                // 步骤2: 远程查询缓存
                try {
                    Log.d(TAG, "🔗 开始查询远端缓存，批次 " + (batchIndex + 1) + "/" + totalBatches + "，Hash数量: " + validHashes.size());
                    Map<String, Object> cacheResponse = batchCheckCache(cacheApiUrl, validHashes);
                    Log.d(TAG, "✅ 远端缓存查询成功，批次 " + (batchIndex + 1));
                    
                    // 记录服务器返回结果中出现的Hash（用于后续检查哪些Hash没有返回结果）
                    Set<String> processedHashes = new HashSet<>();
                    List<Map<String, Object>> batchUpdateData = new ArrayList<>(); // 收集需要批量更新的数据
                    
                    if (cacheResponse != null && cacheResponse.containsKey("items")) {
                        List<Map<String, Object>> items = (List<Map<String, Object>>) cacheResponse.get("items");
                        
                        // 处理缓存结果
                        for (Map<String, Object> item : items) {
                            String imageHash = (String) item.get("image_hash");
                            Boolean cached = (Boolean) item.get("cached");
                            
                            // 记录这个Hash已经被处理
                            if (imageHash != null && !imageHash.isEmpty()) {
                                processedHashes.add(imageHash);
                            }
                            
                            // 根据Hash到URI的MAP找到所有对应的URI（支持一个Hash对应多个URI）
                            List<String> imageUris = hashToUriMap.get(imageHash);
                            if (imageUris == null || imageUris.isEmpty()) {
                                continue; // 找不到对应的URI，跳过
                            }
                            
                            // 处理该Hash对应的所有URI
                            for (String imageUri : imageUris) {
                                // 根据URI找到对应的ImageInfo
                                ImageInfo image = null;
                                for (ImageInfo img : batchImages) {
                                    if (img.uri.equals(imageUri)) {
                                        image = img;
                                        break;
                                    }
                                }
                                
                                if (image == null) {
                                    continue; // 找不到对应的ImageInfo，跳过
                                }
                                
                                if (cached != null && cached && item.containsKey("data")) {
                                    // 缓存命中
                                    Map<String, Object> cacheData = (Map<String, Object>) item.get("data");
                                    
                                    // 避免重复处理
                                    if (result.hitImages.contains(image)) {
                                        continue;
                                    }
                                    
                                    // 收集分类数据，准备批量更新
                                    Map<String, Object> classificationData = new HashMap<>();
                                    classificationData.put("uri", image.uri);
                                    classificationData.put("id", image.id);
                                    
                                    // 从缓存数据中提取分类信息
                                    String category = (String) cacheData.get("category");
                                    if (category == null || category.isEmpty()) {
                                        category = "NA";
                                    }
                                    classificationData.put("category", category);
                                    
                                    Object confidenceObj = cacheData.get("confidence");
                                    double confidence = 0.9; // 默认置信度
                                    if (confidenceObj != null) {
                                        if (confidenceObj instanceof Number) {
                                            confidence = ((Number) confidenceObj).doubleValue();
                                        } else {
                                            try {
                                                confidence = Double.parseDouble(confidenceObj.toString());
                                            } catch (NumberFormatException e) {
                                                // 使用默认值
                                            }
                                        }
                                    }
                                    classificationData.put("confidence", confidence);
                                    
                                    // 保存描述信息（message）
                                    Object messageObj = cacheData.get("description");
                                    if (messageObj == null) {
                                        messageObj = cacheData.get("message");
                                    }
                                    if (messageObj != null) {
                                        classificationData.put("message", messageObj.toString());
                                    }
                                    
                                    // 保存背景颜色字段（跳过 null 和 "null" 字符串）
                                    Object backgroundColorObj = cacheData.get("background_color");
                                    if (backgroundColorObj != null) {
                                        String backgroundColor = backgroundColorObj.toString();
                                        // 只有当背景颜色不为空且不是 "null" 字符串时才保存
                                        if (backgroundColor != null && !backgroundColor.isEmpty() && !backgroundColor.equals("null")) {
                                            classificationData.put("background_color", backgroundColor);
                                        }
                                    }
                                    
                                    // 缓存命中时没有小模型检测结果，设置为空
                                    classificationData.put("idCardDetections", new ArrayList<>());
                                    classificationData.put("generalDetections", new ArrayList<>());
                                    classificationData.put("mobileNetV3Detections", null);
                                    
                                    batchUpdateData.add(classificationData);
                                    result.hitImages.add(image);
                                    
                                    // 统计：只有非NA分类才算分类成功，累加计数器
                                    if (!category.equals("NA")) {
                                        imagesClassified++;
                                    }
                                    processedThisPhase++;
                                } else {
                                    // 缓存未命中
                                    if (!result.naImages.contains(image) && !result.hitImages.contains(image)) {
                                        result.naImages.add(image);
                                        processedThisPhase++;
                                    }
                                }
                            }
                        }
                    }
                    
                    // 处理服务器没有返回结果的Hash（这些Hash对应的图片应该加入未命中列表）
                    for (String hash : validHashes) {
                        if (!processedHashes.contains(hash)) {
                            // 这个Hash在查询列表中，但服务器没有返回结果，视为缓存未命中
                            List<String> imageUris = hashToUriMap.get(hash);
                            if (imageUris != null && !imageUris.isEmpty()) {
                                for (String imageUri : imageUris) {
                                    // 根据URI找到对应的ImageInfo
                                    ImageInfo image = null;
                                    for (ImageInfo img : batchImages) {
                                        if (img.uri.equals(imageUri)) {
                                            image = img;
                                            break;
                                        }
                                    }
                                    
                                    if (image != null && !result.naImages.contains(image) && !result.hitImages.contains(image)) {
                                        result.naImages.add(image);
                                        processedThisPhase++;
                                    }
                                }
                            }
                        }
                    }
                    
                    // 步骤3: 保存结果（批量更新）
                    if (!batchUpdateData.isEmpty()) {
                        Map<String, Object> updateResult = imageDataService.batchUpdateClassification(batchUpdateData);
                        Boolean success = (Boolean) updateResult.get("success");
                        Integer updatedCount = (Integer) updateResult.get("updatedCount");
                        
                        if (success != null && success && updatedCount != null) {
                            result.hitCount += updatedCount;
                            Log.d(TAG, "批次 " + (batchIndex + 1) + " 批量更新分类完成: " + updatedCount + " 张图片");
                        } else {
                            Log.w(TAG, "批次 " + (batchIndex + 1) + " 批量更新分类失败: " + batchUpdateData.size() + " 张图片");
                        }
                    }
                    
                } catch (Exception e) {
                    // 🔥 详细记录远端缓存查询失败的原因
                    String errorMessage = e.getMessage();
                    if (errorMessage != null && errorMessage.contains("timeout")) {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远端缓存查询超时: " + errorMessage, e);
                    } else if (errorMessage != null && errorMessage.contains("HTTP错误")) {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远端缓存查询HTTP错误: " + errorMessage, e);
                    } else if (errorMessage != null && errorMessage.contains("网络")) {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远端缓存查询网络错误: " + errorMessage, e);
                    } else {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远端缓存查询异常: " + errorMessage, e);
                    }
                    // 查询失败，将这批图片加入未命中列表
                    for (ImageInfo image : batchImages) {
                        if (!result.naImages.contains(image) && !result.hitImages.contains(image)) {
                            result.naImages.add(image);
                            processedThisPhase++;
                        }
                    }
                }
                
                // 发送进度更新（每处理一个批次就更新一次，最后一个批次也会在这里发送）
                sendProgressEvent("cache_check", processedThisPhase, totalFoundThisPhase, currentScanId);
            }
            
            Log.d(TAG, "✅ 阶段3b完成: 缓存命中 " + result.hitCount + " 张，剩余待处理: " + result.naImages.size() + " 张，总计: " + totalFoundThisPhase + " 张");
            if (result.hitCount == 0 && totalFoundThisPhase > 0) {
                Log.w(TAG, "⚠️ 警告: 远端缓存查询没有命中任何图片，所有图片将进入远程推理阶段");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "远端缓存查询过程发生错误", e);
            // 出错时，将所有图片加入未命中列表
            result.naImages = naImages;
            result.hitImages.clear();
            result.hitCount = 0;
        }
        
        return result;
    }
    
    /**
     * 批量查询缓存API
     * @param cacheApiUrl 缓存API基础URL
     * @param imageHashes 图片哈希值列表
     * @return 缓存查询结果 { items: [...], cached_count: N, total: N }
     */
    private Map<String, Object> batchCheckCache(String cacheApiUrl, List<String> imageHashes) throws Exception {
        // 构建完整的API URL
        String apiUrl = cacheApiUrl;
        if (!apiUrl.endsWith("/")) {
            apiUrl += "/";
        }
        apiUrl += "api/v1/classify/batch-check-cache";
        
        Log.d(TAG, "🌐 准备远端缓存查询请求: " + apiUrl + ", Hash数量: " + imageHashes.size());
        
        URL url = new URL(apiUrl);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "application/json");
        // 🔥 优化：在后台运行时使用更长的超时时间，防止网络请求被中断
        connection.setConnectTimeout(120000); // 120秒连接超时（后台运行时可能需要更长时间）
        connection.setReadTimeout(120000); // 120秒读取超时
        connection.setDoOutput(true);
        
        Log.d(TAG, "🔗 开始建立HTTP连接（远端缓存查询）...");
        
        try {
            // 构建请求体
            JSONObject requestBody = new JSONObject();
            JSONArray hashesArray = new JSONArray();
            for (String hash : imageHashes) {
                hashesArray.put(hash);
            }
            requestBody.put("image_hashes", hashesArray);
            
            // 发送请求
            OutputStream outputStream = connection.getOutputStream();
            outputStream.write(requestBody.toString().getBytes("UTF-8"));
            outputStream.flush();
            outputStream.close();
            
            // 读取响应
            Log.d(TAG, "📥 开始读取HTTP响应（远端缓存查询）...");
            int responseCode = connection.getResponseCode();
            Log.d(TAG, "📊 HTTP响应码（远端缓存查询）: " + responseCode);
            if (responseCode != HttpURLConnection.HTTP_OK) {
                Log.e(TAG, "❌ HTTP错误（远端缓存查询）: " + responseCode);
                throw new Exception("HTTP错误: " + responseCode);
            }
            
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            reader.close();
            
            // 解析JSON响应
            Log.d(TAG, "📝 开始解析JSON响应（远端缓存查询），响应长度: " + response.length());
            JSONObject jsonResponse = new JSONObject(response.toString());
            
            // 转换为Map格式
            Map<String, Object> result = new HashMap<>();
            int total = jsonResponse.optInt("total", 0);
            int cachedCount = jsonResponse.optInt("cached_count", 0);
            result.put("total", total);
            result.put("cached_count", cachedCount);
            Log.d(TAG, "✅ 远端缓存查询响应解析完成: 总计=" + total + ", 缓存命中=" + cachedCount);
            
            JSONArray itemsArray = jsonResponse.optJSONArray("items");
            List<Map<String, Object>> items = new ArrayList<>();
            if (itemsArray != null) {
                for (int i = 0; i < itemsArray.length(); i++) {
                    JSONObject itemObj = itemsArray.getJSONObject(i);
                    Map<String, Object> item = new HashMap<>();
                    item.put("image_hash", itemObj.optString("image_hash", ""));
                    item.put("cached", itemObj.optBoolean("cached", false));
                    
                    // 使用 optJSONObject 安全地获取 data 字段（如果为 null 则返回 null，不会抛出异常）
                    JSONObject dataObj = itemObj.optJSONObject("data");
                    if (dataObj != null) {
                        Map<String, Object> data = new HashMap<>();
                        data.put("category", dataObj.optString("category", "NA"));
                        data.put("confidence", dataObj.optDouble("confidence", 0.9));
                        data.put("description", dataObj.optString("description", null));
                        data.put("message", dataObj.optString("message", null));
                        // 🆕 添加 background_color 字段的解析
                        String backgroundColor = dataObj.optString("background_color", null);
                        if (backgroundColor != null && !backgroundColor.isEmpty()) {
                            data.put("background_color", backgroundColor);
                        }
                        item.put("data", data);
                    }
                    
                    items.add(item);
                }
            }
            result.put("items", items);
            
            return result;
            
        } finally {
            connection.disconnect();
        }
    }
    
    /**
     * 批量远程推理API
     * @param remoteApiUrl 远程API基础URL
     * @param images 图片列表
     * @return 推理结果 { items: [...], success_count: N, fail_count: N, total: N }
     */
    private Map<String, Object> batchRemoteInference(String remoteApiUrl, List<ImageInfo> images) throws Exception {
        // 构建完整的API URL
        String apiUrl = remoteApiUrl;
        if (!apiUrl.endsWith("/")) {
            apiUrl += "/";
        }
        apiUrl += "api/v1/classify/batch";
        
        Log.d(TAG, "🌐 准备远程推理请求: " + apiUrl + ", 图片数量: " + images.size());
        
        // 检查网络状态（仅在 Release 版本中可能更严格）
        try {
            android.net.ConnectivityManager cm = (android.net.ConnectivityManager) reactContext.getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
            android.net.NetworkInfo networkInfo = cm.getActiveNetworkInfo();
            if (networkInfo == null || !networkInfo.isConnected()) {
                Log.w(TAG, "⚠️ 警告: 网络未连接，但继续尝试请求");
            } else {
                Log.d(TAG, "✅ 网络状态: " + networkInfo.getTypeName() + ", 已连接");
            }
        } catch (Exception e) {
            Log.w(TAG, "⚠️ 无法检查网络状态: " + e.getMessage());
        }
        
        // 生成边界字符串
        String boundary = "----WebKitFormBoundary" + System.currentTimeMillis();
        
        URL url = new URL(apiUrl);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
        // 🔥 优化：在后台运行时使用更长的超时时间，防止网络请求被中断
        connection.setConnectTimeout(300000); // 300秒连接超时（后台运行时可能需要更长时间）
        connection.setReadTimeout(300000); // 300秒读取超时
        connection.setDoOutput(true);
        connection.setDoInput(true);
        
        Log.d(TAG, "🔗 开始建立HTTP连接...");
        
        try {
            OutputStream outputStream = connection.getOutputStream();
            
            // 注意：Hash是可选的，主要用于服务端缓存查询
            // 在远程推理阶段，我们不传递Hash，让服务端自己计算，避免重复计算影响性能
            // 如果需要在远程推理阶段传递Hash，可以从数据库查询或从缓存查询阶段的uriToHashMap中获取
            
            // 添加图片文件
            for (ImageInfo image : images) {
                String contentUri = extractContentUri(image.uri);
                String uriString = contentUri != null ? contentUri : image.uri;
                
                try {
                    // 打开图片输入流
                    InputStream imageInputStream = null;
                    if (uriString.startsWith("content://")) {
                        Uri uri = Uri.parse(uriString);
                        imageInputStream = reactContext.getContentResolver().openInputStream(uri);
                    } else if (uriString.startsWith("file://")) {
                        String filePath = uriString.replace("file://", "");
                        imageInputStream = new FileInputStream(filePath);
                    } else {
                        imageInputStream = new FileInputStream(uriString);
                    }
                    
                    if (imageInputStream == null) {
                        Log.w(TAG, "无法打开图片文件: " + uriString);
                        continue;
                    }
                    
                    // 🔥 压缩图片（与 JS 层保持一致：1024x1024，质量 90%）
                    byte[] compressedImageData;
                    try {
                        compressedImageData = compressImage(imageInputStream, 1024, 90);
                        imageInputStream.close();
                    } catch (Exception compressError) {
                        Log.e(TAG, "❌ 图片压缩失败: " + uriString + ", 使用原始图片", compressError);
                        // 压缩失败时，重新打开输入流使用原始图片
                        imageInputStream.close();
                        if (uriString.startsWith("content://")) {
                            Uri uri = Uri.parse(uriString);
                            imageInputStream = reactContext.getContentResolver().openInputStream(uri);
                        } else if (uriString.startsWith("file://")) {
                            String filePath = uriString.replace("file://", "");
                            imageInputStream = new FileInputStream(filePath);
                        } else {
                            imageInputStream = new FileInputStream(uriString);
                        }
                        // 读取原始图片数据
                        ByteArrayOutputStream originalData = new ByteArrayOutputStream();
                        byte[] buffer = new byte[8192];
                        int bytesRead;
                        while ((bytesRead = imageInputStream.read(buffer)) != -1) {
                            originalData.write(buffer, 0, bytesRead);
                        }
                        compressedImageData = originalData.toByteArray();
                        imageInputStream.close();
                    }
                    
                    // 写入文件字段头
                    String fileName = image.fileName != null ? image.fileName : "image.jpg";
                    String fileField = "--" + boundary + "\r\n";
                    fileField += "Content-Disposition: form-data; name=\"images\"; filename=\"" + fileName + "\"\r\n";
                    fileField += "Content-Type: image/jpeg\r\n\r\n";
                    outputStream.write(fileField.getBytes("UTF-8"));
                    
                    // 写入压缩后的图片数据
                    outputStream.write(compressedImageData);
                    outputStream.write("\r\n".getBytes("UTF-8"));
                } catch (Exception e) {
                    Log.e(TAG, "❌ 读取图片文件失败: " + uriString, e);
                    Log.e(TAG, "   错误类型: " + e.getClass().getSimpleName());
                    Log.e(TAG, "   错误消息: " + e.getMessage());
                    if (e.getCause() != null) {
                        Log.e(TAG, "   原因: " + e.getCause().getMessage());
                    }
                    // 继续处理下一张图片（跳过这张图片）
                }
            }
            
            // 写入结束边界
            String endBoundary = "--" + boundary + "--\r\n";
            outputStream.write(endBoundary.getBytes("UTF-8"));
            outputStream.flush();
            outputStream.close();
            
            // 读取响应
            Log.d(TAG, "📥 开始读取HTTP响应...");
            int responseCode = connection.getResponseCode();
            Log.d(TAG, "📊 HTTP响应码: " + responseCode);
            if (responseCode != HttpURLConnection.HTTP_OK) {
                String errorText = "";
                try {
                    BufferedReader errorReader = new BufferedReader(new InputStreamReader(connection.getErrorStream(), "UTF-8"));
                    StringBuilder errorResponse = new StringBuilder();
                    String line;
                    while ((line = errorReader.readLine()) != null) {
                        errorResponse.append(line);
                    }
                    errorReader.close();
                    errorText = errorResponse.toString();
                } catch (Exception e) {
                    // 忽略错误流读取失败
                }
                Log.e(TAG, "❌ HTTP错误: " + responseCode + ", 错误信息: " + errorText);
                throw new Exception("HTTP错误: " + responseCode + " " + errorText);
            }
            
            BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                response.append(line);
            }
            reader.close();
            
            // 解析JSON响应
            Log.d(TAG, "📝 开始解析JSON响应，响应长度: " + response.length());
            JSONObject jsonResponse = new JSONObject(response.toString());
            
            // 转换为Map格式
            Map<String, Object> result = new HashMap<>();
            int total = jsonResponse.optInt("total", 0);
            int successCount = jsonResponse.optInt("success_count", 0);
            int failCount = jsonResponse.optInt("fail_count", 0);
            result.put("total", total);
            result.put("success_count", successCount);
            result.put("fail_count", failCount);
            Log.d(TAG, "✅ 远程推理响应解析完成: 总计=" + total + ", 成功=" + successCount + ", 失败=" + failCount);
            
            JSONArray itemsArray = jsonResponse.optJSONArray("items");
            List<Map<String, Object>> items = new ArrayList<>();
            if (itemsArray != null) {
                for (int i = 0; i < itemsArray.length(); i++) {
                    JSONObject itemObj = itemsArray.getJSONObject(i);
                    Map<String, Object> item = new HashMap<>();
                    item.put("success", itemObj.optBoolean("success", false));
                    item.put("error", itemObj.optString("error", null));
                    
                    // 使用 optJSONObject 安全地获取 data 字段（如果为 null 则返回 null，不会抛出异常）
                    JSONObject dataObj = itemObj.optJSONObject("data");
                    if (dataObj != null) {
                        Map<String, Object> data = new HashMap<>();
                        data.put("category", dataObj.optString("category", null));
                        data.put("confidence", dataObj.optDouble("confidence", 0.9));
                        data.put("description", dataObj.optString("description", null));
                        data.put("message", dataObj.optString("message", null));
                        // 🆕 添加 background_color 字段的解析
                        String backgroundColor = dataObj.optString("background_color", null);
                        if (backgroundColor != null && !backgroundColor.isEmpty()) {
                            data.put("background_color", backgroundColor);
                        }
                        
                        // 处理小模型推理结果
                        // 使用 optJSONObject 安全地获取 local_inference_result 字段（如果为 null 则返回 null，不会抛出异常）
                        JSONObject localResultObj = dataObj.optJSONObject("local_inference_result");
                        if (localResultObj != null) {
                            Map<String, Object> localResult = new HashMap<>();
                            
                            // 解析 idCardDetections
                            if (localResultObj.has("idCardDetections")) {
                                JSONArray idCardArray = localResultObj.getJSONArray("idCardDetections");
                                List<Map<String, Object>> idCardDetections = new ArrayList<>();
                                for (int j = 0; j < idCardArray.length(); j++) {
                                    JSONObject detectionObj = idCardArray.getJSONObject(j);
                                    Map<String, Object> detection = new HashMap<>();
                                    detection.put("className", detectionObj.optString("className", ""));
                                    detection.put("confidence", detectionObj.optDouble("confidence", 0.0));
                                    
                                    // 🔥 新增：保存 bbox 字段（边界框坐标 [x, y, w, h]）
                                    if (detectionObj.has("bbox")) {
                                        try {
                                            JSONArray bboxArray = detectionObj.getJSONArray("bbox");
                                            if (bboxArray != null && bboxArray.length() == 4) {
                                                List<Double> bbox = new ArrayList<>();
                                                for (int k = 0; k < 4; k++) {
                                                    bbox.add(bboxArray.getDouble(k));
                                                }
                                                detection.put("bbox", bbox);
                                            }
                                        } catch (Exception e) {
                                            Log.w(TAG, "解析 idCard bbox 失败: " + e.getMessage());
                                        }
                                    }
                                    
                                    idCardDetections.add(detection);
                                }
                                localResult.put("idCardDetections", idCardDetections);
                            }
                            
                            // 解析 generalDetections
                            if (localResultObj.has("generalDetections")) {
                                JSONArray generalArray = localResultObj.getJSONArray("generalDetections");
                                List<Map<String, Object>> generalDetections = new ArrayList<>();
                                for (int j = 0; j < generalArray.length(); j++) {
                                    JSONObject detectionObj = generalArray.getJSONObject(j);
                                    Map<String, Object> detection = new HashMap<>();
                                    // 同时保存 className 和 classId（如果存在）
                                    detection.put("className", detectionObj.optString("className", ""));
                                    if (detectionObj.has("classId")) {
                                        detection.put("classId", detectionObj.optInt("classId", -1));
                                    }
                                    detection.put("confidence", detectionObj.optDouble("confidence", 0.0));
                                    
                                    // 🔥 新增：保存 bbox 字段（边界框坐标 [x, y, w, h]）
                                    if (detectionObj.has("bbox")) {
                                        try {
                                            JSONArray bboxArray = detectionObj.getJSONArray("bbox");
                                            if (bboxArray != null && bboxArray.length() == 4) {
                                                List<Double> bbox = new ArrayList<>();
                                                for (int k = 0; k < 4; k++) {
                                                    bbox.add(bboxArray.getDouble(k));
                                                }
                                                detection.put("bbox", bbox);
                                            }
                                        } catch (Exception e) {
                                            Log.w(TAG, "解析 bbox 失败: " + e.getMessage());
                                        }
                                    }
                                    
                                    generalDetections.add(detection);
                                }
                                localResult.put("generalDetections", generalDetections);
                            }
                            
                            // 解析 mobileNetV3Detections
                            if (localResultObj.has("mobileNetV3Detections")) {
                                localResult.put("mobileNetV3Detections", localResultObj.get("mobileNetV3Detections"));
                            }
                            
                            data.put("local_inference_result", localResult);
                        }
                        
                        item.put("data", data);
                    }
                    
                    items.add(item);
                }
            }
            result.put("items", items);
            
            return result;
            
        } finally {
            connection.disconnect();
        }
    }
    
    /**
     * 阶段3c: 远程推理
     * 注意：当推理成功并分类成功时，需要累加 imagesClassified 计数器
     * 参照JS层的 batchClassifyRemote 逻辑实现
     */
    private RemoteInferenceResult performRemoteInference(List<ImageInfo> naImages, String remoteApiUrl) {
        // 初始化阶段级统计变量
        processedThisPhase = 0;
        totalFoundThisPhase = naImages.size();
        Log.d(TAG, "阶段3c开始: 远程推理，待处理图片: " + totalFoundThisPhase + " 张");
        
        // 发送阶段开始进度事件（确保UI能收到"开始处理X张图片"的消息）
        // 注意：必须在批次处理之前发送，确保开始消息先到达JS层
        if (totalFoundThisPhase > 0) {
            Log.d(TAG, "📤 准备发送远程推理开始事件: 0/" + totalFoundThisPhase);
            sendProgressEvent("remote_inference", 0, totalFoundThisPhase, currentScanId);
            Log.d(TAG, "✅ 远程推理开始事件已调用发送");
        }
        
        RemoteInferenceResult result = new RemoteInferenceResult();
        result.successImages = new ArrayList<>();
        result.failedImages = new ArrayList<>();
        result.successCount = 0;
        result.failedCount = 0;
        
        if (remoteApiUrl == null || remoteApiUrl.isEmpty() || naImages.isEmpty()) {
            // 没有远程API或没有待处理图片，直接返回
            result.failedImages = naImages;
            result.failedCount = naImages.size();
            return result;
        }
        
        try {
            // 按批次处理（每批20张，与JS层保持一致）
            int batchSize = 20;
            int totalBatches = (naImages.size() + batchSize - 1) / batchSize;
            
            for (int batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                // 🔥 优化：定期保持线程活跃
                // 1. 检查线程是否被中断
                if (Thread.currentThread().isInterrupted()) {
                    Log.w(TAG, "扫描线程被中断，停止处理");
                    break;
                }
                
                // 2. 短暂睡眠让线程进入可调度状态（比 Thread.yield() 更可靠）
                if (batchIndex > 0) {
                    SystemClock.sleep(5); // 5ms睡眠，让系统有机会调度
                }
                
                int startIndex = batchIndex * batchSize;
                int endIndex = Math.min(startIndex + batchSize, naImages.size());
                List<ImageInfo> batchImages = naImages.subList(startIndex, endIndex);
                
                Log.d(TAG, "处理批次 " + (batchIndex + 1) + "/" + totalBatches + "，图片数量: " + batchImages.size());
                
                try {
                    // 调用远程推理API
                    Log.d(TAG, "🔗 开始调用远程推理API，批次 " + (batchIndex + 1) + "/" + totalBatches + "，图片数量: " + batchImages.size());
                    Map<String, Object> batchResult = batchRemoteInference(remoteApiUrl, batchImages);
                    Log.d(TAG, "✅ 远程推理API调用成功，批次 " + (batchIndex + 1));
                    
                    if (batchResult != null && batchResult.containsKey("items")) {
                        Log.d(TAG, "📊 远程推理结果: 批次 " + (batchIndex + 1) + "，返回 " + ((List<?>) batchResult.get("items")).size() + " 个结果");
                        List<Map<String, Object>> items = (List<Map<String, Object>>) batchResult.get("items");
                        List<Map<String, Object>> batchUpdateData = new ArrayList<>(); // 收集需要批量更新的数据
                        
                        // 处理推理结果
                        for (int i = 0; i < items.size() && i < batchImages.size(); i++) {
                            Map<String, Object> item = items.get(i);
                            ImageInfo image = batchImages.get(i);
                            
                            Boolean success = (Boolean) item.get("success");
                            if (success != null && success && item.containsKey("data")) {
                                // 推理成功
                                Map<String, Object> inferenceData = (Map<String, Object>) item.get("data");
                                
                                // 判断是大模型还是小模型推理
                                String category = (String) inferenceData.get("category");
                                Map<String, Object> localInferenceResult = (Map<String, Object>) inferenceData.get("local_inference_result");
                                
                                Map<String, Object> classificationData = new HashMap<>();
                                classificationData.put("uri", image.uri);
                                classificationData.put("id", image.id);
                                
                                if (category != null && !category.isEmpty()) {
                                    // 大模型推理
                                    classificationData.put("category", category);
                                    
                                    Object confidenceObj = inferenceData.get("confidence");
                                    double confidence = 0.9; // 默认置信度
                                    if (confidenceObj != null) {
                                        if (confidenceObj instanceof Number) {
                                            confidence = ((Number) confidenceObj).doubleValue();
                                        } else {
                                            try {
                                                confidence = Double.parseDouble(confidenceObj.toString());
                                            } catch (NumberFormatException e) {
                                                // 使用默认值
                                            }
                                        }
                                    }
                                    classificationData.put("confidence", confidence);
                                    
                                    // 保存描述信息（message）
                                    Object messageObj = inferenceData.get("description");
                                    if (messageObj == null) {
                                        messageObj = inferenceData.get("message");
                                    }
                                    if (messageObj != null) {
                                        classificationData.put("message", messageObj.toString());
                                    }
                                    
                                    // 保存背景颜色字段（跳过 null 和 "null" 字符串）
                                    Object backgroundColorObj = inferenceData.get("background_color");
                                    if (backgroundColorObj != null) {
                                        String backgroundColor = backgroundColorObj.toString();
                                        // 只有当背景颜色不为空且不是 "null" 字符串时才保存
                                        if (backgroundColor != null && !backgroundColor.isEmpty() && !backgroundColor.equals("null")) {
                                            classificationData.put("background_color", backgroundColor);
                                        }
                                    }
                                    
                                    // 大模型推理没有小模型检测结果
                                    classificationData.put("idCardDetections", new ArrayList<>());
                                    classificationData.put("generalDetections", new ArrayList<>());
                                    classificationData.put("mobileNetV3Detections", null);
                                } else if (localInferenceResult != null) {
                                    // 小模型推理：不在这里进行映射，保存原始检测结果，分类设为NA
                                    // 映射逻辑由JS层处理（依赖配置文件，更灵活）
                                    classificationData.put("category", "NA");
                                    classificationData.put("confidence", 0.8);
                                    
                                    // 保存小模型检测结果（原始数据，供JS层后续映射使用）
                                    Object idCardDetections = localInferenceResult.get("idCardDetections");
                                    Object generalDetections = localInferenceResult.get("generalDetections");
                                    Object mobileNetV3Detections = localInferenceResult.get("mobileNetV3Detections");
                                    
                                    if (idCardDetections != null) {
                                        classificationData.put("idCardDetections", idCardDetections);
                                    } else {
                                        classificationData.put("idCardDetections", new ArrayList<>());
                                    }
                                    
                                    if (generalDetections != null) {
                                        classificationData.put("generalDetections", generalDetections);
                                    } else {
                                        classificationData.put("generalDetections", new ArrayList<>());
                                    }
                                    
                                    classificationData.put("mobileNetV3Detections", mobileNetV3Detections);
                                    classificationData.put("message", null);
                                    
                                    // 保存背景颜色字段（如果存在，跳过 null 和 "null" 字符串）
                                    Object backgroundColorObj = inferenceData.get("background_color");
                                    if (backgroundColorObj != null) {
                                        String backgroundColor = backgroundColorObj.toString();
                                        // 只有当背景颜色不为空且不是 "null" 字符串时才保存
                                        if (backgroundColor != null && !backgroundColor.isEmpty() && !backgroundColor.equals("null")) {
                                            classificationData.put("background_color", backgroundColor);
                                        }
                                    }
                                    
                                    // 注意：小模型推理结果暂时保存为NA，JS层会在后续阶段进行映射
                                    // 这样可以避免在原生层维护复杂的映射逻辑和配置文件
                                } else {
                                    // 无法确定分类结果
                                    Log.w(TAG, "批次 " + (batchIndex + 1) + " 图片 " + image.fileName + " 分类结果构建失败");
                                    result.failedImages.add(image);
                                    result.failedCount++;
                                    processedThisPhase++;
                                    continue;
                                }
                                
                                batchUpdateData.add(classificationData);
                                result.successImages.add(image);
                                result.successCount++;
                                imagesClassified++; // 累加分类成功计数器
                                processedThisPhase++;
                            } else {
                                // 推理失败
                                String error = (String) item.get("error");
                                Log.w(TAG, "批次 " + (batchIndex + 1) + " 图片 " + image.fileName + " 推理失败: " + error);
                                result.failedImages.add(image);
                                result.failedCount++;
                                processedThisPhase++;
                            }
                        }
                        
                        // 批量更新分类信息
                        if (!batchUpdateData.isEmpty()) {
                            Map<String, Object> updateResult = imageDataService.batchUpdateClassification(batchUpdateData);
                            Boolean success = (Boolean) updateResult.get("success");
                            Integer updatedCount = (Integer) updateResult.get("updatedCount");
                            
                            if (success != null && success && updatedCount != null) {
                                Log.d(TAG, "批次 " + (batchIndex + 1) + " 批量更新分类完成: " + updatedCount + " 张图片");
                            } else {
                                Log.w(TAG, "批次 " + (batchIndex + 1) + " 批量更新分类失败: " + batchUpdateData.size() + " 张图片");
                            }
                        }
                    } else {
                        // 整个批次失败
                        Log.e(TAG, "批次 " + (batchIndex + 1) + " 远程推理失败");
                        for (ImageInfo image : batchImages) {
                            result.failedImages.add(image);
                            result.failedCount++;
                            processedThisPhase++;
                        }
                    }
                    
                } catch (Exception e) {
                    // 🔥 详细记录远程推理失败的原因
                    String errorMessage = e.getMessage();
                    if (errorMessage != null && errorMessage.contains("timeout")) {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远程推理超时: " + errorMessage, e);
                    } else if (errorMessage != null && errorMessage.contains("HTTP错误")) {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远程推理HTTP错误: " + errorMessage, e);
                    } else if (errorMessage != null && errorMessage.contains("网络")) {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远程推理网络错误: " + errorMessage, e);
                    } else {
                        Log.e(TAG, "❌ 批次 " + (batchIndex + 1) + " 远程推理异常: " + errorMessage, e);
                    }
                    // 批次失败，将所有图片加入失败列表
                    for (ImageInfo image : batchImages) {
                        result.failedImages.add(image);
                        result.failedCount++;
                        processedThisPhase++;
                    }
                }
                
                // 发送进度更新（每处理一个批次就更新一次，最后一个批次也会在这里发送）
                sendProgressEvent("remote_inference", processedThisPhase, totalFoundThisPhase, currentScanId);
            }
            
            Log.d(TAG, "✅ 阶段3c完成: 推理成功 " + result.successCount + " 张，失败: " + result.failedCount + " 张，总计: " + totalFoundThisPhase + " 张");
            if (result.failedCount > 0) {
                Log.w(TAG, "⚠️ 警告: 有 " + result.failedCount + " 张图片远程推理失败，将保持NA分类，后续可能需要本地推理");
            }
            
        } catch (Exception e) {
            Log.e(TAG, "远程推理过程发生错误", e);
            // 出错时，将所有图片加入失败列表
            result.failedImages = naImages;
            result.successImages.clear();
            result.successCount = 0;
            result.failedCount = naImages.size();
        }
        
        return result;
    }
    
    /**
     * 保存图片分类结果到数据库
     */
    private void saveImageClassification(ImageInfo image, String category, double confidence, 
                                        Map<String, Object> detections, String message, ExifData exifData, String backgroundColor) {
        try {
            Map<String, Object> imageData = new HashMap<>();
            imageData.put("uri", image.uri);
            imageData.put("fileName", image.fileName);
            imageData.put("category", category);
            imageData.put("confidence", confidence);
            // timestamp 使用图片的创建时间（优先 dateTaken，否则 dateModified 或 dateAdded）
            long timestamp = image.dateTaken > 0 ? image.dateTaken : 
                             (image.dateModified > 0 ? image.dateModified : image.dateAdded);
            imageData.put("timestamp", timestamp);
            
            // 优先使用EXIF中的拍摄时间，如果没有则使用MediaStore的时间（如果有效）
            if (exifData != null && exifData.hasTakenTime && exifData.takenTime > 0) {
                imageData.put("takenAt", exifData.takenTime);
            } else if (image.dateTaken > 0) {
                // 只有当 dateTaken 有效时才设置，否则不设置（保持 null）
                imageData.put("takenAt", image.dateTaken);
            }
            // 如果都没有有效时间，不设置 takenAt（保持 null），与 JS 层保持一致
            
            imageData.put("size", image.size);
            imageData.put("mimeType", image.mimeType);
            
            // 优先使用EXIF中的尺寸，如果没有则使用MediaStore的尺寸
            int finalWidth = 0;
            int finalHeight = 0;
            String dimensionSource = "unknown";
            if (exifData != null && exifData.dimensions != null) {
                finalWidth = exifData.dimensions.width;
                finalHeight = exifData.dimensions.height;
                dimensionSource = "exifData.dimensions";
            } else {
                finalWidth = image.width;
                finalHeight = image.height;
                dimensionSource = "MediaStore";
            }
            
            imageData.put("width", finalWidth);
            imageData.put("height", finalHeight);
            
            // 🔥 同时保存 imageDimensions 字段（JS层使用此字段）
            if (finalWidth > 0 && finalHeight > 0) {
                Map<String, Object> imageDimensions = new HashMap<>();
                imageDimensions.put("width", finalWidth);
                imageDimensions.put("height", finalHeight);
                imageData.put("imageDimensions", imageDimensions);
            }
            
            // 🔍 只记录有问题的情况（尺寸为0）
            if (finalWidth <= 0 || finalHeight <= 0) {
                Log.w(TAG, "⚠️ 保存时尺寸为0: fileName=" + image.fileName + 
                      ", width=" + finalWidth + ", height=" + finalHeight + 
                      ", hasExifDimensions=" + (exifData != null && exifData.dimensions != null) +
                      ", MediaStoreWidth=" + image.width + ", MediaStoreHeight=" + image.height);
            }
            
            // GPS信息
            if (exifData != null && exifData.hasGPS && exifData.gps != null) {
                imageData.put("latitude", exifData.gps.latitude);
                imageData.put("longitude", exifData.gps.longitude);
                if (exifData.gps.altitude != null) {
                    imageData.put("altitude", exifData.gps.altitude);
                }
            }
            
            if (detections != null) {
                imageData.put("generalDetections", detections);
            }
            if (message != null) {
                imageData.put("message", message);
            }
            // 保存背景颜色字段（跳过 null 和 "null" 字符串）
            if (backgroundColor != null && !backgroundColor.isEmpty() && !backgroundColor.equals("null")) {
                imageData.put("background_color", backgroundColor);
            }
            
            List<Map<String, Object>> imageDataList = new ArrayList<>();
            imageDataList.add(imageData);
            
            imageDataService.writeImageDetailedInfo(imageDataList);
            
        } catch (Exception e) {
            Log.e(TAG, "保存图片分类失败: " + image.uri, e);
        }
    }
    
    /**
     * 完成扫描
     */
    private void completeScan(String scanId) {
        try {
            // 更新数据库状态
            imageDataService.updateSetting("scan_status", "completed");
            imageDataService.updateSetting("scan_completed_at", String.valueOf(System.currentTimeMillis()));
            imageDataService.updateSetting("scan_needs_post_processing", "true");
            
            // 发送原生层扫描完成进度事件（注意：这只是原生层完成，不是整个扫描流程完成）
            // JS层收到此事件后会启动后续处理（位置补全、本地推理、规则映射、相似度检测）
            sendProgressEvent("native_scan_completed", processedThisPhase, totalFoundThisPhase, scanId);
            
            Log.d(TAG, "扫描完成: " + scanId + ", 处理 " + processedThisPhase + "/" + totalFoundThisPhase + " 张图片");
            
        } catch (Exception e) {
            Log.e(TAG, "完成扫描失败", e);
        }
    }
    
    /**
     * 发送进度事件
     * 
     * 进度事件包含4个关键指标：
     * 1. filesFound: 当前阶段需要处理的图片数量
     * 2. filesProcessed: 当前阶段已处理的图片数量
     * 3. totalImagesToBeClassified: 这次扫描任务一共需要分类的图片总数
     * 4. imagesClassified: 目前已经分类成功的图片数量（整个扫描过程累加）
     */
    private void sendProgressEvent(String stage, int filesProcessed, int filesFound, String scanId) {
        sendProgressEvent(stage, filesProcessed, filesFound, scanId, totalImagesToBeClassified, imagesClassified);
    }
    
    /**
     * 发送进度事件（完整参数）
     */
    private void sendProgressEvent(String stage, int filesProcessed, int filesFound, String scanId, 
                                  int totalImagesToBeClassified, int imagesClassified) {
        // 🔥 优化：原生层直接更新前台服务通知，不依赖JS线程
        // 这样即使JS线程被杀死，通知也能正常更新
        updateForegroundServiceNotification(stage, filesProcessed, filesFound, totalImagesToBeClassified, imagesClassified);
        
        // 发送事件到JS层（如果JS线程存在）
        mainHandler.post(() -> {
            try {
                WritableMap eventData = Arguments.createMap();
                eventData.putString("type", "progress");
                eventData.putString("stage", stage);
                eventData.putInt("filesProcessed", filesProcessed); // 当前阶段已处理的图片数量
                eventData.putInt("filesFound", filesFound); // 当前阶段需要处理的图片数量
                eventData.putInt("totalImagesToBeClassified", totalImagesToBeClassified); // 这次扫描任务一共需要分类的图片总数
                eventData.putInt("imagesClassified", imagesClassified); // 目前已经分类成功的图片数量（整个扫描过程累加）
                eventData.putString("scanId", scanId);
                
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("GalleryScanProgress", eventData);
                
                // 🔥 合并日志：只保留一条，包含完整信息
                Log.d(TAG, "📊 扫描进度: " + stage + ", " + filesProcessed + "/" + filesFound + ", 总分类: " + imagesClassified + "/" + totalImagesToBeClassified);
            } catch (Exception e) {
                Log.e(TAG, "❌ 发送进度事件失败", e);
            }
        });
    }
    
    /**
     * 更新前台服务通知（原生层直接更新，不依赖JS线程）
     */
    private void updateForegroundServiceNotification(String stage, int filesProcessed, int filesFound, 
                                                    int totalImagesToBeClassified, int imagesClassified) {
        try {
            // 生成通知消息
            String message = generateProgressMessage(stage, filesProcessed, filesFound, totalImagesToBeClassified, imagesClassified);
            
            // 发送Intent更新前台服务通知
            Intent intent = new Intent(context, ScanForegroundService.class);
            intent.setAction("UPDATE_PROGRESS");
            intent.putExtra("message", message);
            intent.putExtra("processed", filesProcessed);
            intent.putExtra("total", filesFound);
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "更新前台服务通知失败", e);
        }
    }
    
    /**
     * 生成进度消息（与JS层格式保持一致）
     */
    private String generateProgressMessage(String stage, int filesProcessed, int filesFound, 
                                          int totalImagesToBeClassified, int imagesClassified) {
        String stageName = getStageName(stage);
        String message = stageName + ": " + filesProcessed + "/" + filesFound;
        
        // 添加总分类统计（如果有）
        if (totalImagesToBeClassified > 0) {
            message += " | 分类成功: " + imagesClassified + "/" + totalImagesToBeClassified;
        }
        
        return message;
    }
    
    /**
     * 获取阶段名称（中文）
     */
    private String getStageName(String stage) {
        switch (stage) {
            case "screenshot_detection":
                return "截图检测";
            case "cache_check":
                return "缓存查询";
            case "remote_inference":
                return "远程推理";
            case "native_scan_completed":
                return "原生扫描完成";
            default:
                return "扫描中";
        }
    }
    
    /**
     * 发送扫描完成事件
     */
    private void sendScanCompletedEvent(String scanId) {
        mainHandler.post(() -> {
            try {
                WritableMap eventData = Arguments.createMap();
                eventData.putString("type", "scan_completed");
                eventData.putString("scanId", scanId);
                
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("GalleryScanCompleted", eventData);
                
            } catch (Exception e) {
                Log.e(TAG, "发送扫描完成事件失败", e);
            }
        });
    }
    
    /**
     * 发送错误事件
     */
    private void sendErrorEvent(String scanId, String errorMessage) {
        mainHandler.post(() -> {
            try {
                WritableMap eventData = Arguments.createMap();
                eventData.putString("type", "error");
                eventData.putString("stage", "scan");
                eventData.putString("scanId", scanId);
                eventData.putString("message", errorMessage);
                
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("GalleryScanError", eventData);
                
            } catch (Exception e) {
                Log.e(TAG, "发送错误事件失败", e);
            }
        });
    }
    
    /**
     * 图片信息类
     */
    public static class ImageInfo {
        public String id;
        public String uri;
        public String fileName;
        public String path;
        public String relativePath;
        public long size;
        public long dateTaken;
        public long dateModified;
        public long dateAdded;
        public int width;
        public int height;
        public String mimeType;
    }
    
    /**
     * 比对结果类
     */
    public static class ComparisonResult {
        public List<ImageInfo> newImages;
        public List<String> deletedUris;
        public int newCount;
        public int deletedCount;
    }
    
    
    /**
     * 缓存查询结果类
     */
    public static class CacheResult {
        public List<ImageInfo> hitImages;
        public List<ImageInfo> naImages;
        public int hitCount;
    }
    
    /**
     * 远程推理结果类
     */
    public static class RemoteInferenceResult {
        public List<ImageInfo> successImages;
        public List<ImageInfo> failedImages;
        public int successCount;
        public int failedCount;
    }
    
    /**
     * EXIF数据类
     */
    public static class ExifData {
        public String uri;
        public Long takenTime;
        public GpsInfo gps;
        public ImageDimensions dimensions;
        public boolean hasGPS;
        public boolean hasTakenTime;
    }
    
    /**
     * GPS信息类
     */
    public static class GpsInfo {
        public double latitude;
        public double longitude;
        public Double altitude;
    }
    
    /**
     * 图片尺寸类
     */
    public static class ImageDimensions {
        public int width;
        public int height;
    }
}

