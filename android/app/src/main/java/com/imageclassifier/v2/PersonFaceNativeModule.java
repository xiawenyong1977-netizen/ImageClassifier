package com.imageclassifier.v2;

import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.module.annotations.ReactModule;
import com.imageclassifier.v2.face.PersonFaceOnnxPipeline;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * 人物分组：原生 SCRFD + ArcFace ONNX，供 JS 聚类写库调用。
 */
@ReactModule(name = PersonFaceNativeModule.NAME)
public class PersonFaceNativeModule extends ReactContextBaseJavaModule {

    public static final String NAME = "PersonFaceNative";
    private static final String TAG = "PersonFaceNative";

    private final PersonFaceOnnxPipeline pipeline = new PersonFaceOnnxPipeline();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public PersonFaceNativeModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return NAME;
    }

    @ReactMethod
    public void initialize(String detectorPath, String embeddingPath, double personSimilarityThreshold, Promise promise) {
        executor.execute(() -> {
            try {
                pipeline.initialize(detectorPath, embeddingPath, personSimilarityThreshold);
                promise.resolve(true);
            } catch (Throwable t) {
                Log.e(TAG, "initialize failed", t);
                promise.reject("PERSON_FACE_INIT", t.getMessage(), t);
            }
        });
    }

    @ReactMethod
    public void detectAndEmbed(String imageUri, Promise promise) {
        if (imageUri == null || imageUri.isEmpty()) {
            promise.resolve(null);
            return;
        }
        executor.execute(() -> {
            try {
                WritableMap map = pipeline.detectAndEmbed(getReactApplicationContext(), imageUri);
                if (map == null) {
                    promise.resolve(null);
                } else {
                    promise.resolve(map);
                }
            } catch (Throwable t) {
                Log.e(TAG, "detectAndEmbed failed: " + imageUri, t);
                promise.reject("PERSON_FACE_RUN", t.getMessage(), t);
            }
        });
    }

    @ReactMethod
    public void release(Promise promise) {
        executor.execute(() -> {
            try {
                pipeline.close();
                promise.resolve(true);
            } catch (Throwable t) {
                promise.reject("PERSON_FACE_RELEASE", t.getMessage(), t);
            }
        });
    }

    /**
     * 原生直写 SQLite（person_data + person_group_index），与 JS ImageStorageService 语义对齐。
     */
    @ReactMethod
    public void applyPersonGroupingUpdates(ReadableArray items, Promise promise) {
        if (items == null || items.size() == 0) {
            promise.resolve(true);
            return;
        }
        executor.execute(() -> {
            try {
                PersonGroupingSqliteWriter.applyUpdates(getReactApplicationContext().getApplicationContext(), items);
                promise.resolve(true);
            } catch (Throwable t) {
                Log.e(TAG, "applyPersonGroupingUpdates failed", t);
                promise.reject("PERSON_GROUPING_SQLITE", t.getMessage(), t);
            }
        });
    }

    @Override
    public void invalidate() {
        super.invalidate();
        pipeline.close();
        // 不在此 shutdown executor，避免 RN 热重载后第二次人物分组无法提交任务
    }
}
