# 动态类别加载的YOLOv8n物体识别系统

## 需要安装的依赖

```bash
# 安装 ONNX Runtime (Node.js 版本)
npm install onnxruntime-node

# 或者安装 Web 版本 (如果在浏览器中运行)
npm install onnxruntime-web
```

## 模型文件准备

### 1. YOLOv8n 模型 (支持动态类别检测)
- 下载 YOLOv8n ONNX 模型文件
- 放置在 `./models/yolov8n0905.onnx`
- 系统会自动从模型中提取类别信息

### 2. 自定义模型 (可选)
- 训练自己的模型或下载特定领域的模型
- 放置在 `./models/custom_model.onnx`
- 支持任意数量的类别

## 使用方法

### 1. 基本物体检测 (自动加载类别)
```javascript
const classifier = new ImageClassifierService();

// 首次调用会自动加载模型并提取类别信息
const result = await classifier.detectObjects('path/to/image.jpg', {
  confidenceThreshold: 0.5,
  nmsThreshold: 0.4,
  maxDetections: 10
});
```

### 2. 智能分类（结合时间分类和YOLOv8n）
```javascript
const result = await classifier.smartClassifyImageWithYOLO('path/to/image.jpg', {
  timestamp: Date.now(),
  fileSize: 1024000,
  fileName: 'image.jpg'
});
```

### 3. 获取模型信息
```javascript
// 获取模型详细信息
const modelInfo = classifier.getModelInfo();
console.log('模型路径:', modelInfo.modelPath);
console.log('是否已加载:', modelInfo.isLoaded);
console.log('类别数量:', modelInfo.metadata.numClasses);
console.log('类别列表:', modelInfo.classes);

// 获取类别列表
const classNames = classifier.getClassNames();
console.log('所有类别:', classNames);

// 获取类别数量
const classCount = classifier.getClassCount();
console.log('类别数量:', classCount);

// 检查特定类别
const hasPerson = classifier.hasClass('person');
console.log('是否有人物类别:', hasPerson);

// 获取类别索引
const personIndex = classifier.getClassIndex('person');
console.log('人物类别索引:', personIndex);
```

### 4. 动态类别检测
```javascript
// 系统会自动从模型中检测类别数量
// 支持以下情况：
// - 80类COCO数据集模型
// - 自定义训练模型（任意类别数）
// - 带有元数据的模型（包含类别名称）

// 加载模型后可以查看检测到的类别
await classifier.loadYOLOModel();
const info = classifier.getModelInfo();
console.log('检测到', info.metadata.numClasses, '个类别');
```

## 功能特性

### 🎯 **动态类别检测**
- **自动检测**: 从模型输出形状自动推断类别数量
- **元数据支持**: 支持从模型元数据中提取类别名称
- **严格验证**: 无法提取类别信息时直接报错，确保模型兼容性
- **灵活适配**: 支持任意数量的类别（不限于80种）

### 🔍 **模型信息提取**
- **输出形状分析**: 自动分析模型输出维度
- **类别数量推断**: 根据输出形状计算类别数量
- **元数据解析**: 解析模型中的自定义元数据
- **详细信息提供**: 提供完整的模型和类别信息

### 🧠 **智能分类**
- **时间分类**: 基于拍摄时间的分类
- **物体检测**: 基于检测到的物体分类
- **智能回退**: 自动选择最佳分类方法
- **动态适配**: 根据模型类别自动调整分类逻辑

### ⚙️ **严格验证**
- **模型路径**: 可配置模型文件路径
- **类别管理**: 动态获取和管理类别信息
- **信息查询**: 提供丰富的模型和类别查询接口
- **严格验证**: 模型必须包含有效的类别信息，否则直接报错

## 支持的物体类别

### 动态类别检测
系统会自动从你的模型中检测和加载类别信息，支持：

#### 1. COCO数据集模型 (80种标准类别)
- **人物**: person
- **动物**: cat, dog, bird, horse, sheep, cow, elephant, bear, zebra, giraffe
- **食物**: banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake
- **交通工具**: car, motorcycle, airplane, bus, train, truck, boat
- **日常用品**: laptop, mouse, keyboard, cell phone, book, tv, chair, couch
- **更多**: 总共80种标准物体类别

#### 2. 自定义训练模型 (任意类别数)
- 支持你训练的任何模型
- 自动检测类别数量
- 从模型元数据中提取类别名称
- **必须包含类别元数据**，否则会报错

#### 3. 特定领域模型
- **医疗图像**: tumor, fracture, normal, etc.
- **工业检测**: crack, scratch, dent, normal, etc.
- **农业应用**: crop, weed, pest, disease, etc.
- **任何你需要的类别**

## 扩展方案

### 1. 使用不同版本的YOLO模型
```javascript
// 只需更改模型路径，系统会自动检测类别
classifier.yoloModelPath = './models/yolov8s.onnx'; // 更高精度
classifier.yoloModelPath = './models/yolov8m.onnx'; // 中等大小
classifier.yoloModelPath = './models/yolov8l.onnx'; // 更大模型
classifier.yoloModelPath = './models/yolov8x.onnx'; // 最大模型
```

### 2. 使用特定领域模型
```javascript
// 医疗图像检测模型
classifier.yoloModelPath = './models/medical_detection.onnx';
// 系统会自动检测医疗相关的类别

// 工业缺陷检测模型
classifier.yoloModelPath = './models/defect_detection.onnx';
// 系统会自动检测缺陷相关的类别

// 农业应用模型
classifier.yoloModelPath = './models/agriculture_detection.onnx';
// 系统会自动检测农作物相关的类别
```

### 3. 模型元数据支持
```javascript
// 如果你的模型包含类别元数据，系统会自动提取
// 模型元数据格式示例：
// {
//   "custom_metadata": {
//     "classes": "[\"tumor\", \"fracture\", \"normal\"]"
//   }
// }
```

## 注意事项

1. **模型文件**: 确保模型文件存在且路径正确 (`./models/yolov8n0905.onnx`)
2. **图片格式**: 支持常见图片格式 (jpg, png, webp, etc.)
3. **类别检测**: 系统会自动从模型中检测类别，无需手动配置
4. **性能考虑**: 模型加载会占用内存，建议按需加载
5. **严格验证**: 模型必须包含有效的类别信息，否则会直接报错
6. **模型兼容性**: 支持标准YOLOv8模型和包含类别元数据的自定义模型
7. **元数据要求**: 自定义模型必须包含类别元数据，格式如下：
   ```json
   {
     "custom_metadata": {
       "classes": "[\"class1\", \"class2\", \"class3\"]"
     }
   }
   ```
