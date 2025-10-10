# 远程图片分类功能使用说明

## 📋 功能概述

ImageClassifierService 现在支持三种分类模式：

1. **本地分类** - `classifyImage(imageUri)` - 使用本地ONNX模型
2. **远程分类** - `classifyImageRemote(imageInput, options)` - 调用后端API
3. **混合分类** - `classifyImageHybrid(imageInput, options)` - 自动选择最佳方式

## 🚀 快速开始

### 1. 基础使用：远程分类

```javascript
import ImageClassifierService from './services/ImageClassifierService';

const classifier = new ImageClassifierService();
await classifier.initialize();

// 分类图片（从文件）
const result = await classifier.classifyImageRemote(imageFile, {
  checkHealthFirst: true  // 首次调用时检查健康状态（可选）
  // 缓存查询是强制使用的，无需指定
});

console.log('分类结果:', {
  categoryId: result.categoryId,         // "foods"
  confidence: result.confidence,         // 0.92
  message: result.message                // "一盘美味的意大利面" (AI描述)
});
```

### 2. 高级使用：混合分类

```javascript
// 优先使用远程分类，失败时自动降级到本地分类
const result = await classifier.classifyImageHybrid(imageFile, {
  preferRemote: true,      // 优先使用远程
  fallbackToLocal: true    // 失败时降级到本地
});

console.log('分类方法:', result.classificationMethod);  // "remote" 或 "local"
console.log('分类结果:', result.categoryId);
```

## 📊 API详细说明

### checkHealth()

检查后端服务健康状态

```javascript
const health = await classifier.checkHealth();

if (health.available) {
  console.log('✅ 服务可用');
  console.log('状态:', health.status);
  console.log('数据库:', health.database);
  console.log('模型API:', health.modelApi);
} else {
  console.warn('⚠️ 服务不可用:', health.reason);
}
```

**返回值**：
```javascript
{
  available: boolean,      // 是否可用
  status: string,         // "healthy" 或 "unhealthy"
  database: string,       // "connected" 或 "disconnected"
  modelApi: string,       // "available" 或 "not_configured"
  timestamp: string,      // ISO时间戳
  reason?: string         // 不可用原因（如果不可用）
}
```

### calculateSHA256(imageFile)

计算图片的SHA-256哈希值

```javascript
const hash = await classifier.calculateSHA256(imageFile);
console.log('哈希:', hash);  // "a1b2c3d4e5f6..."
```

### checkCache(imageHash, clientId)

查询缓存

```javascript
const clientId = await UnifiedDataService.getClientId();
const cacheResult = await classifier.checkCache(imageHash, clientId);

if (cacheResult.cached) {
  console.log('✅ 缓存命中:', cacheResult.data);
} else {
  console.log('❌ 缓存未命中');
}
```

### uploadAndClassify(imageFile, imageHash, clientId)

上传图片并分类

```javascript
const result = await classifier.uploadAndClassify(imageFile, imageHash, clientId);

if (result.success) {
  console.log('分类结果:', result.data);
}
```

### classifyImageRemote(imageInput, options)

完整的远程分类流程（推荐使用）

**参数**：
- `imageInput` - 图片文件（File/Blob）或URI（string）
- `options` - 选项对象（可选）
  - `checkHealthFirst` - 是否先检查健康状态（首次调用建议true，默认false）

**注意**：缓存查询是强制启用的，总是会先查询缓存再上传图片，以节省带宽和时间

**返回值**（完全兼容本地分类格式）：
```javascript
{
  // 与本地分类完全相同的字段
  success: boolean,              // 是否成功
  categoryId: string,            // 分类ID (如 "foods")
  confidence: number,            // 置信度 (0-1)
  message: string,               // ⭐ AI生成的描述（远程）或普通消息（本地）
  idCardDetections: [],          // 空数组
  generalDetections: [],         // 空数组
  mobileNetV3Detections: [],     // 空数组
  imageDimensions: null,         // null
  allModelResults: {},           // 空对象
  error?: string                 // 错误信息（如果失败）
}
```

**关键点**：
- ✅ **完全兼容**：与本地分类 `classifyImage()` 返回结构 100% 兼容
- ✅ **无缝替换**：可以直接替换本地分类方法，无需修改调用代码
- ⭐ **唯一区别**：远程分类的 `message` 字段包含 AI 生成的图片描述
  - 本地分类：`message = "图像分类完成"`
  - 远程分类：`message = "一盘美味的意大利面"` (AI描述)

### classifyImageHybrid(imageInput, options)

混合分类策略（推荐）

**参数**：
- `imageInput` - 图片文件（File/Blob）或URI（string）
- `options` - 选项对象
  - `preferRemote` - 优先使用远程（默认true）
  - `fallbackToLocal` - 失败时降级到本地（默认true）

**返回值**：与 `classifyImageRemote` 相同，额外包含：
- `classificationMethod` - "remote" 或 "local"

## 🎯 使用场景

### 场景1：应用启动时检查服务

```javascript
// 在 App.desktop.js 或应用初始化代码中
async function initApp() {
  const classifier = new ImageClassifierService();
  await classifier.initialize();
  
  // 检查远程服务可用性
  const health = await classifier.checkHealth();
  
  if (health.available) {
    console.log('✅ 远程分类服务可用');
    // 启用远程分类功能
    window.remoteClassificationEnabled = true;
  } else {
    console.warn('⚠️ 远程分类服务不可用，将使用本地分类');
    window.remoteClassificationEnabled = false;
  }
}
```

