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
    
    // 注意：已移除 Web Worker 池，使用主线程并行推理
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
          confidenceThreshold: 0.3,  // 提高身份证检测阈值，减少误检
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
      
      // 调试：输出YOLO类别信息
      console.log(`🔍 YOLO8s模型类别数量: ${this.models.yolo8s.classes.length}`);
      console.log(`🔍 YOLO8s类别列表:`, this.models.yolo8s.classes.slice(0, 10));

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
      } else if (confidence > 0.1) { // 调试：显示低置信度的检测
        console.log(`🔍 低置信度检测: classId=${classId}, confidence=${confidence.toFixed(3)}, threshold=${confidenceThreshold}`);
      }
      }
      
      // 应用非极大值抑制 (NMS)
      const nmsDetections = this.applyNMS(detections, nmsThreshold);
      
      // 检查是否有有效检测结果
      if (nmsDetections.length === 0) {
        console.log(`🔍 YOLO后处理: 没有通过NMS的检测结果 (原始检测: ${detections.length}个)`);
        return [];
      }
      
      console.log(`🔍 YOLO后处理: ${detections.length}个原始检测 -> ${nmsDetections.length}个最终检测`);
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
  async classifyImage(imageUri) {
    try {
      // 检查服务是否已初始化
      if (!this.isInitialized) {
        throw new Error('ImageClassifierService 未初始化，请先调用 initialize() 方法');
      }

       // 获取图像尺寸
      const imageDimensions = await this.getOriginalImageDimensions(imageUri);
      // 第一步：检查是否为手机截图（最高优先级）
      console.log('🔍 第一步：检查手机截图...');
      if (await this.identifyMobileScreenshot(imageUri, imageDimensions)) {
        console.log('✅ 检测到手机截图，返回结果');
        return {
          success: true,
          categoryId: 'screenshot',
          confidence: 1.0,
          message: '检测到手机截图',
          idCardDetections: [],
          generalDetections: [],
          mobileNetV3Detections: [],
          imageDimensions: imageDimensions,
          allModelResults: {
            mobileScreenshot: true,
            idCard: [],
            general: [],
            mobileNetV3: []
          }
        };
      }
      console.log('❌ 不是手机截图，继续下一步');

      // 第二步到第四步：并行执行所有模型推理
      console.log('🔍 并行执行所有模型推理...');
      const parallelResults = await this.runParallelInference(imageUri);
      
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
      
      console.log(`📊 所有模型推理完成:`);
      console.log(`  - 身份证模型: ${idCardCount} 个检测结果`);
      console.log(`  - 通用模型: ${generalCount} 个检测结果`);
      console.log(`  - MobileNetV3模型: ${mobileNetV3Count} 个检测结果`);

      // 调用新的分类映射函数
      const categoryId = this.MapObjectes2Category(allModelResults, imageUri, imageDimensions);

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
        allModelResults: allModelResults
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
      await this.loadModel(modelName);

      // 预处理图片
      const inputTensor = await this.preprocessImageForYOLO(imageUri);
      
      // 运行推理
      const feeds = { images: inputTensor };
      // 安全地计算数据范围，避免栈溢出
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
        nmsThreshold
      );

      // 限制检测数量
      const limitedDetections = detections.slice(0, maxDetections);

      // 调试：输出检测结果
      if (limitedDetections.length > 0) {
        console.log(`🔍 ${modelName}检测到${limitedDetections.length}个物体:`, limitedDetections.map(d => ({
          classId: d.classId,
          confidence: d.confidence.toFixed(3),
          bbox: d.bbox.map(b => b.toFixed(2))
        })));
      } else {
        console.log(`⚠️ ${modelName}没有检测到任何物体 (置信度阈值: ${confidenceThreshold})`);
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
    console.log('🚀 开始并行推理... [V3.0 - ' + new Date().toLocaleTimeString() + ']');
    
    // 并行执行所有模型推理，提升性能
    const [idCardResults, generalResults, mobileNetV3Results] = await Promise.allSettled([
      this.classifyImageWithYOLO(imageUri, 'idCard').catch(error => {
        console.error('❌ idCard 推理失败:', error);
        return [];
      }),
      this.classifyImageWithYOLO(imageUri, 'yolo8s').catch(error => {
        console.error('❌ general 推理失败:', error);
        return [];
      }),
      this.classifyImageWithMobileNetV3(imageUri).catch(error => {
        console.error('❌ mobileNetV3 推理失败:', error);
        return {};
      })
    ]);
    
    // 处理结果
    const parallelResults = {
      idCard: idCardResults.status === 'fulfilled' ? idCardResults.value : [],
      general: generalResults.status === 'fulfilled' ? generalResults.value : [],
      mobileNetV3: mobileNetV3Results.status === 'fulfilled' ? mobileNetV3Results.value : {}
    };
    
    const endTime = Date.now();
    console.log(`⏱️ 并行推理完成，总耗时: ${endTime - startTime}ms`);
    console.log(`📊 推理结果: idCard=${parallelResults.idCard.length}, general=${parallelResults.general.length}, mobileNetV3=${parallelResults.mobileNetV3.predictions?.length || 0}`);
    
    return parallelResults;
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
      console.log(`🎯 开始识别图像主角: ${imageURI}`);
      
      if (!yoloDetectResults || yoloDetectResults.length === 0) {
        console.log('⚠️ 没有检测到任何物体');
        return [];
      }

      // 检查图像尺寸参数
      if (!imageDimensions || !imageDimensions.width || !imageDimensions.height) {
        console.log('⚠️ 缺少图像尺寸信息，无法计算物体比例');
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
      
      console.log(`✅ 主角识别完成，识别到 ${results.length} 个分类:`);
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.category}: ${result.count}个物体, 累计面积比例: ${(result.sizeRatio * 100).toFixed(2)}%`);
      });
      
      // 输出详细的面积比例数据，用于阈值调优
      console.log('📊 面积比例详细数据（用于阈值调优）:');
      results.forEach((result, index) => {
        console.log(`  ${result.category}: 面积比例=${(result.sizeRatio * 100).toFixed(3)}%, 物体数量=${result.count}`);
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
  MapObjectes2Category(allModelResults, imageURI, imageDimensions) {
    // 检查身份证检测结果
    if (allModelResults.idCard && allModelResults.idCard.length > 0) {
      console.log('🆔 检测到身份证，返回身份证分类');
      return 'idcard';
    }
    
    // 调用identifyMainRole获取主角信息
    const mainRoleResults = this.identifyMainRole(imageURI, allModelResults.general, imageDimensions);
    
    console.log('🎯 主角识别结果:', mainRoleResults);
    
    // 检查人物分类（遍历所有结果查找人物）
    if (mainRoleResults && mainRoleResults.length > 0) {
      // 查找各种分类
      const personSubject = mainRoleResults.find(result => result.category === 'person');
      const animalSubject = mainRoleResults.find(result => result.category === 'animals');
      const foodSubject = mainRoleResults.find(result => result.category === 'foods');
      
      if (personSubject) {
        console.log(`👤 人物检测: 数量=${personSubject.count}, 面积占比=${(personSubject.sizeRatio * 100).toFixed(3)}%`);
        console.log(`🔍 人物面积占比详细: ${personSubject.sizeRatio} (${(personSubject.sizeRatio * 100).toFixed(3)}%)`);
        
        // 检查是否为单人且面积占比大于5%（降低阈值）
        if (personSubject.count === 1 && personSubject.sizeRatio > 0.05) {
          console.log('✅ 单人分类: 面积占比 > 5%');
          return 'single_person';
        } else if (personSubject.count === 1) {
          console.log('❌ 单人分类: 面积占比不足 5%');
        }
        
        // 检查是否为多人且面积占比大于5%（降低阈值）
        if (personSubject.count > 1 && personSubject.sizeRatio > 0.05) {
          console.log('✅ 多人分类: 面积占比 > 5%');
          return 'social_activities';
        } else if (personSubject.count > 1) {
          console.log('❌ 多人分类: 面积占比不足 5%');
        }
      }
      
      // 检查动物
      if (animalSubject) {
        console.log(`🐾 动物检测: 面积占比=${(animalSubject.sizeRatio * 100).toFixed(3)}%`);
        if (animalSubject.sizeRatio > 0.05) {
          console.log('✅ 动物分类: 面积占比 > 5%');
          return 'pets';
        } else {
          console.log('❌ 动物分类: 面积占比不足 5%');
        }
      }
      
      // 检查美食
      if (foodSubject) {
        console.log(`🍽️ 美食检测: 面积占比=${(foodSubject.sizeRatio * 100).toFixed(3)}%`);
        if (foodSubject.sizeRatio > 0.05) {
          console.log('✅ 美食分类: 面积占比 > 5%');
          return 'foods';
        } else {
          console.log('❌ 美食分类: 面积占比不足 5%');
        }
      }
      
      // 检查交通工具或自然风景（只要人物面积占比不超过0.1）
      const vehicleSubject = mainRoleResults.find(result => result.category === 'transportation');
      const landscapeSubject = mainRoleResults.find(result => result.category === 'nature');
      
      if (vehicleSubject) {
        console.log(`🚗 交通工具检测: 面积占比=${(vehicleSubject.sizeRatio * 100).toFixed(3)}%`);
      }
      if (landscapeSubject) {
        console.log(`🏞️ 风景检测: 面积占比=${(landscapeSubject.sizeRatio * 100).toFixed(3)}%`);
      }
      
      if ((vehicleSubject && vehicleSubject.sizeRatio > 0.1) || 
          (landscapeSubject && landscapeSubject.sizeRatio > 0.1)) {
        // 如果检测到人物且面积占比超过0.1，则不归类为旅游风景
        if (personSubject && personSubject.sizeRatio > 0.1) {
          console.log('❌ 旅游风景分类: 人物面积占比超过 10%');
        } else {
          console.log('✅ 旅游风景分类: 面积占比 > 10% 且人物面积占比 ≤ 10%');
          return 'travel_scenery';
        }
      } else if (vehicleSubject || landscapeSubject) {
        console.log('❌ 旅游风景分类: 面积占比不足 10%');
      }
    }

    // 如果YOLO检测没有明确结果，尝试使用MobileNetV3分类结果
    if (allModelResults.mobileNetV3 && allModelResults.mobileNetV3.success && allModelResults.mobileNetV3.predictions && allModelResults.mobileNetV3.predictions.length > 0) {
      console.log('🧠 使用MobileNetV3分类结果进行辅助分类');
      
      // 按优先级检查MobileNetV3的检测结果：旅游风景 > 宠物 > 美食
      const priorityCategories = [
        { objectCategory: 'transportation', appCategory: 'travel_scenery' },
        { objectCategory: 'infrastructure', appCategory: 'travel_scenery' },
        { objectCategory: 'nature', appCategory: 'travel_scenery' },
        { objectCategory: 'animals', appCategory: 'pets' },
        { objectCategory: 'food', appCategory: 'foods' }
      ];
      
      for (const priority of priorityCategories) {
        console.log(`🔍 检查优先级分类: ${priority.objectCategory} -> ${priority.appCategory}`);
        for (const prediction of allModelResults.mobileNetV3.predictions) {
          const confidence = prediction.probability || prediction.confidence || 0;
          console.log(`📊 检查预测: ${prediction.class} (${(confidence * 100).toFixed(1)}%)`);
          
          // 只处理置信度超过0.05的物体
          if (confidence <= 0.05) {
            console.log(`❌ 置信度过低，跳过: ${prediction.class} (${(confidence * 100).toFixed(1)}%)`);
            continue;
          }
          
          const mobileNetV3ClassInfo = this.configService.getMobileNetV3ClassByEnglishName(prediction.class);
          console.log(`🔍 获取类信息: ${prediction.class} ->`, mobileNetV3ClassInfo);
          
          if (mobileNetV3ClassInfo && mobileNetV3ClassInfo.category === priority.objectCategory) {
            console.log(`🔍 检测到${priority.objectCategory}相关物体: ${prediction.class} -> ${priority.appCategory} (${(confidence * 100).toFixed(1)}%)`);
            console.log(`✅ 直接归类为${priority.appCategory}: ${prediction.class}`);
            return priority.appCategory;
          }
        }
      }
      
      // 如果没有旅游风景相关物体，则使用置信度最高的预测结果
      const topPrediction = allModelResults.mobileNetV3.topPrediction;
      if (topPrediction && topPrediction.confidence > 0.3) { // 置信度阈值
        console.log(`🧠 MobileNetV3最高置信度分类: ${topPrediction.class} (${(topPrediction.confidence * 100).toFixed(1)}%)`);
        
        // 根据MobileNetV3的分类结果映射到应用分类
        const mappedCategory = this.mapMobileNetV3ToAppCategory(topPrediction.class);
        if (mappedCategory !== 'other') {
          console.log(`✅ MobileNetV3映射分类: ${topPrediction.class} -> ${mappedCategory}`);
          return mappedCategory;
        } else {
          console.log(`⚠️ MobileNetV3分类 ${topPrediction.class} 无法映射到应用分类`);
        }
      } else {
        console.log('❌ MobileNetV3最高置信度不足或不存在');
      }
    } else {
      console.log('❌ MobileNetV3分类结果不可用');
    }

    // 如果所有方法都无法确定分类，返回默认分类
    console.log('🔄 所有分类方法都无法确定，使用默认分类');
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
        console.log(`⚠️ 未找到MobileNetV3分类 "${mobileNetV3Class}" 的配置信息`);
        return 'other';
      }
      
      const objectCategory = mobileNetV3ClassInfo.category;
      console.log(`🔍 MobileNetV3分类 "${mobileNetV3Class}" 映射到物体分类: ${objectCategory}`);
      
      // 2. 通过物体分类映射到应用分类
      const objectMappings = this.configService.getObjectMappings();
      const appCategory = objectMappings[objectCategory];
      
      if (appCategory) {
        console.log(`✅ 物体分类 "${objectCategory}" 映射到应用分类: ${appCategory}`);
        return appCategory;
      } else {
        console.log(`⚠️ 未找到物体分类 "${objectCategory}" 的应用分类映射`);
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
   * @param {Object} imageDimensions - 图像尺寸 {width, height}
   * @returns {Promise<boolean>} 如果是手机截图返回true，否则返回false
   */
  async identifyMobileScreenshot(imageUri, imageDimensions) {
    try {
      // 使用传入的图像尺寸，避免重复加载图片
      const originalWidth = imageDimensions.width;
      const originalHeight = imageDimensions.height;
      
      console.log('📏 获取图片分辨率:', originalWidth, 'x', originalHeight);
      
      // 特征1：分辨率判定 - 宽高比<=0.5（手机竖屏比例，包括滚动截图）
      const aspectRatio = originalWidth / originalHeight;
      const isMobileResolution = aspectRatio <= 0.5;
      
      // 特征2：文件名判定 - 包含截图关键词
      const fileName = '';
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
    } catch (error) {
      console.warn('⚠️ 获取原始分辨率失败，跳过手机截图检测:', error.message);
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
