# Android原生扫描职责划分（修订版）

## 一、职责划分原则

### 1.1 核心原则
- **原生层**：负责可以完全后台运行的任务（不依赖JS线程）
- **JS层**：负责需要ONNX Runtime或复杂业务逻辑的任务
- **混合协作**：通过事件+回调实现双向通信

### 1.2 关键约束
- ✅ **本地推理**：留在JS层（ONNX Runtime依赖）
- ✅ **相似度检测**：留在JS层（复杂业务逻辑）
- ✅ **其他任务**：尽量在原生层（实现真正后台）

---

## 二、详细职责划分

### 2.1 原生层职责（Android Native Layer）

#### ✅ 完全在原生层实现（漏斗式处理）

原生层采用**漏斗式处理**，逐步过滤和分类图片：

1. **目录扫描**
   - MediaStore API查询
   - 路径过滤
   - 文件信息收集
   - **输出**：图片列表（uri, fileName, size, timestamp等）

2. **EXIF数据提取**
   - 拍摄时间提取
   - GPS信息提取
   - 图片尺寸提取
   - **输出**：EXIF数据（takenTime, locationInfo, imageDimensions）

3. **文件比对**
   - 从数据库读取现有URI
   - 与扫描结果比对
   - 识别新增/删除文件
   - **输出**：{ deletedUris, newImages }

4. **数据库操作**
   - SQLite读写（完全控制）
   - 批量插入/更新
   - 事务管理

5. **截图检测**（第1层过滤）
   - 文件名规则判断
   - 尺寸判断
   - 路径判断
   - **输出**：是否为截图（boolean）
   - **分类结果**：截图 → `category = 'screenshot'`，非截图 → `category = 'NA'`（等待后续分类）

6. **哈希计算**
   - 多线程并行计算
   - SHA-256哈希
   - **输出**：图片哈希值

7. **远端缓存查询**（第2层过滤）
   - 查询远程API缓存（基于哈希值）
   - 如果命中缓存，直接使用缓存分类结果
   - **输出**：分类结果（category, confidence, detections等）
   - **分类结果**：缓存命中 → 保存分类，未命中 → `category = 'NA'`（继续等待）

8. **远程推理**（第3层过滤）
   - HTTP请求（OkHttp）
   - 图片上传（FormData）
   - 结果解析
   - **输出**：分类结果（category, confidence, detections等）
   - **分类结果**：推理成功 → 保存分类，失败 → `category = 'NA'`（最终交给JS层）

9. **前台服务管理**
   - 服务启动/停止
   - 通知更新
   - WakeLock管理

**漏斗处理流程**：
```
所有新图片
    ↓
[第1层：截图检测]
    ├─ 截图 → category = 'screenshot' ✅（完成）
    └─ 非截图 → category = 'NA'（继续）
        ↓
[第2层：远端缓存查询]
    ├─ 缓存命中 → 保存分类 ✅（完成）
    └─ 未命中 → category = 'NA'（继续）
        ↓
[第3层：远程推理]
    ├─ 推理成功 → 保存分类 ✅（完成）
    └─ 推理失败 → category = 'NA'（交给JS层）
        ↓
最终：category = 'NA' 的图片 → JS层本地推理
```

#### ⚠️ 任务转交（一次通知）

9. **扫描完成通知**
   - 完成所有原生层处理（目录扫描、EXIF提取、文件比对、截图检测、哈希计算、远程推理）
   - **发送一次事件通知JS层"扫描完成，可以开始后续处理了"**
   - **不等待结果**，原生层任务结束
   - **后续所有处理（本地推理、相似度检测）完全由JS层接管**

### 2.2 JS层职责（React Native Layer）

#### ✅ 完全在JS层实现（完全接管）

1. **监听扫描完成通知**
   - 监听原生层"扫描完成"事件（`GalleryScanCompleted`）
   - **收到通知后，完全接管后续所有处理**

