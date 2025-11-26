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
    
    // 🔥 新增：保存最后一次的进度消息，供心跳机制使用
    private String lastProgressMessage = "扫描中...";
    private int lastProcessed = 0;
    private int lastTotal = 0;
    
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
                // 🔥 优化：使用最后一次的进度消息，而不是固定的"扫描中..."
                // 这样心跳时也能显示实际的扫描进度
                updateNotification(lastProgressMessage, lastProcessed, lastTotal);
                // 继续下一次心跳
                if (handler != null) {
                    handler.postDelayed(this, 10000); // 🔥 从30秒改为10秒
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
            // 🔥 初始化进度消息
            lastProgressMessage = "开始扫描...";
            lastProcessed = 0;
            lastTotal = 0;
            startForeground(NOTIFICATION_ID, createNotification("开始扫描...", 0, 0));
            
            // 启动心跳任务，定期更新通知保持服务活跃
            // 🔥 优化：缩短心跳间隔从30秒到10秒
            if (handler != null && heartbeatRunnable != null) {
                handler.postDelayed(heartbeatRunnable, 10000); // 🔥 10秒后开始第一次心跳
            }
        } else if ("UPDATE_PROGRESS".equals(action)) {
            String message = intent.getStringExtra("message");
            int processed = intent.getIntExtra("processed", 0);
            int total = intent.getIntExtra("total", 0);
            
            // 🔥 保存进度消息，供心跳机制使用
            if (message != null) {
                lastProgressMessage = message;
            } else {
                lastProgressMessage = "扫描中...";
            }
            lastProcessed = processed;
            lastTotal = total;
            
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
        
        // 🔥 优化：使用 START_STICKY | START_REDELIVER_INTENT 提高服务优先级
        // START_STICKY: 服务被杀死后自动重启
        // START_REDELIVER_INTENT: 服务被杀死后重新传递最后一个 Intent
        return START_STICKY | START_REDELIVER_INTENT;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "照片扫描服务",
                NotificationManager.IMPORTANCE_DEFAULT // 改为 DEFAULT，确保通知能及时更新（小米手机需要）
            );
            channel.setDescription("显示照片扫描进度");
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            // 小米手机优化：允许通知更新
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            
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
            .setPriority(NotificationCompat.PRIORITY_DEFAULT) // 改为 DEFAULT，确保通知能及时更新
            .setOnlyAlertOnce(false) // 改为 false，允许每次更新都显示（小米手机需要）
            .setAutoCancel(false)
            .setShowWhen(true) // 显示时间戳，帮助用户看到更新
            .setWhen(System.currentTimeMillis()); // 设置当前时间，确保每次更新都有新的时间戳
        
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
    
    // 🔥 新增：当应用从最近任务中移除时，尝试保持服务运行
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        android.util.Log.d("ScanForegroundService", "⚠️ 应用从最近任务中移除，尝试保持服务运行");
        
        // 如果正在扫描（WakeLock 被持有），重新启动服务
        if (wakeLock != null && wakeLock.isHeld()) {
            Intent restartIntent = new Intent(this, ScanForegroundService.class);
            restartIntent.setAction("START_SCAN");
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restartIntent);
            } else {
                startService(restartIntent);
            }
            android.util.Log.d("ScanForegroundService", "✅ 已重新启动服务");
        }
    }
}

