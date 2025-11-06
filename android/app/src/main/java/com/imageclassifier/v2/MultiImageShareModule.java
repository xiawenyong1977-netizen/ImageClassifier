package com.imageclassifier.v2;

import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.Promise;
import java.io.File;
import java.util.ArrayList;

public class MultiImageShareModule extends ReactContextBaseJavaModule {
    
    private ReactApplicationContext reactContext;
    
    public MultiImageShareModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
    }
    
    @Override
    public String getName() {
        return "MultiImageShareModule";
    }
    
    @ReactMethod
    public void shareMultipleImages(ReadableArray imagePaths, Promise promise) {
        try {
            Intent shareIntent = new Intent(Intent.ACTION_SEND_MULTIPLE);
            shareIntent.setType("image/*");
            
            ArrayList<Uri> imageUris = new ArrayList<>();
            
            for (int i = 0; i < imagePaths.size(); i++) {
                String imagePath = imagePaths.getString(i);
                if (imagePath != null && !imagePath.isEmpty()) {
                    // 移除file://前缀
                    if (imagePath.startsWith("file://")) {
                        imagePath = imagePath.substring(7);
                    }
                    
                    File imageFile = new File(imagePath);
                    if (imageFile.exists()) {
                        // 使用FileProvider生成URI
                        Uri imageUri = FileProvider.getUriForFile(
                            reactContext,
                            reactContext.getPackageName() + ".fileprovider",
                            imageFile
                        );
                        imageUris.add(imageUri);
                    }
                }
            }
            
            if (imageUris.isEmpty()) {
                promise.reject("NO_IMAGES", "没有找到有效的图片文件");
                return;
            }
            
            shareIntent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, imageUris);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            
            // 创建分享选择器
            // 使用 createChooser 确保 Android 系统在分享完成后显示"完成"对话框
            // 对话框会显示"返回[应用名称]"选项，让用户选择返回芯图相册或留在微信
            Intent chooserIntent = Intent.createChooser(shareIntent, "分享图片到");
            // 必须添加 FLAG_ACTIVITY_NEW_TASK，因为是从后台启动
            chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            // 不要添加 FLAG_ACTIVITY_EXCLUDE_FROM_RECENTS，这不会影响返回提示
            // createChooser 会自动处理返回提示的显示
            
            reactContext.startActivity(chooserIntent);
            promise.resolve("分享成功");
            
        } catch (Exception e) {
            promise.reject("SHARE_ERROR", e.getMessage());
        }
    }
}