package com.imageclassifier.v2.face;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.net.Uri;
import android.util.Log;

import androidx.exifinterface.media.ExifInterface;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.io.File;
import java.io.InputStream;
import java.nio.FloatBuffer;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;

/**
 * 人物分组：SCRFD + ArcFace ONNX，单线程使用；与 JS FaceDetectionService / FaceEmbeddingService 对齐。
 */
public class PersonFaceOnnxPipeline {

    private static final String TAG = "PersonFaceOnnx";
    private static final int DET_INPUT = 320;
    /** 与 JS FaceDetectionService DEFAULT_SCORE_THRESHOLD 一致；实际运行值由人物相似度设置映射得到 */
    private static final float DEFAULT_SCRFD_SCORE_THRESHOLD = 0.65f;
    private static final float MIN_FACE_SHORT_SIDE = 24f;
    private static final int[] STRIDES = {8, 16, 32};
    private static final String DET_INPUT_NAME = "input.1";
    private static final String EMB_INPUT_NAME = "input_1";
    private static final String EMB_OUTPUT_NAME = "embedding";

    private final Object lock = new Object();
    private OrtEnvironment env;
    private OrtSession detSession;
    private OrtSession embSession;
    private String detInputName = DET_INPUT_NAME;
    private String embInputName = EMB_INPUT_NAME;
    private String embOutputName = EMB_OUTPUT_NAME;
    /** 设置页「人物相似阈值」（与 JS PersonIndexingService 聚类阈值同源） */
    private float personSimilarityThreshold = 0.75f;
    /** SCRFD 解码用检测置信度下限，由 personSimilarityThreshold 映射 */
    private float scrfdScoreThreshold = DEFAULT_SCRFD_SCORE_THRESHOLD;

    /**
     * 人物相似度（0.5–0.95）映射到 SCRFD score 阈值（约 0.48–0.72）：
     * 相似度越高 → 检测阈值略抬高，减少弱框 embedding 噪声；与 JS {@code FaceDetectionService.scoreThreshold} 映射公式一致。
     */
    static float deriveScrfdScoreThresholdFromPersonSimilarity(double personSimilarity) {
        float s = (float) personSimilarity;
        if (Float.isNaN(s) || Float.isInfinite(s)) {
            s = 0.75f;
        }
        s = Math.max(0.5f, Math.min(0.95f, s));
        float det = DEFAULT_SCRFD_SCORE_THRESHOLD + (s - 0.75f) * 0.5f;
        return Math.max(0.48f, Math.min(0.72f, det));
    }

    public void initialize(String detectorPath, String embeddingPath, double personSimilarityThreshold) throws OrtException {
        synchronized (lock) {
            closeSessions();
            if (env == null) {
                env = OrtEnvironment.getEnvironment();
            }
            OrtSession.SessionOptions detOpt = new OrtSession.SessionOptions();
            OrtSession.SessionOptions embOpt = new OrtSession.SessionOptions();
            try {
                detOpt.addNnapi();
            } catch (Throwable ignored) {
                Log.d(TAG, "NNAPI not added for detector (fallback CPU)");
            }
            try {
                embOpt.addNnapi();
            } catch (Throwable ignored) {
                Log.d(TAG, "NNAPI not added for embedding (fallback CPU)");
            }
            String detP = stripFileScheme(detectorPath);
            String embP = stripFileScheme(embeddingPath);
            detSession = env.createSession(detP, detOpt);
            embSession = env.createSession(embP, embOpt);
            if (detSession.getInputNames().iterator().hasNext()) {
                detInputName = detSession.getInputNames().iterator().next();
            }
            List<String> embIn = new ArrayList<>();
            embSession.getInputNames().forEach(embIn::add);
            if (!embIn.isEmpty()) {
                embInputName = embIn.get(0);
            }
            List<String> embOut = new ArrayList<>();
            embSession.getOutputNames().forEach(embOut::add);
            if (!embOut.isEmpty()) {
                embOutputName = embOut.get(0);
                for (String o : embOut) {
                    if (o.toLowerCase().contains("embedding")) {
                        embOutputName = o;
                        break;
                    }
                }
            }
            this.personSimilarityThreshold = (float) personSimilarityThreshold;
            if (Float.isNaN(this.personSimilarityThreshold) || Float.isInfinite(this.personSimilarityThreshold)) {
                this.personSimilarityThreshold = 0.75f;
            }
            this.personSimilarityThreshold = Math.max(0.5f, Math.min(0.95f, this.personSimilarityThreshold));
            this.scrfdScoreThreshold = deriveScrfdScoreThresholdFromPersonSimilarity(this.personSimilarityThreshold);
            Log.i(TAG, "Sessions ready detIn=" + detInputName + " embIn=" + embInputName + " embOut=" + embOutputName
                + " personSim=" + this.personSimilarityThreshold + " scrfdScoreThr=" + this.scrfdScoreThreshold);
        }
    }

