package com.imageclassifier.v2.face;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;

/**
 * Cover 缩放至正方形 targetSize，与 JS ImageProcessor / FaceDetectionService 中 cover 公式一致。
 */
public final class FaceCoverResize {

    private FaceCoverResize() {}

    public static Bitmap coverToSquare(Bitmap src, int targetSize) {
        if (src == null) return null;
        int ow = src.getWidth();
        int oh = src.getHeight();
        if (ow <= 0 || oh <= 0) return null;

        float scale = Math.max((float) targetSize / ow, (float) targetSize / oh);
        int sw = Math.round(ow * scale);
        int sh = Math.round(oh * scale);
        float ox = (targetSize - sw) * 0.5f;
        float oy = (targetSize - sh) * 0.5f;

        Bitmap scaled = Bitmap.createScaledBitmap(src, sw, sh, true);
        Bitmap out = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(out);
        canvas.drawColor(Color.BLACK);
        canvas.drawBitmap(scaled, ox, oy, null);
        if (scaled != src) {
            scaled.recycle();
        }
        return out;
    }

    /** CHW float32, RGB, 值域 [0,1]，与 FaceDetectionService._buildInputTensor 一致 */
    public static float[] bitmapToChw01(Bitmap bmp320) {
        int s = bmp320.getWidth();
        int pixels = s * s;
        float[] chw = new float[3 * pixels];
        int[] px = new int[pixels];
        bmp320.getPixels(px, 0, s, 0, 0, s, s);
        for (int i = 0; i < pixels; i++) {
            int c = px[i];
            float r = ((c >> 16) & 0xff) / 255.0f;
            float g = ((c >> 8) & 0xff) / 255.0f;
            float b = (c & 0xff) / 255.0f;
            int h = i / s;
            int w = i % s;
            int base = h * s + w;
            chw[base] = r;
            chw[pixels + base] = g;
            chw[2 * pixels + base] = b;
        }
        return chw;
    }

    public static float clamp(float v, float lo, float hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** 网络输入坐标 (targetSize) → 原图像素坐标 */
    public static float[] mapBoxToOriginal(float x1, float y1, float x2, float y2,
                                           int origW, int origH, int targetSize) {
        float scale = Math.max((float) targetSize / origW, (float) targetSize / origH);
        float scaledW = origW * scale;
        float scaledH = origH * scale;
        float offsetX = (targetSize - scaledW) * 0.5f;
        float offsetY = (targetSize - scaledH) * 0.5f;
        return new float[]{
            clamp((x1 - offsetX) / scale, 0, origW),
            clamp((y1 - offsetY) / scale, 0, origH),
            clamp((x2 - offsetX) / scale, 0, origW),
            clamp((y2 - offsetY) / scale, 0, origH)
        };
    }

    public static float[] mapPointToOriginal(float x, float y, int origW, int origH, int targetSize) {
        float scale = Math.max((float) targetSize / origW, (float) targetSize / origH);
        float scaledW = origW * scale;
        float scaledH = origH * scale;
        float offsetX = (targetSize - scaledW) * 0.5f;
        float offsetY = (targetSize - scaledH) * 0.5f;
        return new float[]{
            clamp((x - offsetX) / scale, 0, origW),
            clamp((y - offsetY) / scale, 0, origH)
        };
    }
}
