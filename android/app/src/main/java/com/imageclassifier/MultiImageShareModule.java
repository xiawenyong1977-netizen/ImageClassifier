package com.imageclassifier;

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
            
            Intent chooserIntent = Intent.createChooser(shareIntent, "分享图片到");
            chooserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            
            reactContext.startActivity(chooserIntent);
            promise.resolve("分享成功");
            
        } catch (Exception e) {
            promise.reject("SHARE_ERROR", e.getMessage());
        }
    }
}