2. **本地推理（JS层自主决定）**
   - **从数据库查询 `category = 'NA'` 的所有照片**
   - ONNX Runtime模型加载
   - 图片推理
   - 结果后处理
   - **保存结果到数据库**（直接写入）
   - **JS层自主决定何时执行，不依赖原生层**
   - **无需数据传递**：直接从数据库读取NA分类图片

3. **相似度检测（JS层自主决定）**
   - **从数据库读取所有照片**（或已分类照片，根据业务需求）
   - 特征提取
   - 相似度计算
   - 分组管理
   - **保存结果到数据库**（直接写入）
   - **JS层自主决定何时执行，不依赖原生层**
   - **无需数据传递**：直接从数据库读取所有照片

#### ✅ UI和交互

3. **扫描进度展示**
   - 接收进度事件
   - 更新UI显示
   - 用户交互反馈

4. **扫描控制**
   - 启动扫描（传递参数）
   - 停止扫描

5. **数据展示**
   - 读取数据库（只读）
   - 分类列表展示
   - 图片列表展示

6. **缓存管理**
   - 构建缓存（分类统计、相似组等）
   - 刷新缓存
   - 缓存生命周期管理

---

## 三、通信机制设计（简化方案）

### 3.1 通信方式

#### 方案：EventEmitter单向通知（简化方案）✅

**原生层 → JS层**：使用EventEmitter发送通知事件
**JS层**：独立处理，直接操作数据库，无需返回结果

**优点**：
- ✅ 设计简单，无需请求-响应匹配
- ✅ 无需等待，原生层可以继续执行或完成
- ✅ JS层完全独立，可以异步处理
- ✅ 降低耦合度

### 3.2 事件类型定义

#### 3.2.1 扫描进度事件（GalleryScanProgress）

**原生层发送原始数据，JS层复用processProgressData处理**

```typescript
interface RawScanProgressEvent {
  stage: string;              // 扫描阶段
  filesProcessed: number;     // 已处理文件数
  filesFound: number;         // 总文件数
  totalClassified?: number;   // 累计分类成功数
  totalImagesToProcess?: number; // 总处理数
}
```

#### 3.2.2 本地推理阶段通知事件（GalleryLocalInferenceReady）

**原生层通知JS层可以开始本地推理了**

```typescript
interface LocalInferenceReadyEvent {
  type: 'local_inference_ready';
  // 不需要传递图片数据，JS层自己从数据库读取
  // 不需要requestId，不需要等待响应
}
```

#### 3.2.3 相似度检测阶段通知事件（GallerySimilarityReady）

**原生层通知JS层可以开始相似度检测了**

```typescript
interface SimilarityReadyEvent {
  type: 'similarity_ready';
  // 不需要传递图片数据，JS层自己从数据库读取
  // 不需要requestId，不需要等待响应
}
```

### 3.3 JS层处理逻辑（独立处理）

#### 3.3.1 JS层完全接管后续处理

```typescript
// JS层：监听扫描完成通知，完全接管后续所有处理
scanEventEmitter.addListener('GalleryScanCompleted', async () => {
  logger.info('收到扫描完成通知，开始后续处理');
  
  // ========== 1. 本地推理（JS层自主决定） ==========
  const naImages = await UnifiedDataService.readImagesByCategory('NA');
  
  if (naImages.length > 0) {
    logger.info(`开始本地推理: ${naImages.length} 张NA分类图片`);
    
    // 加载ONNX模型（如果未加载）
    if (!imageClassifier.isInitialized) {
      await imageClassifier.initialize();
    }
    
    // 批量进行本地推理
    const batchSize = 5;
    for (let i = 0; i < naImages.length; i += batchSize) {
      const batch = naImages.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (image) => {
        const classification = await imageClassifier.classifyImage(image);
        if (classification.success) {
          // 直接保存结果到数据库
          await UnifiedDataService.batchUpdateClassification([{
            uri: image.uri,
            id: image.id,
            category: classification.categoryId || classification.category,
            confidence: classification.confidence,
            idCardDetections: classification.idCardDetections,
            generalDetections: classification.generalDetections,
            mobileNetV3Detections: classification.mobileNetV3Detections,
            message: classification.message
          }], false);
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    logger.info('本地推理完成');
  }
  
  // ========== 2. 相似度检测（JS层自主决定） ==========
  // 直接从数据库读取所有照片（不依赖任何数据传递）
  const allImages = await UnifiedDataService.readAllImages();
  // 过滤掉不需要相似度检测的分类（如tobecleaned、screenshot等）
  const imagesForSimilarity = allImages.filter(image => 
    image.category !== 'tobecleaned' && image.category !== 'screenshot'
  );
  
  if (imagesForSimilarity.length > 0) {
    logger.info(`开始相似度检测: ${imagesForSimilarity.length} 张图片`);
    
    // 执行相似度检测
    const result = await similarityService.detectSimilarImages({
      timeWindow: 300,
      similarityThreshold: 0.8,
      groupType: 'similar',
      images: imagesForSimilarity,
      clearExisting: true,
      onProgress: (processed, total, groups) => {
        // 进度更新（可选）
      }
    });
    
    // 结果已自动保存到数据库（similarityService内部处理）
    logger.info(`相似度检测完成: 发现 ${result.groups.length} 个相似组`);
  }
  
  logger.info('所有后续处理完成');
});
```

