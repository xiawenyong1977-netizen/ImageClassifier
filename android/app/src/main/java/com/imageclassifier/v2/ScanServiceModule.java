package com.imageclassifier.v2;

import android.content.Intent;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.util.Log;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

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
            // 使用 ApplicationContext 而不是 Activity，避免 Activity 为 null 的问题
            // 小米手机可能在后台时 Activity 为 null，导致通知无法更新
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                Intent intent = new Intent(context, ScanForegroundService.class);
                intent.setAction("UPDATE_PROGRESS");
                intent.putExtra("message", message != null ? message : "扫描中...");
                intent.putExtra("processed", processed);
                intent.putExtra("total", total);
                // 使用 startForegroundService 确保服务能正常启动（Android 8.0+）
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent);
                } else {
                    context.startService(intent);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "更新扫描进度失败: " + e.getMessage(), e);
        }
    }
    
    @ReactMethod
    public void stopScanService() {
        try {
            // 使用 ApplicationContext 而不是 Activity，确保在后台时也能停止服务
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                Intent intent = new Intent(context, ScanForegroundService.class);
                intent.setAction("STOP_SCAN");
                context.stopService(intent);
                Log.d(TAG, "前台服务已停止");
            } else {
                Activity activity = getCurrentActivity();
                if (activity != null) {
                    Intent intent = new Intent(activity, ScanForegroundService.class);
                    intent.setAction("STOP_SCAN");
                    activity.stopService(intent);
                    Log.d(TAG, "前台服务已停止（使用Activity）");
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "停止前台服务失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 检查扫描服务是否正在运行
     * @param promise Promise对象，返回服务是否运行
     */
    @ReactMethod
    public void isScanServiceRunning(Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context == null) {
                promise.resolve(false);
                return;
            }
            
            ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager == null) {
                promise.resolve(false);
                return;
            }
            
            // 检查服务是否在运行
            for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
                if (ScanForegroundService.class.getName().equals(service.service.getClassName())) {
                    Log.d(TAG, "扫描服务正在运行");
                    promise.resolve(true);
                    return;
                }
            }
            
            Log.d(TAG, "扫描服务未运行");
            promise.resolve(false);
        } catch (Exception e) {
            Log.e(TAG, "检查服务状态失败: " + e.getMessage(), e);
            promise.resolve(false);
        }
    }
    
    /**
     * 强制停止扫描服务（如果正在运行）
     * 用于在启动新扫描前清理旧的服务状态
     */
    @ReactMethod
    public void forceStopScanService() {
        try {
            Log.d(TAG, "🔄 强制停止扫描服务...");
            // 先发送停止命令
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                Intent intent = new Intent(context, ScanForegroundService.class);
                intent.setAction("STOP_SCAN");
                context.stopService(intent);
                Log.d(TAG, "✅ 已发送停止命令");
            }
            
            // 等待一小段时间确保服务停止
            try {
                Thread.sleep(500);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            
            // 再次检查并强制停止（如果还在运行）
            ActivityManager manager = (ActivityManager) getReactApplicationContext().getSystemService(Context.ACTIVITY_SERVICE);
            if (manager != null) {
                for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
                    if (ScanForegroundService.class.getName().equals(service.service.getClassName())) {
                        Log.w(TAG, "⚠️ 服务仍在运行，尝试强制停止");
                        android.os.Process.killProcess(service.pid);
                        Log.d(TAG, "✅ 已强制停止服务进程");
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "强制停止服务失败: " + e.getMessage(), e);
        }
    }
}

