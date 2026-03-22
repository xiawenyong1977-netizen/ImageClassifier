package com.imageclassifier.v2;

import android.app.ActivityManager;
import android.content.Context;
import android.util.Log;

/**
 * 相册扫描与人物分组共用「独占」语义：任一前台任务在跑即视为占用，防止并发写库。
 */
public final class ExclusiveForegroundTasks {

    private static final String TAG = "ExclusiveForegroundTasks";

    private ExclusiveForegroundTasks() {
    }

    public static boolean isServiceClassRunning(Context context, Class<?> serviceClass) {
        if (context == null || serviceClass == null) {
            return false;
        }
        ActivityManager manager = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
        if (manager == null) {
            return false;
        }
        try {
            for (ActivityManager.RunningServiceInfo service : manager.getRunningServices(Integer.MAX_VALUE)) {
                if (serviceClass.getName().equals(service.service.getClassName())) {
                    return true;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "检查服务失败: " + serviceClass.getSimpleName(), e);
        }
        return false;
    }

    /** 扫描前台或人物分组前台任一在运行 */
    public static boolean isAnyExclusiveForegroundRunning(Context context) {
        return isServiceClassRunning(context, ScanForegroundService.class)
            || isServiceClassRunning(context, PersonIndexForegroundService.class);
    }
}