#### 3.3.2 JS层恢复检查机制

```typescript
// JS层：APP启动/恢复时检查未处理任务
import { AppState } from 'react-native';

class GalleryScanService {
  /**
   * 检查是否有未处理的后续任务
   */
  async checkPendingPostProcessing(): Promise<boolean> {
    try {
      // 1. 检查扫描状态
      const scanStatus = await UnifiedDataService.getSetting('scan_status');
      const needsPostProcessing = await UnifiedDataService.getSetting('scan_needs_post_processing');
      
      if (scanStatus === 'completed' && needsPostProcessing === 'true') {
        logger.info('检测到未处理的后续任务，开始执行...');
        
        // 2. 执行后续处理（复用上面的逻辑）
        await this.executePostProcessing();
        
        // 3. 清除标记
        await UnifiedDataService.updateSetting('scan_needs_post_processing', 'false');
        
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('检查后续任务失败:', error);
      return false;
    }
  }
  
  /**
   * 执行后续处理（本地推理、相似度检测）
   */
  private async executePostProcessing() {
    // 复用3.3.1中的逻辑
    // ...
  }
}

// APP启动时检查
useEffect(() => {
  const init = async () => {
    // 初始化服务...
    
    // 检查是否有未处理的后续任务
    await scanService.checkPendingPostProcessing();
  };
  
  init();
}, []);

// 监听APP前后台切换
AppState.addEventListener('change', async (nextAppState) => {
  if (nextAppState === 'active') {
    // APP回到前台，检查是否有未处理任务
    await scanService.checkPendingPostProcessing();
  }
});
```

---

## 四、扫描流程设计（混合方案）

### 4.1 完整扫描流程（极简版）

```
┌─────────────────────────────────────────────────────────┐
│                   原生层（后台运行）                      │
└─────────────────────────────────────────────────────────┘
         │
         │ 阶段1: 目录扫描（MediaStore）
         ▼
    [扫描图片列表]
         │
         │ 阶段2: 文件比对
         ▼
    [识别新增/删除]
         │
         │ 阶段3a: 截图检测
         ▼
    [保存截图分类到数据库]
         │
         │ 阶段3b: 缓存查询（远程API）
         ▼
    [保存缓存命中结果到数据库]
         │
         │ 阶段3c: 远程推理
         ▼
    [保存远程推理结果到数据库]
         │
         │ 阶段4: 更新数据库状态 + 发送通知（任务转交）
         │         ┌──────────────────────┐
         │         │ 1. 更新数据库状态     │
         │         │    scan_status = 'completed' │
         │         │    scan_needs_post_processing = 'true' │
         │         └──────────┬───────────┘
         │                    │
         │         ┌──────────▼───────────┐
         │         │ 2. 发送通知事件      │
         │         │ (GalleryScanCompleted) │
         │         │ (如果JS线程存在)     │
         │         └──────────┬───────────┘
         │                    │
         │         ┌──────────▼───────────┐
         │         │   JS层（完全接管）    │
         │         │   (如果JS线程存在)   │
         │         │                      │
         │         │  1. 本地推理          │
         │         │     - 读取NA图片      │
         │         │     - 执行推理        │
         │         │     - 保存结果        │
         │         │                      │
         │         │  2. 相似度检测        │
         │         │     - 读取图片        │
         │         │     - 特征提取        │
         │         │     - 相似度计算      │
         │         │     - 保存结果        │
         │         │                      │
         │         │  （JS层自主决定顺序） │
         │         └──────────────────────┘
         │
         │ （原生层任务结束，不等待）
         │
         │ 完成
         ▼
    [原生层扫描完成]

[如果JS线程被杀死，事件丢失]
    │
    └─ 状态已保存在数据库 ✅
    
[APP回到前台，JS线程恢复]
    │
    └─ JS层检查数据库状态 ✅
           │
           └─ 发现未处理任务，执行后续处理 ✅
```

