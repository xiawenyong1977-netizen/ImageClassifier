import UnifiedDataService from './UnifiedDataService.js';

class ImageClassifierService {
  constructor() {
    this.isInitialized = false;
    // Supported categories - 从 UnifiedDataService 获取
    this.categories = UnifiedDataService.getAllCategoryIds();
    
    // Multi-model configuration for ID card and general detection
    // 根据环境自动选择模型路径
    const isWebEnvironment = typeof window !== 'undefined' && window.location;
    const isDevelopment = isWebEnvironment && window.location.hostname === 'localhost';
    const modelBasePath = isDevelopment ? 'http://localhost:3000/models' : './models';
    
    this.models = {
      idCard: {
        model: null,
        path: `${modelBasePath}/id_card_detection.onnx`,
        classes: [
          'id_card_front',  // 身份证正面 - 类别ID: 0
          'id_card_back'    // 身份证背面 - 类别ID: 1
        ],
        metadata: null,
        priority: 1, // 高优先级，先检测
        description: '身份证识别专用模型'
      },
      yolo8s: {
        model: null,
        path: `${modelBasePath}/yolov8s.onnx`,
        classes: [
          'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
          'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
          'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
          'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
          'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
          'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
          'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
          'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
          'hair drier', 'toothbrush'
        ],
        metadata: null,
        priority: 2, // 低优先级，后检测
        description: '通用物体检测模型'
      }
    };
    
    
  }

  // Initialize service
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      // 加载所有模型
      const loadResults = await this.loadMultipleModels(['idCard', 'yolo8s']);
      
      // 检查加载结果
      const failedModels = Object.entries(loadResults)
        .filter(([name, result]) => !result.success)
        .map(([name, result]) => `${name}: ${result.error}`);
      
      if (failedModels.length > 0) {
        // 如果有模型加载失败，抛出错误而不是继续
        throw new Error(`模型加载失败: ${failedModels.join(', ')}`);
      }
      
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
          const path = await import('path');
          
