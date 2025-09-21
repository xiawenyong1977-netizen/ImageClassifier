import UnifiedDataService from './UnifiedDataService.js';
import configService from './ConfigService.js';

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
  }

  // 获取模型路径（处理相对路径和绝对路径）
  getModelPath(configPath, modelBasePath) {
    if (!configPath) {
      throw new Error('模型路径配置缺失');
    }
    
    // 如果配置中的路径已经是完整路径（包含协议或绝对路径），直接使用
    if (configPath.startsWith('http://') || configPath.startsWith('https://') || configPath.startsWith('/')) {
      return configPath;
    }
    
    // 如果是相对路径，与基础路径组合
    if (configPath.startsWith('./')) {
      // 移除 './' 前缀
      const fileName = configPath.substring(2);
      // 如果文件名包含 models/，只取文件名部分
      if (fileName.startsWith('models/')) {
        const actualFileName = fileName.substring(7); // 移除 'models/' 前缀
        return `${modelBasePath}/${actualFileName}`;
      }
      // 直接拼接
      return `${modelBasePath}/${fileName}`;
    }
    
    // 如果配置路径已经包含 models 目录，直接拼接
    if (configPath.includes('models/')) {
      return `${modelBasePath}/${configPath}`;
    }
    
    // 直接拼接
    return `${modelBasePath}/${configPath}`;
  }

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
      
      // 根据环境选择模型路径
      const isWebEnvironment = typeof window !== 'undefined' && window.location;
      const isDevelopment = isWebEnvironment && window.location.hostname === 'localhost';
      const modelBasePath = isDevelopment ? 'http://localhost:3000/models' : './models';

      // 初始化模型配置
      this.models = {
        // ID卡模型保持硬编码（特有模型，不在配置文件中）
        idCard: {
          model: null,
          path: `${modelBasePath}/id_card_detection.onnx`,
          classes: ['id_card_front', 'id_card_back'],
          metadata: null,
          priority: 1,
          description: '身份证识别专用模型',
          confidenceThreshold: 0.3,
          nmsThreshold: 0.4,
          maxDetections: 5
        },
        // YOLO8s模型从配置文件读取
        yolo8s: {
          model: null,
          path: this.getModelPath(modelConfigs.yolo8s?.path, modelBasePath),
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
          path: this.getModelPath(modelConfigs.mobilenetv3?.path, modelBasePath),
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
        
        console.log(`✅ MobileNetV3类别加载成功: ${this.imagenetClasses.length} 个类别`);
      } else {
        console.warn('⚠️ 配置服务中未找到MobileNetV3类别数据');
        this.imagenetClasses = [];
        this.models.mobilenetv3.classes = [];
      }

      // 加载分类信息
      this.categories = this.configService.getAllCategoryIds();
      console.log(`✅ 分类信息加载成功: ${this.categories.length} 个分类`);

      console.log('✅ 模型配置初始化完成');
      return true;
    } catch (error) {
      console.error('❌ 模型配置初始化失败:', error);
      throw error;
    }
  }

  // 初始化ONNX Runtime
  async initializeONNX() {
    if (this.ort) {
      return this.ort;
    }

    try {
      if (typeof window !== 'undefined') {
        // 浏览器环境
        const ortModule = await import('onnxruntime-web');
        this.ort = ortModule.default || ortModule;
      } else {
        // Node.js环境
        this.ort = await import('onnxruntime-node');
      }
      
      console.log('✅ ONNX Runtime初始化成功');
      return this.ort;
    } catch (error) {
      console.error('❌ ONNX Runtime初始化失败:', error);
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
      console.log(`✅ 模型加载完成: ${loadResults.message}`);
      
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
        // Node.js 环境
        try {
          const fs = await import('fs');
          
          if (!fs.existsSync(modelConfig.path)) {
            throw new Error(`${modelName} model file not found: ${modelConfig.path}`);
          }
        } catch (error) {
        }
      }

        // MobileNetV3类别已在初始化时加载，无需重复加载

        // 加载ONNX模型
        // 使用统一的ONNX Runtime实例
        const ort = this.ort;
        
        // 创建推理会话时的配置
        const sessionOptions = {
          executionProviders: ['cpu'], // 强制使用CPU
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
  async postprocessYOLOOutput(output, confidenceThreshold = null, nmsThreshold = null, classes = null) {
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
        data = output.cpuData;
      } else if (Array.isArray(output)) {
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
      
      // 使用提供的类别列表或默认类别
      const classList = classes || this.models.yolo8s.classes;
      
      // 简化的调试信息
      const outputData = {
        dims: predictions.dims,
        dataType: typeof predictions.data[0],
        confidenceThreshold: confidenceThreshold,
        modelType: numValues === 6 ? 'idCard' : (numValues === 84 ? 'general' : 'unknown')
      };
      
      // 只输出调试信息到控制台
      const modelType = numValues === 6 ? 'idCard' : (numValues === 84 ? 'general' : 'unknown');
      
      // 处理所有检测框，寻找有效的class_id=0或1的检测结果
      const maxBoxesToProcess = numBoxes; // 处理所有8400个框
      
      const detections = [];
      
      // 解析检测结果
      for (let i = 0; i < maxBoxesToProcess; i++) {
        let confidence, classId;
        
        // 身份证模型格式：按特征优先存储 [all_x, all_y, all_w, all_h, all_class0, all_class1]
        // 身份证模型输出已经是概率值（0-1范围），直接使用原始分数
        const class0Score = predictions.data[numBoxes * 4 + i]; // 身份证正面分数
        const class1Score = predictions.data[numBoxes * 5 + i]; // 身份证背面分数
        
        // 直接比较原始分数，取较大的作为置信度，对应的索引作为类别ID
        if (class0Score > class1Score) {
          confidence = class0Score;
          classId = 0; // 身份证正面
        } else {
          confidence = class1Score;
          classId = 1; // 身份证背面
        }
        
        // 根据模型类型验证class_id范围并添加检测结果
        if (numValues === 6) {
          // 身份证模型：只接受 class_id = 0 或 1
          // 使用适当的置信度阈值
          const threshold = 0.3; // 30%阈值
          
          if (classId === 0 || classId === 1) {
            if (confidence > threshold) {
              const className = classId === 0 ? 'id_card_front' : 'id_card_back';
              detections.push({
                class: className,
                confidence: confidence,
                classIndex: classId
              });
            }
          }
        } else if (numValues === 84) {
          // 通用模型：按特征优先存储 [all_x, all_y, all_w, all_h, all_class0, all_class1, ..., all_class79]
          // 置信度 = max(class_0, class_1, ..., class_79)
          // 通用模型输出可能已经是概率值，直接使用原始分数
          
          // 按特征优先解析检测框 i 的数据
          const x = predictions.data[i];                           // 索引 i
          const y = predictions.data[numBoxes + i];               // 索引 8400 + i
          const w = predictions.data[numBoxes * 2 + i];           // 索引 16800 + i
          const h = predictions.data[numBoxes * 3 + i];           // 索引 25200 + i
          
          // 提取80个类别分数
          const classScores = [];
          for (let j = 0; j < 80; j++) {
            classScores.push(predictions.data[numBoxes * (4 + j) + i]);
          }
          
          // 直接使用原始分数，不应用sigmoid激活
          const maxClassScore = Math.max(...classScores);
          const maxClassIndex = classScores.indexOf(maxClassScore);
          
          // 置信度 = 最高的类别分数
          const finalConfidence = maxClassScore;
          
          if (finalConfidence > confidenceThreshold) {
            const className = classList[maxClassIndex] || `class_${maxClassIndex}`;
            detections.push({
              class: className,
              confidence: finalConfidence,
              classIndex: maxClassIndex
            });
          }
        } else {
          // 其他格式，尝试通用处理
          if (classId >= 0 && classId < 80) {
            if (confidence > 30) {
              const className = classList[classId] || `class_${classId}`;
              detections.push({
                class: className,
                confidence: confidence,
                classIndex: classId
              });
            }
          }
        }
        
      }
      
      // 应用非极大值抑制 (NMS)
      const nmsDetections = this.applyNMS(detections, nmsThreshold);
      
      // 检查是否有有效检测结果
      if (nmsDetections.length === 0) {
        return [];
      }
      
      
      // 统计检测结果
      const idCardFrontCount = nmsDetections.filter(d => d.classIndex === 0).length;
      const idCardBackCount = nmsDetections.filter(d => d.classIndex === 1).length;
      
      // 显示每个检测结果的详细信息
      nmsDetections.forEach((detection, index) => {
      });
      
      return nmsDetections;
    } catch (error) {
      console.error('YOLO postprocessing failed:', error);
      return [];
    }
  }

  // Apply Non-Maximum Suppression
  applyNMS(detections, nmsThreshold) {
    // 按置信度排序
    detections.sort((a, b) => b.confidence - a.confidence);
    
    const filteredDetections = [];
    const seenClasses = new Set();
    
    // 对于每个检测，只保留每个类别的最高置信度检测
    for (const detection of detections) {
      const classKey = `${detection.class}_${detection.classIndex}`;
      
      if (!seenClasses.has(classKey)) {
        filteredDetections.push(detection);
        seenClasses.add(classKey);
      }
    }
    
    return filteredDetections;
  }

  // Calculate Intersection over Union (IoU)
  calculateIoU(box1, box2) {
    const [x1, y1, w1, h1] = box1;
    const [x2, y2, w2, h2] = box2;
    
    const xLeft = Math.max(x1 - w1/2, x2 - w2/2);
    const yTop = Math.max(y1 - h1/2, y2 - h2/2);
    const xRight = Math.min(x1 + w1/2, x2 + w2/2);
    const yBottom = Math.min(y1 + h1/2, y2 + h2/2);
    
    if (xRight < xLeft || yBottom < yTop) {
      return 0;
    }
    
    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = w1 * h1;
    const box2Area = w2 * h2;
    const unionArea = box1Area + box2Area - intersectionArea;
    
    return intersectionArea / unionArea;
  }




  // 将YOLOv8n检测结果映射到应用分类
  async mapDetectionsToCategories(detections) {
    // 从存储中获取分类规则（带优先级）
    const rulesData = await UnifiedDataService.imageStorageService.getClassificationRulesWithPriority();
    
    // 如果没有优先级数据，回退到旧版本
    if (!rulesData.categoryPriorities) {
      const categoryMapping = await UnifiedDataService.getClassificationRules();
      return this.mapDetectionsToCategoriesLegacy(detections, categoryMapping);
    }

    const { categoryPriorities, objectMappings } = rulesData;
    const categoryScores = {};
    
    // 计算每个分类的分数
    detections.forEach(detection => {
      const mappedCategory = objectMappings[detection.class] || 'other';
      const confidence = detection.confidence;
      
      if (!categoryScores[mappedCategory]) {
        categoryScores[mappedCategory] = {
          score: 0,
          priority: categoryPriorities[mappedCategory] || 999, // 未知分类优先级最低
          detections: []
        };
      }
      
      // 使用最高置信度作为该分类的分数
      categoryScores[mappedCategory].score = Math.max(categoryScores[mappedCategory].score, confidence);
      categoryScores[mappedCategory].detections.push(detection);
    });

    // 按优先级和置信度选择最佳分类
    let bestCategory = 'other';
    let bestPriority = 999;
    let bestScore = 0;
    
    Object.entries(categoryScores).forEach(([category, data]) => {
      const { score, priority } = data;
      
      // 优先级高的分类优先（数字小的优先级高）
      if (priority < bestPriority || 
          (priority === bestPriority && score > bestScore)) {
        bestPriority = priority;
        bestScore = score;
        bestCategory = category;
      }
    });

    console.log(`🎯 分类选择: ${bestCategory} (优先级: ${bestPriority}, 置信度: ${bestScore.toFixed(3)})`);
    return bestCategory;
  }

  // 旧版本的分类方法（兼容性）
  mapDetectionsToCategoriesLegacy(detections, categoryMapping) {
    const categoryScores = {};
    
    detections.forEach(detection => {
      const mappedCategory = categoryMapping[detection.class] || 'other';
      const confidence = detection.confidence;
      
      if (!categoryScores[mappedCategory]) {
        categoryScores[mappedCategory] = 0;
      }
      
      categoryScores[mappedCategory] = Math.max(categoryScores[mappedCategory], confidence);
    });

    let bestCategory = 'other';
    let bestScore = 0;
    
    Object.entries(categoryScores).forEach(([category, score]) => {
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    });

    return bestCategory;
  }

  // Classify image (simplified version, directly using time classification)
  async classifyImage(imageUri, metadata = {}, options = {}) {
    const { unloadAfterClassification = false } = options;
    
    try {
      // 检查服务是否已初始化
      if (!this.isInitialized) {
        throw new Error('ImageClassifierService 未初始化，请先调用 initialize() 方法');
      }

      // 第一步：检查是否为手机截图（最高优先级）
      const fileName = metadata.fileName || '';
      
      // 优先使用EXIF中提取的图片尺寸，如果没有则获取原始分辨率
      let originalWidth, originalHeight;
      
      if (metadata.imageDimensions && metadata.imageDimensions.width && metadata.imageDimensions.height) {
        // 使用EXIF中提取的尺寸
        originalWidth = metadata.imageDimensions.width;
        originalHeight = metadata.imageDimensions.height;
        console.log('📏 使用EXIF中的图片尺寸:', originalWidth, 'x', originalHeight);
      } else {
        // 回退到获取原始分辨率
        try {
          const originalDimensions = await this.getOriginalImageDimensions(imageUri);
          originalWidth = originalDimensions.width;
          originalHeight = originalDimensions.height;
          console.log('📏 使用获取的原始分辨率:', originalWidth, 'x', originalHeight);
        } catch (error) {
          console.warn('⚠️ 获取原始分辨率失败，跳过手机截图检测:', error.message);
          originalWidth = null;
          originalHeight = null;
        }
      }
      
      if (originalWidth && originalHeight && this.isMobileScreenshot(originalWidth, originalHeight, fileName)) {
          return {
            category: 'screenshot',
            confidence: 0.9,
            reason: '检测到手机截图特征',
            method: 'mobile_screenshot',
            detections: [],
            idCardDetected: false,
            usedModels: [],
            idCardDetections: [],
            generalDetections: []
          };
        }

      // 第二步：使用智能推理检测
      const detectionResult = await this.smartDetectObjects(imageUri, {
        idCardConfidenceThreshold: 0.7,  // 提高身份证检测阈值，减少误检
        generalConfidenceThreshold: 0.5,
        nmsThreshold: 0.4,
        maxDetections: 10
      });

      let result;
      if (detectionResult.success && detectionResult.detections.length > 0) {
        // 根据检测结果进行分类
        const category = await this.mapDetectionsToCategories(detectionResult.detections);
        const confidence = Math.max(...detectionResult.detections.map(d => d.confidence));
        
        // 分离不同类型的检测结果
        const idCardDetections = detectionResult.detections.filter(d => 
          d.class === 'id_card_front' || d.class === 'id_card_back'
        );
        
        // 检查是否使用了MobileNetV3模型
        const hasMobileNetV3 = detectionResult.usedModels && detectionResult.usedModels.includes('mobilenetv3');
        
        const generalDetections = detectionResult.detections.filter(d => 
          d.class !== 'id_card_front' && d.class !== 'id_card_back' && !hasMobileNetV3
        );
        
        const smartClassifications = hasMobileNetV3 ? 
          detectionResult.detections.filter(d => 
            d.class !== 'id_card_front' && d.class !== 'id_card_back'
          ) : [];
        
        result = {
          category: category || 'other',
          confidence: confidence,
          reason: `检测到 ${detectionResult.detections.length} 个物体`,
          method: 'smart_detection',
          detections: detectionResult.detections,
          idCardDetected: detectionResult.idCardDetected,
          usedModels: detectionResult.usedModels,
          // 分离的检测结果，用于保存到图片详情
          idCardDetections: idCardDetections,
          generalDetections: generalDetections,
          smartClassifications: smartClassifications
        };
      } else {
        // 如果没有检测到物体，返回默认分类
        result = {
          category: 'other',
          confidence: 0.50,
          reason: '未检测到物体',
          method: 'no_detection',
          detections: [],
          idCardDetected: false,
          usedModels: [],
          // 空的检测结果
          idCardDetections: [],
          generalDetections: [],
          smartClassifications: []
        };
      }

      // 如果设置了分类后卸载模型，则卸载所有模型
      if (unloadAfterClassification) {
        this.unloadAllModels();
      }

      return result;
    } catch (error) {
      console.error('Image classification failed:', error);
      return {
        category: 'other',
        confidence: 0.50,
        reason: 'Classification failed',
        method: 'fallback'
      };
    }
  }

  // Batch classify images
  async classifyImages(imageUris, metadata = {}, options = {}) {
    const { unloadAfterClassification = false } = options;
    const results = [];
    
    for (const uri of imageUris) {
      try {
        const result = await this.classifyImage(uri, metadata, { unloadAfterClassification: false });
        results.push({
          uri,
          ...result,
        });
      } catch (error) {
        console.error(`Failed to classify image ${uri}:`, error);
        results.push({
          uri,
          category: 'other',
          confidence: 0,
          error: error.message,
        });
      }
    }
    
    // 如果设置了批量分类后卸载模型，则卸载所有模型
    if (unloadAfterClassification) {
      this.unloadAllModels();
    }
    
    return results;
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
  async classifyImageWithYOLO(imageUri, modelName = 'yolo8s', options = {}) {
    if (!this.models[modelName] || !this.models[modelName].model) {
      throw new Error(`Model ${modelName} not loaded`);
    }
    
    // 从模型配置获取默认参数
    const modelConfig = this.models[modelName];
    const defaultOptions = {
      confidenceThreshold: modelConfig?.confidenceThreshold || 0.25,
      nmsThreshold: modelConfig?.nmsThreshold || 0.4,
      maxDetections: modelConfig?.maxDetections || 10
    };
    
    const {
      confidenceThreshold = defaultOptions.confidenceThreshold,
      nmsThreshold = defaultOptions.nmsThreshold,
      maxDetections = defaultOptions.maxDetections
    } = options;

    try {
      // 确保模型已加载
      await this.loadModel(modelName);

      const modelConfig = this.models[modelName];

      // 预处理图片
      const inputTensor = await this.preprocessImageForYOLO(imageUri);
      
      // 运行推理
      const feeds = { images: inputTensor };
      // 安全地计算数据范围，避免栈溢出
      const dataArray = Array.from(inputTensor.data);
      const minValue = dataArray.reduce((min, val) => Math.min(min, val), Infinity);
      const maxValue = dataArray.reduce((max, val) => Math.max(max, val), -Infinity);
      
      const results = await modelConfig.model.run(feeds);
      
      // 后处理结果
      // 尝试不同的输出名称
      const outputData = results.output0 || results.output || results[Object.keys(results)[0]];
      
      if (!outputData) {
        throw new Error(`模型 ${modelName} 没有返回有效的输出数据。输出键: ${Object.keys(results)}`);
      }
      
      const detections = await this.postprocessYOLOOutput(
        outputData, 
        confidenceThreshold, 
        nmsThreshold,
        modelConfig.classes
      );

      // 限制检测数量
      const limitedDetections = detections.slice(0, maxDetections);

      return {
        success: true,
        detections: limitedDetections,
        totalDetections: detections.length,
        model: modelName,
        processingTime: Date.now(),
        // 对于身份证模型，添加idCardDetected字段
        ...(modelName === 'idCard' && { idCardDetected: this.checkIdCardDetected(limitedDetections) })
      };
    } catch (error) {
      console.error(`❌ ${modelName}模型检测失败:`, error);
      return {
        success: false,
        error: error.message,
        detections: [],
        totalDetections: 0,
        model: modelName,
        processingTime: Date.now(),
        ...(modelName === 'idCard' && { idCardDetected: false })
      };
    }
  }

      // 智能推理：先检测身份证，再决定是否使用通用模型
  async smartDetectObjects(imageUri, options = {}) {
    const {
      idCardConfidenceThreshold = 0.3,   // 身份证阈值，适当提高
      generalConfidenceThreshold = 0.25, // 通用模型阈值
      nmsThreshold = 0.4,
      maxDetections = 10
    } = options;


    const startTime = Date.now();
    const results = {
      success: false,
      detections: [],
      totalDetections: 0,
      model: 'smart',
      processingTime: 0,
      idCardDetected: false,
      usedModels: [],
      reasoning: ''
    };

    try {
      // 第一步：使用身份证模型检测
      const idCardResult = await this.classifyImageWithYOLO(imageUri, 'idCard', {
        confidenceThreshold: idCardConfidenceThreshold, // 使用配置的阈值
        nmsThreshold,
        maxDetections: 5 // 身份证通常只有1-2个
      });

      results.usedModels.push('idCard');
      results.reasoning += '使用身份证模型检测；';

      // 检查是否检测到身份证
      const idCardDetected = this.checkIdCardDetected(idCardResult.detections);
      results.idCardDetected = idCardDetected;

      if (idCardDetected) {
        results.detections = idCardResult.detections;
        results.totalDetections = idCardResult.totalDetections;
        results.reasoning += '检测到身份证，停止推理；';
        results.success = true;
      } else {
        
        // 第二步：使用通用模型检测
        const generalResult = await this.classifyImageWithYOLO(imageUri, 'yolo8s', {
          confidenceThreshold: generalConfidenceThreshold, // 使用配置的阈值
          nmsThreshold,
          maxDetections
        });

        results.usedModels.push('yolo8s');
        
        // 检查YOLO是否检测到有效物体
        if (generalResult.success && generalResult.detections.length > 0) {
          results.detections = generalResult.detections;
          results.totalDetections = generalResult.totalDetections;
          results.reasoning += '未检测到身份证，使用通用模型检测到物体；';
          results.success = true;
        } else {
          // 第三步：YOLO没有检测到物体，使用MobileNetV3进行分类
          try {
            const classificationResult = await this.classifyImageWithMobileNetV3(imageUri, {
              confidenceThreshold: this.models.mobilenetv3?.confidenceThreshold || 0.3
            });
            
            results.usedModels.push('mobilenetv3');
            
            if (classificationResult.success && classificationResult.validPredictions.length > 0) {
              // 将分类结果转换为检测格式
              const classificationDetections = classificationResult.validPredictions.map(pred => ({
                class: pred.class,  // 修复：使用pred.class而不是pred.className
                confidence: pred.probability,
                bbox: [0, 0, 1, 1], // 全图检测
                area: 1.0
              }));
              
              results.detections = classificationDetections;
              results.totalDetections = classificationDetections.length;
              results.reasoning += 'YOLO未检测到物体，使用MobileNetV3进行分类；';
              results.success = true;
            } else {
              results.reasoning += 'YOLO和MobileNetV3都未检测到有效结果；';
              results.success = false;
            }
          } catch (classificationError) {
            console.warn('MobileNetV3分类失败:', classificationError.message);
            results.reasoning += `YOLO未检测到物体，MobileNetV3分类失败: ${classificationError.message};`;
            results.success = false;
          }
        }
      }

      results.processingTime = Date.now() - startTime;


      return results;

    } catch (error) {
      console.error('❌ 智能推理失败:', error.message);
      results.success = false;
      results.processingTime = Date.now() - startTime;
      results.reasoning += `推理失败: ${error.message};`;
      throw error;
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
  isMobileScreenshot(originalWidth, originalHeight, fileName) {
    // 特征1：分辨率判定 - 宽高比<=0.5（手机竖屏比例，包括滚动截图）
    const aspectRatio = originalWidth / originalHeight;
    const isMobileResolution = aspectRatio <= 0.5;
    
    // 特征2：文件名判定 - 包含截图关键词
    const fileNameLower = fileName.toLowerCase();
    const isScreenshotFile = fileNameLower.includes('screenshot') || 
                            fileNameLower.includes('截图') || 
                            fileNameLower.includes('screen');
    
    // 调试信息
    console.log('🔍 手机截图判定调试:');
    console.log(`  - 文件名: ${fileName}`);
    console.log(`  - 原始分辨率: ${originalWidth}x${originalHeight}`);
    console.log(`  - 宽高比: ${aspectRatio.toFixed(3)}`);
    console.log(`  - 手机分辨率: ${isMobileResolution}`);
    console.log(`  - 截图文件名: ${isScreenshotFile}`);
    console.log(`  - 最终判定: ${isMobileResolution || isScreenshotFile}`);
    
    // 两个特征中只要有一个满足就判定为手机截图
    return isMobileResolution || isScreenshotFile;
  }

  // 检查是否检测到身份证
  checkIdCardDetected(detections) {
    if (!detections || detections.length === 0) {
      return false;
    }

    // 直接使用模型配置中的身份证类别
    const idCardClasses = this.models.idCard.classes;

    // 检查检测结果中是否包含身份证类别
    const hasIdCard = detections.some(detection => 
      idCardClasses.includes(detection.class)
    );

    if (detections.length > 0) {
    }

    return hasIdCard;
  }

  // 获取身份证检测结果详情
  getIdCardDetectionDetails(detections) {
    if (!detections || detections.length === 0) {
      return {
        detected: false,
        count: 0,
        details: []
      };
    }

    // 直接使用模型配置中的身份证类别
    const idCardClasses = this.models.idCard.classes;

    const idCardDetections = detections.filter(detection => 
      idCardClasses.includes(detection.class)
    );

    return {
      detected: idCardDetections.length > 0,
      count: idCardDetections.length,
      details: idCardDetections.map(detection => ({
        class: detection.class,
        confidence: detection.confidence,
        bbox: detection.bbox,
        type: this.classifyIdCardType(detection.class)
      }))
    };
  }

  // 分类身份证类型（正面/反面）
  classifyIdCardType(className) {
    // 直接使用模型配置中的类别名称
    const idCardClasses = this.models.idCard.classes;
    
    if (className === idCardClasses[0]) { // id_card_front
      return 'front';
    } else if (className === idCardClasses[1]) { // id_card_back
      return 'back';
    } else {
      return 'unknown';
    }
  }

  // ==================== 新增的公共接口函数 ====================

  
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



  /**
   * 获取模型状态
   * @returns {Object} 模型状态信息
   */
  getModelStatus() {
    const status = {};
    let loadedCount = 0;

    Object.keys(this.models).forEach(modelName => {
      const isLoaded = !!this.models[modelName].model;
      status[modelName] = {
        loaded: isLoaded,
        path: this.models[modelName].path,
        description: this.models[modelName].description,
        priority: this.models[modelName].priority
      };
      if (isLoaded) {
        loadedCount++;
      }
    });

      return {
      totalModels: Object.keys(this.models).length,
      loadedModels: loadedCount,
      unloadedModels: Object.keys(this.models).length - loadedCount,
      isInitialized: this.isInitialized,
      status: status
    };
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
      console.log('✅ MobileNetV3模型加载成功');
      
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
  postprocessMobileNetV3Output(output, confidenceThreshold = null) {
    try {
      // 使用模型配置中的阈值作为默认值
      const threshold = confidenceThreshold !== null ? confidenceThreshold : (this.models.mobilenetv3?.confidenceThreshold || 0.3);
      
      const outputData = output.data;
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

  // 使用身份证模型进行检测
  async classifyImageWithIDModel(imageUri, options = {}) {
    return await this.classifyImageWithYOLO(imageUri, 'idCard', options);
  }


  // 使用MobileNetV3分类图片
  async classifyImageWithMobileNetV3(imageUri, options = {}) {
    const { confidenceThreshold = this.models.mobilenetv3?.confidenceThreshold || 0.3 } = options;
    
    try {
      // 确保模型已加载
      await this.loadMobileNetV3Model();
      
      // 预处理图片
      const inputTensor = await this.preprocessImageForMobileNetV3(imageUri);
      
      // 运行推理
      const modelConfig = this.models.mobilenetv3;
      const feeds = { [modelConfig.inputName]: inputTensor };
      const results = await modelConfig.model.run(feeds);
      
      // 获取输出
      const output = results[modelConfig.outputName];
      if (!output) {
        throw new Error('MobileNetV3模型没有返回有效的输出数据');
      }
      
      // 后处理结果
      const processedResults = this.postprocessMobileNetV3Output(output, confidenceThreshold);
      
      return {
        success: true,
        predictions: processedResults.predictions,
        validPredictions: processedResults.validPredictions,
        topPrediction: processedResults.topPrediction,
        confidence: processedResults.confidence,
        model: 'mobilenetv3',
        processingTime: Date.now()
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
        processingTime: Date.now()
      };
    }
  }
}

export default ImageClassifierService;