    public void close() {
        synchronized (lock) {
            closeSessions();
        }
    }

    private void closeSessions() {
        try {
            if (detSession != null) {
                detSession.close();
            }
        } catch (Exception ignored) {
        }
        detSession = null;
        try {
            if (embSession != null) {
                embSession.close();
            }
        } catch (Exception ignored) {
        }
        embSession = null;
    }

    private static String stripFileScheme(String path) {
        if (path == null) return null;
        if (path.startsWith("file://")) {
            return path.substring(7);
        }
        return path;
    }

    public WritableMap detectAndEmbed(Context ctx, String imageUriStr) throws Exception {
        synchronized (lock) {
            if (detSession == null || embSession == null || env == null) {
                throw new IllegalStateException("PersonFaceOnnxPipeline not initialized");
            }
        }

        Bitmap full = loadBitmap(ctx, imageUriStr);
        if (full == null) return null;
        int ow = full.getWidth();
        int oh = full.getHeight();
        if (ow <= 0 || oh <= 0) {
            full.recycle();
            return null;
        }

        Bitmap cov = FaceCoverResize.coverToSquare(full, DET_INPUT);
        full.recycle();
        if (cov == null) return null;

        float[] chw320 = FaceCoverResize.bitmapToChw01(cov);
        cov.recycle();

        ScrfdDecoder.FaceDet det;
        synchronized (lock) {
            det = runDetector(chw320);
        }
        if (det == null) {
            return null;
        }

        float[] obox = FaceCoverResize.mapBoxToOriginal(det.x1, det.y1, det.x2, det.y2, ow, oh, DET_INPUT);
        float shortSide = Math.min(obox[2] - obox[0], obox[3] - obox[1]);
        if (shortSide < MIN_FACE_SHORT_SIDE) {
            return null;
        }

        float[] kpsOrig = null;
        if (det.kpsNet != null && det.kpsNet.length >= 10) {
            kpsOrig = new float[10];
            for (int i = 0; i < 5; i++) {
                float[] p = FaceCoverResize.mapPointToOriginal(det.kpsNet[i * 2], det.kpsNet[i * 2 + 1], ow, oh, DET_INPUT);
                kpsOrig[i * 2] = p[0];
                kpsOrig[i * 2 + 1] = p[1];
            }
        }

        full = loadBitmap(ctx, imageUriStr);
        if (full == null) return null;

        float[] alignedChw;
        if (kpsOrig != null) {
            alignedChw = FaceAlignArcFace.alignTo112(full, full.getWidth(), full.getHeight(), kpsOrig);
        } else {
            alignedChw = cropResizeBoxTo112Chw01(full, obox);
        }
        full.recycle();

        if (alignedChw == null) return null;

        // face_embedding.onnx 与 JS FaceEmbeddingService（inputLayout: NHWC）一致：[1, 112, 112, 3]
        float[] embChw = chw01ToNormalizedNchw(alignedChw, 112);
        float[] embInput = normalizedChwToNhwc(embChw, 112);
        float[] embedding;
        synchronized (lock) {
            embedding = runEmbeddingNhwc(embInput);
        }
        if (embedding == null) return null;

        WritableMap map = Arguments.createMap();
        map.putDouble("score", det.score);
        WritableArray arr = Arguments.createArray();
        for (float v : embedding) {
            arr.pushDouble(v);
        }
        map.putArray("embedding", arr);
        return map;
    }

