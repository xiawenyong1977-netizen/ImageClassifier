package com.imageclassifier.v2;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

public class ScanForegroundService extends Service {
    private static final String CHANNEL_ID = "ScanServiceChannel";
    private static final int NOTIFICATION_ID = 1;
    
    private NotificationManager notificationManager;
    private PowerManager.WakeLock wakeLock;
    private android.os.Handler handler;
    private Runnable heartbeatRunnable;
    
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        
        // 创建 WakeLock 防止 CPU 休眠
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "ScanForegroundService::WakeLock"
        );
        
        // 创建 Handler 用于定期发送心跳
        handler = new android.os.Handler(android.os.Looper.getMainLooper());
        
        // 心跳任务：定期更新通知，保持服务活跃
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                // 每30秒更新一次通知，保持服务活跃
                updateNotification("扫描中...", 0, 0);
                // 继续下一次心跳
                if (handler != null) {
                    handler.postDelayed(this, 30000); // 30秒
                }
            }
        };
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }
        
        String action = intent.getAction();
        
        if ("START_SCAN".equals(action)) {
            // 获取 WakeLock，防止 CPU 休眠
            // 使用超长超时时间，确保扫描过程中不会释放
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(60 * 60 * 1000L /*60分钟*/);
            }
            startForeground(NOTIFICATION_ID, createNotification("开始扫描...", 0, 0));
            
            // 启动心跳任务，定期更新通知保持服务活跃
            if (handler != null && heartbeatRunnable != null) {
                handler.postDelayed(heartbeatRunnable, 30000); // 30秒后开始第一次心跳
            }
        } else if ("UPDATE_PROGRESS".equals(action)) {
            String message = intent.getStringExtra("message");
            int processed = intent.getIntExtra("processed", 0);
            int total = intent.getIntExtra("total", 0);
            updateNotification(message != null ? message : "扫描中...", processed, total);
        } else if ("STOP_SCAN".equals(action)) {
            // 停止心跳任务
            if (handler != null && heartbeatRunnable != null) {
                handler.removeCallbacks(heartbeatRunnable);
            }
            
            // 释放 WakeLock
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            stopForeground(true);
            stopSelf();
        }
        
        // 使用 START_STICKY 确保服务被系统杀死后自动重启
        return START_STICKY;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "图片扫描服务",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("显示图片扫描进度");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }
    
    private Notification createNotification(String message, int processed, int total) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M 
            ? PendingIntent.FLAG_IMMUTABLE 
            : PendingIntent.FLAG_UPDATE_CURRENT;
            
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, notificationIntent, flags
        );
        
        String progressText = total > 0 
            ? String.format("%s (%d/%d)", message, processed, total)
            : message;
        
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("照片智能分类")
            .setContentText(progressText)
            .setSmallIcon(android.R.drawable.ic_menu_upload)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false);
        
        if (total > 0) {
            builder.setProgress(total, processed, false);
        }
        
        return builder.build();
    }
    
    private void updateNotification(String message, int processed, int total) {
        Notification notification = createNotification(message, processed, total);
        notificationManager.notify(NOTIFICATION_ID, notification);
    }
    
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    @Override
    public void onDestroy() {
        super.onDestroy();
        // 停止心跳任务
        if (handler != null && heartbeatRunnable != null) {
            handler.removeCallbacks(heartbeatRunnable);
        }
        
        // 释放 WakeLock
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        notificationManager.cancel(NOTIFICATION_ID);
    }
}

