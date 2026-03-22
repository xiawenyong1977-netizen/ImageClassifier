package com.imageclassifier.v2;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.module.annotations.ReactModule;

@ReactModule(name = PersonIndexForegroundModule.NAME)
public class PersonIndexForegroundModule extends ReactContextBaseJavaModule {

    public static final String NAME = "PersonIndexForeground";
    private static final String TAG = "PersonIndexForeground";

    public PersonIndexForegroundModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void startPersonIndexForeground() {
        try {
            Activity activity = getCurrentActivity();
            Context ctx = activity != null ? activity : getReactApplicationContext();
            Intent intent = new Intent(ctx, PersonIndexForegroundService.class);
            intent.setAction("START_PERSON_INDEX");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            Log.d(TAG, "人物分组前台服务已启动");
        } catch (Exception e) {
            Log.e(TAG, "启动人物分组前台服务失败", e);
        }
    }

    @ReactMethod
    public void updatePersonIndexProgress(String message, int processed, int total, String title) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context == null) {
                return;
            }
            Intent intent = new Intent(context, PersonIndexForegroundService.class);
            intent.setAction("UPDATE_PERSON_INDEX_PROGRESS");
            String finalMessage = message != null ? message : "Person grouping...";
            intent.putExtra("message", finalMessage);
            intent.putExtra("processed", processed);
            intent.putExtra("total", total);
            if (title != null) {
                intent.putExtra("title", title);
            }
            context.startService(intent);
        } catch (Exception e) {
            Log.e(TAG, "更新人物分组通知失败", e);
        }
    }

    @ReactMethod
    public void stopPersonIndexForeground() {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context != null) {
                Intent intent = new Intent(context, PersonIndexForegroundService.class);
                intent.setAction("STOP_PERSON_INDEX");
                context.stopService(intent);
                Log.d(TAG, "人物分组前台服务已停止");
                return;
            }
            Activity activity = getCurrentActivity();
            if (activity != null) {
                Intent intent = new Intent(activity, PersonIndexForegroundService.class);
                intent.setAction("STOP_PERSON_INDEX");
                activity.stopService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "停止人物分组前台服务失败", e);
        }
    }

    /**
     * 与 {@link ScanServiceModule#isScanServiceRunning(Promise)} 语义一致：扫描或人物分组任一前台在跑即为 true。
     */
    @ReactMethod
    public void isPersonIndexForegroundRunning(Promise promise) {
        try {
            ReactApplicationContext context = getReactApplicationContext();
            if (context == null) {
                promise.resolve(false);
                return;
            }
            promise.resolve(ExclusiveForegroundTasks.isAnyExclusiveForegroundRunning(context));
        } catch (Exception e) {
            Log.e(TAG, "检查独占前台任务失败", e);
            promise.resolve(false);
        }
    }
}