    private static float[] cropResizeBoxTo112Chw01(Bitmap full, float[] obox) {
        int w = full.getWidth();
        int h = full.getHeight();
        int x1 = (int) Math.floor(obox[0]);
        int y1 = (int) Math.floor(obox[1]);
        int x2 = (int) Math.ceil(obox[2]);
        int y2 = (int) Math.ceil(obox[3]);
        x1 = Math.max(0, Math.min(w - 1, x1));
        y1 = Math.max(0, Math.min(h - 1, y1));
        x2 = Math.max(x1 + 1, Math.min(w, x2));
        y2 = Math.max(y1 + 1, Math.min(h, y2));
        int cw = x2 - x1;
        int ch = y2 - y1;
        Bitmap crop = Bitmap.createBitmap(full, x1, y1, cw, ch);
        Bitmap scaled = Bitmap.createScaledBitmap(crop, 112, 112, true);
        if (crop != full) crop.recycle();
        float[] out = FaceCoverResize.bitmapToChw01(scaled);
        scaled.recycle();
        return out;
    }

    private static float[] chw01ToNormalizedNchw(float[] chw01, int size) {
        int n = size * size;
        float[] out = new float[3 * n];
        float m = 127.5f;
        float s = 128.0f;
        for (int i = 0; i < n; i++) {
            out[i] = (chw01[i] * 255f - m) / s;
            out[n + i] = (chw01[n + i] * 255f - m) / s;
            out[2 * n + i] = (chw01[2 * n + i] * 255f - m) / s;
        }
        return out;
    }

    /** CHW 展平 → NHWC 展平，与 JS FaceEmbeddingService NHWC Tensor 内存序一致 */
    private static float[] normalizedChwToNhwc(float[] nchw, int size) {
        int n = size * size;
        float[] nhwc = new float[n * 3];
        for (int i = 0; i < n; i++) {
            int b = i * 3;
            nhwc[b] = nchw[i];
            nhwc[b + 1] = nchw[n + i];
            nhwc[b + 2] = nchw[2 * n + i];
        }
        return nhwc;
    }

