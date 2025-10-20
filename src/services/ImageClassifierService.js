import UnifiedDataService from './UnifiedDataService.js';
import configService from './ConfigService.js';
import { logger, ModelPathAdapter } from '../adapters/WebAdapters.js';

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
      UPLOAD_BATCH_SIZE: 20,      // 批量上传大小
      REMOTE_TIMEOUT: 60000,      // 远程请求超时（毫秒）- 增加到60秒
      HEALTH_CHECK_TIMEOUT: 5000  // 健康检查超时（毫秒）
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

  /**
   * 检测可用的执行提供者（GPU/CPU）
   * @returns {Promise<string[]>} 可用的执行提供者列表
   */
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
  async preprocessImageForYOLO(imageData, inputSize = 640) {
    try {
      // 使用统一的ONNX Runtime实例
      const ort = this.ort;
      
      // 将图片转换为RGB格式并调整大小
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          canvas.width = inputSize;
          canvas.height = inputSize;
          
          // 计算缩放比例，保持长宽比
          const scale = Math.min(inputSize / img.width, inputSize / img.height);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          
          // 计算居中位置
          const x = (inputSize - scaledWidth) / 2;
          const y = (inputSize - scaledHeight) / 2;
          
          // 填充黑色背景
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, inputSize, inputSize);
          
          // 绘制图片，保持长宽比
          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          
          // 获取图片数据
          const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
          const { data } = imageData;
          
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
          resolve(tensor);
        };
        
        img.onerror = reject;
        img.src = imageData;
      });
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
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Object>} 分类结果
   */
  async classifyImage(imageUri) {
    const totalStartTime = Date.now();
    
    try {
      // 检查服务是否已初始化
      if (!this.isInitialized) {
        throw new Error('ImageClassifierService 未初始化，请先调用 initialize() 方法');
      }

      // 获取图像尺寸
      const dimensionsStart = Date.now();
      const imageDimensions = await this.getOriginalImageDimensions(imageUri);
      const dimensionsTime = Date.now() - dimensionsStart;
      
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
      logger.info(`  ├─ 获取图像尺寸: ${dimensionsTime}ms`);
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
          dimensionsTime,
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
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      img.src = imageUri;
    });
  }

  // 检查是否为手机截图




  // ==================== 并行推理相关函数 ====================

  /**
   * 并行执行所有模型推理
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Object>} 所有模型的推理结果
   */
  async runParallelInference(imageUri) {
    const startTime = Date.now();
    logger.info('🚀 开始串行推理（避免资源竞争）... [V2.0 - ' + new Date().toLocaleTimeString() + ']');
    
    // 串行执行推理，避免资源竞争导致单个模型变慢
    let idCardResults = [];
    let generalResults = [];
    let mobileNetV3Results = {};
    
    // 详细耗时统计
    const timings = {
      total: 0,
      idCard: 0,
      general: 0,
      mobileNetV3: 0
    };
    
    try {
      // 串行执行，依次运行三个模型
      
      // 1. ID卡模型
      const idCardStart = Date.now();
      try {
        idCardResults = await this.classifyImageWithYOLO(imageUri, 'idCard');
        timings.idCard = Date.now() - idCardStart;
        logger.info(`⏱️ ID卡模型推理耗时: ${timings.idCard}ms`);
      } catch (error) {
        timings.idCard = Date.now() - idCardStart;
        console.error('❌ idCard 推理失败:', error);
        idCardResults = [];
      }
      
      // 2. YOLOv8模型
      const generalStart = Date.now();
      try {
        generalResults = await this.classifyImageWithYOLO(imageUri, 'yolo8s');
        timings.general = Date.now() - generalStart;
        logger.info(`⏱️ YOLOv8模型推理耗时: ${timings.general}ms`);
      } catch (error) {
        timings.general = Date.now() - generalStart;
        console.error('❌ general 推理失败:', error);
        generalResults = [];
      }
      
      // 3. MobileNetV3模型
      const mobileNetStart = Date.now();
      try {
        mobileNetV3Results = await this.classifyImageWithMobileNetV3(imageUri);
        timings.mobileNetV3 = Date.now() - mobileNetStart;
        logger.info(`⏱️ MobileNetV3模型推理耗时: ${timings.mobileNetV3}ms`);
      } catch (error) {
        timings.mobileNetV3 = Date.now() - mobileNetStart;
        console.error('❌ mobileNetV3 推理失败:', error);
        mobileNetV3Results = {};
      }
      
      logger.debug(`✅ 所有模型推理完成:`);
      logger.debug(`  - idCard: ${idCardResults.length} 个检测结果`);
      logger.debug(`  - general: ${generalResults.length} 个检测结果`);
      logger.debug(`  - mobileNetV3: ${mobileNetV3Results.predictions ? mobileNetV3Results.predictions.length : 0} 个检测结果`);
      
      // 性能分析
      const serialTotalTime = timings.idCard + timings.general + timings.mobileNetV3;
      
      logger.info(`📊 串行推理性能统计:`);
      logger.info(`  - ID卡模型: ${timings.idCard}ms`);
      logger.info(`  - YOLOv8模型: ${timings.general}ms`);
      logger.info(`  - MobileNetV3模型: ${timings.mobileNetV3}ms`);
      logger.info(`  - 串行总时间: ${serialTotalTime}ms`);
      
    } catch (error) {
      console.error('❌ 串行推理过程中发生错误:', error);
    }
    
    // 处理结果
    const serialResults = {
      idCard: idCardResults || [],
      general: generalResults || [],
      mobileNetV3: mobileNetV3Results || {}
    };
    
    const endTime = Date.now();
    timings.total = endTime - startTime;
    logger.info(`⏱️ 串行推理总耗时: ${timings.total}ms`);
    
    return serialResults;
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
   * @param {string} imageUri - 图片URI
   * @param {string} fileName - 文件名
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Promise<boolean>} 如果是手机截图返回true，否则返回false
   */
  async identifyMobileScreenshot(imageUri, fileName, width, height) {
    try {
      // 特征1：分辨率判定 - 宽高比<=0.5（手机竖屏比例，包括滚动截图）
      const aspectRatio = width / height;
      const isMobileResolution = aspectRatio <= 0.5;
      
      // 特征2：文件名判定 - 包含截图关键词
      const fileNameLower = (fileName || '').toLowerCase();
      const isScreenshotFile = fileNameLower.includes('screenshot') || 
                              fileNameLower.includes('截图') || 
                              fileNameLower.includes('screen');
      
      const isScreenshot = isMobileResolution || isScreenshotFile;
      
      // 只在检测到手机截图时输出调试信息
      if (isScreenshot) {
        logger.debug(`📱 检测到手机截图: ${width}x${height}, 宽高比=${aspectRatio.toFixed(3)}, 文件名=${fileName}`);
      }
      
      // 两个特征中只要有一个满足就判定为手机截图
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

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      return new Promise((resolve, reject) => {
        img.onload = () => {
          const inputSize = 224; // MobileNetV3输入尺寸
          canvas.width = inputSize;
          canvas.height = inputSize;
          
          // 使用cover模式保持宽高比，居中裁剪
          const scale = Math.max(inputSize / img.width, inputSize / img.height);
          const scaledWidth = img.width * scale;
          const scaledHeight = img.height * scale;
          
          const x = (inputSize - scaledWidth) / 2;
          const y = (inputSize - scaledHeight) / 2;
          
          // 填充黑色背景
          ctx.fillStyle = 'black';
          ctx.fillRect(0, 0, inputSize, inputSize);
          
          // 绘制图片
          ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
          
          // 获取图片数据
          const imageData = ctx.getImageData(0, 0, inputSize, inputSize);
          const { data } = imageData;
          
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
          resolve(tensor);
        };
        
        img.onerror = reject;
        img.src = imageUri;
      });
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

  // ==================== 后端分类服务方法 ====================
  
  /**
   * API配置
   */
  getAPIConfig() {
    return {
      baseURL: 'https://www.xintuxiangce.top',
      timeout: 30000, // 30秒超时
      categoryMap: {
        "social_activities": "social_activities",
        "pets": "pets",
        "single_person": "single_person",
        "foods": "foods",
        "travel_scenery": "travel_scenery",
        "screenshot": "screenshot",
        "idcard": "idcard",
        "other": "other"
      }
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
   * 批量检测手机截图
   * @param {Array} imageDataList - [{ uri, fileName, width, height }]
   * @returns {Promise<{screenshots: Array, nonScreenshots: Array}>}
   */
  async batchDetectScreenshots(imageDataList) {
    const screenshots = [];
    const nonScreenshots = [];
    
    for (const imageData of imageDataList) {
      const isScreenshot = await this.identifyMobileScreenshot(
        imageData.uri, 
        imageData.fileName, 
        imageData.width, 
        imageData.height
      );
      
      if (isScreenshot) {
        screenshots.push(imageData);
      } else {
        nonScreenshots.push(imageData);
      }
    }
    
    logger.debug(`📱 批量截图检测完成：${screenshots.length} 张截图，${nonScreenshots.length} 张非截图`);
    
    return { screenshots, nonScreenshots };
  }

  /**
   * 批量查询缓存
   * @param {Array<string>} imageHashes - 图片哈希数组（自动分批处理）
   * @param {string} userId - 可选的用户ID
   * @returns {Promise<Object>} 批量缓存查询结果 { success: true, total, cached_count, items: [] }
   */
  async batchCheckCache(imageHashes, userId = null) {
    const config = this.getAPIConfig();
    
    if (imageHashes.length === 0) {
      return { success: true, total: 0, cached_count: 0, items: [] };
    }
    
    try {
      logger.debug(`🔍 批量查询缓存：${imageHashes.length} 个哈希值`);
      
      // 分批处理（每批100个）
      const batchSize = this.BATCH_CONFIG.CACHE_BATCH_SIZE;
      const allItems = [];
      let totalCached = 0;
      
      for (let i = 0; i < imageHashes.length; i += batchSize) {
        const batchHashes = imageHashes.slice(i, i + batchSize);
        
        const headers = { 'Content-Type': 'application/json' };
        if (userId) {
          headers['X-User-ID'] = userId;
        }
        
        const response = await fetch(`${config.baseURL}/api/v1/classify/batch-check-cache`, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({ image_hashes: batchHashes })
        });
        
        if (!response.ok) {
          throw new Error(`批量缓存查询失败: HTTP ${response.status}`);
        }
        
        const result = await response.json();
        allItems.push(...result.items);
        totalCached += result.cached_count;
        
        logger.debug(`✅ 批次 ${Math.floor(i / batchSize) + 1}：命中 ${result.cached_count}/${result.total}`);
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
    
    try {
      logger.debug(`⬆️  批量上传分类：${imageDataList.length} 张图片`);
      
      // 分批处理（每批20张）
      const batchSize = this.BATCH_CONFIG.UPLOAD_BATCH_SIZE;
      const allItems = [];
      let totalSuccess = 0;
      let totalFail = 0;
      
      for (let i = 0; i < imageDataList.length; i += batchSize) {
        const batch = imageDataList.slice(i, i + batchSize);
        
        const formData = new FormData();
        
        // 添加图片文件
        for (const imageData of batch) {
          formData.append('images', imageData.blob, imageData.fileName || 'image.jpg');
        }
        
        // 添加哈希列表
        const hashes = batch.map(img => img.hash).filter(h => h);
        if (hashes.length > 0) {
          formData.append('image_hashes', JSON.stringify(hashes));
        }
        
        const headers = {};
        if (userId) {
          headers['X-User-ID'] = userId;
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(`${config.baseURL}/api/v1/classify/batch`, {
          method: 'POST',
          headers: headers,
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          const errorText = await response.text();
          logger.error(`❌ 批量分类HTTP错误: ${response.status} ${response.statusText}`, errorText);
          throw new Error(`批量分类失败: HTTP ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        
        // 记录批次结果详情
        logger.debug(`📊 批次 ${Math.floor(i / batchSize) + 1} 原始结果:`, {
          success: result.success,
          total: result.total,
          success_count: result.success_count,
          fail_count: result.fail_count,
          itemsLength: result.items?.length,
          firstItem: result.items?.[0]
        });
        
        // 合并结果，保留原始 imageData 引用
        const itemsWithData = result.items.map((item, idx) => ({
          ...item,
          imageData: batch[idx].imageData // 保留原始图片数据引用
        }));
        
        allItems.push(...itemsWithData);
        totalSuccess += result.success_count;
        totalFail += result.fail_count;
        
        logger.debug(`✅ 批次 ${Math.floor(i / batchSize) + 1}：成功 ${result.success_count}/${result.total}`);
      }
      
      logger.debug(`✅ 批量分类完成：总成功 ${totalSuccess}/${imageDataList.length}`);
      
      return {
        success: true,
        total: imageDataList.length,
        success_count: totalSuccess,
        fail_count: totalFail,
        items: allItems
      };
    } catch (error) {
      // 处理超时和取消请求的情况
      if (error.name === 'AbortError' || error.message === 'The user aborted a request.') {
        logger.warn('⚠️ 远程推理超时或被取消，将降级到本地推理');
        return {
          success: false,
          total: imageDataList.length,
          success_count: 0,
          fail_count: imageDataList.length,
          items: imageDataList.map((imageData, index) => ({
            index,
            success: false,
            data: null,
            error: '请求超时或取消',
            imageData
          }))
        };
      }
      
      logger.error('❌ 批量分类失败:', error.message || error);
      logger.error('❌ 错误详情:', error);
      throw error;
    }
  }

  async checkHealth() {
    const config = this.getAPIConfig();
    
    try {
      logger.debug('🏥 检查后端服务健康状态...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.BATCH_CONFIG.HEALTH_CHECK_TIMEOUT);
      
      const response = await fetch(`${config.baseURL}/api/v1/health`, {
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
        modelApi: data.model_api
      });
      
      return {
        available: isHealthy,
        status: data.status,
        database: data.database,
        modelApi: data.model_api,
        timestamp: data.timestamp
      };
      
    } catch (error) {
      logger.error('❌ 健康检查失败:', error);
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
   * 查询缓存
   * 
   * @param {string} imageHash - 图片SHA-256哈希
   * @param {string} clientId - 客户端ID
   * @returns {Promise<Object>} 缓存查询结果
   */
  async checkCache(imageHash, clientId) {
    const config = this.getAPIConfig();
    
    try {
      const response = await fetch(`${config.baseURL}/api/v1/classify/check-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': clientId || ''
        },
        body: JSON.stringify({
          image_hash: imageHash
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      
      const result = await response.json();
      
      // 不再输出缓存查询结果日志，由调用方决定是否输出
      
      return result;
      
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
   * 完整的远程图片分类流程
   * 
   * @param {Blob|File|string} imageInput - 图片文件或URI
   * @param {Object} options - 选项
   * @param {boolean} options.checkHealthFirst - 是否先检查健康状态
   * @returns {Promise<Object>} 分类结果
   */
  async classifyImageRemote(imageInput, options = {}) {
    const {
      checkHealthFirst = false
    } = options;
    
    try {
      logger.debug('🚀 开始远程图片分类...');
      
      // 步骤0: 检查服务可用性（可选）
      if (checkHealthFirst) {
        logger.debug('🏥 检查服务状态...');
        const health = await this.checkHealth();
        
        if (!health.available) {
          throw new Error(`服务不可用: ${health.reason || '未知原因'}`);
        }
        
        logger.debug('✅ 服务正常');
      }
      
      // 获取客户端ID
      const clientId = await UnifiedDataService.getClientId();
      logger.debug('🆔 客户端ID:', clientId);
      
      // 将imageInput转换为Blob/File
      let imageFile = imageInput;
      
      // 如果输入是URI字符串，需要转换为Blob
      if (typeof imageInput === 'string') {
        const response = await fetch(imageInput);
        const blob = await response.blob();
        imageFile = new File([blob], 'image.jpg', { type: blob.type || 'image/jpeg' });
      }
      
      // 步骤1: 计算哈希
      const imageHash = await this.calculateSHA256(imageFile);
      
      // 步骤1.5: 缩放图像到1024x1024（保持宽高比）
      const resizedImageFile = await this.resizeImageTo1024(imageFile);
      
      // 步骤2: 查询缓存（强制使用）
      const cacheResult = await this.checkCache(imageHash, clientId);
      
      if (cacheResult.cached) {
        // 缓存命中！
        logger.info(`✅ 远程推理缓存命中: ${imageHash.substring(0, 8)}...`);
        
        // 直接返回完整的缓存结果
        return {
          success: true,
          data: cacheResult.data,  // 保留完整的 data 对象
          from_cache: true,
          request_id: cacheResult.request_id
        };
      }
      
      // 步骤3: 缓存未命中，上传图片
      logger.debug('⬆️  上传图片分类...');
      const result = await this.uploadAndClassify(resizedImageFile, imageHash, clientId);
      
      if (result.success) {
        logger.debug('✅ 远程分类成功');
        
        // 直接返回完整的服务器响应
        return {
          success: true,
          data: result.data,  // 保留完整的 data 对象
          from_cache: false,
          processing_time_ms: result.processing_time_ms,
          request_id: result.request_id
        };
      } else {
        throw new Error(result.error || '分类失败');
      }
      
    } catch (error) {
      logger.error('❌ 远程分类失败:', error);
      
      // 返回结构兼容本地分类格式
      return {
        success: false,
        error: error.message,
        categoryId: 'other',
        confidence: 0,
        message: `远程分类失败: ${error.message}`,
        // 保持与本地分类兼容的空字段
        idCardDetections: [],
        generalDetections: [],
        mobileNetV3Detections: [],
        imageDimensions: null,
        allModelResults: {}
      };
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
