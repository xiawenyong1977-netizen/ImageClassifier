import { logger, ModelPathAdapter } from '../adapters/WebAdapters';
import ImageProcessor from './ImageProcessor';

const DEFAULT_MODEL_FILE = 'face_embedding.onnx';
const DEFAULT_INPUT_SIZE = 112;
const DEFAULT_MEAN = [127.5, 127.5, 127.5];
const DEFAULT_STD = [128.0, 128.0, 128.0];
const DEFAULT_MODEL_CONFIG = {
  path: `./models/${DEFAULT_MODEL_FILE}`,
  inputSize: DEFAULT_INPUT_SIZE,
  inputName: 'input_1',
  outputName: 'embedding',
  inputLayout: 'NHWC',
  mean: DEFAULT_MEAN,
  std: DEFAULT_STD
};

class FaceEmbeddingService {
  constructor() {
    this.isInitialized = false;
    this.isAvailable = false;
    this.ort = null;
    this.model = null;
    this.modelConfig = null;
    this.inputName = null;
    this.outputName = null;
    this.inputSize = DEFAULT_INPUT_SIZE;
    this.mean = DEFAULT_MEAN;
    this.std = DEFAULT_STD;
    this.inputLayout = 'NCHW';
    this.imageProcessor = ImageProcessor;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.model;
    }

    const config = DEFAULT_MODEL_CONFIG;

    this.modelConfig = config;
    this.inputSize = config.inputSize || DEFAULT_INPUT_SIZE;
    this.mean = Array.isArray(config.mean) && config.mean.length === 3 ? config.mean : DEFAULT_MEAN;
    this.std = Array.isArray(config.std) && config.std.length === 3 ? config.std : DEFAULT_STD;
    this.inputLayout = config.inputLayout || 'NCHW';

    try {
      const modelFileName = (config.path || '').split('/').pop() || DEFAULT_MODEL_FILE;
      if (typeof ModelPathAdapter.ensureModelExists === 'function') {
        try {
          await ModelPathAdapter.ensureModelExists(modelFileName);
        } catch (error) {
          logger.error(`❌ faceEmbedding 模型复制失败: ${error.message || error}`);
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
      this.inputName = config.inputName || (this.model.inputNames ? this.model.inputNames[0] : null);
      this.outputName = config.outputName || (this.model.outputNames ? this.model.outputNames[0] : null);

      if (!this.inputName || !this.outputName) {
        throw new Error('faceEmbedding 模型缺少 input/output 名称');
      }

      this.isAvailable = true;
      this.isInitialized = true;
      logger.debug('✅ faceEmbedding 模型加载成功');
      return this.model;
    } catch (error) {
      logger.error('❌ faceEmbedding 模型加载失败:', error);
      this.isInitialized = true;
      this.isAvailable = false;
      return null;
    }
  }

  isReady() {
    return this.isInitialized && this.isAvailable && this.model;
  }

  async extractEmbedding(imageUri) {
    if (!imageUri) return null;

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isReady()) {
      return null;
    }

    try {
      const pixelData = await this.imageProcessor.getPixelData(
        imageUri,
        this.inputSize,
        this.inputSize,
        { mode: 'cover' }
      );

      return await this.extractEmbeddingFromPixelData(pixelData, this.inputSize, this.inputSize);
    } catch (error) {
      logger.error('❌ 人物Embedding提取失败:', error);
      return null;
    }
  }

  async extractEmbeddingFromPixelData(pixelData, width, height) {
    if (!pixelData || width <= 0 || height <= 0) return null;

    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.isReady()) return null;

    try {
      let resized = pixelData;
      if (width !== this.inputSize || height !== this.inputSize) {
        resized = this._resizePixelData(pixelData, width, height, this.inputSize, this.inputSize);
      }

      const mean = this.mean;
      const std = this.std;
      let inputData;
      let inputShape;

      if (this.inputLayout === 'NHWC') {
        inputData = new Float32Array(this.inputSize * this.inputSize * 3);
        for (let i = 0; i < resized.length; i += 4) {
          const pixelIndex = i / 4;
          const r = resized[i];
          const g = resized[i + 1];
          const b = resized[i + 2];

          const nr = (r - mean[0]) / std[0];
          const ng = (g - mean[1]) / std[1];
          const nb = (b - mean[2]) / std[2];

          const base = pixelIndex * 3;
          inputData[base] = nr;
          inputData[base + 1] = ng;
          inputData[base + 2] = nb;
        }
        inputShape = [1, this.inputSize, this.inputSize, 3];
      } else {
        inputData = new Float32Array(3 * this.inputSize * this.inputSize);
        for (let i = 0; i < resized.length; i += 4) {
          const pixelIndex = i / 4;
          const r = resized[i];
          const g = resized[i + 1];
          const b = resized[i + 2];

          const nr = (r - mean[0]) / std[0];
          const ng = (g - mean[1]) / std[1];
          const nb = (b - mean[2]) / std[2];

          const h = Math.floor(pixelIndex / this.inputSize);
          const w = pixelIndex % this.inputSize;

          const chwIndexR = h * this.inputSize + w;
          const chwIndexG = this.inputSize * this.inputSize + h * this.inputSize + w;
          const chwIndexB = 2 * this.inputSize * this.inputSize + h * this.inputSize + w;

          inputData[chwIndexR] = nr;
          inputData[chwIndexG] = ng;
          inputData[chwIndexB] = nb;
        }
        inputShape = [1, 3, this.inputSize, this.inputSize];
      }

      const inputTensor = new this.ort.Tensor('float32', inputData, inputShape);

      const results = await this.model.run({ [this.inputName]: inputTensor });
      const output = results[this.outputName];
      if (!output) {
        throw new Error('faceEmbedding 模型没有返回输出');
      }

      let outputData;
      if (output.cpuData) {
        outputData = output.cpuData;
      } else if (typeof output.data === 'function') {
        outputData = await output.data();
      } else if (Array.isArray(output)) {
        outputData = output;
      } else {
        throw new Error('faceEmbedding 输出格式不可识别');
      }

      const embedding = new Float32Array(outputData);
      return this._normalizeEmbedding(embedding);
    } catch (error) {
      logger.error('❌ 人物Embedding提取失败:', error);
      return null;
    }
  }

  _resizePixelData(pixelData, srcW, srcH, dstW, dstH) {
    const resized = new Uint8ClampedArray(dstW * dstH * 4);
    for (let y = 0; y < dstH; y++) {
      const srcY = Math.floor((y / dstH) * srcH);
      for (let x = 0; x < dstW; x++) {
        const srcX = Math.floor((x / dstW) * srcW);
        const srcIndex = (srcY * srcW + srcX) * 4;
        const dstIndex = (y * dstW + x) * 4;
        resized[dstIndex] = pixelData[srcIndex];
        resized[dstIndex + 1] = pixelData[srcIndex + 1];
        resized[dstIndex + 2] = pixelData[srcIndex + 2];
        resized[dstIndex + 3] = pixelData[srcIndex + 3];
      }
    }
    return resized;
  }

  _normalizeEmbedding(vector) {
    if (!vector || vector.length === 0) return null;
    let norm = 0;
    for (let i = 0; i < vector.length; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (!norm || norm === 0) return null;

    const normalized = new Float32Array(vector.length);
    for (let i = 0; i < vector.length; i++) {
      normalized[i] = vector[i] / norm;
    }
    return normalized;
  }
}

export default FaceEmbeddingService;
