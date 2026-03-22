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
    public void updateScanProgress(String message, int processed, int total, String title) {
        try {
            // 使用 ApplicationContext 而不是 Activity，避免 Activity 为 null 的问题
            // 小米手机可能在后台时 Activity 为 null，导致通知无法更新
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                Intent intent = new Intent(context, ScanForegroundService.class);
                intent.setAction("UPDATE_PROGRESS");
                // 🔥 解耦：如果消息为null，使用硬编码的英文默认消息
                // 通知的实际内容完全由JS层控制，原生层只提供fallback
                String finalMessage = message != null ? message : "Scanning...";
                intent.putExtra("message", finalMessage);
                intent.putExtra("processed", processed);
                intent.putExtra("total", total);
                // 🔥 解耦：通知标题也由JS层传递，如果为null则使用资源文件的默认值（已国际化）
                if (title != null) {
                    intent.putExtra("title", title);
                }
                // 🔥 修复：使用 startService 而不是 startForegroundService
                // 服务应该在扫描开始时通过 startScanService() 启动，updateProgress 只用于更新通知
                // 如果服务没有启动，startService() 会启动服务，然后在 UPDATE_PROGRESS action 中调用 startForeground()
                // 如果服务已经启动，startService() 只会调用 onStartCommand 更新通知，不会触发5秒超时
                context.startService(intent);
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
     * 检查「独占后台任务」是否正在运行（相册扫描或人物分组前台任一）
     * @param promise Promise对象，返回是否占用
     */
    @ReactMethod
    public void isScanServiceRunning(Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context == null) {
                promise.resolve(false);
                return;
            }
            boolean busy = ExclusiveForegroundTasks.isAnyExclusiveForegroundRunning(context);
            Log.d(TAG, busy ? "独占任务占用中" : "独占任务未占用");
            promise.resolve(busy);
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
            Log.d(TAG, "🔄 强制停止独占前台服务（扫描 + 人物分组）...");
            // 先发送停止命令
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                Intent personIntent = new Intent(context, PersonIndexForegroundService.class);
                personIntent.setAction("STOP_PERSON_INDEX");
                context.stopService(personIntent);
                Intent intent = new Intent(context, ScanForegroundService.class);
                intent.setAction("STOP_SCAN");
                context.stopService(intent);
                Log.d(TAG, "✅ 已发送停止扫描/人物分组前台命令");
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
                    String cn = service.service.getClassName();
                    if (ScanForegroundService.class.getName().equals(cn)
                        || PersonIndexForegroundService.class.getName().equals(cn)) {
                        Log.w(TAG, "⚠️ 前台服务仍在运行，尝试强制停止: " + cn);
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

