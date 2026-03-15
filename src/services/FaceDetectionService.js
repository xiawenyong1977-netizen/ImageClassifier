import { logger, ModelPathAdapter } from '../adapters/WebAdapters';
import ImageProcessor from './ImageProcessor';

const DEFAULT_MODEL_FILE = 'face_detector.onnx';
const DEFAULT_INPUT_SIZE = 320;
const DEFAULT_SCORE_THRESHOLD = 0.65;
const DEFAULT_MAX_DETECTIONS = 1;
const DEFAULT_MIN_FACE_SIZE = 24;
const DEFAULT_MODEL_CONFIG = {
  path: `./models/${DEFAULT_MODEL_FILE}`,
  type: 'scrfd',
  inputSize: DEFAULT_INPUT_SIZE,
  inputName: 'input.1',
  boxesOutput: 'boxes',
  scoresOutput: 'scores',
  boxesNormalized: true,
  scoreThreshold: DEFAULT_SCORE_THRESHOLD,
  maxDetections: DEFAULT_MAX_DETECTIONS,
  minFaceSize: DEFAULT_MIN_FACE_SIZE,
  strides: [8, 16, 32]
};

class FaceDetectionService {
  constructor() {
    this.isInitialized = false;
    this.isAvailable = false;
    this.ort = null;
    this.model = null;
    this.modelConfig = null;
    this.inputName = null;
    this.boxesOutput = null;
    this.scoresOutput = null;
    this.inputSize = DEFAULT_INPUT_SIZE;
    this.scoreThreshold = DEFAULT_SCORE_THRESHOLD;
    this.maxDetections = DEFAULT_MAX_DETECTIONS;
    this.minFaceSize = DEFAULT_MIN_FACE_SIZE;
    this.boxesNormalized = false;
    this.detectorType = 'boxes';
    this.strides = [8, 16, 32];
    this.imageProcessor = ImageProcessor;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.model;
    }

    const config = DEFAULT_MODEL_CONFIG;

    this.modelConfig = config;
    this.inputSize = config.inputSize || DEFAULT_INPUT_SIZE;
    this.scoreThreshold = typeof config.scoreThreshold === 'number' ? config.scoreThreshold : DEFAULT_SCORE_THRESHOLD;
    this.maxDetections = typeof config.maxDetections === 'number' ? config.maxDetections : DEFAULT_MAX_DETECTIONS;
    this.minFaceSize = typeof config.minFaceSize === 'number' ? config.minFaceSize : DEFAULT_MIN_FACE_SIZE;
    this.inputName = config.inputName || null;
    this.boxesOutput = config.boxesOutput || 'boxes';
    this.scoresOutput = config.scoresOutput || 'scores';
    this.boxesNormalized = config.boxesNormalized === true;
    this.detectorType = config.type || 'boxes';
    if (Array.isArray(config.strides) && config.strides.length > 0) {
      this.strides = config.strides;
    }

