package com.imageclassifier.v2;

import android.content.Intent;
import android.app.Activity;
import android.util.Log;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class ScanServiceModule extends ReactContextBaseJavaModule {
    private static final String TAG = "ScanServiceModule";
    private final ReactApplicationContext reactContext;
    
    public ScanServiceModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }
    
    @Override
    public String getName() {
        return "ScanServiceModule";
    }
    
    @ReactMethod
    public void startScanService() {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(activity, ScanForegroundService.class);
                intent.setAction("START_SCAN");
                
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    activity.startForegroundService(intent);
                } else {
                    activity.startService(intent);
                }
                Log.d(TAG, "前台服务已启动");
            } else {
                Log.w(TAG, "Activity 为空，无法启动服务");
            }
        } catch (Exception e) {
            Log.e(TAG, "启动前台服务失败: " + e.getMessage(), e);
        }
    }
    
    @ReactMethod
    public void updateScanProgress(String message, int processed, int total) {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(activity, ScanForegroundService.class);
                intent.setAction("UPDATE_PROGRESS");
                intent.putExtra("message", message != null ? message : "扫描中...");
                intent.putExtra("processed", processed);
                intent.putExtra("total", total);
                activity.startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "更新扫描进度失败: " + e.getMessage(), e);
        }
    }
    
    @ReactMethod
    public void stopScanService() {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(activity, ScanForegroundService.class);
                intent.setAction("STOP_SCAN");
                activity.stopService(intent);
                Log.d(TAG, "前台服务已停止");
            }
        } catch (Exception e) {
            Log.e(TAG, "停止前台服务失败: " + e.getMessage(), e);
        }
    }
}

