package com.imageclassifier;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.File;

public class MediaStoreModule extends ReactContextBaseJavaModule {
    private static final String TAG = "MediaStoreModule";
    private final ReactApplicationContext reactContext;

    public MediaStoreModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }

    @Override
    public String getName() {
        return "MediaStoreModule";
    }

    @ReactMethod
    public void deleteFile(String filePath, Promise promise) {
        try {
            Log.d(TAG, "尝试删除文件: " + filePath);
            
            // 方法1: 使用MediaStore删除
            boolean deleted = deleteFileViaMediaStore(filePath);
            if (deleted) {
                Log.d(TAG, "MediaStore删除成功: " + filePath);
                promise.resolve(true);
                return;
            }
            
            // 方法2: 使用File.delete()删除
            deleted = deleteFileDirectly(filePath);
            if (deleted) {
                Log.d(TAG, "直接删除成功: " + filePath);
                promise.resolve(true);
                return;
            }
            
            // 方法3: 使用系统命令删除
            deleted = deleteFileViaSystem(filePath);
            if (deleted) {
                Log.d(TAG, "系统命令删除成功: " + filePath);
                promise.resolve(true);
                return;
            }
            
            Log.d(TAG, "所有删除方法都失败了: " + filePath);
            // 静默处理错误，不触发系统通知，只返回false
            promise.resolve(false);
            
        } catch (Exception e) {
            Log.e(TAG, "删除文件时发生错误: " + e.getMessage(), e);
            // 静默处理异常，不触发系统通知，只返回false
            promise.resolve(false);
        }
    }

    private boolean deleteFileViaMediaStore(String filePath) {
        try {
            ContentResolver contentResolver = reactContext.getContentResolver();
            
            // 查询文件的MediaStore ID
            String selection = MediaStore.Images.Media.DATA + "=?";
            String[] selectionArgs = {filePath};
            
            Cursor cursor = contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                new String[]{MediaStore.Images.Media._ID},
                selection,
                selectionArgs,
                null
            );
            
            if (cursor != null && cursor.moveToFirst()) {
                int idColumn = cursor.getColumnIndex(MediaStore.Images.Media._ID);
                long id = cursor.getLong(idColumn);
                cursor.close();
                
                // 使用MediaStore删除文件
                Uri deleteUri = Uri.withAppendedPath(
                    MediaStore.Images.Media.EXTERNAL_CONTENT_URI, 
                    String.valueOf(id)
                );
                
                int deletedRows = contentResolver.delete(deleteUri, null, null);
                Log.d(TAG, "MediaStore删除结果: " + deletedRows + " 行");
                
                // 验证文件是否真的被删除了
                File file = new File(filePath);
                return !file.exists();
            }
            
            if (cursor != null) {
                cursor.close();
            }
            
            return false;
            
        } catch (Exception e) {
            Log.e(TAG, "MediaStore删除失败: " + e.getMessage(), e);
            return false;
        }
    }

    private boolean deleteFileDirectly(String filePath) {
        try {
            File file = new File(filePath);
            if (file.exists()) {
                boolean deleted = file.delete();
                Log.d(TAG, "直接删除结果: " + deleted);
                return deleted && !file.exists();
            }
            return false;
        } catch (Exception e) {
            Log.e(TAG, "直接删除失败: " + e.getMessage(), e);
            return false;
        }
    }

    private boolean deleteFileViaSystem(String filePath) {
        try {
            // 使用Runtime执行系统命令
            Process process = Runtime.getRuntime().exec("rm -f \"" + filePath + "\"");
            int exitCode = process.waitFor();
            
            Log.d(TAG, "系统命令删除结果: " + exitCode);
            
            // 验证文件是否真的被删除了
            File file = new File(filePath);
            return !file.exists();
            
        } catch (Exception e) {
            Log.e(TAG, "系统命令删除失败: " + e.getMessage(), e);
            return false;
        }
    }

    @ReactMethod
    public void getFileInfo(String filePath, Promise promise) {
        try {
            File file = new File(filePath);
            WritableMap fileInfo = Arguments.createMap();
            
            if (file.exists()) {
                fileInfo.putBoolean("exists", true);
                fileInfo.putString("path", file.getAbsolutePath());
                fileInfo.putString("name", file.getName());
                fileInfo.putDouble("size", file.length());
                fileInfo.putDouble("lastModified", file.lastModified());
                fileInfo.putBoolean("canRead", file.canRead());
                fileInfo.putBoolean("canWrite", file.canWrite());
                fileInfo.putBoolean("canExecute", file.canExecute());
            } else {
                fileInfo.putBoolean("exists", false);
            }
            
            promise.resolve(fileInfo);
            
        } catch (Exception e) {
            Log.e(TAG, "获取文件信息失败: " + e.getMessage(), e);
            promise.reject("FILE_INFO_ERROR", e.getMessage());
        }
    }
}
