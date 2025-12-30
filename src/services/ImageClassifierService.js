import UnifiedDataService from './UnifiedDataService.js';
import configService from './ConfigService.js';
import { logger, ModelPathAdapter, CanvasAdapter, Platform, getUri } from '../adapters/WebAdapters';
import imageProcessor from './ImageProcessor';

class ImageClassifierService {
  constructor() {
    this.isInitialized = false;
    // Supported categories - 将在初始化时从配置服务获取
    this.categories = [];
    
    // ImageNet-1K类别列表（1000个类别）
    this.imagenetClasses = null; // 延迟加载
    
    // ONNX Runtime实例（统一导入，避免重复导入）
    this.ort = null;
    
    // 配置服务实例
    this.configService = configService;
    
    // 模型配置将在初始化时从配置文件加载
    this.models = {};
    
    // 缓存可用的执行提供者，避免重复检测
    this.cachedProviders = null;
    
    // 批量处理配置
    this.BATCH_CONFIG = {
      CACHE_BATCH_SIZE: 100,      // 批量缓存查询大小
      UPLOAD_BATCH_SIZE: 20,       // 批量上传大小（移动端会在每批次后清理临时文件）
      REMOTE_TIMEOUT: 180000,     // 远程请求超时（毫秒）- 增加到180秒（后台网络可能更慢）
      CACHE_TIMEOUT: 60000,       // 缓存查询超时（毫秒）- 60秒
      HEALTH_CHECK_TIMEOUT: 10000  // 健康检查超时（毫秒）- 增加到10秒
    };
    
    // 注意：已移除 Web Worker 池，使用主线程并行推理
  }

  // 🗑️ 已移除 getModelPath 方法，现在使用 ModelPathAdapter.getModelPath()

  // 从配置文件初始化模型配置
  async initializeModelConfigs() {
    try {
      // 初始化配置服务
      const configLoaded = await this.configService.initialize();
      if (!configLoaded) {
        throw new Error('配置服务初始化失败');
      }

      // 获取所有模型配置
      const modelConfigs = this.configService.getAllModelConfigs();
      
      // 🆕 使用适配器获取模型路径（无需关心平台差异）
      // 初始化模型配置
      this.models = {
        // ID卡模型保持硬编码（特有模型，不在配置文件中）
        idCard: {
          model: null,
          path: ModelPathAdapter.getModelPath('id_card_detection.onnx'),
          classes: ['id_card_front', 'id_card_back'],
          metadata: null,
          priority: 1,
          description: '身份证识别专用模型',
          confidenceThreshold: 0.7,  // 提高身份证检测阈值，减少误检
          nmsThreshold: 0.4,
          maxDetections: 5
        },
        // YOLO8s模型从配置文件读取
        yolo8s: {
          model: null,
          path: ModelPathAdapter.getModelPath('yolov8s.onnx', modelConfigs.yolo8s?.path),
          classes: null, // 将从配置文件加载
          metadata: null,
          priority: 2,
          description: modelConfigs.yolo8s?.name || '通用物体检测模型',
          confidenceThreshold: modelConfigs.yolo8s?.confidenceThreshold || 0.25,
          nmsThreshold: modelConfigs.yolo8s?.nmsThreshold || 0.4,
          maxDetections: modelConfigs.yolo8s?.maxDetections || 10
        },
        // MobileNetV3模型从配置文件读取
        mobilenetv3: {
          model: null,
          path: ModelPathAdapter.getModelPath('mobilenetv3_rw_Opset17.onnx', modelConfigs.mobilenetv3?.path),
          classes: null, // 将从配置文件加载
          metadata: null,
          priority: 3,
          description: modelConfigs.mobilenetv3?.name || 'MobileNetV3图像分类模型',
          inputName: 'x',
          outputName: '496',
          confidenceThreshold: modelConfigs.mobilenetv3?.confidenceThreshold || 0.3
        }
      };

      // 加载YOLO物体类别映射
      const yoloObjectMap = this.configService.getYoloObjectNameMap();
      this.models.yolo8s.classes = Object.keys(yoloObjectMap);
      
      // 调试：输出YOLO类别信息
      logger.debug(`YOLO8s模型类别数量: ${this.models.yolo8s.classes.length}`);
      logger.debug(`YOLO8s类别列表:`, this.models.yolo8s.classes.slice(0, 10));

      // 加载MobileNetV3类别映射
      const mobilenetv3Classes = this.configService.getMobileNetV3Classes();
      if (mobilenetv3Classes && Object.keys(mobilenetv3Classes).length > 0) {
        // 转换为数组格式（按ID排序）
        const classesArray = Object.values(mobilenetv3Classes)
          .sort((a, b) => a.id - b.id)
          .map(cls => cls.english);
        
        this.imagenetClasses = classesArray;
        this.models.mobilenetv3.classes = Object.values(mobilenetv3Classes)
          .sort((a, b) => a.id - b.id);
        
        logger.debug(`MobileNetV3类别加载成功: ${this.imagenetClasses.length} 个类别`);
      } else {
        logger.warn('配置服务中未找到MobileNetV3类别数据');
        this.imagenetClasses = [];
        this.models.mobilenetv3.classes = [];
      }

      // 加载分类信息
      this.categories = this.configService.getAllCategoryIds();
      logger.debug(`分类信息加载成功: ${this.categories.length} 个分类`);

      logger.debug('模型配置初始化完成');
      return true;
    } catch (error) {
      logger.error('模型配置初始化失败:', error);
      throw error;
    }
  }

  // 初始化ONNX Runtime
  async initializeONNX() {
    if (this.ort) {
      return this.ort;
    }

    try {
      // 🆕 使用适配器加载正确的ONNX Runtime版本
      this.ort = await ModelPathAdapter.loadOnnxRuntime();
      logger.debug('✅ ONNX Runtime初始化成功');
      return this.ort;
    } catch (error) {
      logger.error('❌ ONNX Runtime初始化失败:', error);
      throw error;
    }
  }

  // Initialize service
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // 初始化模型配置（从配置文件加载）
      await this.initializeModelConfigs();
      
      // 初始化ONNX Runtime
      await this.initializeONNX();
      
      // 加载所有模型
      const loadResults = await this.loadAllModels(['idCard', 'yolo8s', 'mobilenetv3']);
      
      // 检查加载结果
      if (!loadResults.success) {
        throw new Error(`模型加载失败: ${loadResults.message}`);
      }
      logger.info(`✅ 模型加载完成: ${loadResults.message}`);
      
