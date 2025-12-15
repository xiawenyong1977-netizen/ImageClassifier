package com.imageclassifier.v2;

import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;

import java.util.ArrayList;
import java.util.List;

/**
 * 相册扫描模块
 * React Native桥接模块，提供JS层调用原生扫描服务的接口
 */
public class GalleryScanModule extends ReactContextBaseJavaModule {
    private static final String TAG = "GalleryScanModule";
    private final ReactApplicationContext reactContext;
    private GalleryScanService scanService;
    
    public GalleryScanModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.scanService = new GalleryScanService(reactContext);
    }
    
    @Override
    public String getName() {
        return "GalleryScanModule";
    }
    
    /**
     * 启动扫描
     * @param options 扫描选项
     *   - scanPaths: string[] (扫描路径数组，相对路径，如 ["DCIM/Camera"])
     *   - compareLimit: number (比对限制，0表示不限制，推荐值：100用于快速测试，1000用于正常使用)
     *   - remoteApiUrl: string (远程推理API地址，可选)
     *   - cacheApiUrl: string (远端缓存API地址，可选)
     *   - language: string (语言设置，'zh' 表示中文，'en' 表示英文，用于城市名称选择，默认为 'zh')
     * @param promise Promise对象
     * @return 返回对象包含：
     *   - scanId: string (扫描任务ID)
     *   - totalImagesToBeClassified: number (总需要处理的图片数量 = 新增照片 + 数据库中NA分类的照片)
     */
    @ReactMethod
    public void startScan(ReadableMap options, Promise promise) {
        try {
            // 解析扫描路径
            List<String> scanPaths = new ArrayList<>();
            if (options.hasKey("scanPaths")) {
                ReadableArray scanPathsArray = options.getArray("scanPaths");
                if (scanPathsArray != null) {
                    for (int i = 0; i < scanPathsArray.size(); i++) {
                        String path = scanPathsArray.getString(i);
                        if (path != null && !path.isEmpty()) {
                            scanPaths.add(path);
                        }
                    }
                }
            }
            
            // 解析其他选项
            int compareLimit = options.hasKey("compareLimit") ? options.getInt("compareLimit") : 0;
            String remoteApiUrl = options.hasKey("remoteApiUrl") ? options.getString("remoteApiUrl") : null;
            String cacheApiUrl = options.hasKey("cacheApiUrl") ? options.getString("cacheApiUrl") : null;
            // 🔥 解耦：语言设置由JS层传递，用于城市名称选择
            String language = options.hasKey("language") ? options.getString("language") : "zh"; // 默认为中文
            
            // 启动扫描（同步执行阶段1和阶段2，返回总数量）
            GalleryScanService.ScanStartResult result = scanService.startScan(scanPaths, compareLimit, remoteApiUrl, cacheApiUrl, language);
            
            // 构建返回对象
            WritableMap resultMap = Arguments.createMap();
            resultMap.putString("scanId", result.scanId);
            resultMap.putInt("totalImagesToBeClassified", result.totalImagesToBeClassified);
            
            Log.d(TAG, "扫描已启动: " + result.scanId + ", 总数量: " + result.totalImagesToBeClassified + ", compareLimit=" + compareLimit);
            promise.resolve(resultMap);
            
        } catch (Exception e) {
            Log.e(TAG, "启动扫描失败", e);
            promise.reject("START_SCAN_ERROR", e.getMessage());
        }
    }
    
    /**
     * 添加事件监听器（React Native NativeEventEmitter 要求）
     * @param eventName 事件名称
     */
    @ReactMethod
    public void addListener(String eventName) {
        // React Native NativeEventEmitter 要求实现此方法
        // 实际的事件发送在 GalleryScanService 中通过 DeviceEventManagerModule 完成
    }
    
    /**
     * 移除事件监听器（React Native NativeEventEmitter 要求）
     * @param count 要移除的监听器数量
     */
    @ReactMethod
    public void removeListeners(Integer count) {
        // React Native NativeEventEmitter 要求实现此方法
        // 实际的事件发送在 GalleryScanService 中通过 DeviceEventManagerModule 完成
    }
    
}