    try {
      const modelFileName = (config.path || '').split('/').pop() || DEFAULT_MODEL_FILE;
      if (typeof ModelPathAdapter.ensureModelExists === 'function') {
        try {
          await ModelPathAdapter.ensureModelExists(modelFileName);
        } catch (error) {
          logger.error(`❌ faceDetector 模型复制失败: ${error.message || error}`);
        }
      }

      const modelPath = ModelPathAdapter.getModelPath(modelFileName, config.path);
      this.ort = await ModelPathAdapter.loadOnnxRuntime();

      const sessionOptions = {
        executionProviders: ModelPathAdapter.getExecutionProviders
          ? ModelPathAdapter.getExecutionProviders()
          : ['cpu'],
        graphOptimizationLevel: 'disabled',
        enableCpuMemArena: false,
        enableMemPattern: false,
        enableProfiling: false,
        logSeverityLevel: 3,
        logVerbosityLevel: 0,
        sessionLogSeverityLevel: 3,
        sessionLogVerbosityLevel: 0
      };

      this.model = await this.ort.InferenceSession.create(modelPath, sessionOptions);
      if (!this.inputName) {
        this.inputName = this.model.inputNames ? this.model.inputNames[0] : null;
      }

      if (!this.inputName) {
        throw new Error('faceDetector 模型缺少 input 名称');
      }

      this.isAvailable = true;
      this.isInitialized = true;
      logger.debug('✅ faceDetector 模型加载成功');
      return this.model;
    } catch (error) {
      logger.error('❌ faceDetector 模型加载失败:', error);
      this.isInitialized = true;
      this.isAvailable = false;
      return null;
    }
  }

  isReady() {
    return this.isInitialized && this.isAvailable && this.model;
  }

  async detectPrimaryFace(imageUri) {
    if (!imageUri) return null;

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isReady()) {
      return null;
    }

    try {
      const originalDimensions = await this.imageProcessor.getImageDimensions(imageUri);
      const pixelData = await this.imageProcessor.getPixelData(
        imageUri,
        this.inputSize,
        this.inputSize,
        { mode: 'cover' }
      );

      const inputTensor = this._buildInputTensor(pixelData, this.inputSize);
      const results = await this.model.run({ [this.inputName]: inputTensor });

      let best = null;
      if (this.detectorType === 'scrfd') {
        best = await this._decodeScrfd(results);
      } else {
        const boxesTensor = this._getTensor(results, this.boxesOutput);
        const scoresTensor = this._getTensor(results, this.scoresOutput);
        if (!boxesTensor || !scoresTensor) {
          logger.warn('⚠️ faceDetector 输出缺失，跳过人物分组');
          return null;
        }
        const boxes = await this._getTensorData(boxesTensor);
        const scores = await this._getTensorData(scoresTensor);
        best = this._selectBestFace(boxes, scores, this.boxesNormalized ? this.inputSize : null);
      }
      if (!best) {
        return null;
      }

      const detectorFaceWidth = Math.max(0, (best.box?.x2 || 0) - (best.box?.x1 || 0));
      const detectorFaceHeight = Math.max(0, (best.box?.y2 || 0) - (best.box?.y1 || 0));
      const originalBox = this._mapCoverBoxToOriginal(best.box, originalDimensions, this.inputSize);
      const originalKeypoints = this._mapCoverKeypointsToOriginal(best.keypoints, originalDimensions, this.inputSize);
      const originalFaceWidth = Math.max(0, (originalBox?.x2 || 0) - (originalBox?.x1 || 0));
      const originalFaceHeight = Math.max(0, (originalBox?.y2 || 0) - (originalBox?.y1 || 0));
      const originalFaceShortSide = Math.min(originalFaceWidth, originalFaceHeight);
      if (originalFaceShortSide < this.minFaceSize) {
        logger.warn(
          `👤 [人脸检测] 人脸框过小，已过滤: score=${best.score?.toFixed ? best.score.toFixed(6) : best.score}, ` +
          `detectorSize=${detectorFaceWidth.toFixed(2)}x${detectorFaceHeight.toFixed(2)}, ` +
          `originalSize=${originalFaceWidth.toFixed(2)}x${originalFaceHeight.toFixed(2)}, ` +
          `minFaceSize=${this.minFaceSize}`
        );
        return null;
      }

      return {
        box: originalBox,
        detectorBox: best.box,
        keypoints: originalKeypoints,
        detectorKeypoints: best.keypoints || null,
        score: best.score,
        size: this.inputSize,
        imageWidth: originalDimensions?.width || this.inputSize,
        imageHeight: originalDimensions?.height || this.inputSize
      };
    } catch (error) {
      logger.error('❌ 人脸检测失败:', error);
      return null;
    }
  }

  _buildInputTensor(pixelData, size) {
    const chwData = new Float32Array(3 * size * size);
    for (let i = 0; i < pixelData.length; i += 4) {
      const pixelIndex = i / 4;
      const r = pixelData[i];
      const g = pixelData[i + 1];
      const b = pixelData[i + 2];

      const h = Math.floor(pixelIndex / size);
      const w = pixelIndex % size;

      const base = h * size + w;
      chwData[base] = r / 255.0;
      chwData[size * size + base] = g / 255.0;
      chwData[2 * size * size + base] = b / 255.0;
    }

    return new this.ort.Tensor('float32', chwData, [1, 3, size, size]);
  }

  _mapCoverBoxToOriginal(box, originalDimensions, targetSize) {
    if (!box || !originalDimensions?.width || !originalDimensions?.height || !targetSize) {
      return box;
    }

    const originalWidth = originalDimensions.width;
    const originalHeight = originalDimensions.height;
    const scale = Math.max(targetSize / originalWidth, targetSize / originalHeight);
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    const offsetX = (targetSize - scaledWidth) * 0.5;
    const offsetY = (targetSize - scaledHeight) * 0.5;

    return {
      x1: this._clamp((box.x1 - offsetX) / scale, 0, originalWidth),
      y1: this._clamp((box.y1 - offsetY) / scale, 0, originalHeight),
      x2: this._clamp((box.x2 - offsetX) / scale, 0, originalWidth),
      y2: this._clamp((box.y2 - offsetY) / scale, 0, originalHeight)
    };
  }

  _mapCoverKeypointsToOriginal(keypoints, originalDimensions, targetSize) {
    if (!Array.isArray(keypoints) || keypoints.length === 0 || !originalDimensions?.width || !originalDimensions?.height || !targetSize) {
      return null;
    }

    const originalWidth = originalDimensions.width;
    const originalHeight = originalDimensions.height;
    const scale = Math.max(targetSize / originalWidth, targetSize / originalHeight);
    const scaledWidth = originalWidth * scale;
    const scaledHeight = originalHeight * scale;
    const offsetX = (targetSize - scaledWidth) * 0.5;
    const offsetY = (targetSize - scaledHeight) * 0.5;

    return keypoints.map(point => ({
      x: this._clamp((point.x - offsetX) / scale, 0, originalWidth),
      y: this._clamp((point.y - offsetY) / scale, 0, originalHeight)
    }));
  }

  _clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  _getTensor(results, key) {
    if (!results || !key) return null;
    return results[key] || results[this._findOutputKey(results, key)] || null;
  }

  async _getTensorData(tensor) {
    if (!tensor) return null;
    if (tensor.cpuData) return tensor.cpuData;
    if (typeof tensor.data === 'function') return await tensor.data();
    if (Array.isArray(tensor)) return tensor;
    return tensor.data || null;
  }

  _findOutputKey(results, keyword) {
    const keys = Object.keys(results || {});
    return keys.find(k => k.toLowerCase().includes(keyword.toLowerCase())) || null;
  }

  async _decodeScrfd(results) {
    if (!results) return null;
    let bestScore = this.scoreThreshold;
    let bestBox = null;
    let bestKeypoints = null;
    const strideSummaries = [];

    for (const stride of this.strides) {
      const scoreKey = this._findOutputKey(results, `score_${stride}`) || this._findOutputKey(results, `score${stride}`);
      const bboxKey = this._findOutputKey(results, `bbox_${stride}`) || this._findOutputKey(results, `bbox${stride}`);
      const kpsKey = this._findOutputKey(results, `kps_${stride}`) || this._findOutputKey(results, `kps${stride}`);
      if (!scoreKey || !bboxKey) {
        strideSummaries.push(`stride=${stride}: missing score/bbox output`);
        continue;
      }

      const scoreTensor = results[scoreKey];
      const bboxTensor = results[bboxKey];
      const kpsTensor = kpsKey ? results[kpsKey] : null;
      if (!scoreTensor || !bboxTensor) {
        strideSummaries.push(`stride=${stride}: empty tensor`);
        continue;
      }

      const scoreData = await this._getTensorData(scoreTensor);
      const bboxData = await this._getTensorData(bboxTensor);
      const kpsData = kpsTensor ? await this._getTensorData(kpsTensor) : null;
      const scoreDims = scoreTensor.dims || [];
      const bboxDims = bboxTensor.dims || [];
      const kpsDims = kpsTensor?.dims || [];
      let strideBestScore = -Infinity;
      if (scoreDims.length === 4 && bboxDims.length === 4) {
        const bboxAnchors = Math.floor(bboxDims[1] / 4);
        let numAnchors = scoreDims[1];
        let useClassScores = false;
        if (scoreDims[1] === bboxAnchors * 2) {
          useClassScores = true;
          numAnchors = bboxAnchors;
        } else if (bboxAnchors > 0) {
          numAnchors = Math.min(numAnchors, bboxAnchors);
        }
        const height = scoreDims[2];
        const width = scoreDims[3];

        for (let a = 0; a < numAnchors; a++) {
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const scoreChannel = useClassScores ? (a * 2 + 1) : a;
              const scoreIndex = ((scoreChannel * height) + y) * width + x;
              const score = scoreData[scoreIndex];
              if (score > strideBestScore) {
                strideBestScore = score;
              }
              if (score <= bestScore) continue;

              const bboxBase = (a * 4) * height * width;
              const idx = y * width + x;
              const l = bboxData[bboxBase + idx];
              const t = bboxData[bboxBase + height * width + idx];
              const r = bboxData[bboxBase + 2 * height * width + idx];
              const b = bboxData[bboxBase + 3 * height * width + idx];

              const cx = (x + 0.5) * stride;
              const cy = (y + 0.5) * stride;
              const x1 = cx - l * stride;
              const y1 = cy - t * stride;
              const x2 = cx + r * stride;
              const y2 = cy + b * stride;

              bestScore = score;
              bestBox = { x1, y1, x2, y2 };
              bestKeypoints = this._decodeScrfdKeypoints4d(kpsData, kpsDims, a, y, x, height, width, stride);
            }
          }
        }

        strideSummaries.push(
          `stride=${stride}: scoreKey=${scoreKey}, bboxKey=${bboxKey}, ` +
          `scoreDims=${JSON.stringify(scoreDims)}, bboxDims=${JSON.stringify(bboxDims)}, kpsDims=${JSON.stringify(kpsDims)}, ` +
          `anchors=${numAnchors}, maxScore=${Number.isFinite(strideBestScore) ? strideBestScore.toFixed(6) : 'n/a'}, format=4d`
        );
        continue;
      }

      if (scoreDims.length === 3 && bboxDims.length === 3) {
        const candidateCount = scoreDims[1];
        const bboxCandidateCount = bboxDims[1];
        const scoreTail = scoreDims[2];
        const bboxTail = bboxDims[2];
        const featureHeight = Math.floor(this.inputSize / stride);
        const featureWidth = Math.floor(this.inputSize / stride);
        const cellCount = featureHeight * featureWidth;

        if (candidateCount !== bboxCandidateCount || scoreTail !== 1 || bboxTail !== 4 || cellCount <= 0 || candidateCount % cellCount !== 0) {
          strideSummaries.push(
            `stride=${stride}: unsupported flattened dims score=${JSON.stringify(scoreDims)} bbox=${JSON.stringify(bboxDims)}`
          );
          continue;
        }

        const numAnchors = Math.max(1, Math.floor(candidateCount / cellCount));
        for (let n = 0; n < candidateCount; n++) {
          const score = scoreData[n];
          if (score > strideBestScore) {
            strideBestScore = score;
          }
          if (score <= bestScore) continue;

          // SCRFD 导出的 [1, N, *] 版本通常按 cell-major 展平，同一 cell 的多 anchor 连续排列。
          const cellIndex = Math.floor(n / numAnchors);
          const y = Math.floor(cellIndex / featureWidth);
          const x = cellIndex % featureWidth;
          const bboxBase = n * 4;
          const l = bboxData[bboxBase];
          const t = bboxData[bboxBase + 1];
          const r = bboxData[bboxBase + 2];
          const b = bboxData[bboxBase + 3];

          const cx = (x + 0.5) * stride;
          const cy = (y + 0.5) * stride;
          const x1 = cx - l * stride;
          const y1 = cy - t * stride;
          const x2 = cx + r * stride;
          const y2 = cy + b * stride;

          bestScore = score;
          bestBox = { x1, y1, x2, y2 };
          bestKeypoints = this._decodeScrfdKeypoints3d(kpsData, kpsDims, n, stride, cx, cy);
        }

        strideSummaries.push(
          `stride=${stride}: scoreKey=${scoreKey}, bboxKey=${bboxKey}, ` +
          `scoreDims=${JSON.stringify(scoreDims)}, bboxDims=${JSON.stringify(bboxDims)}, kpsDims=${JSON.stringify(kpsDims)}, ` +
          `anchors=${numAnchors}, maxScore=${Number.isFinite(strideBestScore) ? strideBestScore.toFixed(6) : 'n/a'}, format=3d`
        );
        continue;
      }

      strideSummaries.push(`stride=${stride}: unexpected dims score=${JSON.stringify(scoreDims)} bbox=${JSON.stringify(bboxDims)}`);
    }

    logger.debug(`👤 [人脸检测] SCRFD解码摘要: threshold=${this.scoreThreshold}, ${strideSummaries.join(' | ')}`);

    if (!bestBox) {
      logger.warn(`👤 [人脸检测] 未找到超过阈值的人脸框，threshold=${this.scoreThreshold}, bestScore=${bestScore}`);
      return null;
    }
    logger.debug(`👤 [人脸检测] 检测成功: score=${bestScore.toFixed(6)}, box=${JSON.stringify(bestBox)}`);
    return { score: bestScore, box: bestBox, keypoints: bestKeypoints };
  }

  _decodeScrfdKeypoints4d(kpsData, kpsDims, anchorIndex, y, x, height, width, stride) {
    if (!kpsData || !Array.isArray(kpsDims) || kpsDims.length !== 4) {
      return null;
    }

    const channelCount = kpsDims[1];
    if (channelCount < (anchorIndex + 1) * 10) {
      return null;
    }

    const idx = y * width + x;
    const base = anchorIndex * 10 * height * width;
    const cx = (x + 0.5) * stride;
    const cy = (y + 0.5) * stride;
    const points = [];

    for (let i = 0; i < 5; i++) {
      const px = kpsData[base + (i * 2) * height * width + idx];
      const py = kpsData[base + (i * 2 + 1) * height * width + idx];
      points.push({
        x: cx + px * stride,
        y: cy + py * stride
      });
    }

    return points;
  }

  _decodeScrfdKeypoints3d(kpsData, kpsDims, candidateIndex, stride, cx, cy) {
    if (!kpsData || !Array.isArray(kpsDims) || kpsDims.length !== 3) {
      return null;
    }

    if (kpsDims[1] <= candidateIndex || kpsDims[2] !== 10) {
      return null;
    }

    const base = candidateIndex * 10;
    const points = [];
    for (let i = 0; i < 5; i++) {
      points.push({
        x: cx + kpsData[base + i * 2] * stride,
        y: cy + kpsData[base + i * 2 + 1] * stride
      });
    }
    return points;
  }

  _selectBestFace(boxes, scores, scale = null) {
    const resolvedScores = Array.isArray(scores) ? scores : Array.from(scores || []);
    const resolvedBoxes = Array.isArray(boxes) ? boxes : Array.from(boxes || []);
    if (resolvedScores.length === 0 || resolvedBoxes.length === 0) {
      return null;
    }

    let bestIndex = -1;
    let bestScore = this.scoreThreshold;

    for (let i = 0; i < resolvedScores.length; i++) {
      const score = resolvedScores[i];
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex < 0) return null;

    const base = bestIndex * 4;
    if (base + 3 >= resolvedBoxes.length) return null;

    let x1 = resolvedBoxes[base];
    let y1 = resolvedBoxes[base + 1];
    let x2 = resolvedBoxes[base + 2];
    let y2 = resolvedBoxes[base + 3];

    if (scale) {
      x1 *= scale;
      y1 *= scale;
      x2 *= scale;
      y2 *= scale;
    }

    return {
      score: bestScore,
      box: { x1, y1, x2, y2 }
    };
  }
}

export default FaceDetectionService;