### 场景2：扫描时使用混合分类

```javascript
// 在 GalleryScannerService.js 中
async function classifyImageInScan(imageUri) {
  const classifier = new ImageClassifierService();
  await classifier.initialize();
  
  // 使用混合分类：优先远程，失败时降级到本地
  const result = await classifier.classifyImageHybrid(imageUri, {
    preferRemote: true,
    fallbackToLocal: true
  });
  
  console.log('分类结果:', result.categoryId);
  console.log('分类方式:', result.classificationMethod);  // "remote" 或 "local"
  
  return result.categoryId;
}
```

### 场景3：单张图片分类（用户手动触发）

```javascript
// 在用户上传图片时
async function handleImageUpload(file) {
  const classifier = new ImageClassifierService();
  await classifier.initialize();
  
  try {
    // 首次调用时检查健康状态
    const result = await classifier.classifyImageRemote(file, {
      checkHealthFirst: true
    });
    
    if (result.success) {
      // 显示结果给用户
      showNotification({
        title: '分类完成',
        message: `类别：${result.categoryId}\n置信度：${(result.confidence * 100).toFixed(1)}%\n描述：${result.message}`
      });
    } else {
      // 显示错误
      showError('分类失败: ' + result.error);
    }
    
  } catch (error) {
    showError('分类失败: ' + error.message);
  }
}
```

## ⚡ 性能优化建议

### 1. 首次调用时检查健康状态

```javascript
let serviceChecked = false;

async function classifyWithCheck(imageFile) {
  if (!serviceChecked) {
    const health = await classifier.checkHealth();
    if (!health.available) {
      console.warn('远程服务不可用，使用本地分类');
      return await classifier.classifyImage(imageUri);
    }
    serviceChecked = true;
  }
  
  return await classifier.classifyImageRemote(imageFile);
}
```

### 2. 批量分类时的缓存优势

```javascript
// 扫描1000张图片，缓存会自动优化性能
async function batchClassify(imageFiles) {
  const results = [];
  
  for (const file of imageFiles) {
    const result = await classifier.classifyImageRemote(file);
    results.push(result);
  }
  
  console.log(`分类完成: ${results.length} 张图片`);
  console.log('缓存查询已自动优化，节省了带宽和时间');
  
  return results;
}
```

### 3. 错误处理和重试

```javascript
async function classifyWithRetry(imageFile, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const result = await classifier.classifyImageRemote(imageFile);
      
      if (result.success) {
        return result;
      }
      
      if (i < maxRetries - 1) {
        console.warn(`分类失败，重试 ${i + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
      
    } catch (error) {
      if (i === maxRetries - 1) {
        // 最后一次也失败，降级到本地分类
        console.warn('远程分类失败，降级到本地');
        return await classifier.classifyImage(imageUri);
      }
    }
  }
}
```

## 🔧 集成到现有扫描流程

### 修改 GalleryScannerService

```javascript
// 在处理单张图片时
async processImage(imageInfo) {
  const classifier = new ImageClassifierService();
  await classifier.initialize();
  
  // 使用混合分类
  const result = await classifier.classifyImageHybrid(imageInfo.uri, {
    preferRemote: true,      // 优先使用远程
    fallbackToLocal: true    // 失败时用本地
  });
  
  // 保存分类结果
  imageInfo.category = result.categoryId;
  imageInfo.confidence = result.confidence;
  imageInfo.classificationMethod = result.classificationMethod;
  
  // message 字段包含 AI 生成的描述
  if (result.message && result.message !== '图像分类完成') {
    imageInfo.description = result.message;
  }
  
  return imageInfo;
}
```

## 📊 监控和日志

所有方法都包含详细的日志输出：

```
🏥 检查后端服务健康状态...
✅ 服务健康检查完成
🆔 客户端ID: a1b2c3d4-...
🔑 计算图片哈希...
🔑 哈希: a1b2c3d4e5f6...
🔍 查询缓存...
✅ 缓存命中！
⬆️  上传图片分类...
✅ 分类完成: foods
```

## ⚠️ 注意事项

1. **自动使用客户端ID**：所有远程方法会自动获取并使用客户端唯一ID
2. **超时设置**：默认30秒超时，可在 `getAPIConfig()` 中修改
3. **错误处理**：所有方法都包含完整的错误处理
4. **缓存优化**：默认启用缓存查询，节省带宽和时间
5. **混合策略**：推荐使用 `classifyImageHybrid()`，自动选择最佳方式

## 🎯 推荐使用方式

### 在扫描大量图片时

使用混合分类策略，自动平衡速度和准确性：

```javascript
const result = await classifier.classifyImageHybrid(imageUri);
```

### 在处理单张用户上传图片时

使用纯远程分类，获得AI生成的描述：

```javascript
const result = await classifier.classifyImageRemote(imageFile, {
  checkHealthFirst: true
});

// 显示AI生成的描述（在 message 字段中）
showDescription(result.message);
```

---

**现在您的应用同时具备本地和远程分类能力！** 🎉

