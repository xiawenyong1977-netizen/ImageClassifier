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

/**
 * 人物分组专用前台服务：与相册扫描 {@link ScanForegroundService} 分离的通知渠道、文案与 notificationId。
 */
public class PersonIndexForegroundService extends Service {
    private static final String CHANNEL_ID = "PersonIndexServiceChannel";
    private static final int NOTIFICATION_ID = 2;

    private static final String DEFAULT_MESSAGE = "Person grouping...";
    private static final String DEFAULT_STARTING = "Starting person grouping...";

    private NotificationManager notificationManager;
    private PowerManager.WakeLock wakeLock;
    private android.os.Handler handler;
    private Runnable heartbeatRunnable;

    private String lastProgressMessage;
    private String lastTitle;
    private int lastProcessed;
    private int lastTotal;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);

        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "PersonIndexForegroundService::WakeLock"
        );

        handler = new android.os.Handler(android.os.Looper.getMainLooper());
        heartbeatRunnable = new Runnable() {
            @Override
            public void run() {
                updateNotification(lastProgressMessage, lastProcessed, lastTotal, lastTitle);
                if (handler != null) {
                    handler.postDelayed(this, 10000);
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

        if ("START_PERSON_INDEX".equals(action)) {
            Notification simple = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(getString(R.string.person_index_notification_title))
                .setContentText(DEFAULT_STARTING)
                .setSmallIcon(android.R.drawable.ic_menu_myplaces)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .build();

            startForeground(NOTIFICATION_ID, simple);

            lastProgressMessage = DEFAULT_STARTING;
            lastTitle = null;
            lastProcessed = 0;
            lastTotal = 0;

            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(60 * 60 * 1000L);
            }

            if (handler != null) {
                handler.post(new Runnable() {
                    @Override
                    public void run() {
                        updateNotification(DEFAULT_STARTING, 0, 0, null);
                    }
                });
            } else {
                updateNotification(DEFAULT_STARTING, 0, 0, null);
            }

            if (handler != null && heartbeatRunnable != null) {
                handler.postDelayed(heartbeatRunnable, 10000);
            }
        } else if ("UPDATE_PERSON_INDEX_PROGRESS".equals(action)) {
            String message = intent.getStringExtra("message");
            int processed = intent.getIntExtra("processed", 0);
            int total = intent.getIntExtra("total", 0);
            String title = intent.getStringExtra("title");

            Notification progressNotification = createNotification(
                message != null ? message : DEFAULT_MESSAGE,
                processed,
                total,
                title
            );
            startForeground(NOTIFICATION_ID, progressNotification);

            if (message != null) {
                lastProgressMessage = message;
            } else {
                lastProgressMessage = DEFAULT_MESSAGE;
            }
            if (title != null) {
                lastTitle = title;
            }
            lastProcessed = processed;
            lastTotal = total;

            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(60 * 60 * 1000L);
            }

            if (handler != null && heartbeatRunnable != null) {
                handler.removeCallbacks(heartbeatRunnable);
                handler.postDelayed(heartbeatRunnable, 10000);
            }
        } else if ("STOP_PERSON_INDEX".equals(action)) {
            if (handler != null && heartbeatRunnable != null) {
                handler.removeCallbacks(heartbeatRunnable);
            }
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            stopForeground(true);
            stopSelf();
        }

        return START_STICKY | START_REDELIVER_INTENT;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                getString(R.string.person_index_notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription(getString(R.string.person_index_notification_channel_description));
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification createNotification(String message, int processed, int total, String title) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 1, notificationIntent, flags);

        String progressText = total > 0
            ? String.format("%s (%d/%d)", message, processed, total)
            : message;

        String notificationTitle = title != null ? title : getString(R.string.person_index_notification_title);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(notificationTitle)
            .setContentText(progressText)
            .setSmallIcon(android.R.drawable.ic_menu_myplaces)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setOnlyAlertOnce(false)
            .setAutoCancel(false)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis());

        if (total > 0) {
            builder.setProgress(total, processed, false);
        }

        return builder.build();
    }

    private void updateNotification(String message, int processed, int total, String title) {
        Notification notification = createNotification(message, processed, total, title);
        notificationManager.notify(NOTIFICATION_ID, notification);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (handler != null && heartbeatRunnable != null) {
            handler.removeCallbacks(heartbeatRunnable);
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        notificationManager.cancel(NOTIFICATION_ID);
        try {
            FileLogger.getInstance(this).flush();
        } catch (Exception e) {
            android.util.Log.e("PersonIndexForegroundService", "flush log failed", e);
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (wakeLock != null && wakeLock.isHeld()) {
            Intent restartIntent = new Intent(this, PersonIndexForegroundService.class);
            restartIntent.setAction("START_PERSON_INDEX");
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restartIntent);
            } else {
                startService(restartIntent);
            }
        }
    }
}
