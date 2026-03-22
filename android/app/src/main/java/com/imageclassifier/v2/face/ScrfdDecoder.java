package com.imageclassifier.v2.face;

import java.util.Map;
import java.util.Set;

/**
 * SCRFD 输出解码，与 src/services/FaceDetectionService.js _decodeScrfd 对齐（3d / 4d）。
 */
public final class ScrfdDecoder {

    public static final class FaceDet {
        public final float score;
        public final float x1, y1, x2, y2;
        /** 5 点，网络输入坐标系 (targetSize) */
        public final float[] kpsNet; // length 10: x0,y0,...

        public FaceDet(float score, float x1, float y1, float x2, float y2, float[] kpsNet) {
            this.score = score;
            this.x1 = x1;
            this.y1 = y1;
            this.x2 = x2;
            this.y2 = y2;
            this.kpsNet = kpsNet;
        }
    }

    private ScrfdDecoder() {}

    /** 从 ONNX 输出名 → float 数组映射中解析最佳人脸（多 stride）。 */
    public static FaceDet decodeFromOutputMaps(int inputSize, float scoreThreshold, int[] strides,
                                               Map<String, float[]> tensors, Map<String, long[]> dimsMap) {
        float bestScore = Float.NEGATIVE_INFINITY;
        FaceDet best = null;
        Set<String> names = tensors.keySet();
        for (int stride : strides) {
            String sk = findOutputKey(names, "score_" + stride);
            String bk = findOutputKey(names, "bbox_" + stride);
            String kk = findOutputKey(names, "kps_" + stride);
            if (sk == null || bk == null) continue;
            FaceDet d = tryStride(inputSize, scoreThreshold, stride,
                    tensors.get(sk), dimsMap.get(sk),
                    tensors.get(bk), dimsMap.get(bk),
                    kk != null ? tensors.get(kk) : null, kk != null ? dimsMap.get(kk) : null, bestScore);
            if (d != null && d.score > bestScore) {
                bestScore = d.score;
                best = d;
            }
        }
        return best;
    }

    private static String findOutputKey(Set<String> keys, String keyword) {
        String low = keyword.toLowerCase();
        for (String k : keys) {
            if (k.toLowerCase().contains(low)) {
                return k;
            }
        }
        return null;
    }

    private static FaceDet tryStride(int inputSize, float scoreThreshold, int stride,
                                     float[] scoreData, long[] scoreDims,
                                     float[] bboxData, long[] bboxDims,
                                     float[] kpsData, long[] kpsDims, float currentBestScore) {
        if (scoreDims == null || bboxDims == null || scoreData == null || bboxData == null) return null;
        if (scoreDims.length == 4 && bboxDims.length == 4) {
            return decode4d(inputSize, scoreThreshold, stride, scoreData, scoreDims, bboxData, bboxDims, kpsData, kpsDims, currentBestScore);
        }
        if (scoreDims.length == 3 && bboxDims.length == 3) {
            return decode3d(inputSize, scoreThreshold, stride, scoreData, scoreDims, bboxData, bboxDims, kpsData, kpsDims, currentBestScore);
        }
        return null;
    }

    private static FaceDet decode3d(int inputSize, float scoreThreshold, int stride,
                                    float[] scoreData, long[] scoreDims,
                                    float[] bboxData, long[] bboxDims,
                                    float[] kpsData, long[] kpsDims, float currentBestScore) {
        int candidateCount = (int) scoreDims[1];
        int bboxCandidateCount = (int) bboxDims[1];
        int scoreTail = (int) scoreDims[2];
        int bboxTail = (int) bboxDims[2];
        int featureHeight = (int) Math.floor((double) inputSize / stride);
        int featureWidth = (int) Math.floor((double) inputSize / stride);
        int cellCount = featureHeight * featureWidth;
        if (candidateCount != bboxCandidateCount || scoreTail != 1 || bboxTail != 4 || cellCount <= 0 || candidateCount % cellCount != 0) {
            return null;
        }
        int numAnchors = Math.max(1, candidateCount / cellCount);
        float bestScore = Float.NEGATIVE_INFINITY;
        float bx1 = 0, by1 = 0, bx2 = 0, by2 = 0;
        float[] bestKps = null;

        for (int n = 0; n < candidateCount; n++) {
            float score = scoreData[n];
            if (score <= scoreThreshold || score <= bestScore) continue;

            int cellIndex = n / numAnchors;
            int y = cellIndex / featureWidth;
            int x = cellIndex % featureWidth;
            int bboxBase = n * 4;
            float l = bboxData[bboxBase];
            float t = bboxData[bboxBase + 1];
            float r = bboxData[bboxBase + 2];
            float b = bboxData[bboxBase + 3];

            float cx = (x + 0.5f) * stride;
            float cy = (y + 0.5f) * stride;
            float x1 = cx - l * stride;
            float y1 = cy - t * stride;
            float x2 = cx + r * stride;
            float y2 = cy + b * stride;

            bestScore = score;
            bx1 = x1;
            by1 = y1;
            bx2 = x2;
            by2 = y2;
            bestKps = decodeKps3d(kpsData, kpsDims, n, stride, cx, cy);
        }
        if (bestScore <= scoreThreshold || bestScore == Float.NEGATIVE_INFINITY || bestScore <= currentBestScore) return null;
        return new FaceDet(bestScore, bx1, by1, bx2, by2, bestKps);
    }