### 4.2 关键设计点（极简版）

#### 4.2.1 任务转交流程

**原生层**：
1. 完成所有原生层处理（目录扫描、EXIF提取、文件比对、截图检测、哈希计算、远程推理）
2. **发送一次`GalleryScanCompleted`事件通知JS层**
3. **原生层任务结束，不等待任何结果**

**JS层**：
1. 监听`GalleryScanCompleted`事件
2. **完全接管后续所有处理**：
   - 自主决定何时执行本地推理
   - 自主决定何时执行相似度检测
   - 自主决定处理顺序
3. **所有操作都从数据库读取数据，直接保存结果到数据库**
4. **完全独立处理，不依赖原生层**

---

## 五、通信设计评估

### 5.1 现有设计是否满足需求？

#### ✅ 满足的部分（简化后）

1. **原生层 → JS层**（EventEmitter单向通知）
   - ✅ 进度更新：`GalleryScanProgress`
   - ✅ 本地推理通知：`GalleryLocalInferenceReady`（简单通知，无数据传递）
   - ✅ 相似度检测通知：`GallerySimilarityReady`（简单通知，无数据传递）
   - ✅ 数据更新通知：`GalleryDataUpdated`

2. **JS层 → 原生层**（Promise-based方法）
   - ✅ 启动扫描：`startScan()`
   - ✅ 停止扫描：`stopScan()`
   - ❌ ~~返回推理结果~~（不再需要，JS层直接保存）
   - ❌ ~~返回相似度结果~~（不再需要，JS层直接保存）

#### ✅ 简化后的优势

1. **无需请求-响应匹配**
   - ✅ 原生层只发送通知，不等待响应
   - ✅ JS层独立处理，不依赖原生层
   - ✅ 降低复杂度，减少出错可能

2. **无需数据传递**
   - ✅ JS层直接从数据库读取数据
   - ✅ 减少Bridge数据传输压力
   - ✅ 提升性能

3. **JS线程依赖（仍存在）**
   - **问题**：本地推理和相似度检测需要JS线程运行
   - **影响**：如果APP在后台，JS线程可能被杀死
   - **解决方案**：
     - 使用前台服务保持APP活跃
     - 引导用户添加到白名单
     - JS层处理失败不影响原生层扫描完成

### 5.2 简化后的实现

#### 5.2.1 原生层通知（极简实现）

```java
// 原生层：完成前3层后，发送通知
private void notifyLocalInferenceReady() {
    WritableMap eventData = Arguments.createMap();
    eventData.putString("type", "local_inference_ready");
    
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("GalleryLocalInferenceReady", eventData);
    
    // 不等待响应，继续执行或完成扫描
    Log.d(TAG, "已通知JS层开始本地推理");
}

private void notifySimilarityReady() {
    WritableMap eventData = Arguments.createMap();
    eventData.putString("type", "similarity_ready");
    
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("GallerySimilarityReady", eventData);
    
    // 不等待响应，完成扫描
    Log.d(TAG, "已通知JS层开始相似度检测");
}
```

#### 5.2.2 JS层处理（独立处理）