      // Time-based simulation classification algorithm already initialized
      this.isInitialized = true;
    } catch (error) {
      console.error('❌ Image classification service initialization failed:', error);
      throw error;
    }
  }

  // Load specific model
  async loadModel(modelName = 'yolo8s') {
    try {
      const modelConfig = this.models[modelName];
      if (!modelConfig) {
        throw new Error(`Unknown model: ${modelName}`);
      }

      if (modelConfig.model) {
        return modelConfig.model;
      }


      
      // 在浏览器环境中，我们直接尝试加载模型文件
      // 如果文件不存在，ONNX Runtime 会抛出相应的错误
      // 在 Node.js 环境中，可以检查文件是否存在
      if (typeof window === 'undefined') {
        // Node.js 环境 - 在构建时跳过，因为浏览器环境不需要
        console.warn('⚠️ Node.js环境下的文件系统检查在浏览器构建中被跳过');
      }

        // MobileNetV3类别已在初始化时加载，无需重复加载

        // 🆕 确保模型文件存在（仅在移动端需要从 assets 复制）
        if (typeof ModelPathAdapter.ensureModelExists === 'function') {
          const modelFileName = modelConfig.path.split('/').pop();
          await ModelPathAdapter.ensureModelExists(modelFileName);
        }

        // 加载ONNX模型
        // 使用统一的ONNX Runtime实例
        const ort = this.ort;
        
        // 检测可用的执行提供者
        const availableProviders = await this.detectAvailableProviders();
        
        // 创建推理会话时的配置
        const sessionOptions = {
          executionProviders: availableProviders, // 使用检测到的可用提供者
          graphOptimizationLevel: 'disabled', // 禁用图优化，避免输出格式变化
          enableCpuMemArena: false, // 禁用CPU内存池
          enableMemPattern: false, // 禁用内存模式
          enableProfiling: false,
          logSeverityLevel: 3, // 只显示错误日志 (0=Verbose, 1=Info, 2=Warning, 3=Error, 4=Fatal)
          logVerbosityLevel: 0, // 最小详细级别
          sessionLogSeverityLevel: 3, // 会话日志级别
          sessionLogVerbosityLevel: 0 // 会话详细级别
        };
        
        
        modelConfig.model = await ort.InferenceSession.create(modelConfig.path, sessionOptions);

      
      return modelConfig.model;
    } catch (error) {
      console.error(`Failed to load ${modelName} model:`, error);
      throw error;
    }
  }

  async detectAvailableProviders() {
    // 如果已经检测过，直接返回缓存结果
    if (this.cachedProviders) {
      return this.cachedProviders;
    }
    
    try {
      // 🆕 从适配器获取推荐的提供者列表
      const recommendedProviders = ModelPathAdapter.getExecutionProviders();
      logger.debug(`🔍 适配器推荐的执行提供者: ${recommendedProviders.join(', ')}`);
      
      const ort = this.ort;
      const availableProviders = [];
      
      // 检查ONNX Runtime实际支持的提供者
      if (typeof ort.getAvailableProviders === 'function') {
        // 获取ONNX Runtime实际支持的提供者
        const ortProviders = await ort.getAvailableProviders();
        logger.debug(`🔍 ONNX Runtime实际支持: ${ortProviders.join(', ')}`);
        
        // 🆕 取推荐列表和实际支持的交集（按推荐顺序）
        for (const provider of recommendedProviders) {
          if (ortProviders.includes(provider)) {
            availableProviders.push(provider);
            logger.debug(`✅ 启用提供者: ${provider}`);
          }
        }
      } else if (typeof ort.listSupportedBackends === 'function') {
        // Node.js环境：使用listSupportedBackends方法
        const backends = ort.listSupportedBackends();
        logger.debug(`🔍 ONNX Runtime支持的backend: ${backends.map(b => b.name).join(', ')}`);
        
        // 🆕 取推荐列表和实际支持的交集（按推荐顺序）
        for (const provider of recommendedProviders) {
          if (backends.some(b => b.name === provider)) {
            availableProviders.push(provider);
            logger.debug(`✅ 启用提供者: ${provider}`);
          }
        }
      } else {
        // 🆕 如果没有检测方法，直接使用推荐列表
        logger.debug('⚠️ ONNX Runtime未提供检测方法，使用推荐列表');
        availableProviders.push(...recommendedProviders);
      }
      
      // 如果没有检测到任何提供者，默认使用CPU
      if (availableProviders.length === 0) {
        availableProviders.push('cpu');
        logger.debug('⚠️ 未检测到可用提供者，使用 CPU');
      }
      
      // 缓存检测结果
      this.cachedProviders = availableProviders;
      logger.info(`✅ 执行提供者检测完成: ${availableProviders.join(', ')}`);
      
      return availableProviders;
    } catch (error) {
      console.warn('⚠️ 检测执行提供者失败，使用 CPU:', error.message);
      this.cachedProviders = ['cpu'];
      return ['cpu'];
    }
  }

  // 预处理图片用于YOLO模型
  async preprocessImageForYOLO(imageUri, inputSize = 640) {
    try {
      // 使用统一的ONNX Runtime实例
      const ort = this.ort;
      
      // 使用新接口获取像素数据（保持宽高比，居中，黑边填充）
      const data = await imageProcessor.getPixelData(
        imageUri,
        inputSize,
        inputSize,
        { mode: 'contain', backgroundColor: [0, 0, 0, 255] }
      );
      
      // 转换为RGB格式并归一化到[0,1]
      const rgbData = new Float32Array(inputSize * inputSize * 3);
      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        rgbData[pixelIndex * 3] = data[i] / 255.0;         // R
        rgbData[pixelIndex * 3 + 1] = data[i + 1] / 255.0; // G
        rgbData[pixelIndex * 3 + 2] = data[i + 2] / 255.0; // B
      }
      
      // 关键修复：转换为正确的BCHW格式
      // 原始格式：HWC (Height, Width, Channel) - [640, 640, 3]
      // 目标格式：BCHW (Batch, Channel, Height, Width) - [1, 3, 640, 640]
      const bchwData = new Float32Array(1 * 3 * inputSize * inputSize);
      
      for (let h = 0; h < inputSize; h++) {
        for (let w = 0; w < inputSize; w++) {
          const pixelIndex = h * inputSize + w;
          const r = rgbData[pixelIndex * 3];
          const g = rgbData[pixelIndex * 3 + 1];
          const b = rgbData[pixelIndex * 3 + 2];
          
          // BCHW格式：先所有R，再所有G，最后所有B
          bchwData[h * inputSize + w] = r;                    // R通道
          bchwData[inputSize * inputSize + h * inputSize + w] = g;        // G通道  
          bchwData[2 * inputSize * inputSize + h * inputSize + w] = b;    // B通道
        }
      }
      
      // 转换为ONNX格式 (1, 3, 640, 640)
      const tensor = new ort.Tensor('float32', bchwData, [1, 3, inputSize, inputSize]);
      return tensor;
    } catch (error) {
      console.error('Image preprocessing failed:', error);
      throw error;
    }
  }

  // Postprocess YOLO output with dynamic classes
  async postprocessYOLOOutput(output, confidenceThreshold, nmsThreshold) {
    try {
      if (!output) {
        throw new Error('输出数据为空');
      }
      
      if (!output.dims) {
        throw new Error(`输出数据缺少 dims 属性: ${JSON.stringify(output)}`);
      }
      
      // 获取实际的数值数据
      let data;
      if (output.cpuData) {
        // CPU数据，直接使用
        data = output.cpuData;
      } else if (output.data) {
        // GPU数据，需要转换为CPU数据
        data = await output.data();
      } else if (Array.isArray(output)) {
        // 数组格式数据
        data = output;
      } else {
        throw new Error(`无法识别的输出数据格式: ${JSON.stringify(output)}`);
      }
      
      const predictions = {
        dims: output.dims,
        data: data
      };
      
      if (!predictions || !predictions.dims) {
        throw new Error(`预测数据无效: ${JSON.stringify(predictions)}`);
      }
      
      const [batchSize, numValues, numBoxes] = predictions.dims;
      
      // 计算类别数量：总数值 - 4个边界框坐标 = 类别数量
      const numClasses = numValues - 4;
      
      // 使用传入的置信度阈值
      
      // 处理所有检测框，寻找有效的class_id=0或1的检测结果
      const detections = [];
      
      // 解析检测结果
      for (let i = 0; i < numBoxes; i++) {
        // 提取边界框坐标 (x, y, w, h)
        const x = predictions.data[numBoxes * 0 + i];
        const y = predictions.data[numBoxes * 1 + i];
        const w = predictions.data[numBoxes * 2 + i];
        const h = predictions.data[numBoxes * 3 + i];
        
        const classScores = [];
        
        // 提取所有类别分数
        for (let j = 0; j < numClasses; j++) {
          classScores.push(predictions.data[numBoxes * (4 + j) + i]);
        }
        
        // 找到最佳类别
        const maxScore = Math.max(...classScores);
        const classId = classScores.indexOf(maxScore);
        const confidence = maxScore;
        
        // 统一处理所有模型类型
        if (confidence > confidenceThreshold && classId >= 0 && classId < numClasses) {
          detections.push({
            classId: classId,
            confidence: confidence,
            bbox: [x, y, w, h]
          });
        }
      }
      
      // 应用非极大值抑制 (NMS)
      const nmsDetections = this.applyNMS(detections, nmsThreshold);
      
      // 检查是否有有效检测结果
      if (nmsDetections.length === 0) {
        logger.debug(`🔍 YOLO后处理: 没有通过NMS的检测结果 (原始检测: ${detections.length}个)`);
        return [];
      }
      
      logger.debug(`🔍 YOLO后处理: ${detections.length}个原始检测 -> ${nmsDetections.length}个最终检测`);
      return nmsDetections;
    } catch (error) {
      console.error('YOLO postprocessing failed:', error);
      return [];
    }
  }

  // Apply Non-Maximum Suppression
  applyNMS(detections, nmsThreshold = 0.4) {
    if (!detections || detections.length === 0) {
      return [];
    }

    // 按置信度降序排序
    detections.sort((a, b) => b.confidence - a.confidence);
    
    const filteredDetections = [];
    const suppressed = new Array(detections.length).fill(false);
    
    for (let i = 0; i < detections.length; i++) {
      if (suppressed[i]) continue;
      
      const currentDetection = detections[i];
      
      // 计算当前检测框与其他检测框的IoU
      for (let j = i + 1; j < detections.length; j++) {
        if (suppressed[j]) continue;
        
        const otherDetection = detections[j];
        
        // 只对相同类别的检测框进行NMS
        if (currentDetection.classId !== otherDetection.classId) {
          continue;
        }
        
        // 计算IoU
        const iou = this.calculateIoU(currentDetection, otherDetection);
        
        // 如果IoU超过阈值，抑制该检测框
        if (iou > nmsThreshold) {
          suppressed[j] = true;
        }
      }
      
      // 只有在处理完所有其他框后，才添加当前框到结果中
      filteredDetections.push(currentDetection);
    }
    
    return filteredDetections;
  }


  // 计算两个检测框的IoU (Intersection over Union)
  calculateIoU(detection1, detection2) {
    // 从bbox数组获取坐标 [x, y, w, h]
    const [x1, y1, w1, h1] = detection1.bbox;
    const [x2, y2, w2, h2] = detection2.bbox;
    
    // 计算交集区域的坐标
    const intersectionX1 = Math.max(x1, x2);
    const intersectionY1 = Math.max(y1, y2);
    const intersectionX2 = Math.min(x1 + w1, x2 + w2);
    const intersectionY2 = Math.min(y1 + h1, y2 + h2);
    
    // 计算交集面积
    const intersectionArea = Math.max(0, intersectionX2 - intersectionX1) * Math.max(0, intersectionY2 - intersectionY1);
    
    // 计算并集面积
    const area1 = w1 * h1;
    const area2 = w2 * h2;
    const unionArea = area1 + area2 - intersectionArea;
    
    // 避免除零
    if (unionArea === 0) {
      return 0;
    }
    
    return intersectionArea / unionArea;
  }

 
  // Classify image (simplified version, directly using time classification)
  /**
   * 图片分类主方法（纯本地推理）
   * 注意：此方法仅用于扫描流程的第4层本地推理降级
   * 截图检测、缓存查询、远程推理已在前3层完成
   * @param {Object} imageData - 图片数据对象，包含 uri、imageDimensions 等字段
   * @returns {Promise<Object>} 分类结果
   */
  async classifyImage(imageData) {
    const totalStartTime = Date.now();
    
    try {
      // 检查服务是否已初始化
      if (!this.isInitialized) {
        throw new Error('ImageClassifierService 未初始化，请先调用 initialize() 方法');
      }

      // 从 imageData 中获取 URI
      const imageUri = getUri(imageData);
      if (!imageUri) {
        logger.error('⚠️ 本地推理：无法获取图片URI:', {
          imageId: imageData?.id,
          fileName: imageData?.fileName,
          uri: imageData?.uri
        });
        throw new Error(`无法获取图片URI: ${imageData?.fileName || 'unknown'}`);
      }

      // 从 imageData 中提取图像尺寸
      // 设计：imageDimensions 必须是一个对象，包含 width 和 height 两个数字属性
      const dims = imageData.imageDimensions;

      if (!dims || 
          typeof dims !== 'object' || 
          typeof dims.width !== 'number' || dims.width <= 0 ||
          typeof dims.height !== 'number' || dims.height <= 0) {
        logger.error('⚠️ 数据库缺少图片尺寸数据:', {
          imageId: imageData?.id,
          fileName: imageData?.fileName,
          uri: imageData?.uri,
          hasImageDimensions: !!imageData?.imageDimensions,
          imageDimensionsType: typeof imageData?.imageDimensions,
          imageDimensionsValue: imageData?.imageDimensions
        });
        throw new Error(`数据库缺少图片尺寸数据: ${imageData?.fileName || 'unknown'}`);
      }
      
      const imageDimensions = {
        width: dims.width,
        height: dims.height
      };
      
      // 执行本地并行推理
      const inferenceStart = Date.now();
      const parallelResults = await this.runParallelInference(imageUri);
      const inferenceTime = Date.now() - inferenceStart;
      
      // 保存所有模型的原始结果
      const allModelResults = {
        mobileScreenshot: false,
        idCard: parallelResults.idCard || [],
        general: parallelResults.general || [],
        mobileNetV3: parallelResults.mobileNetV3 || []
      };

      // 统计检测结果
      const idCardCount = allModelResults.idCard.length;
      const generalCount = allModelResults.general.length;
      const mobileNetV3Count = allModelResults.mobileNetV3.predictions ? allModelResults.mobileNetV3.predictions.length : 0;

      // 调用新的分类映射函数
      const mappingStart = Date.now();
      const categoryId = await this.MapObjectes2Category(allModelResults, imageUri, imageDimensions);
      const mappingTime = Date.now() - mappingStart;

      const totalTime = Date.now() - totalStartTime;
      
      // 输出完整的性能分析报告
      logger.info(`🎯 单张图片分类完整性能报告:`);
      logger.info(`  ├─ 模型推理总时间: ${inferenceTime}ms`);
      logger.info(`  ├─ 分类映射: ${mappingTime}ms`);
      logger.info(`  └─ 总耗时: ${totalTime}ms`);
      logger.info(`  → 分类结果: ${categoryId}`);
      
      // 返回详细的分类结果，由调用方决定如何保存
      const result = {
        success: true,
        categoryId: categoryId,
        confidence: 1.0, // 使用分类映射的置信度
        message: '图像分类完成',
        // 返回所有检测结果，供调用方使用
        idCardDetections: allModelResults.idCard,
        generalDetections: allModelResults.general,
        mobileNetV3Detections: allModelResults.mobileNetV3,
        imageDimensions: imageDimensions,
        // 返回原始模型结果，供调试和分析
        allModelResults: allModelResults,
        // 返回性能统计
        performanceMetrics: {
          totalTime,
          inferenceTime,
          mappingTime
        }
      };
      
      
      return result;  
      


    } catch (error) {
      console.error('Image classification failed:', error);
      return {
        success: false,
        categoryId: 'other',
        message: `分类失败: ${error.message}`,
        // 即使分类失败，也返回空的检测结果字段，确保数据结构一致
        idCardDetections: [],
        generalDetections: [],
        mobileNetV3Detections: null,
        imageDimensions: null
      };
    }
  }

 



 

  // 卸载模型
  unloadModel(modelName) {
    if (!this.models[modelName]) {
      throw new Error(`Unknown model: ${modelName}`);
    }
    
    // 正确释放ONNX模型会话
    if (this.models[modelName].model) {
      try {
        // ONNX Runtime会话有dispose方法用于释放内存
        if (typeof this.models[modelName].model.dispose === 'function') {
          this.models[modelName].model.dispose();
        }
      } catch (error) {
        console.warn(`释放模型 ${modelName} 时出错:`, error.message);
      }
    }
    
    this.models[modelName].model = null;
    this.models[modelName].classes = null;
    this.models[modelName].metadata = null;
    
    // 对于MobileNetV3模型，清理ImageNet类别数据（可选，因为数据量不大）
    if (modelName === 'mobilenetv3') {
      this.imagenetClasses = null;
      this.models.mobilenetv3.classes = null;
    }
  }

  // 卸载所有模型
  unloadAllModels() {
    let unloadedCount = 0;
    
    Object.keys(this.models).forEach(modelName => {
      if (this.models[modelName].model) {
        this.unloadModel(modelName);
        unloadedCount++;
      }
    });
    
  }

  // 检测物体（使用指定模型）
  // 使用YOLO模型进行检测（支持idCard和yolo8s）
  async classifyImageWithYOLO(imageUri, modelName) {
    const t0 = Date.now();
    
    if (!imageUri) {
      throw new Error('imageUri is required');
    }
    if (!modelName) {
      throw new Error('modelName is required');
    }
    if (!this.models[modelName] || !this.models[modelName].model) {
      throw new Error(`Model ${modelName} not loaded`);
    }
    
    // 从模型配置获取参数
    const modelConfig = this.models[modelName];
    const confidenceThreshold = modelConfig.confidenceThreshold;
    const nmsThreshold = modelConfig.nmsThreshold;
    const maxDetections = modelConfig.maxDetections;

    try {
      // 确保模型已加载
      const loadStart = Date.now();
      await this.loadModel(modelName);
      const loadTime = Date.now() - loadStart;

      // 预处理图片
      const preprocessStart = Date.now();
      const inputTensor = await this.preprocessImageForYOLO(imageUri);
      const preprocessTime = Date.now() - preprocessStart;
      
      // 运行推理
      const inferenceStart = Date.now();
      const feeds = { images: inputTensor };
      const results = await modelConfig.model.run(feeds);
      const inferenceTime = Date.now() - inferenceStart;
      
      // 后处理结果
      const postprocessStart = Date.now();
      const outputData = results.output0 || results.output || results[Object.keys(results)[0]];
      
      if (!outputData) {
        throw new Error(`模型 ${modelName} 没有返回有效的输出数据。输出键: ${Object.keys(results)}`);
      }
      
      const detections = await this.postprocessYOLOOutput(
        outputData, 
        confidenceThreshold,
        nmsThreshold
      );

      // 限制检测数量
      const limitedDetections = detections.slice(0, maxDetections);
      const postprocessTime = Date.now() - postprocessStart;
      
      const totalTime = Date.now() - t0;
      
      // 详细性能日志（仅在检测到物体或总时间过长时输出）
      if (limitedDetections.length > 0 || totalTime > 1000) {
        logger.info(`📊 ${modelName}推理性能: 总${totalTime}ms (加载${loadTime}ms + 预处理${preprocessTime}ms + 推理${inferenceTime}ms + 后处理${postprocessTime}ms) → ${limitedDetections.length}个检测`);
      }
     
      return limitedDetections;
    } catch (error) {
      console.error(`❌ ${modelName}模型检测失败:`, error);
      return []
    }
  }


  // 获取图片原始分辨率
  async getOriginalImageDimensions(imageUri) {
    try {
      // 使用ImageProcessor统一接口，避免重复加载
      return await imageProcessor.getImageDimensions(imageUri);
    } catch (error) {
      throw new Error('Failed to load image');
    }
  }

  // 检查是否为手机截图




  // ==================== 并行推理相关函数 ====================

  /**
   * 并行/串行执行所有模型推理
   * - 移动端：并行推理（React Native原生C++支持多线程）
   * - PC端：串行推理（Web WASM受限于主线程）
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Object>} 所有模型的推理结果
   */
  async runParallelInference(imageUri) {
    const startTime = Date.now();
    
    // 判断是否为移动端平台
    const isMobile = Platform.OS === 'android' || Platform.OS === 'ios';
    
    // 详细耗时统计
    const timings = {
      total: 0,
      idCard: 0,
      general: 0,
      mobileNetV3: 0
    };
    
    let results = {
      idCard: [],
      general: [],
      mobileNetV3: {}
    };
    
    try {
      if (isMobile) {
        // ============ 移动端：并行推理 ============
        logger.info('🚀 开始并行推理（移动端原生多线程）...');
        
        const parallelStart = Date.now();
        
        const [idCardResults, generalResults, mobileNetV3Results] = await Promise.all([
          // 1. ID卡模型
          this.classifyImageWithYOLO(imageUri, 'idCard').catch(error => {
            logger.error('❌ ID卡推理失败:', error.message);
            return [];
          }),
          
          // 2. YOLOv8模型
          this.classifyImageWithYOLO(imageUri, 'yolo8s').catch(error => {
            logger.error('❌ YOLO推理失败:', error.message);
            return [];
          }),
          
          // 3. MobileNetV3模型
          this.classifyImageWithMobileNetV3(imageUri).catch(error => {
            logger.error('❌ MobileNetV3推理失败:', error.message);
            return {};
          })
        ]);
        
        const parallelTime = Date.now() - parallelStart;
        
        results = {
          idCard: idCardResults || [],
          general: generalResults || [],
          mobileNetV3: mobileNetV3Results || {}
        };
        
        logger.info(`✅ 并行推理完成！总耗时: ${parallelTime}ms`);
        logger.debug(`  - ID卡: ${results.idCard.length} 个 | YOLO: ${results.general.length} 个 | MobileNetV3: ${results.mobileNetV3.predictions ? results.mobileNetV3.predictions.length : 0} 个`);
        
      } else {
        // ============ PC端：串行推理 ============
        logger.info('🚀 开始串行推理（PC端Web环境）...');
        
        // 1. ID卡模型
        const idCardStart = Date.now();
        try {
          results.idCard = await this.classifyImageWithYOLO(imageUri, 'idCard');
          timings.idCard = Date.now() - idCardStart;
          logger.debug(`  - ID卡模型: ${timings.idCard}ms`);
        } catch (error) {
          timings.idCard = Date.now() - idCardStart;
          logger.error('❌ ID卡推理失败:', error.message);
          results.idCard = [];
        }
        
        // 2. YOLOv8模型
        const generalStart = Date.now();
        try {
          results.general = await this.classifyImageWithYOLO(imageUri, 'yolo8s');
          timings.general = Date.now() - generalStart;
          logger.debug(`  - YOLOv8模型: ${timings.general}ms`);
        } catch (error) {
          timings.general = Date.now() - generalStart;
          logger.error('❌ YOLO推理失败:', error.message);
          results.general = [];
        }
        
        // 3. MobileNetV3模型
        const mobileNetStart = Date.now();
        try {
          results.mobileNetV3 = await this.classifyImageWithMobileNetV3(imageUri);
          timings.mobileNetV3 = Date.now() - mobileNetStart;
          logger.debug(`  - MobileNetV3模型: ${timings.mobileNetV3}ms`);
        } catch (error) {
          timings.mobileNetV3 = Date.now() - mobileNetStart;
          logger.error('❌ MobileNetV3推理失败:', error.message);
          results.mobileNetV3 = {};
        }
        
        const serialTotalTime = timings.idCard + timings.general + timings.mobileNetV3;
        logger.info(`✅ 串行推理完成！总耗时: ${serialTotalTime}ms`);
        logger.debug(`  - ID卡: ${results.idCard.length} 个 | YOLO: ${results.general.length} 个 | MobileNetV3: ${results.mobileNetV3.predictions ? results.mobileNetV3.predictions.length : 0} 个`);
      }
      
    } catch (error) {
      logger.error('❌ 推理过程中发生错误:', error);
      // 返回空结果，避免中断流程
      results = {
        idCard: [],
        general: [],
        mobileNetV3: {}
      };
    }
    
    const endTime = Date.now();
    timings.total = endTime - startTime;
    
    logger.info(`⏱️ 推理总耗时: ${timings.total}ms`);
    
    return results;
  }


  
  // ==================== 分类函数 ====================

  /**
   * 识别图像中的主角对象
   * @param {string} imageURI - 图像URI（用于日志记录）
   * @param {Array} yoloDetectResults - YOLO检测结果数组
   * @param {Object} imageDimensions - 图像尺寸 {width, height}
   * @returns {Array} 主角信息数组，每个元素包含 {category, count, sizeRatio}
   */
  identifyMainRole(imageURI, yoloDetectResults, imageDimensions) {
    try {
      logger.debug(`🎯 开始识别图像主角: ${imageURI}`);
      
      if (!yoloDetectResults || yoloDetectResults.length === 0) {
        logger.debug('⚠️ 没有检测到任何物体');
        return [];
      }

      // 检查图像尺寸参数
      if (!imageDimensions || !imageDimensions.width || !imageDimensions.height) {
        logger.debug('⚠️ 缺少图像尺寸信息，无法计算物体比例');
        return [];
      }

      const { width: imageWidth, height: imageHeight } = imageDimensions;
      const imageArea = imageWidth * imageHeight;
      
      // YOLO输入尺寸（固定为640x640）
      const yoloInputSize = 640;
      
      // 统计各类别的检测结果
      const categoryStats = {};
      
      yoloDetectResults.forEach(detection => {
        const classId = detection.classId;
        
        // 获取物体信息（包含分类信息）
        const objectInfo = this.configService.getYoloObjectById(classId);
        
        if (objectInfo && objectInfo.category) {
          const category = objectInfo.category;
          
          if (!categoryStats[category]) {
            categoryStats[category] = {
              count: 0,
              totalArea: 0
            };
          }
          
          // 将YOLO的bbox坐标从640x640转换回原始图像尺寸
          const [x, y, w, h] = detection.bbox;
          
          // 计算缩放比例（YOLO预处理时保持长宽比）
          const scale = Math.min(yoloInputSize / imageWidth, yoloInputSize / imageHeight);
          const scaledWidth = imageWidth * scale;
          const scaledHeight = imageHeight * scale;
          
          // 计算在原始图像中的偏移量
          const offsetX = (yoloInputSize - scaledWidth) / 2;
          const offsetY = (yoloInputSize - scaledHeight) / 2;
          
          // 将bbox坐标转换回原始图像坐标
          const originalX = (x - offsetX) / scale;
          const originalY = (y - offsetY) / scale;
          const originalW = w / scale;
          const originalH = h / scale;
          
          // 确保坐标在图像范围内
          const clampedX = Math.max(0, Math.min(originalX, imageWidth));
          const clampedY = Math.max(0, Math.min(originalY, imageHeight));
          const clampedW = Math.max(0, Math.min(originalW, imageWidth - clampedX));
          const clampedH = Math.max(0, Math.min(originalH, imageHeight - clampedY));
          
          // 计算物体面积比例
          const objectArea = clampedW * clampedH;
          const areaRatio = objectArea / imageArea;
          
          categoryStats[category].count++;
          categoryStats[category].totalArea += areaRatio;
        }
      });
      
      // 构建结果数组
      const results = Object.entries(categoryStats)
        .map(([category, stats]) => ({ 
          category, 
          count: stats.count,
          sizeRatio: stats.totalArea // 累计面积比例
        }))
        .sort((a, b) => b.sizeRatio - a.sizeRatio); // 按面积比例降序排序
      
      logger.debug(`✅ 主角识别完成，识别到 ${results.length} 个分类:`);
      results.forEach((result, index) => {
        logger.debug(`  ${index + 1}. ${result.category}: ${result.count}个物体, 累计面积比例: ${(result.sizeRatio * 100).toFixed(2)}%`);
      });
      
      // 输出详细的面积比例数据，用于阈值调优
      logger.debug('📊 面积比例详细数据（用于阈值调优）:');
      results.forEach((result, index) => {
        logger.debug(`  ${result.category}: 面积比例=${(result.sizeRatio * 100).toFixed(3)}%, 物体数量=${result.count}`);
      });
      
      return results;
      
    } catch (error) {
      console.error('❌ 主角识别失败:', error);
      return [];
    }
  }

  


  
  /**
   * 将检测到的物体映射到分类ID
   * @param {Object} allModelResults - 所有模型的推理结果
   * @param {string} imageURI - 图像URI
   * @param {Object} imageDimensions - 图像尺寸 {width, height}
   * @returns {string} 分类ID
   */
  async MapObjectes2Category(allModelResults, imageURI, imageDimensions) {
    // 检查身份证检测结果
    if (allModelResults.idCard && allModelResults.idCard.length > 0) {
      logger.debug('🆔 检测到身份证，返回身份证分类');
      return 'idcard';
    }
    
    // 合并YOLO和MobileNetV3检测结果到一个集合中
    const allDetectedObjects = [];
    
    // 添加YOLO检测结果（general模型）
    if (allModelResults.general && allModelResults.general.length > 0) {
      allModelResults.general.forEach(detection => {
        // 获取物体名称和类别信息
        const objectInfo = this.configService.getYoloObjectById(detection.classId);
        const objectName = objectInfo ? objectInfo.english : `class_${detection.classId}`;
        const objectCategory = objectInfo ? objectInfo.category : null;
        
        // 通过物体类别映射到应用分类
        let appCategory = null;
        if (objectCategory) {
          const objectMappings = this.configService.getObjectMappings();
          appCategory = objectMappings[objectCategory];
        }
        
        allDetectedObjects.push({
          name: objectName,
          confidence: detection.confidence,
          source: 'YOLO',
          boundingBox: detection.bbox,
          objectCategory: objectCategory,
          appCategory: appCategory
        });
      });
    }
    
    // 添加MobileNetV3检测结果
    if (allModelResults.mobileNetV3 && allModelResults.mobileNetV3.success && allModelResults.mobileNetV3.predictions) {
      allModelResults.mobileNetV3.predictions.forEach(prediction => {
        // 获取MobileNetV3类别信息
        const mobileNetV3ClassInfo = this.configService.getMobileNetV3ClassByEnglishName(prediction.class);
        const objectCategory = mobileNetV3ClassInfo ? mobileNetV3ClassInfo.category : null;
        
        // 通过物体类别映射到应用分类
        let appCategory = null;
        if (objectCategory) {
          const objectMappings = this.configService.getObjectMappings();
          appCategory = objectMappings[objectCategory];
        }
        
        allDetectedObjects.push({
          name: prediction.class,
          confidence: prediction.probability,
          source: 'MobileNetV3',
          boundingBox: null,
          objectCategory: objectCategory,
          appCategory: appCategory
        });
      });
    }
    
    // 按置信度排序
    allDetectedObjects.sort((a, b) => b.confidence - a.confidence);
    
    logger.debug('🔍 所有检测到的物体:', allDetectedObjects.map(obj => 
      `${obj.name}: ${(obj.confidence * 100).toFixed(1)}% (${obj.source})`
    ).join(', '));

    // 特殊处理：检查espresso maker
    const espressoMakerDetection = allDetectedObjects.find(obj => 
      obj.name === 'espresso maker' && obj.confidence > 0.05
    );
    
    if (espressoMakerDetection) {
      logger.debug(`☕ 检测到espresso maker，置信度: ${(espressoMakerDetection.confidence * 100).toFixed(1)}%，来源: ${espressoMakerDetection.source}，返回idcard分类`);
      return 'idcard';
    }

    // 特殊处理：检查book
    const bookDetection = allDetectedObjects.find(obj => 
      obj.name === 'Book' && obj.confidence > 0.1
    );
    
    if (bookDetection) {
      logger.debug(`📚 检测到book，置信度: ${(bookDetection.confidence * 100).toFixed(1)}%，来源: ${bookDetection.source}，返回idcard分类`);
      return 'idcard';
    }

    // 调用identifyMainRole获取主角信息
    const mainRoleResults = this.identifyMainRole(imageURI, allModelResults.general, imageDimensions);
    
    logger.debug('🎯 主角识别结果:', mainRoleResults);
    
    // 检查人物分类（遍历所有结果查找人物）
    if (mainRoleResults && mainRoleResults.length > 0) {
      // 查找各种分类
      const personSubject = mainRoleResults.find(result => result.category === 'person');
      const animalSubject = mainRoleResults.find(result => result.category === 'animals');
      const foodSubject = mainRoleResults.find(result => result.category === 'foods');
      
      if (personSubject) {
        logger.debug(`👤 人物检测: 数量=${personSubject.count}, 面积占比=${(personSubject.sizeRatio * 100).toFixed(3)}%`);
        
        // 检查是否为单人且面积占比大于5%（降低阈值）
        if (personSubject.count === 1 && personSubject.sizeRatio > 0.05) {
          logger.debug('✅ 单人分类: 面积占比 > 5%');
          return 'single_person';
        } else if (personSubject.count === 1) {
          logger.debug('❌ 单人分类: 面积占比不足 5%');
        }
        
        // 检查是否为多人且面积占比大于8%（降低阈值）
        if (personSubject.count > 1 && personSubject.sizeRatio > 0.08) {
          logger.debug('✅ 多人分类: 面积占比 > 8%');
          return 'social_activities';
        } else if (personSubject.count > 1) {
          logger.debug('❌ 多人分类: 面积占比不足 8%');
        }
      }
      
      // 检查动物
      if (animalSubject) {
        logger.debug(`🐾 动物检测: 面积占比=${(animalSubject.sizeRatio * 100).toFixed(3)}%`);
        if (animalSubject.sizeRatio > 0.05) {
          logger.debug('✅ 动物分类: 面积占比 > 5%');
          return 'pets';
        } else {
          logger.debug('❌ 动物分类: 面积占比不足 5%');
        }
      }
      
      // 检查美食
      if (foodSubject) {
        logger.debug(`🍽️ 美食检测: 面积占比=${(foodSubject.sizeRatio * 100).toFixed(3)}%`);
        if (foodSubject.sizeRatio > 0.05) {
          logger.debug('✅ 美食分类: 面积占比 > 5%');
          return 'foods';
        } else {
          logger.debug('❌ 美食分类: 面积占比不足 5%');
        }
      }
    }

    // 特殊处理：检查是否含有nature类别
    const natureDetections = allDetectedObjects.filter(obj => 
      obj.objectCategory === 'nature' && obj.confidence > 0.1
    );
    
    if (natureDetections.length > 0) {
      logger.debug(`🌿 检测到自然风景相关物体: ${natureDetections.length}个`);
      natureDetections.forEach((obj, index) => {
        logger.debug(`  ${index + 1}. ${obj.name} (${obj.source}): 置信度 ${(obj.confidence * 100).toFixed(1)}%`);
      });
      logger.debug('✅ 归类为自然风景分类');
      return 'travel_scenery';
    }

    // 返回置信度最高的物体的app归类
    if (allDetectedObjects.length > 0) {
      const topConfidenceObject = allDetectedObjects[0]; // 已经按置信度排序，第一个就是最高的
      
      if (topConfidenceObject.appCategory) {
        logger.debug(`🎯 使用置信度最高的物体进行分类:`);
        logger.debug(`  - 物体名称: ${topConfidenceObject.name}`);
        logger.debug(`  - 置信度: ${(topConfidenceObject.confidence * 100).toFixed(1)}%`);
        logger.debug(`  - 来源: ${topConfidenceObject.source}`);
        logger.debug(`  - 物体类别: ${topConfidenceObject.objectCategory}`);
        logger.debug(`  - 应用分类: ${topConfidenceObject.appCategory}`);
        logger.debug(`✅ 返回应用分类: ${topConfidenceObject.appCategory}`);
        return topConfidenceObject.appCategory;
      } else {
        logger.debug(`⚠️ 置信度最高的物体 "${topConfidenceObject.name}" 没有有效的应用分类，使用默认分类`);
        return 'other';
      }
    }

    


    

    
    return 'other';
  }
    

  /**
   * 将MobileNetV3的分类结果映射到应用分类
   * @param {string} mobileNetV3Class - MobileNetV3的分类名称
   * @returns {string} 应用分类ID
   */
  mapMobileNetV3ToAppCategory(mobileNetV3Class) {
    if (!mobileNetV3Class) return 'other';
    
    try {
      // 1. 通过MobileNetV3分类名称获取物体分类信息
      const mobileNetV3ClassInfo = this.configService.getMobileNetV3ClassByEnglishName(mobileNetV3Class);
      if (!mobileNetV3ClassInfo || !mobileNetV3ClassInfo.category) {
        logger.debug(`⚠️ 未找到MobileNetV3分类 "${mobileNetV3Class}" 的配置信息`);
        return 'other';
      }
      
      const objectCategory = mobileNetV3ClassInfo.category;
      logger.debug(`🔍 MobileNetV3分类 "${mobileNetV3Class}" 映射到物体分类: ${objectCategory}`);
      
      // 2. 通过物体分类映射到应用分类
      const objectMappings = this.configService.getObjectMappings();
      const appCategory = objectMappings[objectCategory];
      
      if (appCategory) {
        logger.debug(`✅ 物体分类 "${objectCategory}" 映射到应用分类: ${appCategory}`);
        return appCategory;
      } else {
        logger.debug(`⚠️ 未找到物体分类 "${objectCategory}" 的应用分类映射`);
        return 'other';
      }
      
    } catch (error) {
      console.error(`❌ MobileNetV3分类映射失败: ${mobileNetV3Class}`, error);
      return 'other';
    }
  }

  // ==================== 新增的公共接口函数 ====================


  /**
   * 识别手机截图
   * @param {string} fileName - 文件名
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {string} path - 文件路径（可选，可能是相对路径或绝对路径）
   * @returns {Promise<boolean>} 如果是手机截图返回true，否则返回false
   */
  async identifyMobileScreenshot(fileName, width, height, path = null) {
    try {
      // 特征1：分辨率判定 - 宽高比<=0.5（手机竖屏比例，包括滚动截图）
      // 只有当宽高都大于0时才进行宽高比判断，避免除零错误
      let isMobileResolution = false;
      if (width > 0 && height > 0) {
        const aspectRatio = width / height;
        isMobileResolution = aspectRatio <= 0.5;
      }
      
      // 特征2：文件名判定 - 包含截图关键词
      const fileNameLower = (fileName || '').toLowerCase();
      const isScreenshotFile = fileNameLower.includes('screenshot') || 
                              fileNameLower.includes('截图') || 
                              fileNameLower.includes('screen');
      
      // 特征3：路径判定 - 检查是否在截图目录中
      // path可能是相对路径（Android 10+）或绝对路径（Android 9及以下），PC和移动端都兼容
      let isScreenshotPath = false;
      const screenshotKeywords = ['screenshots', '截图', 'screen'];
      
      if (path) {
        const pathLower = path.toLowerCase();
        isScreenshotPath = screenshotKeywords.some(keyword => 
          pathLower.includes(keyword)
        );
      }
      
      const isScreenshot = isMobileResolution || isScreenshotFile || isScreenshotPath;
      
      // 只在检测到手机截图时输出调试信息
      if (isScreenshot) {
        const aspectRatio = width > 0 && height > 0 ? (width / height).toFixed(3) : 'N/A';
        logger.debug(`📱 检测到手机截图: ${width}x${height}, 宽高比=${aspectRatio}, 文件名=${fileName}, 路径=${path || 'N/A'}`);
      }
      
      // 特征中只要有一个满足就判定为手机截图
      return isScreenshot;
    } catch (error) {
      logger.warn('⚠️ 手机截图检测失败:', error.message);
      return false;
    }
  }

  /**
   * 加载指定模型
   * @param {string} modelName - 模型名称 ('idCard' 或 'yolo8s')
   * @returns {Promise<Object>} 加载结果
   */

  /**
   * 加载模型（支持指定模型列表或加载所有模型）
   * @param {Array} modelNames - 可选的模型名称数组，不传则加载所有模型
   * @returns {Promise<Object>} 加载结果
   */
  async loadAllModels(modelNames = null) {
    try {
      // 如果没有指定模型列表，则加载所有模型
      const targetModels = modelNames || Object.keys(this.models);
      
      const results = {};
      for (const modelName of targetModels) {
        try {
          await this.loadModel(modelName);
          results[modelName] = { success: true, error: null };
    } catch (error) {
          results[modelName] = { success: false, error: error.message };
          console.error(`❌ ${modelName} 加载失败:`, error.message);
        }
      }
      
      const successCount = Object.values(results).filter(r => r.success).length;
      const totalCount = targetModels.length;
      
        return {
        success: successCount === totalCount,
        totalModels: totalCount,
        loadedModels: successCount,
        results: results,
        message: `成功加载 ${successCount}/${totalCount} 个模型`
      };
    } catch (error) {
      console.error('加载模型失败:', error);
      return {
        success: false,
        totalModels: 0,
        loadedModels: 0,
        results: {},
        message: `加载失败: ${error.message}`,
        error: error.message
      };
    }
  }






  // 加载MobileNetV3模型
  async loadMobileNetV3Model() {
    try {
      const modelConfig = this.models.mobilenetv3;
      
      if (modelConfig.model) {
        return modelConfig.model;
      }

      // ImageNet类别已在初始化时加载

      // 🆕 确保模型文件存在（仅在移动端需要从 assets 复制）
      if (typeof ModelPathAdapter.ensureModelExists === 'function') {
        const modelFileName = modelConfig.path.split('/').pop();
        await ModelPathAdapter.ensureModelExists(modelFileName);
      }

      // 使用统一的ONNX Runtime实例
      const ort = this.ort;

      // 创建推理会话
      const sessionOptions = {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'disabled',
        enableCpuMemArena: false,
        enableMemPattern: false,
        enableProfiling: false,
        logSeverityLevel: 3,
        logVerbosityLevel: 0,
        sessionLogSeverityLevel: 3,
        sessionLogVerbosityLevel: 0
      };

      modelConfig.model = await ort.InferenceSession.create(modelConfig.path, sessionOptions);
      logger.debug('✅ MobileNetV3模型加载成功');
      
      return modelConfig.model;
    } catch (error) {
      console.error('❌ MobileNetV3模型加载失败:', error);
      throw error;
    }
  }


  // 预处理图片用于MobileNetV3
  async preprocessImageForMobileNetV3(imageUri) {
    try {
      // 使用统一的ONNX Runtime实例
      const ort = this.ort;

      const inputSize = 224; // MobileNetV3输入尺寸
      // 使用新接口获取像素数据（cover模式，填满并裁剪）
      const data = await imageProcessor.getPixelData(
        imageUri,
        inputSize,
        inputSize,
        { mode: 'cover' }
      );
      
      // 转换为RGB格式并归一化到[0,1]
      const rgbData = new Float32Array(inputSize * inputSize * 3);
      for (let i = 0; i < data.length; i += 4) {
        const pixelIndex = i / 4;
        rgbData[pixelIndex * 3] = data[i] / 255.0;         // R
        rgbData[pixelIndex * 3 + 1] = data[i + 1] / 255.0; // G
        rgbData[pixelIndex * 3 + 2] = data[i + 2] / 255.0; // B
      }
      
      // 转换为CHW格式 (Channel, Height, Width)
      const chwData = new Float32Array(3 * inputSize * inputSize);
      for (let h = 0; h < inputSize; h++) {
        for (let w = 0; w < inputSize; w++) {
          for (let c = 0; c < 3; c++) {
            const hwcIndex = h * inputSize * 3 + w * 3 + c;
            const chwIndex = c * inputSize * inputSize + h * inputSize + w;
            chwData[chwIndex] = rgbData[hwcIndex];
          }
        }
      }
      
      // 创建ONNX张量 [1, 3, 224, 224]
      const tensor = new ort.Tensor('float32', chwData, [1, 3, inputSize, inputSize]);
      return tensor;
    } catch (error) {
      console.error('❌ MobileNetV3图片预处理失败:', error);
      throw error;
    }
  }

  // 后处理MobileNetV3输出
  async postprocessMobileNetV3Output(output, confidenceThreshold = null) {
    try {
      // 使用模型配置中的阈值作为默认值
      const threshold = confidenceThreshold !== null ? confidenceThreshold : (this.models.mobilenetv3?.confidenceThreshold || 0.3);
      
      // 获取实际的数值数据（支持GPU和CPU）
      let outputData;
      if (output.cpuData) {
        // CPU数据，直接使用
        outputData = output.cpuData;
        logger.debug('📊 使用CPU数据，长度:', outputData.length);
      } else if (output.data) {
        // GPU数据，需要转换为CPU数据
        outputData = await output.data();
        logger.debug('📊 使用GPU数据，长度:', outputData.length);
      } else if (Array.isArray(output)) {
        // 数组格式数据
        outputData = output;
        logger.debug('📊 使用数组数据，长度:', outputData.length);
      } else {
        throw new Error(`无法识别的MobileNetV3输出数据格式: ${JSON.stringify(output)}`);
      }
      
      logger.debug('📊 输出数据前5个值:', outputData.slice(0, 5));
      logger.debug('📊 ImageNet类别数量:', this.imagenetClasses ? this.imagenetClasses.length : 'undefined');
      const probabilities = new Array(outputData.length);

      // 计算softmax
      let maxLogit = Math.max(...outputData);
      let sumExp = 0;
      for (let i = 0; i < outputData.length; i++) {
        probabilities[i] = Math.exp(outputData[i] - maxLogit);
        sumExp += probabilities[i];
      }

      // 归一化
      for (let i = 0; i < probabilities.length; i++) {
        probabilities[i] /= sumExp;
      }

      // 获取top-5预测结果
      const top5 = [];
      for (let i = 0; i < probabilities.length; i++) {
        top5.push({
          index: i,
          probability: probabilities[i],
          class: this.imagenetClasses && this.imagenetClasses[i] ? this.imagenetClasses[i] : `class_${i}`
        });
      }

      top5.sort((a, b) => b.probability - a.probability);
      
      // 过滤低置信度预测
      const validPredictions = top5.filter(pred => pred.probability >= threshold);
      
      return {
        predictions: top5.slice(0, 5), // 返回top-5
        validPredictions: validPredictions,
        topPrediction: top5[0],
        confidence: top5[0].probability
      };
    } catch (error) {
      console.error('❌ MobileNetV3后处理失败:', error);
      return {
        predictions: [],
        validPredictions: [],
        topPrediction: null,
        confidence: 0
      };
    }
  }



  // 使用MobileNetV3分类图片
  async classifyImageWithMobileNetV3(imageUri, options = {}) {
    const t0 = Date.now();
    const { confidenceThreshold = this.models.mobilenetv3?.confidenceThreshold || 0.3 } = options;
    
    try {
      // 确保模型已加载
      const loadStart = Date.now();
      await this.loadMobileNetV3Model();
      const loadTime = Date.now() - loadStart;
      
      // 预处理图片
      const preprocessStart = Date.now();
      const inputTensor = await this.preprocessImageForMobileNetV3(imageUri);
      const preprocessTime = Date.now() - preprocessStart;
      
      // 运行推理
      const inferenceStart = Date.now();
      const modelConfig = this.models.mobilenetv3;
      const feeds = { [modelConfig.inputName]: inputTensor };
      const results = await modelConfig.model.run(feeds);
      const inferenceTime = Date.now() - inferenceStart;
      
      // 获取输出
      const postprocessStart = Date.now();
      const output = results[modelConfig.outputName];
      if (!output) {
        throw new Error('MobileNetV3模型没有返回有效的输出数据');
      }
      
      // 后处理结果
      const processedResults = await this.postprocessMobileNetV3Output(output, confidenceThreshold);
      const postprocessTime = Date.now() - postprocessStart;
      
      const totalTime = Date.now() - t0;
      
      // 详细性能日志（仅在总时间过长时输出）
      if (totalTime > 500) {
        logger.info(`📊 MobileNetV3推理性能: 总${totalTime}ms (加载${loadTime}ms + 预处理${preprocessTime}ms + 推理${inferenceTime}ms + 后处理${postprocessTime}ms)`);
      }
      
      return {
        success: true,
        predictions: processedResults.predictions,
        validPredictions: processedResults.validPredictions,
        topPrediction: processedResults.topPrediction,
        confidence: processedResults.confidence,
        model: 'mobilenetv3',
        processingTime: totalTime
      };
    } catch (error) {
      console.error('❌ MobileNetV3分类失败:', error);
      return {
        success: false,
        error: error.message,
        predictions: [],
        validPredictions: [],
        topPrediction: null,
        confidence: 0,
        model: 'mobilenetv3',
        processingTime: Date.now() - t0
      };
    }
  }

  /**
   * 翻译ImageNet类别ID为英文名称
   * @param {string} classId - 如 "imagenet_class_664"
   * @returns {string} 英文名称或原ID
   */
  translateImageNetClass(classId) {
    try {
      // 提取数字部分
      const match = classId.match(/imagenet_class_(\d+)/);
      if (!match) {
        return classId; // 如果不是标准格式，返回原ID
      }
      
      const classNumber = parseInt(match[1]);
      
      // 🔥 修复：通过 configService 根据 ID 获取类别信息，而不是通过数组索引
      // 因为数组索引和类别 ID 可能不匹配（如果 ID 不是从 0 开始或有缺失）
      const classInfo = this.configService.getMobileNetV3ClassById(classNumber);
      if (classInfo && classInfo.english) {
        return classInfo.english;
      }
      
      // 如果找不到，返回去掉前缀的数字ID
      return classNumber.toString();
    } catch (error) {
      logger.warn(`翻译ImageNet类别失败: ${classId}`, error);
      return classId;
    }
  }

  /**
   * 翻译 mobileNetV3Detections 中的 imagenet_class_xxx 为英文名称
   * @param {Object} mobileNetV3Detections - MobileNetV3检测结果
   * @returns {Object} 翻译后的检测结果
   */
  translateMobileNetV3Detections(mobileNetV3Detections) {
    if (!mobileNetV3Detections || !mobileNetV3Detections.predictions || !Array.isArray(mobileNetV3Detections.predictions)) {
      return mobileNetV3Detections;
    }
    
    const translated = {
      ...mobileNetV3Detections,
      predictions: mobileNetV3Detections.predictions.map(prediction => {
        if (prediction.class && typeof prediction.class === 'string' && prediction.class.startsWith('imagenet_class_')) {
          const translatedName = this.translateImageNetClass(prediction.class);
          if (translatedName !== prediction.class) {
            logger.debug(`🔄 翻译 MobileNetV3: ${prediction.class} -> ${translatedName}`);
          }
          return {
            ...prediction,
            class: translatedName || prediction.class
          };
        }
        return prediction;
      })
    };
    
    return translated;
  }

  // ==================== 后端分类服务方法 ====================
  
  /**
   * API配置
   */
  getAPIConfig() {
    return {
      baseURL: 'http://123.57.68.4:8000',
      timeout: 30000 // 30秒超时
    };
  }

  /**
   * 检查后端服务健康状态
   * 
   * @returns {Promise<Object>} 健康状态信息
   */
  /**
   * 计算图片的SHA-256哈希值
   * @param {string} imageUri - 图片URI
   * @returns {Promise<string>} SHA-256哈希字符串
   */
  async calculateImageHash(imageUri) {
    try {
      // 安全地加载图片数据
      let blob;
      
      if (imageUri.startsWith('file://')) {
        // 本地文件：使用 WebAdapters 中的安全读取函数
        const { readImageFileAsBlob } = require('../adapters/WebAdapters.js');
        blob = await readImageFileAsBlob(imageUri);
      } else {
        // 网络URL：使用 fetch
        const response = await fetch(imageUri);
        blob = await response.blob();
      }
      
      const arrayBuffer = await blob.arrayBuffer();
      
      // 计算SHA-256哈希
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      logger.error('❌ 计算图片哈希失败:', error);
      throw error;
    }
  }

  /**
   * 批量查询缓存
   * @param {Array<{hash: string, uri: string}>} imageHashes - 包含hash和uri的对象数组（自动分批处理）
   * @param {string} userId - 可选的用户ID
   * @returns {Promise<Object>} 批量缓存查询结果 { success: true, total, cached_count, items: [] }
   */
  async batchCheckCache(imageHashes, userId = null) {
    const config = this.getAPIConfig();
    
    if (imageHashes.length === 0) {
      return { success: true, total: 0, cached_count: 0, items: [] };
    }
    
    try {
      logger.debug(`🔍 批量查询缓存（v2）：${imageHashes.length} 个哈希值`);
      
      // 验证输入格式：必须是对象数组，且包含 hash 和 uri
      const normalizedItems = imageHashes.map((item, index) => {
        if (typeof item === 'string') {
          throw new Error(`batchCheckCache: 参数格式错误，索引 ${index} 处传入的是字符串，必须传入包含 hash 和 uri 的对象`);
        }
        
        const hash = item.hash || item.image_hash;
        const uri = item.uri || item.image_uri;
        
        if (!hash) {
          throw new Error(`batchCheckCache: 参数格式错误，索引 ${index} 处缺少 hash 字段`);
        }
        
        if (!uri) {
          throw new Error(`batchCheckCache: 参数格式错误，索引 ${index} 处缺少 uri 字段（后端需要真实的 image URI）`);
        }
        
        return {
          hash: hash,
          uri: uri
        };
      });
      
      // 分批处理（每批200个，v2接口支持最多200个）
      const batchSize = Math.min(this.BATCH_CONFIG.CACHE_BATCH_SIZE, 200);
      const allItems = [];
      let totalCached = 0;
      
      for (let i = 0; i < normalizedItems.length; i += batchSize) {
        const batchItems = normalizedItems.slice(i, i + batchSize);
        
        // 构建 v2 格式的请求体
        // image_uri 是必填字段，必须使用真实的图片 URI
        const requestBody = {
          items: batchItems.map((item, index) => ({
            index: index,
            image_hash: item.hash,
            image_uri: item.uri  // 使用真实的 image_uri（后端必需）
          }))
          // prompt 和 user_id 是可选的，不传或传 null 都可以
        };
        
        // 可选字段：只在有值时才添加
        if (userId) {
          requestBody.user_id = userId;
        }
        
        const headers = { 'Content-Type': 'application/json' };
        if (userId) {
          headers['X-User-ID'] = userId;
        }
        
        // 添加超时控制，防止后台请求挂起
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          logger.warn(`⚠️ 缓存查询超时 (${this.BATCH_CONFIG.CACHE_TIMEOUT}ms)，中止请求...`);
          controller.abort();
        }, this.BATCH_CONFIG.CACHE_TIMEOUT);
        
        try {
          const response = await fetch(`${config.baseURL}/api/v2/classify/batch-check-cache`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId); // 成功后清除超时器
          
          if (!response.ok) {
            // 尝试读取错误详情
            let errorDetail = '';
            try {
              const errorData = await response.json();
              errorDetail = errorData.detail || errorData.error || '';
            } catch (e) {
              errorDetail = await response.text().catch(() => '');
            }
            logger.error(`❌ 批量缓存查询失败: HTTP ${response.status}`, {
              status: response.status,
              statusText: response.statusText,
              errorDetail: errorDetail,
              requestBody: requestBody
            });
            throw new Error(`批量缓存查询失败: HTTP ${response.status}${errorDetail ? ` - ${errorDetail}` : ''}`);
          }
          
          const result = await response.json();
          
          // 检查是否有错误
          if (result.error_type && result.error_type !== 'success') {
            throw new Error(result.error || '缓存查询失败');
          }
          
          // v2 接口返回格式：{ results: [...], summary: { total, cached_count, miss_count } }
          const items = result.results || [];
          const summary = result.summary || {};
          
          // 转换为兼容格式（包含 image_hash 字段，数据嵌套在 data 字段中）
          const formattedItems = items.map(item => ({
            image_hash: item.image_hash,
            cached: item.cached || false,
            data: item.cached ? {
              category: item.category,
              confidence: item.confidence,
              description: item.description,
              message: item.description,  // 兼容字段
              background_color: item.background_color,
              raw_content: item.raw_content
            } : null
          }));
          
          allItems.push(...formattedItems);
          totalCached += summary.cached_count || 0;
          
          logger.debug(`✅ 批次 ${Math.floor(i / batchSize) + 1}：命中 ${summary.cached_count || 0}/${summary.total || items.length}`);
        } catch (fetchError) {
          clearTimeout(timeoutId); // 失败后也要清除超时器
          if (fetchError.name === 'AbortError') {
            logger.warn(`⚠️ 批次 ${Math.floor(i / batchSize) + 1} 缓存查询超时，跳过该批次`);
            // 继续处理下一批次，不抛出错误
            continue;
          }
          throw fetchError;
        }
      }
      
      logger.debug(`✅ 批量缓存查询完成：总命中 ${totalCached}/${imageHashes.length}`);
      
      return {
        success: true,
        total: imageHashes.length,
        cached_count: totalCached,
        items: allItems
      };
    } catch (error) {
      logger.error('❌ 批量缓存查询失败:', error);
      throw error;
    }
  }

  /**
   * 批量远程分类
   * @param {Array} imageDataList - [{ uri, hash, blob, fileName, imageData }] 自动分批处理
   * @param {Object} options - { userId, timeout }
   * @returns {Promise<Object>} 批量分类结果 { success: true, total, success_count, fail_count, items: [] }
   */
  async batchClassifyRemote(imageDataList, options = {}) {
    const config = this.getAPIConfig();
    const { userId = null, timeout = this.BATCH_CONFIG.REMOTE_TIMEOUT } = options;
    
    if (imageDataList.length === 0) {
      return { success: true, total: 0, success_count: 0, fail_count: 0, items: [] };
    }
    
    // 参数检查：确保不超过最大批次大小
    const maxBatchSize = this.BATCH_CONFIG.UPLOAD_BATCH_SIZE;
    if (imageDataList.length > maxBatchSize) {
      throw new Error(`批次大小 ${imageDataList.length} 超过最大限制 ${maxBatchSize}，请在调用前分批`);
    }
    
    try {
      logger.debug(`⬆️  批量上传分类：${imageDataList.length} 张图片`);
      
      try {
        let formData = new FormData(); // 改为 let，因为重试时需要重建
        
        // 添加图片文件
        let totalBlobSize = 0;
        
        for (const imageData of imageDataList) {
            const blobSize = imageData.blobSize || imageData.blob?.size || 0;
            totalBlobSize += blobSize;
            
            // PC端：使用 Blob
            formData.append('images', imageData.blob, imageData.fileName || 'image.jpg');
          }
          
        // 添加图片元数据（v2格式）
        const imageMetadata = {
          items: imageDataList.map((img, index) => {
            // 注意：image_uri 应该使用原始文件路径，而不是缩放后的 base64 数据 URI
            // resizedUri 可能是 base64 数据 URI（data:image/jpeg;base64,...），不应该作为 image_uri
            // 优先使用 imageData.uri（原始文件路径），否则使用 uri
            let imageUri = img.imageData?.uri || img.uri || null;
            
            // 如果 imageUri 是 base64 数据 URI，尝试从 imageData 获取原始路径
            if (imageUri && imageUri.startsWith('data:image/')) {
              logger.warn(`⚠️ 图片 ${index} 的 URI 是 base64 数据 URI，尝试使用原始路径`);
              // 如果 imageData 有原始 URI，使用它
              if (img.imageData?.uri && !img.imageData.uri.startsWith('data:image/')) {
                imageUri = img.imageData.uri;
              } else {
                // 如果没有原始路径，使用 fileName 作为备用
                imageUri = img.fileName || `image_${index}`;
                logger.warn(`⚠️ 图片 ${index} 缺少原始 URI，使用 fileName 作为备用: ${imageUri}`);
              }
            }
            
            if (!imageUri) {
              logger.warn(`⚠️ 图片 ${index} 缺少 URI，使用 fileName 作为备用: ${img.fileName || 'unknown'}`);
              imageUri = img.fileName || `image_${index}`;
            }
            
            // 获取 hash（第一阶段计算的基于原图的 hash）
            // hash 可能来自 img.hash 或 img.imageData.hash
            const imageHash = img.hash || img.imageData?.hash || null;
            
            if (!imageHash) {
              logger.warn(`⚠️ 图片 ${index} 缺少 hash，将无法正确匹配缓存`);
            }
            
            return {
              index: index,
              image_uri: imageUri,
              image_hash: imageHash  // 添加第一阶段计算的基于原图的 hash
            };
          }),
          prompt: null, // 可选，使用默认提示词
          user_id: userId || null // 可选
        };
        formData.append('image_metadata', JSON.stringify(imageMetadata));
        
        const headers = {};
        if (userId) {
          headers['X-User-ID'] = userId;
        }
        
        logger.info(`🌐 发送批量请求: ${imageDataList.length}张图片, 总大小: ${(totalBlobSize / 1024 / 1024).toFixed(2)}MB`);
        
        let response;
        let retryCount = 0;
        const maxRetries = 2; // 最多重试2次
        
        while (retryCount <= maxRetries) {
          // 每次重试都创建新的 AbortController 和超时器
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            logger.warn(`⚠️ 请求超时 (${timeout}ms)，中止请求...`);
            controller.abort();
          }, timeout);
          
          try {
            const retryInfo = retryCount > 0 ? ` (重试 ${retryCount}/${maxRetries})` : '';
            logger.info(`🚀 开始发送请求 (${imageDataList.length}张图片, ${(totalBlobSize / 1024 / 1024).toFixed(2)}MB)${retryInfo}...`);
            
            const fetchStartTime = Date.now();
            logger.debug(`📤 调用 fetch()...`);
            
            response = await fetch(`${config.baseURL}/api/v2/classify/batch`, {
              method: 'POST',
              headers: headers,
              body: formData,
              signal: controller.signal
            });
            
            const fetchDuration = Date.now() - fetchStartTime;
            logger.info(`✅ 请求成功，状态码: ${response.status}, 耗时: ${fetchDuration}ms`);
            clearTimeout(timeoutId); // 成功后清除超时器
            break; // 成功，跳出重试循环
          } catch (fetchError) {
            clearTimeout(timeoutId); // 失败后也要清除超时器
            
            // 检查是否是超时错误
            const isTimeoutError = fetchError.name === 'AbortError' || 
                                   fetchError.message === 'The user aborted a request.' ||
                                   fetchError.message?.includes('aborted');
            
            // 检查是否是网络错误
            const isNetworkError = fetchError.message === 'Network request failed' ||
                                  fetchError.message?.includes('network') ||
                                  fetchError.message?.includes('Network');
            
            if (isTimeoutError) {
              logger.warn(`⚠️ 请求超时或被中止 (${timeout}ms):`, {
                error: fetchError.name || fetchError.message,
                retryCount,
                maxRetries,
                batchSize: imageDataList.length,
                totalSize: `${(totalBlobSize / 1024 / 1024).toFixed(2)}MB`
              });
              
              // 超时错误不重试，直接抛出
              const timeoutError = new Error(`请求超时 (${timeout}ms)`);
              timeoutError.name = 'TimeoutError';
              timeoutError.originalError = fetchError;
              throw timeoutError;
            }
            
            retryCount++;
            
            // 如果还有重试机会且是网络错误，等待后重试
            if (retryCount <= maxRetries && isNetworkError) {
              logger.warn(`⚠️ 网络请求失败，${retryCount}/${maxRetries}次重试，等待1秒后重试...`, {
                error: fetchError.message,
                batchSize: imageDataList.length
              });
              await new Promise(resolve => setTimeout(resolve, 1000));
              
              // 【关键】重建FormData对象，因为可能被破坏了
              const newFormData = new FormData();
              for (const imageData of imageDataList) {
                // PC端：使用 Blob
                newFormData.append('images', imageData.blob, imageData.fileName || 'image.jpg');
              }
              // 添加图片元数据（v2格式，重试时也需要重建）
              const retryImageMetadata = {
                items: imageDataList.map((img, index) => {
                  // 注意：image_uri 应该使用原始文件路径，而不是缩放后的 base64 数据 URI
                  let imageUri = img.imageData?.uri || img.uri || null;
                  
                  // 如果 imageUri 是 base64 数据 URI，尝试从 imageData 获取原始路径
                  if (imageUri && imageUri.startsWith('data:image/')) {
                    logger.warn(`⚠️ 重试时图片 ${index} 的 URI 是 base64 数据 URI，尝试使用原始路径`);
                    if (img.imageData?.uri && !img.imageData.uri.startsWith('data:image/')) {
                      imageUri = img.imageData.uri;
                    } else {
                      imageUri = img.fileName || `image_${index}`;
                      logger.warn(`⚠️ 重试时图片 ${index} 缺少原始 URI，使用 fileName 作为备用: ${imageUri}`);
                    }
                  }
                  
                  if (!imageUri) {
                    logger.warn(`⚠️ 重试时图片 ${index} 缺少 URI，使用 fileName 作为备用: ${img.fileName || 'unknown'}`);
                    imageUri = img.fileName || `image_${index}`;
                  }
                  
                  // 获取 hash（第一阶段计算的基于原图的 hash）
                  const imageHash = img.hash || img.imageData?.hash || null;
                  
                  if (!imageHash) {
                    logger.warn(`⚠️ 重试时图片 ${index} 缺少 hash，将无法正确匹配缓存`);
                  }
                  
                  return {
                    index: index,
                    image_uri: imageUri,
                    image_hash: imageHash  // 添加第一阶段计算的基于原图的 hash
                  };
                }),
                prompt: null,
                user_id: userId || null
              };
              newFormData.append('image_metadata', JSON.stringify(retryImageMetadata));
              formData = newFormData;
                
              continue; // 继续下一次重试
            }
            
            // 没有重试机会了，或者不是网络错误，抛出异常
            logger.error(`❌ 请求失败（无法重试）:`, {
              error: fetchError.name || fetchError.message,
              retryCount,
              maxRetries,
              isNetworkError,
              isTimeoutError
            });
            throw fetchError; // 抛给外层catch处理
          }
        }
        
        // 处理 HTTP 非 200 的情况（请求级错误，与单个图片无关）
        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`❌ HTTP错误: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
        
        const result = await response.json();
        
        // v2 接口响应格式：results 数组和 summary 对象
        const results = result.results || [];
        const summary = result.summary || {};
        
        // 检查整体错误（error_type 不为 SUCCESS）- 服务级错误，与单个图片无关
        if (result.error_type && result.error_type !== 'success') {
          const errorMessage = result.error || '内部服务异常';
          logger.error(`❌ 服务端返回错误: ${result.error_type}`, errorMessage);
          throw new Error(`服务端错误 (${result.error_type}): ${errorMessage}`);
        }
        
        // 合并结果，保留原始 imageData 引用，处理单个 result 的错误
        // 注意：数据结构要与 batchCheckCache 保持一致，数据嵌套在 data 字段中
        const itemsWithData = results.map((item, idx) => {
          const imageData = imageDataList[idx]?.imageData;
          
          // 如果该 result 有错误，保存错误信息到 message，分类保持 NA
          if (item.error) {
            return {
              index: item.index,
              image_uri: item.image_uri,
              success: false,
              error: item.error,
              data: null, // 错误时 data 为 null
              imageData
            };
          }
          
          // 成功的情况，将数据嵌套在 data 字段中（与 batchCheckCache 保持一致）
          return {
            index: item.index,
            image_uri: item.image_uri,
            success: true,
            error: null,
            data: {
              category: item.category,
              confidence: item.confidence,
              description: item.description,
              message: item.description, // 兼容字段
              background_color: item.background_color,
              raw_content: item.raw_content,
              inference_method: item.inference_method,
              processing_time_ms: item.processing_time_ms
            },
            imageData
          };
        });
        
        const successCount = summary.success_count || 0;
        const totalCount = summary.total_count || imageDataList.length;
        const failedCount = summary.failed_count || 0;
        
        logger.debug(`✅ 批量分类完成：成功 ${successCount}/${totalCount}`);
      
        return {
          success: true,
          total: totalCount,
          success_count: successCount,
          fail_count: failedCount,
          items: itemsWithData
        };
      } catch (batchError) {
        // 检查是否是超时错误
        const isTimeoutError = batchError.name === 'TimeoutError' ||
                              batchError.name === 'AbortError' ||
                              batchError.message === 'The user aborted a request.' ||
                              batchError.message?.includes('超时') ||
                              batchError.message?.includes('timeout') ||
                              batchError.message?.includes('aborted');
        
        // 根据错误类型记录不同的日志
        if (isTimeoutError) {
          logger.warn(`⚠️ 批量处理超时或被中止:`, {
            error: batchError.name || batchError.message,
            batchSize: imageDataList.length,
            originalError: batchError.originalError || batchError
          });
        } else {
          // 其他异常（JSON解析失败、FormData构建失败等）
          logger.error(`❌ 批量处理异常:`, {
            error: batchError.name || batchError.message,
            batchSize: imageDataList.length,
            stack: batchError.stack
          });
        }
        
        const failedItems = imageDataList.map((imageData, idx) => ({
          index: idx,
          filename: imageData.fileName,
          success: false,
          data: null,
          error: isTimeoutError 
            ? `请求超时或被中止: ${batchError.message || 'Aborted'}` 
            : batchError.message || '批量处理失败',
          imageData: imageData.imageData
        }));
        
        return {
          success: false,
          total: imageDataList.length,
          success_count: 0,
          fail_count: imageDataList.length,
          items: failedItems
        };
      }
    } catch (error) {
      // 处理超时和取消请求的情况
      const isTimeoutError = error.name === 'TimeoutError' ||
                            error.name === 'AbortError' || 
                            error.message === 'The user aborted a request.' ||
                            error.message?.includes('超时') ||
                            error.message?.includes('timeout');
      
      if (isTimeoutError) {
        logger.warn('⚠️ 远程推理超时或被取消，将降级到本地推理', {
          timeout: this.BATCH_CONFIG.REMOTE_TIMEOUT,
          batchSize: imageDataList.length,
          error: error.message || error.name
        });
        return {
          success: false,
          total: imageDataList.length,
          success_count: 0,
          fail_count: imageDataList.length,
          items: imageDataList.map((imageData, index) => ({
            index,
            success: false,
            data: null,
            error: `请求超时 (${this.BATCH_CONFIG.REMOTE_TIMEOUT}ms)`,
            imageData
          }))
        };
      }
      
      // 处理其他错误
      logger.error('❌ 批量分类失败:', {
        error: error.message || error.name,
        batchSize: imageDataList.length,
        stack: error.stack
      });
      
      // 返回失败结果而不是抛出异常，让调用方可以降级到本地推理
      return {
        success: false,
        total: imageDataList.length,
        success_count: 0,
        fail_count: imageDataList.length,
        items: imageDataList.map((imageData, index) => ({
          index,
          success: false,
          data: null,
          error: error.message || '批量分类失败',
          imageData
        }))
      };
    }
  }


  async checkHealthv2() {
    const config = this.getAPIConfig();
    
    try {
      logger.debug('🏥 检查后端服务健康状态...');
      
      // 构建查询参数（v2版本支持的可选参数）
      const queryParams = new URLSearchParams();
      
      // 获取 user_id（客户端ID）
      try {
        const clientId = await UnifiedDataService.getClientId();
        if (clientId) {
          queryParams.append('user_id', clientId);
        }
      } catch (error) {
        logger.debug('⚠️ 获取客户端ID失败，跳过user_id参数:', error.message);
      }
      
      // 获取设备类型
      const deviceType = Platform.OS === 'web' ? 'Web' : 
                        Platform.OS === 'android' ? 'Android' : 
                        Platform.OS === 'ios' ? 'iOS' : 'Unknown';
      queryParams.append('device_type', deviceType);
      
      // 添加客户端时间戳（ISO 8601格式）
      const clientTimestamp = new Date().toISOString();
      queryParams.append('client_timestamp', clientTimestamp);
      
      // 构建完整的URL
      const url = `${config.baseURL}/api/v2/health${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.BATCH_CONFIG.HEALTH_CHECK_TIMEOUT);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return {
          available: false,
          reason: `HTTP错误: ${response.status}`
        };
      }
      
      const data = await response.json();
      
      // 判断服务是否完全可用
      const isHealthy = 
        data.status === 'healthy' && 
        data.database === 'connected' && 
        data.model_api === 'available';
      
      logger.debug('✅ 服务健康检查完成:', {
        available: isHealthy,
        status: data.status,
        database: data.database,
        modelApi: data.model_api,
        userId: data.user_id,
        deviceType: data.device_type,
        clientTimestamp: data.client_timestamp
      });
      
      return {
        available: isHealthy,
        status: data.status,
        database: data.database,
        modelApi: data.model_api,
        timestamp: data.timestamp,
        userId: data.user_id,
        deviceType: data.device_type,
        clientTimestamp: data.client_timestamp
      };
      
    } catch (error) {
      logger.debug('⚠️ 健康检查失败:', error.message);
      return {
        available: false,
        reason: error.name === 'AbortError' ? '请求超时' : '网络错误或服务不可达'
      };
    }
  }

  /**
   * 计算文件的SHA-256哈希
   * 
   * @param {Blob|File} imageFile - 图片文件
   * @returns {Promise<string>} SHA-256哈希值
   */
  async calculateSHA256(imageFile) {
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return hashHex;
    } catch (error) {
      logger.error('计算SHA-256失败:', error);
      throw error;
    }
  }

  /**
   * 查询缓存（v2版本，使用批量接口）
   * 
   * @param {string} imageHash - 图片SHA-256哈希
   * @param {string} clientId - 客户端ID
   * @param {string} imageUri - 图片URI（可选，用于标识）
   * @returns {Promise<Object>} 缓存查询结果 { cached: boolean, data: Object|null, request_id: string }
   */
  async checkCache(imageHash, clientId, imageUri = null) {
    const config = this.getAPIConfig();
    
    try {
      // v2版本使用批量接口，单次查询也需要按照批量格式发送
      const requestBody = {
        items: [
          {
            index: 0,
            image_uri: imageUri || `hash_${imageHash.substring(0, 8)}`,
            image_hash: imageHash
          }
        ]
      };
      
      // 如果提供了 clientId，添加到请求体中
      if (clientId) {
        requestBody.user_id = clientId;
      }
      
      const headers = {
        'Content-Type': 'application/json'
      };
      
      // Header方式传递用户ID（优先级更高）
      if (clientId) {
        headers['X-User-ID'] = clientId;
      }
      
      const response = await fetch(`${config.baseURL}/api/v2/classify/batch-check-cache`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      
      const result = await response.json();
      
      // 检查是否有错误
      if (result.error_type && result.error_type !== 'success') {
        throw new Error(result.error || '缓存查询失败');
      }
      
      // 从批量响应中提取第一个结果
      if (result.results && result.results.length > 0) {
        const cacheItem = result.results[0];
        
        // 转换为兼容格式
        return {
          cached: cacheItem.cached || false,
          data: cacheItem.cached ? {
            category: cacheItem.category,
            confidence: cacheItem.confidence,
            description: cacheItem.description,
            background_color: cacheItem.background_color,
            raw_content: cacheItem.raw_content
          } : null,
          request_id: result.request_id
        };
      } else {
        // 没有结果，返回未缓存
        return {
          cached: false,
          data: null,
          request_id: result.request_id
        };
      }
      
    } catch (error) {
      logger.error('❌ 查询缓存失败:', error);
      throw error;
    }
  }

  /**
   * 上传图片并分类
   * 
   * @param {Blob|File} imageFile - 图片文件
   * @param {string} imageHash - 图片SHA-256哈希（可选）
   * @param {string} clientId - 客户端ID
   * @returns {Promise<Object>} 分类结果
   */
  async uploadAndClassify(imageFile, imageHash = null, clientId) {
    const config = this.getAPIConfig();
    
    try {
      logger.debug('⬆️  上传图片进行分类...');
      
      const formData = new FormData();
      formData.append('image', imageFile);
      
      if (imageHash) {
        formData.append('image_hash', imageHash);
      }
      
      const headers = {};
      if (clientId) {
        headers['X-User-ID'] = clientId;
      }
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      
      const response = await fetch(`${config.baseURL}/api/v1/classify`, {
        method: 'POST',
        headers: headers,
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      
      const result = await response.json();
      
      logger.debug('✅ 分类完成:', result.data?.category);
      
      return result;
      
    } catch (error) {
      logger.error('❌ 上传分类失败:', error);
      throw error;
    }
  }


  /**
   * 将图像缩放到1024x1024，保持宽高比
   * @param {File} imageFile - 原始图像文件
   * @returns {Promise<File>} - 缩放后的图像文件
   */
  async resizeImageTo1024(imageFile) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // 计算缩放比例，保持宽高比
        const maxSize = 1024;
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        // 设置canvas尺寸
        canvas.width = width;
        canvas.height = height;
        
        // 绘制缩放后的图像
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为Blob
        canvas.toBlob((blob) => {
          if (blob) {
            // 创建新的File对象
            const resizedFile = new File([blob], imageFile.name, {
              type: blob.type || 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(resizedFile);
          } else {
            reject(new Error('图像缩放失败'));
          }
        }, 'image/jpeg', 0.9); // 使用90%质量
      };
      
      img.onerror = () => {
        reject(new Error('图像加载失败'));
      };
      
      // 加载图像
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
      };
      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };
      reader.readAsDataURL(imageFile);
    });
  }
}

export default ImageClassifierService;