    private static float[] decodeKps3d(float[] kpsData, long[] kpsDims, int candidateIndex, int stride, float cx, float cy) {
        if (kpsData == null || kpsDims == null || kpsDims.length != 3) return null;
        if (kpsDims[1] <= candidateIndex || kpsDims[2] != 10) return null;
        int base = candidateIndex * 10;
        float[] out = new float[10];
        for (int i = 0; i < 5; i++) {
            out[i * 2] = cx + kpsData[base + i * 2] * stride;
            out[i * 2 + 1] = cy + kpsData[base + i * 2 + 1] * stride;
        }
        return out;
    }

    private static FaceDet decode4d(int inputSize, float scoreThreshold, int stride,
                                    float[] scoreData, long[] scoreDims,
                                    float[] bboxData, long[] bboxDims,
                                    float[] kpsData, long[] kpsDims, float currentBestScore) {
        int bboxAnchors = (int) Math.floor((double) bboxDims[1] / 4.0);
        int numAnchors = (int) scoreDims[1];
        boolean useClassScores = false;
        if (scoreDims[1] == bboxAnchors * 2) {
            useClassScores = true;
            numAnchors = bboxAnchors;
        } else if (bboxAnchors > 0) {
            numAnchors = Math.min(numAnchors, bboxAnchors);
        }
        int height = (int) scoreDims[2];
        int width = (int) scoreDims[3];
        float bestScore = Float.NEGATIVE_INFINITY;
        float bx1 = 0, by1 = 0, bx2 = 0, by2 = 0;
        float[] bestKps = null;

        for (int a = 0; a < numAnchors; a++) {
            for (int y = 0; y < height; y++) {
                for (int x = 0; x < width; x++) {
                    int scoreChannel = useClassScores ? (a * 2 + 1) : a;
                    int scoreIndex = ((scoreChannel * height) + y) * width + x;
                    float score = scoreData[scoreIndex];
                    if (score <= scoreThreshold || score <= bestScore) continue;

                    int bboxBase = (a * 4) * height * width;
                    int idx = y * width + x;
                    float l = bboxData[bboxBase + idx];
                    float t = bboxData[bboxBase + height * width + idx];
                    float r = bboxData[bboxBase + 2 * height * width + idx];
                    float b = bboxData[bboxBase + 3 * height * width + idx];

                    float cx = (x + 0.5f) * stride;
                    float cy = (y + 0.5f) * stride;
                    float x1 = cx - l * stride;
                    float y1 = cy - t * stride;
                    float x2 = cx + r * stride;
                    float y2 = cy + b * stride;

                    bestScore = score;
                    bx1 = x1;
                    by1 = y1;
                    bx2 = x2;
                    by2 = y2;
                    bestKps = decodeKps4d(kpsData, kpsDims, a, y, x, height, width, stride);
                }
            }
        }
        if (bestScore <= scoreThreshold || bestScore == Float.NEGATIVE_INFINITY || bestScore <= currentBestScore) return null;
        return new FaceDet(bestScore, bx1, by1, bx2, by2, bestKps);
    }

    private static float[] decodeKps4d(float[] kpsData, long[] kpsDims, int anchorIndex, int y, int x, int height, int width, int stride) {
        if (kpsData == null || kpsDims == null || kpsDims.length != 4) return null;
        int channelCount = (int) kpsDims[1];
        if (channelCount < (anchorIndex + 1) * 10) return null;
        int idx = y * width + x;
        int base = anchorIndex * 10 * height * width;
        float cx = (x + 0.5f) * stride;
        float cy = (y + 0.5f) * stride;
        float[] out = new float[10];
        for (int i = 0; i < 5; i++) {
            float px = kpsData[base + (i * 2) * height * width + idx];
            float py = kpsData[base + (i * 2 + 1) * height * width + idx];
            out[i * 2] = cx + px * stride;
            out[i * 2 + 1] = cy + py * stride;
        }
        return out;
    }
}