```typescript
// JS层：监听通知，独立处理
import GalleryScanService from './GalleryScanService';
import UnifiedDataService from './UnifiedDataService';
import ImageClassifierService from './ImageClassifierService';
import ImageSimilarityService from './ImageSimilarityService';

// 监听本地推理通知
GalleryScanService.onLocalInferenceReady(async () => {
  try {
    // 从数据库读取NA分类图片
    const naImages = await UnifiedDataService.readImagesByCategory('NA');
    
    if (naImages.length === 0) {
      logger.info('没有NA分类图片，跳过本地推理');
      return;
    }
    
    logger.info(`开始本地推理: ${naImages.length} 张图片`);
    
    // 加载模型并执行推理
    const imageClassifier = new ImageClassifierService();
    if (!imageClassifier.isInitialized) {
      await imageClassifier.initialize();
    }
    
    // 批量处理
    const batchSize = 5;
    for (let i = 0; i < naImages.length; i += batchSize) {
      const batch = naImages.slice(i, i + batchSize);
      
      const results = await Promise.all(
        batch.map(async (image) => {
          const classification = await imageClassifier.classifyImage(image);
          if (classification.success) {
            return {
              uri: image.uri,
              id: image.id,
              category: classification.categoryId || classification.category,
              confidence: classification.confidence,
              idCardDetections: classification.idCardDetections,
              generalDetections: classification.generalDetections,
              mobileNetV3Detections: classification.mobileNetV3Detections,
              message: classification.message
            };
          }
          return null;
        })
      );
      
      // 直接保存到数据库
      const validResults = results.filter(r => r !== null);
      if (validResults.length > 0) {
        await UnifiedDataService.batchUpdateClassification(validResults, false);
      }
    }
    
    logger.info('本地推理完成');
  } catch (error) {
    logger.error('本地推理失败:', error);
  }
});

// 监听相似度检测通知
GalleryScanService.onSimilarityReady(async () => {
  try {
    // 从数据库读取所有已分类图片
    const allImages = await UnifiedDataService.readAllImages();
    const imagesForSimilarity = allImages.filter(image => 
      image.category !== 'tobecleaned' && image.category !== 'screenshot'
    );
    
    if (imagesForSimilarity.length === 0) {
      logger.info('没有图片，跳过相似度检测');
      return;
    }
    
    logger.info(`开始相似度检测: ${imagesForSimilarity.length} 张图片`);
    
    // 执行相似度检测（内部会自动保存结果）
    const similarityService = new ImageSimilarityService();
    await similarityService.initialize();
    
    const result = await similarityService.detectSimilarImages({
      timeWindow: 300,
      similarityThreshold: 0.8,
      groupType: 'similar',
      images: imagesForSimilarity,
      clearExisting: true
    });
    
    logger.info(`相似度检测完成: 发现 ${result.groups.length} 个相似组`);
  } catch (error) {
    logger.error('相似度检测失败:', error);
  }
});
```

---

## 六、实施建议

### 6.1 分阶段实施

#### 阶段1：基础扫描功能（原生层）
- ✅ 目录扫描
- ✅ EXIF提取
- ✅ 文件比对
- ✅ 数据库操作
- ✅ 截图检测
- ✅ 远程推理

#### 阶段2：JS层独立处理（简化）
- ✅ 监听通知事件
- ✅ 从数据库读取数据
- ✅ 执行本地推理/相似度检测
- ✅ 保存结果到数据库

#### 阶段3：优化和完善
- ✅ 断点续传
- ✅ 性能优化
- ✅ 错误恢复

### 6.2 关键成功因素（简化后）

1. **简单通知机制**：原生层只发送通知，不等待响应
2. **JS层独立性**：JS层完全独立处理，不依赖原生层
3. **数据库共享**：原生层和JS层共享数据库，通过数据库通信
4. **错误隔离**：JS层处理失败不影响原生层扫描完成

---

## 七、总结

### 7.1 职责划分总结（极简版）

