package com.imageclassifier;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;
import android.os.Build;
import android.Manifest;

import androidx.exifinterface.media.ExifInterface;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

public class MediaStoreModule extends ReactContextBaseJavaModule {
    private static final String TAG = "MediaStoreModule";
    private final ReactApplicationContext reactContext;

    public MediaStoreModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "MediaStoreModule";
    }

    @ReactMethod
    public void deleteFile(String filePath, Promise promise) {
        try {
            Log.d(TAG, "尝试删除文件: " + filePath);
            
            // 方法1: 使用File.delete()删除（优先）
            boolean deleted = deleteFileDirectly(filePath);
            if (deleted) {
                Log.d(TAG, "直接删除成功: " + filePath);
                promise.resolve(true);
                return;
            }
            
            // 方法2: 使用MediaStore删除（备选）
            deleted = deleteFileViaMediaStore(filePath);
            if (deleted) {
                Log.d(TAG, "MediaStore删除成功: " + filePath);
                promise.resolve(true);
                return;
            }
            
            Log.d(TAG, "所有删除方法都失败了: " + filePath);
            // 返回明确的错误信息
            promise.reject("DELETE_FAILED", "文件删除失败，可能没有权限或文件不存在");
            
        } catch (Exception e) {
            Log.e(TAG, "删除文件时发生错误: " + e.getMessage(), e);
            // 返回具体的错误信息
            promise.reject("DELETE_ERROR", "删除文件时发生错误: " + e.getMessage());
        }
    }

    private boolean deleteFileViaMediaStore(String filePath) {
        try {
            // 检查权限
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                // Android 13+ 需要 WRITE_MEDIA_IMAGES 权限
                if (reactContext.checkSelfPermission("android.permission.WRITE_MEDIA_IMAGES") 
                    != PackageManager.PERMISSION_GRANTED) {
                    Log.w(TAG, "缺少 WRITE_MEDIA_IMAGES 权限");
                    return false;
                }
            } else {
                // Android 12 及以下需要 WRITE_EXTERNAL_STORAGE 权限
                if (reactContext.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) 
                    != PackageManager.PERMISSION_GRANTED) {
                    Log.w(TAG, "缺少 WRITE_EXTERNAL_STORAGE 权限");
                    return false;
                }
            }
            
            ContentResolver contentResolver = reactContext.getContentResolver();
            
            // 先检查文件是否存在
            File file = new File(filePath);
            if (!file.exists()) {
                Log.w(TAG, "文件不存在: " + filePath);
                return false;
            }
            
            Log.d(TAG, "开始查询MediaStore，文件路径: " + filePath);
            
            // 查询文件的MediaStore ID
            String selection = MediaStore.Images.Media.DATA + "=?";
            String[] selectionArgs = {filePath};
            
            Cursor cursor = contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Images.Media._ID},
                selection,
                selectionArgs,
                null
            );
            
            Log.d(TAG, "MediaStore查询结果: cursor=" + (cursor != null ? "非空" : "空"));
            
            if (cursor != null && cursor.moveToFirst()) {
                int idColumn = cursor.getColumnIndex(MediaStore.Images.Media._ID);
                long id = cursor.getLong(idColumn);
                Log.d(TAG, "找到MediaStore ID: " + id);
                cursor.close();
                
                // 使用MediaStore删除文件
                Uri deleteUri = Uri.withAppendedPath(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, 
                    String.valueOf(id)
                );
                
                Log.d(TAG, "删除URI: " + deleteUri);
                int deletedRows = contentResolver.delete(deleteUri, null, null);
                Log.d(TAG, "MediaStore删除结果: " + deletedRows + " 行");
                
                // 验证文件是否真的被删除了
                boolean fileStillExists = file.exists();
                Log.d(TAG, "文件删除后状态: " + (fileStillExists ? "仍存在" : "已删除"));
                return !fileStillExists;
            } else {
                Log.w(TAG, "MediaStore中未找到文件记录: " + filePath);
            }
            
            if (cursor != null) {
                cursor.close();
            }
            
            return false;
            
        } catch (Exception e) {
            Log.e(TAG, "MediaStore删除失败: " + e.getMessage(), e);
            return false;
        }
    }

    private boolean deleteFileDirectly(String filePath) {
        try {
            File file = new File(filePath);
            if (file.exists()) {
                boolean deleted = file.delete();
                Log.d(TAG, "直接删除结果: " + deleted);
                return deleted && !file.exists();
            }
            return false;
        } catch (Exception e) {
            Log.e(TAG, "直接删除失败: " + e.getMessage(), e);
            return false;
        }
    }

    private boolean deleteFileViaSystem(String filePath) {
        try {
            // 使用Runtime执行系统命令
            Process process = Runtime.getRuntime().exec("rm -f \"" + filePath + "\"");
            int exitCode = process.waitFor();
            
            Log.d(TAG, "系统命令删除结果: " + exitCode);
            
            // 验证文件是否真的被删除了
            File file = new File(filePath);
            return !file.exists();
            
        } catch (Exception e) {
            Log.e(TAG, "系统命令删除失败: " + e.getMessage(), e);
            return false;
        }
    }

    @ReactMethod
    public void getFileInfo(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            WritableMap fileInfo = Arguments.createMap();
            
            if (file.exists()) {
                fileInfo.putBoolean("exists", true);
                fileInfo.putString("path", file.getAbsolutePath());
                fileInfo.putString("name", file.getName());
                fileInfo.putDouble("size", file.length());
                fileInfo.putDouble("lastModified", file.lastModified());
                fileInfo.putBoolean("canRead", file.canRead());
                fileInfo.putBoolean("canWrite", file.canWrite());
                fileInfo.putBoolean("canExecute", file.canExecute());
            } else {
                fileInfo.putBoolean("exists", false);
            }
            
            promise.resolve(fileInfo);
            
        } catch (Exception e) {
            Log.e(TAG, "获取文件信息失败: " + e.getMessage(), e);
            promise.reject("FILE_INFO_ERROR", e.getMessage());
        }
    }

    /**
     * 获取所有图片清单
     * @param limit 限制返回数量，0表示不限制
     * @param offset 偏移量，用于分页
     * @param promise Promise对象
     */
    @ReactMethod
    public void getAllImages(int limit, int offset, Promise promise) {
        try {
            Log.d(TAG, "开始获取图片清单, limit=" + limit + ", offset=" + offset);
            
            ContentResolver contentResolver = reactContext.getContentResolver();
            
            // 查询字段
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
                MediaStore.Images.Media.DATA  // 文件路径
            };
            
            // 排序：按拍摄时间降序（不在这里添加 LIMIT，因为不是所有 Android 版本都支持）
            String sortOrder = MediaStore.Images.Media.DATE_TAKEN + " DESC";
            
            Cursor cursor = contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection,
                null,  // selection
                null,  // selectionArgs
                sortOrder
            );
            
            WritableArray imageArray = Arguments.createArray();
            int count = 0;
            int skipped = 0;
            
            if (cursor != null) {
                int idColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media._ID);
                int nameColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.SIZE);
                int dateTakenColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_TAKEN);
                int dateModifiedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_MODIFIED);
                int dateAddedColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATE_ADDED);
                int widthColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.WIDTH);
                int heightColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.HEIGHT);
                int mimeTypeColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.MIME_TYPE);
                int dataColumn = cursor.getColumnIndexOrThrow(MediaStore.Images.Media.DATA);
                
                // 手动实现分页：跳过 offset 个结果
                if (offset > 0 && cursor.moveToPosition(offset - 1)) {
                    // 移动到起始位置
                } else if (offset > 0) {
                    // offset 超出范围
                    cursor.close();
                    WritableMap result = Arguments.createMap();
                    result.putArray("images", imageArray);
                    result.putInt("count", 0);
                    result.putInt("offset", offset);
                    result.putBoolean("hasMore", false);
                    promise.resolve(result);
                    return;
                }
                
                // 读取指定数量的结果
                while (cursor.moveToNext()) {
                    long id = cursor.getLong(idColumn);
                    String displayName = cursor.getString(nameColumn);
                    long size = cursor.getLong(sizeColumn);
                    long dateTaken = cursor.getLong(dateTakenColumn);
                    long dateModified = cursor.getLong(dateModifiedColumn);
                    long dateAdded = cursor.getLong(dateAddedColumn);
                    int width = cursor.getInt(widthColumn);
                    int height = cursor.getInt(heightColumn);
                    String mimeType = cursor.getString(mimeTypeColumn);
                    String path = cursor.getString(dataColumn);
                    
                    // 构建Content URI
                    Uri contentUri = ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                        id
                    );
                    
                    WritableMap imageInfo = Arguments.createMap();
                    imageInfo.putString("id", String.valueOf(id));
                    imageInfo.putString("uri", contentUri.toString());
                    imageInfo.putString("fileName", displayName);
                    imageInfo.putString("path", path);
                    imageInfo.putDouble("size", size);
                    imageInfo.putDouble("dateTaken", dateTaken);
                    imageInfo.putDouble("dateModified", dateModified * 1000); // 转换为毫秒
                    imageInfo.putDouble("dateAdded", dateAdded * 1000); // 转换为毫秒
                    imageInfo.putInt("width", width);
                    imageInfo.putInt("height", height);
                    imageInfo.putString("mimeType", mimeType);
                    
                    imageArray.pushMap(imageInfo);
                    count++;
                    
                    // 如果设置了 limit，达到 limit 后停止
                    if (limit > 0 && count >= limit) {
                        break;
                    }
                }
                
                cursor.close();
            }
            
            WritableMap result = Arguments.createMap();
            result.putArray("images", imageArray);
            result.putInt("count", count);
            result.putInt("offset", offset);
            result.putBoolean("hasMore", count == limit);
            
            Log.d(TAG, "成功获取 " + count + " 张图片");
            promise.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "获取图片清单失败: " + e.getMessage(), e);
            promise.reject("GET_IMAGES_ERROR", e.getMessage());
        }
    }

    /**
     * 提取图片的EXIF信息
     * @param uriString 图片URI
     * @param promise Promise对象
     */
    @ReactMethod
    public void getImageExif(String uriString, Promise promise) {
        try {
            Uri uri = Uri.parse(uriString);
            ContentResolver contentResolver = reactContext.getContentResolver();
            
            // Android 10+ 需要使用setRequireOriginal获取原始图片（包含完整EXIF）
            Uri originalUri = uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                try {
                    originalUri = MediaStore.setRequireOriginal(uri);
                } catch (Exception e) {
                    Log.w(TAG, "无法获取原始图片，使用普通URI: " + e.getMessage());
                }
            }
            
            InputStream inputStream = contentResolver.openInputStream(originalUri);
            if (inputStream == null) {
                promise.reject("EXIF_ERROR", "无法打开图片流");
                return;
            }
            
            ExifInterface exif = new ExifInterface(inputStream);
            WritableMap exifData = Arguments.createMap();
            
            // 提取拍摄时间
            String dateTimeOriginal = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
            String dateTime = exif.getAttribute(ExifInterface.TAG_DATETIME);
            String dateTimeDigitized = exif.getAttribute(ExifInterface.TAG_DATETIME_DIGITIZED);
            
            if (dateTimeOriginal != null) {
                exifData.putString("dateTimeOriginal", dateTimeOriginal);
                exifData.putDouble("takenTime", parseExifDateTime(dateTimeOriginal));
            } else if (dateTime != null) {
                exifData.putString("dateTime", dateTime);
                exifData.putDouble("takenTime", parseExifDateTime(dateTime));
            } else if (dateTimeDigitized != null) {
                exifData.putString("dateTimeDigitized", dateTimeDigitized);
                exifData.putDouble("takenTime", parseExifDateTime(dateTimeDigitized));
            }
            
            // 提取GPS信息
            float[] latLong = new float[2];
            boolean hasGPS = exif.getLatLong(latLong);
            
            if (hasGPS) {
                WritableMap gpsInfo = Arguments.createMap();
                gpsInfo.putDouble("latitude", latLong[0]);
                gpsInfo.putDouble("longitude", latLong[1]);
                
                // 提取GPS高度
                double altitude = exif.getAltitude(0);
                if (altitude != 0) {
                    gpsInfo.putDouble("altitude", altitude);
                }
                
                // 提取GPS时间戳
                String gpsDateStamp = exif.getAttribute(ExifInterface.TAG_GPS_DATESTAMP);
                String gpsTimeStamp = exif.getAttribute(ExifInterface.TAG_GPS_TIMESTAMP);
                if (gpsDateStamp != null && gpsTimeStamp != null) {
                    gpsInfo.putString("gpsDateStamp", gpsDateStamp);
                    gpsInfo.putString("gpsTimeStamp", gpsTimeStamp);
                }
                
                exifData.putMap("gps", gpsInfo);
                exifData.putBoolean("hasGPS", true);
            } else {
                exifData.putBoolean("hasGPS", false);
            }
            
            // 提取图片尺寸
            int imageWidth = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0);
            int imageHeight = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0);
            if (imageWidth > 0 && imageHeight > 0) {
                exifData.putInt("width", imageWidth);
                exifData.putInt("height", imageHeight);
            }
            
            // 提取其他常用EXIF信息
            String make = exif.getAttribute(ExifInterface.TAG_MAKE);
            String model = exif.getAttribute(ExifInterface.TAG_MODEL);
            String orientation = exif.getAttribute(ExifInterface.TAG_ORIENTATION);
            
            if (make != null) exifData.putString("make", make);
            if (model != null) exifData.putString("model", model);
            if (orientation != null) exifData.putString("orientation", orientation);
            
            inputStream.close();
            
            Log.d(TAG, "成功提取EXIF信息, hasGPS=" + hasGPS);
            promise.resolve(exifData);
            
        } catch (IOException e) {
            Log.e(TAG, "读取EXIF失败: " + e.getMessage(), e);
            promise.reject("EXIF_ERROR", e.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "提取EXIF信息失败: " + e.getMessage(), e);
            promise.reject("EXIF_ERROR", e.getMessage());
        }
    }

    /**
     * 批量提取EXIF信息（性能优化版本）
     * @param uriArrayString JSON数组格式的URI列表
     * @param promise Promise对象
     */
    @ReactMethod
    public void batchGetImageExif(String uriArrayString, Promise promise) {
        try {
            // 解析URI数组（简单实现，生产环境应使用JSON库）
            String[] uris = uriArrayString
                .replace("[", "")
                .replace("]", "")
                .replace("\"", "")
                .split(",");
            
            WritableArray results = Arguments.createArray();
            int successCount = 0;
            int failCount = 0;
            
            for (String uriString : uris) {
                uriString = uriString.trim();
                if (uriString.isEmpty()) continue;
                
                try {
                    Uri uri = Uri.parse(uriString);
                    ContentResolver contentResolver = reactContext.getContentResolver();
                    
                    Uri originalUri = uri;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        try {
                            originalUri = MediaStore.setRequireOriginal(uri);
                        } catch (Exception e) {
                            // 忽略错误，使用普通URI
                        }
                    }
                    
                    InputStream inputStream = contentResolver.openInputStream(originalUri);
                    if (inputStream == null) {
                        WritableMap errorResult = Arguments.createMap();
                        errorResult.putString("uri", uriString);
                        errorResult.putBoolean("success", false);
                        errorResult.putString("error", "无法打开图片流");
                        results.pushMap(errorResult);
                        failCount++;
                        continue;
                    }
                    
                    ExifInterface exif = new ExifInterface(inputStream);
                    WritableMap exifData = Arguments.createMap();
                    exifData.putString("uri", uriString);
                    exifData.putBoolean("success", true);
                    
                    // 提取拍摄时间
                    String dateTimeOriginal = exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL);
                    if (dateTimeOriginal != null) {
                        exifData.putDouble("takenTime", parseExifDateTime(dateTimeOriginal));
                    }
                    
                    // 提取GPS信息
                    float[] latLong = new float[2];
                    if (exif.getLatLong(latLong)) {
                        WritableMap gpsInfo = Arguments.createMap();
                        gpsInfo.putDouble("latitude", latLong[0]);
                        gpsInfo.putDouble("longitude", latLong[1]);
                        gpsInfo.putDouble("altitude", exif.getAltitude(0));
                        exifData.putMap("gps", gpsInfo);
                    }
                    
                    // 提取图片尺寸
                    int width = exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0);
                    int height = exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0);
                    if (width > 0) exifData.putInt("width", width);
                    if (height > 0) exifData.putInt("height", height);
                    
                    inputStream.close();
                    results.pushMap(exifData);
                    successCount++;
                    
                } catch (Exception e) {
                    WritableMap errorResult = Arguments.createMap();
                    errorResult.putString("uri", uriString);
                    errorResult.putBoolean("success", false);
                    errorResult.putString("error", e.getMessage());
                    results.pushMap(errorResult);
                    failCount++;
                }
            }
            
            WritableMap result = Arguments.createMap();
            result.putArray("results", results);
            result.putInt("successCount", successCount);
            result.putInt("failCount", failCount);
            result.putInt("total", uris.length);
            
            Log.d(TAG, "批量EXIF提取完成: 成功=" + successCount + ", 失败=" + failCount);
            promise.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "批量提取EXIF失败: " + e.getMessage(), e);
            promise.reject("BATCH_EXIF_ERROR", e.getMessage());
        }
    }

    /**
     * 解析EXIF日期时间格式 (yyyy:MM:dd HH:mm:ss) 为时间戳
     */
    private long parseExifDateTime(String dateTimeStr) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US);
            sdf.setTimeZone(TimeZone.getDefault());
            Date date = sdf.parse(dateTimeStr);
            return date != null ? date.getTime() : 0;
        } catch (Exception e) {
            Log.w(TAG, "解析EXIF日期失败: " + dateTimeStr);
            return 0;
        }
    }

    /**
     * 根据文件路径查询MediaStore URI
     * @param filePath 文件路径
     * @param promise Promise对象
     */
    @ReactMethod
    public void getUriByPath(String filePath, Promise promise) {
        try {
            ContentResolver contentResolver = reactContext.getContentResolver();
            
            String selection = MediaStore.Images.Media.DATA + "=?";
            String[] selectionArgs = {filePath};
            
            Cursor cursor = contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Images.Media._ID},
                selection,
                selectionArgs,
                null
            );
            
            if (cursor != null && cursor.moveToFirst()) {
                int idColumn = cursor.getColumnIndex(MediaStore.Images.Media._ID);
                long id = cursor.getLong(idColumn);
                cursor.close();
                
                Uri contentUri = ContentUris.withAppendedId(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                    id
                );
                
                promise.resolve(contentUri.toString());
            } else {
                if (cursor != null) cursor.close();
                promise.resolve(null);
            }
            
        } catch (Exception e) {
            Log.e(TAG, "根据路径查询URI失败: " + e.getMessage(), e);
            promise.reject("GET_URI_ERROR", e.getMessage());
        }
    }

    /**
     * 批量计算文件哈希（多线程并行计算）
     * @param filePaths 文件路径数组
     * @param promise Promise对象
     */
    @ReactMethod
    public void batchCalculateFileHash(ReadableArray filePaths, Promise promise) {
        try {
            int fileCount = filePaths.size();
            Log.d(TAG, "开始批量哈希计算: " + fileCount + " 个文件");
            
            if (fileCount == 0) {
                WritableArray results = Arguments.createArray();
                WritableMap result = Arguments.createMap();
                result.putArray("results", results);
                result.putInt("successCount", 0);
                result.putInt("failCount", 0);
                result.putInt("total", 0);
                promise.resolve(result);
                return;
            }
            
            long startTime = System.currentTimeMillis();
            
            // 创建线程池（使用CPU核心数）
            int threadCount = Runtime.getRuntime().availableProcessors();
            ExecutorService executor = Executors.newFixedThreadPool(threadCount);
            
            Log.d(TAG, "使用 " + threadCount + " 个线程并行计算");
            
            // 创建任务列表
            List<Future<HashResult>> futures = new ArrayList<>();
            
            for (int i = 0; i < fileCount; i++) {
                final String filePath = filePaths.getString(i);
                final int index = i;
                
                // 提交任务到线程池
                Future<HashResult> future = executor.submit(new Callable<HashResult>() {
                    @Override
                    public HashResult call() {
                        return calculateSingleFileHash(filePath, index);
                    }
                });
                
                futures.add(future);
            }
            
            // 收集结果
            WritableArray results = Arguments.createArray();
            int successCount = 0;
            int failCount = 0;
            
            for (Future<HashResult> future : futures) {
                try {
                    HashResult result = future.get(); // 阻塞等待结果
                    
                    WritableMap resultMap = Arguments.createMap();
                    resultMap.putInt("index", result.index);
                    resultMap.putString("filePath", result.filePath);
                    resultMap.putBoolean("success", result.success);
                    
                    if (result.success) {
                        resultMap.putString("hash", result.hash);
                        successCount++;
                    } else {
                        resultMap.putString("error", result.error);
                        failCount++;
                    }
                    
                    results.pushMap(resultMap);
                    
                } catch (Exception e) {
                    Log.e(TAG, "获取哈希计算结果失败: " + e.getMessage());
                    failCount++;
                }
            }
            
            // 关闭线程池
            executor.shutdown();
            
            long duration = System.currentTimeMillis() - startTime;
            
            // 构建返回结果
            WritableMap finalResult = Arguments.createMap();
            finalResult.putArray("results", results);
            finalResult.putInt("successCount", successCount);
            finalResult.putInt("failCount", failCount);
            finalResult.putInt("total", fileCount);
            finalResult.putDouble("duration", duration);
            
            Log.d(TAG, "批量哈希计算完成: 成功=" + successCount + ", 失败=" + failCount + ", 耗时=" + duration + "ms");
            
            promise.resolve(finalResult);
            
        } catch (Exception e) {
            Log.e(TAG, "批量哈希计算失败: " + e.getMessage(), e);
            promise.reject("BATCH_HASH_ERROR", e.getMessage());
        }
    }

    /**
     * 计算单个文件的SHA-256哈希
     * @param filePath 文件路径
     * @param index 索引
     * @return 哈希结果
     */
    private HashResult calculateSingleFileHash(String filePath, int index) {
        HashResult result = new HashResult();
        result.index = index;
        result.filePath = filePath;
        
        FileInputStream fis = null;
        try {
            // 移除 file:// 前缀
            String cleanPath = filePath.replace("file://", "");
            File file = new File(cleanPath);
            
            if (!file.exists()) {
                result.success = false;
                result.error = "文件不存在";
                return result;
            }
            
            // 创建SHA-256消息摘要
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            
            // 读取文件并计算哈希
            fis = new FileInputStream(file);
            byte[] buffer = new byte[8192]; // 8KB缓冲区
            int bytesRead;
            
            while ((bytesRead = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, bytesRead);
            }
            
            // 获取哈希值
            byte[] hashBytes = digest.digest();
            
            // 转换为十六进制字符串
            StringBuilder hexString = new StringBuilder();
            for (byte b : hashBytes) {
                String hex = Integer.toHexString(0xff & b);
                if (hex.length() == 1) {
                    hexString.append('0');
                }
                hexString.append(hex);
            }
            
            result.success = true;
            result.hash = hexString.toString();
            
        } catch (Exception e) {
            Log.e(TAG, "计算文件哈希失败: " + filePath, e);
            result.success = false;
            result.error = e.getMessage();
        } finally {
            if (fis != null) {
                try {
                    fis.close();
                } catch (IOException e) {
                    // 忽略关闭错误
                }
            }
        }
        
        return result;
    }

    /**
     * 哈希计算结果类
     */
    private static class HashResult {
        int index;
        String filePath;
        boolean success;
        String hash;
        String error;
    }
}
