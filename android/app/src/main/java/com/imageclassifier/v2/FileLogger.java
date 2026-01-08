package com.imageclassifier.v2;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.locks.ReentrantLock;

/**
 * 原生层文件日志系统
 * 双缓冲区设计：两个1000条缓冲区，交替写入
 * 1分钟无日志输出时自动刷新到文件
 */
public class FileLogger {
    private static final String TAG = "FileLogger";
    private static final int BUFFER_SIZE = 1000;
    private static final long FLUSH_INTERVAL_MS = 60 * 1000; // 1分钟
    private static final String LOG_DIR_NAME = "native_logs";
    private static final String LOG_FILE_NAME = "native_log.txt"; // 固定的日志文件名
    
    private static FileLogger instance;
    private static final ReentrantLock instanceLock = new ReentrantLock();
    
    private final Context context;
    private final File logDir;
    private final File logFile; // 固定的日志文件
    private final ReentrantLock bufferLock = new ReentrantLock();
    
    // 双缓冲区
    private final ArrayList<String> buffer1;
    private final ArrayList<String> buffer2;
    private ArrayList<String> currentBuffer;
    
    // 1分钟刷新机制
    private final Handler flushHandler;
    private Runnable flushRunnable;
    
    private FileLogger(Context context) {
        this.context = context.getApplicationContext();
        this.buffer1 = new ArrayList<>(BUFFER_SIZE);
        this.buffer2 = new ArrayList<>(BUFFER_SIZE);
        this.currentBuffer = buffer1;
        this.flushHandler = new Handler(Looper.getMainLooper());
        
        // 初始化日志目录
        this.logDir = new File(this.context.getFilesDir(), LOG_DIR_NAME);
        if (!logDir.exists()) {
            logDir.mkdirs();
        }
        
        // 初始化固定的日志文件
        this.logFile = new File(logDir, LOG_FILE_NAME);
        
        // 初始化刷新任务
        this.flushRunnable = new Runnable() {
            @Override
            public void run() {
                flush();
            }
        };
        
        // 启动第一次刷新计时器
        scheduleFlush();
    }
    
    /**
     * 获取单例实例
     */
    public static FileLogger getInstance(Context context) {
        if (instance == null) {
            instanceLock.lock();
            try {
                if (instance == null) {
                    instance = new FileLogger(context);
                }
            } finally {
                instanceLock.unlock();
            }
        }
        return instance;
    }
    
    /**
     * 记录日志
     * @param level 日志级别 (d, i, w, e)
     * @param tag 标签
     * @param message 消息
     */
    public void log(String level, String tag, String message) {
        if (context == null) {
            return;
        }
        
        // 格式化日志条目
        String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.getDefault())
                .format(new Date());
        String logEntry = String.format("[%s] [%s] %s: %s", timestamp, level.toUpperCase(), tag, message);
        
        // 输出到 logcat（仅在 debug 版本，或 error/warn 级别）
        // Release 版本：只输出 error 和 warn 到 logcat，debug 和 info 不输出到 logcat
        // Debug 版本：所有级别都输出到 logcat
        boolean shouldOutputToLogcat = BuildConfig.DEBUG || 
                                       level.toLowerCase().equals("e") || 
                                       level.toLowerCase().equals("w");
        
        if (shouldOutputToLogcat) {
            switch (level.toLowerCase()) {
                case "d":
                    Log.d(tag, message);
                    break;
                case "i":
                    Log.i(tag, message);
                    break;
                case "w":
                    Log.w(tag, message);
                    break;
                case "e":
                    Log.e(tag, message);
                    break;
                default:
                    Log.d(tag, message);
            }
        }
        
