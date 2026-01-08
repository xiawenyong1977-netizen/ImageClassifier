package com.imageclassifier.v2;

import android.content.Context;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * 原生日志导出模块
 * 供 JavaScript 层调用，导出原生层的日志
 */
public class NativeLogExportModule extends ReactContextBaseJavaModule {
    private static final String TAG = "NativeLogExportModule";
    
    private final ReactApplicationContext reactContext;
    
    public NativeLogExportModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }
    
    @Override
    public String getName() {
        return "NativeLogExportModule";
    }
    
    /**
     * 导出原生日志
     * 返回内存中的日志和最近的文件日志
     */
    @ReactMethod
    public void exportNativeLogs(Promise promise) {
        try {
            Context context = reactContext.getApplicationContext();
            FileLogger fileLogger = FileLogger.getInstance(context);
            
            // 先刷新缓冲区（确保最新日志被保存）
            fileLogger.flush();
            
            // 获取内存中的日志
            List<String> memoryLogs = fileLogger.getAllLogs();
            int memoryLogCount = fileLogger.getLogCount();
            
            // 获取日志文件路径
            String logFilePath = fileLogger.getLogFilePath();
            
            // 读取日志文件内容（只有一个文件）
            String fileContent = "";
            if (logFilePath != null && !logFilePath.isEmpty()) {
                try {
                    fileContent = readFileContent(logFilePath);
                } catch (Exception e) {
                    Log.e(TAG, "读取日志文件失败: " + logFilePath, e);
                }
            }
            
            // 构建返回结果
            WritableMap result = Arguments.createMap();
            
            // 内存日志
            WritableArray memoryLogsArray = Arguments.createArray();
            for (String log : memoryLogs) {
                memoryLogsArray.pushString(log);
            }
            result.putArray("memoryLogs", memoryLogsArray);
            result.putInt("memoryLogCount", memoryLogCount);
            
            // 文件日志（只有一个文件）
            result.putString("fileLogPath", logFilePath);
            result.putString("fileLogContent", fileContent);
            
            // 日志文件路径
            result.putString("logFilePath", logFilePath);
            
            promise.resolve(result);
            
        } catch (Exception e) {
            Log.e(TAG, "导出原生日志失败", e);
            promise.reject("EXPORT_ERROR", "导出原生日志失败: " + e.getMessage(), e);
        }
    }
    
    /**
     * 读取文件内容（UTF-8）
     */
    private String readFileContent(String filePath) throws IOException {
        File file = new File(filePath);
        if (!file.exists() || !file.canRead()) {
            return "";
        }
        
        try (FileInputStream fis = new FileInputStream(file)) {
            byte[] buffer = new byte[(int) file.length()];
            int bytesRead = fis.read(buffer);
            if (bytesRead > 0) {
                // 检查是否有 UTF-8 BOM
                if (bytesRead >= 3 && 
                    buffer[0] == (byte) 0xEF && 
                    buffer[1] == (byte) 0xBB && 
                    buffer[2] == (byte) 0xBF) {
                    // 跳过 BOM
                    return new String(buffer, 3, bytesRead - 3, StandardCharsets.UTF_8);
                } else {
                    return new String(buffer, 0, bytesRead, StandardCharsets.UTF_8);
                }
            }
            return "";
        }
    }
}