| 功能 | 原生层 | JS层 | 通信方式 |
|------|--------|------|----------|
| 目录扫描 | ✅ | - | - |
| EXIF提取 | ✅ | - | - |
| 文件比对 | ✅ | - | - |
| 数据库操作 | ✅ 写入 | ✅ 只读+写入 | 共享数据库 |
| 截图检测 | ✅ | - | - |
| 哈希计算 | ✅ | - | - |
| 远程推理 | ✅ | - | - |
| 扫描完成通知 | ✅ 一次通知 | ✅ 接收通知 | EventEmitter（单向通知） |
| 本地推理 | - | ✅ 完全接管 | JS层自主决定 |
| 相似度检测 | - | ✅ 完全接管 | JS层自主决定 |
| 缓存管理 | - | ✅ | - |

### 7.2 通信设计评估（简化版）

**✅ 简化后的设计完全满足需求**

**优势**：
- ✅ **极简设计**：原生层只发送一次通知，不等待响应
- ✅ **无需匹配**：不需要请求-响应匹配机制
- ✅ **无需传递数据**：JS层直接从数据库读取
- ✅ **降低耦合**：JS层完全独立，不依赖原生层
- ✅ **完全接管**：JS层自主决定后续处理顺序和时机
- ✅ **错误隔离**：JS层处理失败不影响原生层扫描完成

**通信方式**：
- EventEmitter：原生层 → JS层（一次通知：`GalleryScanCompleted`）
- 数据库：原生层 ↔ JS层（共享数据库，通过数据库通信）

### 7.3 后台运行机制 ⭐

#### 7.3.1 原生层后台运行能力 ✅

**关键问题**：APP切换到后台，JS线程被杀死，原生层还能后台扫描吗？

**答案**：✅ **可以！原生层完全独立运行**

**机制保证**：
1. **Foreground Service**：`ScanForegroundService`前台服务保证原生层不被系统杀死
2. **WakeLock**：防止CPU休眠，保证扫描任务持续执行
3. **独立线程**：扫描逻辑在原生层独立线程执行，不依赖JS线程

**结论**：原生层可以完全独立后台运行，即使JS线程被杀死也不影响扫描

#### 7.3.2 事件发送机制 ⚠️

**当JS线程被杀死时**：
- ✅ **原生层继续执行**：事件发送失败不影响原生层扫描任务
- ⚠️ **事件可能丢失**：如果JS线程不存在，`GalleryScanCompleted`事件会被丢弃
- ✅ **不抛异常**：React Native的EventEmitter不会因为JS线程不存在而抛异常

**影响**：
- 进度更新事件丢失 → **不影响**（原生层继续扫描）
- 扫描完成通知丢失 → **需要处理**（JS层恢复时需要检查）

#### 7.3.3 任务移交恢复机制 ✅

**解决方案**：数据库状态标记 + JS层恢复检查

**设计**：
1. **原生层**：扫描完成时更新数据库状态
   ```sql
   -- 在settings表中标记
   scan_status = 'completed'
   scan_needs_post_processing = 'true'
   ```

2. **JS层**：APP恢复时检查数据库状态
   - APP启动时检查
   - APP从后台回到前台时检查
   - 如果发现`scan_needs_post_processing = 'true'`，执行后续处理

**流程**：
```
原生层完成扫描
    │
    ├─ 更新数据库状态 ✅
    ├─ 尝试发送事件（可能失败）⚠️
    └─ 原生层任务结束

[APP回到前台]
    │
    └─ JS层检查数据库状态 ✅
           │
           └─ 发现未处理任务，执行后续处理 ✅
```

### 7.4 风险与缓解（完整版）

| 风险 | 影响 | 缓解措施 | 优先级 |
|------|------|----------|--------|
| JS线程被杀死 | 事件丢失，任务移交失败 | **数据库状态标记 + JS层恢复检查** | 高 |
| 原生层后台运行 | 系统可能杀死服务 | Foreground Service + WakeLock + 白名单 | 中 |
| 数据库并发访问 | 数据不一致 | WAL模式+单例连接 | 中 |
| JS层处理延迟 | 用户体验 | 不影响原生层扫描完成 | 低 |