        // 添加到当前缓冲区
        bufferLock.lock();
        try {
            currentBuffer.add(logEntry);
            
            // 如果当前缓冲区满了，切换到另一个缓冲区
            if (currentBuffer.size() >= BUFFER_SIZE) {
                ArrayList<String> otherBuffer = (currentBuffer == buffer1) ? buffer2 : buffer1;
                
                // 如果另一个缓冲区也满了，清空它（覆盖最旧的日志）
                if (otherBuffer.size() >= BUFFER_SIZE) {
                    otherBuffer.clear();
                }
                
                // 切换到另一个缓冲区
                currentBuffer = otherBuffer;
            }
            
            // 重置1分钟计时器
            scheduleFlush();
        } finally {
            bufferLock.unlock();
        }
    }
    
    /**
     * 记录 debug 日志
     */
    public void d(String tag, String message) {
        log("d", tag, message);
    }
    
    /**
     * 记录 info 日志
     */
    public void i(String tag, String message) {
        log("i", tag, message);
    }
    
    /**
     * 记录 warn 日志
     */
    public void w(String tag, String message) {
        log("w", tag, message);
    }
    
    /**
     * 记录 warn 日志（带异常）
     */
    public void w(String tag, String message, Throwable throwable) {
        String fullMessage = message + ": " + Log.getStackTraceString(throwable);
        log("w", tag, fullMessage);
    }
    
    /**
     * 记录 error 日志
     */
    public void e(String tag, String message) {
        log("e", tag, message);
    }
    
    /**
     * 记录 error 日志（带异常）
     */
    public void e(String tag, String message, Throwable throwable) {
        String fullMessage = message + ": " + Log.getStackTraceString(throwable);
        log("e", tag, fullMessage);
    }
    
    /**
     * 安排1分钟后刷新
     */
    private void scheduleFlush() {
        if (flushHandler != null && flushRunnable != null) {
            // 取消旧的计时器
            flushHandler.removeCallbacks(flushRunnable);
            // 启动新的计时器（1分钟后刷新）
            flushHandler.postDelayed(flushRunnable, FLUSH_INTERVAL_MS);
        }
    }
    
    /**
     * 刷新缓冲区到文件
     * 将所有内存中的日志（两个缓冲区的所有内容）写入文件，覆盖模式
     * 永远写入同一个日志文件，每次刷新都覆盖整个文件
     */
    public void flush() {
        if (context == null || logDir == null || logFile == null) {
            return;
        }
        
        bufferLock.lock();
        try {
            // 收集所有内存中的日志（两个缓冲区的所有内容）
            ArrayList<String> otherBuffer = (currentBuffer == buffer1) ? buffer2 : buffer1;
            List<String> allLogs = new ArrayList<>();
            allLogs.addAll(otherBuffer);
            allLogs.addAll(currentBuffer);
            
            // 如果没有日志，无需刷新
            if (allLogs.isEmpty()) {
                return;
            }
            
            // 写入文件（UTF-8 with BOM，覆盖模式）
            try (FileWriter writer = new FileWriter(logFile, false)) {
                // 写入 UTF-8 BOM（\uFEFF）
                writer.write('\uFEFF');
                
                // 写入所有日志内容
                for (String logEntry : allLogs) {
                    writer.write(logEntry);
                    writer.write("\n");
                }
                
                writer.flush();
                
                Log.d(TAG, "✅ 日志已刷新到文件: " + logFile.getAbsolutePath() + 
                      ", 条数: " + allLogs.size());
            } catch (IOException e) {
                Log.e(TAG, "❌ 写入日志文件失败", e);
            }
            
            // 注意：不清空缓冲区，因为内存中需要保留日志供导出使用
            
        } finally {
            bufferLock.unlock();
        }
    }
    
    /**
     * 获取所有内存中的日志（用于导出）
     * @return 所有日志条目的列表
     */
    public List<String> getAllLogs() {
        List<String> allLogs = new ArrayList<>();
        bufferLock.lock();
        try {
            // 添加非当前缓冲区的内容（已满的缓冲区）
            ArrayList<String> otherBuffer = (currentBuffer == buffer1) ? buffer2 : buffer1;
            allLogs.addAll(otherBuffer);
            
            // 添加当前缓冲区的内容
            allLogs.addAll(currentBuffer);
        } finally {
            bufferLock.unlock();
        }
        return allLogs;
    }
    
    /**
     * 获取内存中的日志条数
     */
    public int getLogCount() {
        bufferLock.lock();
        try {
            ArrayList<String> otherBuffer = (currentBuffer == buffer1) ? buffer2 : buffer1;
            return otherBuffer.size() + currentBuffer.size();
        } finally {
            bufferLock.unlock();
        }
    }
    
    /**
     * 获取日志文件路径
     */
    public String getLogFilePath() {
        return logFile != null && logFile.exists() ? logFile.getAbsolutePath() : "";
    }
}

