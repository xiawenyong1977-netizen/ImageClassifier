package com.imageclassifier.v2.face;

import android.graphics.Bitmap;

/**
 * 与 PersonIndexingService._alignFaceByKeypoints / ArcFace 模板对齐。
 */
public final class FaceAlignArcFace {

    private static final float[][] ARCFACE_TEMPLATE_112 = {
            {38.2946f, 51.6963f},
            {73.5318f, 51.5014f},
            {56.0252f, 71.7366f},
            {41.5493f, 92.3655f},
            {70.7299f, 92.2045f}
    };

    private FaceAlignArcFace() {}

    public static float[] alignTo112(Bitmap orig, int origW, int origH, float[] kpsOrig) {
        if (orig == null || kpsOrig == null || kpsOrig.length < 10) return null;
        int targetSize = 112;
        float scale = targetSize / 112.0f;
        float[][] dest = new float[5][2];
        for (int i = 0; i < 5; i++) {
            dest[i][0] = ARCFACE_TEMPLATE_112[i][0] * scale;
            dest[i][1] = ARCFACE_TEMPLATE_112[i][1] * scale;
        }
        float[][] src = new float[5][2];
        for (int i = 0; i < 5; i++) {
            src[i][0] = kpsOrig[i * 2];
            src[i][1] = kpsOrig[i * 2 + 1];
        }
        SimilarityTransform st = estimateSimilarityTransform(src, dest);
        if (st == null) return null;
        SimilarityTransform inv = invertSimilarityTransform(st);
        if (inv == null) return null;

        int[] argb = new int[targetSize * targetSize];
        int[] origPx = new int[origW * origH];
        orig.getPixels(origPx, 0, origW, 0, 0, origW, origH);

        for (int y = 0; y < targetSize; y++) {
            for (int x = 0; x < targetSize; x++) {
                float sx = inv.a * x - inv.b * y + inv.tx;
                float sy = inv.b * x + inv.a * y + inv.ty;
                int rgba = sampleBilinear(origPx, origW, origH, sx, sy);
                argb[y * targetSize + x] = rgba;
            }
        }
        Bitmap out = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
        out.setPixels(argb, 0, targetSize, 0, 0, targetSize, targetSize);
        float[] chw = FaceCoverResize.bitmapToChw01(out);
        out.recycle();
        return chw;
    }

    private static int sampleBilinear(int[] px, int w, int h, float x, float y) {
        float cx = FaceCoverResize.clamp(x, 0, w - 1f);
        float cy = FaceCoverResize.clamp(y, 0, h - 1f);
        int x0 = (int) Math.floor(cx);
        int y0 = (int) Math.floor(cy);
        int x1 = Math.min(w - 1, x0 + 1);
        int y1 = Math.min(h - 1, y0 + 1);
        float dx = cx - x0;
        float dy = cy - y0;
        int c00 = px[y0 * w + x0];
        int c10 = px[y0 * w + x1];
        int c01 = px[y1 * w + x0];
        int c11 = px[y1 * w + x1];
        return blend4(c00, c10, c01, c11, dx, dy);
    }

    private static int blend4(int c00, int c10, int c01, int c11, float dx, float dy) {
        int a = blend(c00 >> 24, c10 >> 24, c01 >> 24, c11 >> 24, dx, dy);
        int r = blend((c00 >> 16) & 0xff, (c10 >> 16) & 0xff, (c01 >> 16) & 0xff, (c11 >> 16) & 0xff, dx, dy);
        int g = blend((c00 >> 8) & 0xff, (c10 >> 8) & 0xff, (c01 >> 8) & 0xff, (c11 >> 8) & 0xff, dx, dy);
        int b = blend(c00 & 0xff, c10 & 0xff, c01 & 0xff, c11 & 0xff, dx, dy);
        return (a << 24) | (r << 16) | (g << 8) | b;
    }

    private static int blend(int v00, int v10, int v01, int v11, float dx, float dy) {
        float top = v00 * (1 - dx) + v10 * dx;
        float bottom = v01 * (1 - dx) + v11 * dx;
        return Math.round(top * (1 - dy) + bottom * dy);
    }

    private static final class SimilarityTransform {
        final float a, b, tx, ty;

        SimilarityTransform(float a, float b, float tx, float ty) {
            this.a = a;
            this.b = b;
            this.tx = tx;
            this.ty = ty;
        }
    }

    private static SimilarityTransform estimateSimilarityTransform(float[][] src, float[][] dst) {
        double[][] normalMatrix = new double[4][4];
        double[] normalVector = new double[4];
        for (int i = 0; i < 5; i++) {
            float sx = src[i][0], sy = src[i][1];
            float dx = dst[i][0], dy = dst[i][1];
            addRow(normalMatrix, normalVector, new double[]{sx, -sy, 1, 0}, dx);
            addRow(normalMatrix, normalVector, new double[]{sy, sx, 0, 1}, dy);
        }
        double[] sol = solveLinearSystem4(normalMatrix, normalVector);
        if (sol == null) return null;
        return new SimilarityTransform((float) sol[0], (float) sol[1], (float) sol[2], (float) sol[3]);
    }

    private static void addRow(double[][] m, double[] v, double[] row, double value) {
        for (int i = 0; i < 4; i++) {
            v[i] += row[i] * value;
            for (int j = 0; j < 4; j++) {
                m[i][j] += row[i] * row[j];
            }
        }
    }

    private static double[] solveLinearSystem4(double[][] matrix, double[] vector) {
        int size = 4;
        double[][] aug = new double[size][size + 1];
        for (int i = 0; i < size; i++) {
            System.arraycopy(matrix[i], 0, aug[i], 0, size);
            aug[i][size] = vector[i];
        }
        for (int pivot = 0; pivot < size; pivot++) {
            int maxRow = pivot;
            for (int row = pivot + 1; row < size; row++) {
                if (Math.abs(aug[row][pivot]) > Math.abs(aug[maxRow][pivot])) {
                    maxRow = row;
                }
            }
            if (Math.abs(aug[maxRow][pivot]) < 1e-8) return null;
            if (maxRow != pivot) {
                double[] tmp = aug[pivot];
                aug[pivot] = aug[maxRow];
                aug[maxRow] = tmp;
            }
            double pivotValue = aug[pivot][pivot];
            for (int col = pivot; col <= size; col++) {
                aug[pivot][col] /= pivotValue;
            }
            for (int row = 0; row < size; row++) {
                if (row == pivot) continue;
                double factor = aug[row][pivot];
                if (factor == 0) continue;
                for (int col = pivot; col <= size; col++) {
                    aug[row][col] -= factor * aug[pivot][col];
                }
            }
        }
        double[] out = new double[size];
        for (int i = 0; i < size; i++) {
            out[i] = aug[i][size];
        }
        return out;
    }

    private static SimilarityTransform invertSimilarityTransform(SimilarityTransform t) {
        float det = t.a * t.a + t.b * t.b;
        if (det < 1e-8f) return null;
        return new SimilarityTransform(
                t.a / det,
                -t.b / det,
                (-t.a * t.tx - t.b * t.ty) / det,
                (t.b * t.tx - t.a * t.ty) / det
        );
    }
}