    private ScrfdDecoder.FaceDet runDetector(float[] chw320) throws OrtException {
        long[] shape = new long[]{1, 3, DET_INPUT, DET_INPUT};
        OnnxTensor tensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(chw320), shape);
        Map<String, OnnxTensor> inputs = new HashMap<>();
        inputs.put(detInputName, tensor);
        try (OrtSession.Result result = detSession.run(inputs)) {
            Map<String, float[]> tensors = new HashMap<>();
            Map<String, long[]> dimsMap = new HashMap<>();
            for (Map.Entry<String, OnnxValue> e : result) {
                if (!(e.getValue() instanceof OnnxTensor)) continue;
                OnnxTensor ot = (OnnxTensor) e.getValue();
                tensors.put(e.getKey(), tensorToFloatArray(ot));
                dimsMap.put(e.getKey(), ot.getInfo().getShape());
            }
            return ScrfdDecoder.decodeFromOutputMaps(DET_INPUT, scrfdScoreThreshold, STRIDES, tensors, dimsMap);
        } finally {
            tensor.close();
        }
    }

    private float[] runEmbeddingNhwc(float[] nhwc112) throws OrtException {
        long[] shape = new long[]{1, 112, 112, 3};
        OnnxTensor tensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(nhwc112), shape);
        Map<String, OnnxTensor> inputs = new HashMap<>();
        inputs.put(embInputName, tensor);
        try (OrtSession.Result result = embSession.run(inputs)) {
            OnnxValue ov = null;
            for (Map.Entry<String, OnnxValue> e : result) {
                if (embOutputName != null && embOutputName.equals(e.getKey())) {
                    ov = e.getValue();
                    break;
                }
            }
            if (ov == null) {
                for (Map.Entry<String, OnnxValue> e : result) {
                    ov = e.getValue();
                    break;
                }
            }
            if (!(ov instanceof OnnxTensor)) return null;
            return tensorToFloatArray((OnnxTensor) ov);
        } finally {
            tensor.close();
        }
    }

    private static float[] tensorToFloatArray(OnnxTensor t) throws OrtException {
        FloatBuffer fb = t.getFloatBuffer();
        float[] arr = new float[fb.remaining()];
        fb.get(arr);
        return arr;
    }

    private static Bitmap loadBitmap(Context ctx, String uriStr) {
        try {
            Uri uri = Uri.parse(uriStr);
            if ("file".equalsIgnoreCase(uri.getScheme())) {
                String p = uri.getPath();
                if (p != null) {
                    File f = new File(p);
                    if (f.exists()) {
                        String abs = f.getAbsolutePath();
                        Bitmap bmp = BitmapFactory.decodeFile(abs);
                        return applyExifOrientationFromFile(bmp, abs);
                    }
                }
            }
            InputStream exifIn = ctx.getContentResolver().openInputStream(uri);
            if (exifIn == null) {
                return null;
            }
            ExifInterface exif;
            try {
                exif = new ExifInterface(exifIn);
            } finally {
                exifIn.close();
            }
            InputStream decodeIn = ctx.getContentResolver().openInputStream(uri);
            if (decodeIn == null) {
                return null;
            }
            try {
                Bitmap bmp = BitmapFactory.decodeStream(decodeIn);
                return applyExifOrientation(bmp, exif);
            } finally {
                decodeIn.close();
            }
        } catch (Exception e) {
            Log.e(TAG, "loadBitmap failed: " + uriStr, e);
            return null;
        }
    }

    private static Bitmap applyExifOrientationFromFile(Bitmap bitmap, String path) {
        if (bitmap == null) {
            return null;
        }
        try {
            ExifInterface exif = new ExifInterface(path);
            return applyExifOrientation(bitmap, exif);
        } catch (Exception e) {
            Log.w(TAG, "EXIF read failed, using bitmap as-is: " + path, e);
            return bitmap;
        }
    }

    /**
     * BitmapFactory 不应用 JPEG 方向标签，竖拍图在像素上仍是横向，SCRFD 易漏检。
     */
    private static Bitmap applyExifOrientation(Bitmap bitmap, ExifInterface exif) {
        if (bitmap == null || exif == null) {
            return bitmap;
        }
        int orientation = exif.getAttributeInt(
            ExifInterface.TAG_ORIENTATION,
            ExifInterface.ORIENTATION_UNDEFINED);
        if (orientation == ExifInterface.ORIENTATION_UNDEFINED
            || orientation == ExifInterface.ORIENTATION_NORMAL) {
            return bitmap;
        }
        int w = bitmap.getWidth();
        int h = bitmap.getHeight();
        Matrix m = new Matrix();
        float cx = w / 2f;
        float cy = h / 2f;
        try {
            switch (orientation) {
                case ExifInterface.ORIENTATION_ROTATE_90:
                    m.postRotate(90f, cx, cy);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    m.postRotate(180f, cx, cy);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    m.postRotate(270f, cx, cy);
                    break;
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                    m.postScale(-1f, 1f, cx, cy);
                    break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                    m.postScale(1f, -1f, cx, cy);
                    break;
                case ExifInterface.ORIENTATION_TRANSPOSE:
                    m.postScale(-1f, 1f, cx, cy);
                    m.postRotate(270f, cx, cy);
                    break;
                case ExifInterface.ORIENTATION_TRANSVERSE:
                    m.postScale(-1f, 1f, cx, cy);
                    m.postRotate(90f, cx, cy);
                    break;
                default:
                    return bitmap;
            }
            Bitmap out = Bitmap.createBitmap(bitmap, 0, 0, w, h, m, true);
            if (out != null && out != bitmap) {
                bitmap.recycle();
            }
            return out != null ? out : bitmap;
        } catch (OutOfMemoryError e) {
            Log.e(TAG, "applyExifOrientation OOM", e);
            return bitmap;
        } catch (Exception e) {
            Log.w(TAG, "applyExifOrientation failed", e);
            return bitmap;
        }
    }
}