          if (!fs.existsSync(modelConfig.path)) {
            throw new Error(`${modelName} model file not found: ${modelConfig.path}`);
          }
        } catch (error) {
        }
      }

        // 加载ONNX模型
        // 根据环境选择不同的 ONNX Runtime
        let ort;
        if (typeof window !== 'undefined') {
          // 浏览器环境
          ort = await import('onnxruntime-web');
          // 在浏览器环境中，onnxruntime-web 的默认导出就是 ort
          ort = ort.default || ort;
        } else {
          // Node.js 环境
          ort = await import('onnxruntime-node');
        }
        
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

 



  // Preprocess image for YOLOv8n
  async preprocessImage(imageData, inputSize = 640) {
    try {
      // 导入 ONNX Runtime
      let ort;
      if (typeof window !== 'undefined') {
        // 浏览器环境
        ort = await import('onnxruntime-web');
        ort = ort.default || ort;
      } else {
        // Node.js 环境
        ort = await import('onnxruntime-node');
      }
      
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
  async postprocessYOLOOutput(output, confidenceThreshold = 0.3, nmsThreshold = 0.4, classes = null) {
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
      
      // 安全地计算数据范围，避免栈溢出
      const sampleData = Array.from(predictions.data.slice(0, 100));
      const minValue = sampleData.reduce((min, val) => Math.min(min, val), Infinity);
      const maxValue = sampleData.reduce((max, val) => Math.max(max, val), -Infinity);
      
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
  mapDetectionsToCategories(detections) {
    const categoryMapping = {
      // 身份证相关 -> idcard
      'id_card_front': 'idcard',
      'id_card_back': 'idcard',
      
      // 人物相关 -> people
      'person': 'people',
      
      // 宠物相关 -> pet
      'cat': 'pet',
      'dog': 'pet',
      'bird': 'pet',
      'horse': 'pet',
      'sheep': 'pet',
      'cow': 'pet',
      'elephant': 'pet',
      'bear': 'pet',
      'zebra': 'pet',
      'giraffe': 'pet',
      
      // 生活用品 -> life
      'bottle': 'life',
      'wine glass': 'life',
      'cup': 'life',
      'fork': 'life',
      'knife': 'life',
      'spoon': 'life',
      'bowl': 'life',
      'tv': 'life',
      'couch': 'life',
      'bed': 'life',
      'dining table': 'life',
      'toilet': 'life',
      'microwave': 'life',
      'oven': 'life',
      'toaster': 'life',
      'sink': 'life',
      'refrigerator': 'life',
      'clock': 'life',
      'vase': 'life',
      'scissors': 'life',
      'teddy bear': 'life',
      'hair drier': 'life',
      'toothbrush': 'life',
      
      // 食物相关 -> food
      'banana': 'food',
      'apple': 'food',
      'sandwich': 'food',
      'orange': 'food',
      'broccoli': 'food',
      'carrot': 'food',
      'hot dog': 'food',
      'pizza': 'food',
      'donut': 'food',
      'cake': 'food',
      
      // 工作文档 -> document
      'laptop': 'document',
      'mouse': 'document',
      'keyboard': 'document',
      'cell phone': 'document',
      'book': 'document',
      
      // 交通工具 -> travel
      'car': 'travel',
      'motorcycle': 'travel',
      'airplane': 'travel',
      'bus': 'travel',
      'train': 'travel',
      'truck': 'travel',
      'boat': 'travel',
      'bicycle': 'travel',
      
      // 游戏相关 -> game
      'sports ball': 'game',
      'frisbee': 'game',
      'skis': 'game',
      'snowboard': 'game',
      'kite': 'game',
      'baseball bat': 'game',
      'baseball glove': 'game',
      'skateboard': 'game',
      'surfboard': 'game',
      'tennis racket': 'game',
      
      // 其他 -> other
      'traffic light': 'other',
      'fire hydrant': 'other',
      'stop sign': 'other',
      'parking meter': 'other',
      'bench': 'other',
      'backpack': 'other',
      'umbrella': 'other',
      'handbag': 'other',
      'tie': 'other',
      'suitcase': 'other',
      'potted plant': 'other',
      'chair': 'other'
    };

    const categoryScores = {};
    
    detections.forEach(detection => {
      const mappedCategory = categoryMapping[detection.class] || 'other';
      const confidence = detection.confidence;
      
      if (!categoryScores[mappedCategory]) {
        categoryScores[mappedCategory] = 0;
      }
      
      // 使用最高置信度作为该分类的分数
      categoryScores[mappedCategory] = Math.max(categoryScores[mappedCategory], confidence);
    });

    // 找到最高分的分类
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

      // 使用智能推理检测
      const detectionResult = await this.smartDetectObjects(imageUri, {
        idCardConfidenceThreshold: 0.7,  // 提高身份证检测阈值，减少误检
        generalConfidenceThreshold: 0.5,
        nmsThreshold: 0.4,
        maxDetections: 10
      });

      let result;
      if (detectionResult.success && detectionResult.detections.length > 0) {
        // 根据检测结果进行分类
        const category = this.mapDetectionsToCategories(detectionResult.detections);
        const confidence = Math.max(...detectionResult.detections.map(d => d.confidence));
        
        // 分离身份证检测结果和通用模型检测结果
        const idCardDetections = detectionResult.detections.filter(d => 
          d.class === 'id_card_front' || d.class === 'id_card_back'
        );
        const generalDetections = detectionResult.detections.filter(d => 
          d.class !== 'id_card_front' && d.class !== 'id_card_back'
        );
        
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
          generalDetections: generalDetections
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
          generalDetections: []
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



  // 多模型管理功能
  async loadMultipleModels(modelNames = ['yolo8s']) {
    
    const results = {};
    for (const modelName of modelNames) {
      try {
        await this.loadModel(modelName);
        results[modelName] = { success: true, error: null };
      } catch (error) {
        results[modelName] = { success: false, error: error.message };
        console.error(`❌ ${modelName} failed to load:`, error.message);
      }
    }
    
    return results;
  }

 

  // 卸载模型
  unloadModel(modelName) {
    if (!this.models[modelName]) {
      throw new Error(`Unknown model: ${modelName}`);
    }
    
    this.models[modelName].model = null;
    this.models[modelName].classes = null;
    this.models[modelName].metadata = null;
    
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
  async detectObjectsWithModel(imageUri, modelName, options = {}) {
    if (!this.models[modelName] || !this.models[modelName].model) {
      throw new Error(`Model ${modelName} not loaded`);
    }
    
    const {
      confidenceThreshold = 0.3,
      nmsThreshold = 0.4,
      maxDetections = 10
    } = options;


    const modelConfig = this.models[modelName];

    // 预处理图片
    const inputTensor = await this.preprocessImage(imageUri);
    
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
      processingTime: Date.now()
    };
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
      const idCardResult = await this.detectObjectsWithModel(imageUri, 'idCard', {
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
        const generalResult = await this.detectObjectsWithModel(imageUri, 'yolo8s', {
          confidenceThreshold: generalConfidenceThreshold, // 使用配置的阈值
          nmsThreshold,
          maxDetections
        });

        results.usedModels.push('yolo8s');
        results.detections = generalResult.detections;
        results.totalDetections = generalResult.totalDetections;
        results.reasoning += '未检测到身份证，使用通用模型检测；';
        results.success = true;
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
}

export default ImageClassifierService;
