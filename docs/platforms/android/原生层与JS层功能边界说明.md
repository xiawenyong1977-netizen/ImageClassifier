# 原生层与JS层功能边界说明

## 一、整体架构

### 扫描流程概览
```
JS层启动扫描
    ↓
原生层执行（Android平台）
    ├─ 阶段1: 目录扫描（MediaStore API）
    ├─ 阶段2: 文件比对（与数据库比对）
    ├─ 阶段3a: 截图检测
    ├─ 阶段3b: 远端缓存查询
    └─ 阶段3c: 远程推理
    ↓
原生层发送完成事件到JS层
    ↓
JS层接收完成事件，开始后续处理
    ├─ 阶段4: 位置信息补全（降级处理）
    │   └─ 对原生层未获取到位置信息的图片进行降级处理
    ├─ 阶段5: 本地推理和规则映射（NA分类图片）
    │   ├─ 检查是否已有推理结果
    │   ├─ 如果没有，进行本地ONNX模型推理
    │   └─ 应用规则映射确定最终分类
    └─ 阶段6: 相似度检测
        └─ 检测相似图片并分组
    ↓
JS层更新UI，扫描完全结束
```

## 二、原生层功能职责

### 2.1 核心功能模块

#### **GalleryScanService（核心扫描服务）**
- **位置**: `android/app/src/main/java/com/imageclassifier/v2/GalleryScanService.java`
- **职责**: 完整的扫描流程实现

#### **GalleryScanModule（React Native桥接模块）**
- **位置**: `android/app/src/main/java/com/imageclassifier/v2/GalleryScanModule.java`
- **职责**: 暴露给JS层的接口

### 2.2 原生层负责的功能

#### ✅ **阶段1: 目录扫描**
- 使用 Android MediaStore API 扫描设备图片
- 支持按路径过滤（相对路径，如 "DCIM/Camera"）
- 提取图片基本信息：ID、URI、文件名、大小、时间戳、尺寸、MIME类型等
- **输出**: `List<ImageInfo>` - 所有扫描到的图片列表

#### ✅ **阶段2: 文件比对**
- 与数据库中的图片进行比对
- 识别新增图片和已删除图片
- 支持 `compareLimit` 参数限制比对数量（性能优化）
- **输出**: 
  - `newImages`: 新增图片列表
  - `deletedUris`: 已删除图片URI列表

#### ✅ **阶段3a: 截图检测**
- 基于文件名、路径、宽高比判断是否为截图
- 使用EXIF数据优化判断（有GPS信息则不是截图）
- 提取EXIF数据（包括GPS坐标）
- **位置信息获取（简化版本）**：
  - 如果有API URL，尝试调用远程API获取位置信息
  - 仅调用远程API `/api/v1/location/nearby-cities`，不进行本地查询
  - 如果获取成功，直接保存位置信息到数据库
  - 如果获取失败，不保存位置信息，留给JS层处理（降级策略）
- 截图直接分类为 `screenshot`，非截图分类为 `NA`
- **输出**: `List<ImageInfo>` - 非截图图片列表（需要进一步处理）

#### ✅ **阶段3b: 远端缓存查询**
- **分批处理**: 按100张图片分批处理（降低内存占用）
- **Hash计算**: 批量并行计算图片Hash值
- **数据结构**: 
  - `hashToUriMap`: Hash → URI列表（支持一个Hash对应多个URI）
  - `uriToHashMap`: URI → Hash（反向查找）
- **远程查询**: 调用缓存API批量查询
- **结果处理**: 缓存命中时直接保存分类结果到数据库
- **输出**: 
  - `naImages`: 缓存未命中的图片列表（需要远程推理）
  - `hitCount`: 缓存命中数量（用于统计和日志）
- **注意**: 缓存命中的图片已直接保存到数据库，不需要返回图片列表

#### ✅ **阶段3c: 远程推理**
- **分批处理**: 按20张图片分批处理（与JS层保持一致）
- **图片上传**: 使用 `multipart/form-data` 格式上传图片文件
- **Hash上传**: 仅上传已有的Hash（不强制计算，避免性能开销）
- **结果处理**: 
  - 大模型推理：直接保存分类结果到数据库
  - 小模型推理：保存原始检测数据，分类设为 `NA`（由JS层后续映射）
- **输出**: 
  - `successCount`: 推理成功数量（用于统计和日志）
  - `failedCount`: 推理失败数量（用于统计和日志）
- **注意**: 推理成功的图片已直接保存到数据库，不需要返回图片列表

#### ✅ **数据库操作**
- 使用 `ImageDataService` 进行数据库读写
- **保存新图片的完整信息**（`writeImageDetailedInfo`）
  - 支持插入新图片和更新现有图片（`INSERT OR REPLACE`）
  - 保存完整的图片信息：基础信息（URI、文件名、尺寸、时间戳等）、EXIF数据（GPS坐标）、位置信息、分类信息等
  - **使用场景**: 截图检测阶段，保存新发现的图片的完整信息
- **批量更新分类信息**（`batchUpdateClassification`）
  - 只更新已存在图片的分类相关字段（`UPDATE`）
  - 更新字段：分类、置信度、检测结果（idCardDetections、generalDetections、mobileNetV3Detections）、消息等
  - 如果图片不存在，更新会失败
  - **使用场景**: 缓存查询和远程推理阶段，更新已存在图片的分类信息
- 删除已删除的图片（`removeImagesByUris`）
- 查询NA分类的图片（`getImagesByCategory`）

#### ✅ **事件发送**
- 进度事件：`GalleryScanProgress`
  - `stage`: 当前阶段（screenshot_detection, cache_check, remote_inference）
  - `filesProcessed`: 当前阶段已处理数量
  - `filesFound`: 当前阶段总数量
  - `totalImagesToBeClassified`: 总需要分类的图片数
  - `imagesClassified`: 已分类成功的图片数
  - `scanId`: 扫描任务ID
- 完成事件：`GalleryScanCompleted`
- 错误事件：`GalleryScanError`

### 2.3 原生层不负责的功能

#### ❌ **分类映射逻辑**
- 小模型推理结果的分类映射（如 `mapDetectionsToCategory`）
- 原因：依赖配置文件，逻辑复杂，JS层更灵活

#### ✅ **EXIF数据提取**
- 原生层提取APP需要的所有EXIF数据：
  - **GPS坐标**：纬度、经度、海拔高度（用于位置信息获取）
  - **拍摄时间**：从EXIF的DATETIME_ORIGINAL、DATETIME、DATETIME_DIGITIZED中提取
  - **图片尺寸**：宽度和高度（从EXIF的IMAGE_WIDTH和IMAGE_LENGTH中提取）
- **优先级策略**：
  - 拍摄时间：优先使用EXIF中的拍摄时间，如果没有则使用MediaStore的时间
  - 图片尺寸：优先使用EXIF中的尺寸，如果没有则使用MediaStore的尺寸
  - GPS坐标：直接从EXIF中提取（MediaStore不提供GPS信息）
- JS层在需要时可以提取其他EXIF数据（如相机信息、ISO等），但APP核心功能所需的数据已在原生层提取完成

#### ❌ **本地模型推理**
- 原生层不进行本地ONNX模型推理
- 原因：JS层已有完整的本地推理实现

#### ❌ **相似度检测**
- 原生层不进行相似度检测
- 原因：JS层已有相似度检测逻辑

## 三、JS层功能职责

### 3.1 JS层负责的功能

#### ✅ **扫描流程协调**
- 调用原生层启动扫描
- 监听原生层发送的事件
- 更新UI显示扫描进度
- **原生层扫描完成后，JS层接管后续处理任务**

#### ✅ **阶段4: 位置信息补全**（原生层扫描完成后）
- **降级处理**：处理原生层未获取到位置信息的图片
- 查询数据库中有GPS坐标但没有位置信息的图片（`latitude` 和 `longitude` 存在，但 `city` 或 `country` 缺失）
- **注意**：原生层在阶段3a已尝试获取位置信息，JS层只处理原生层未获取到的图片
- 使用GPS坐标查询地理位置信息（城市、国家等）
  - 优先使用远程API查询（`cityLocationService.findNearestCityAsync`）
  - 如果远程API失败，自动降级为本地查询（使用本地城市数据库）
- 并发处理：使用 `Promise.all` 并发查询每批内的图片位置信息
- 批量更新图片的位置信息到数据库
- **目的**: 补全原生层未获取到的图片地理位置元数据

#### ✅ **阶段5: 本地推理和规则映射**（NA分类图片，合并阶段）
- 查询数据库中所有分类为 `NA` 的图片
- **智能检测**: 首先检查图片是否已有推理结果
  - 如果已有 `generalDetections`、`idCardDetections` 或 `mobileNetV3Detections`，跳过推理
  - 如果没有，才进行本地ONNX模型推理
- 加载ONNX模型（延迟加载，仅在需要时）
- 执行本地推理，生成检测结果
- **规则映射**: 对每张图片的检测结果应用映射规则（`mapDetectionsToCategory`）
  - 检测身份证 → `idcard`
  - 统计人数 → `single_person` / `social_activities`
  - 检测宠物 → `pets`
  - 检测食物 → `foods`
  - 物体少 → `travel_scenery`
  - 默认 → `other`
- 批量更新推理结果和分类信息到数据库
- **注意**: 无论推理结果是来自远程API还是本地ONNX模型，都需要进行规则映射才能确定最终分类

#### ✅ **阶段6: 相似度检测**
- 检测相似图片（基于图片Hash或特征）
- 将相似图片分组
- 保存相似度分组信息

#### ✅ **EXIF数据提取**
- 在需要时提取图片EXIF数据
- 提取拍摄时间、GPS信息、尺寸等
- **主要用于位置信息补全阶段**

#### ✅ **本地模型推理**
- 当远程推理不可用或图片分类为NA时，使用本地ONNX模型推理
- 加载和管理ONNX模型
- **延迟加载策略**: 仅在需要时加载，节省内存

#### ✅ **数据缓存管理**
- 管理全局图片缓存（`GlobalImageCache`）
- 提供统一的数据服务接口（`UnifiedDataService`）
- 在扫描完成后刷新缓存

### 3.2 JS层与原生层的交互

#### **调用原生层**
```javascript
// 启动扫描（Android平台）
const { GalleryScanModule } = NativeModules;
const result = await GalleryScanModule.startScan({
  scanPaths: ['DCIM/Camera'],
  compareLimit: 1000,
  remoteApiUrl: 'https://api.example.com',
  cacheApiUrl: 'https://api.example.com'
});
// 返回: { scanId, totalImagesToBeClassified }
```

#### **监听原生层事件**
```javascript
import { NativeEventEmitter } from 'react-native';

const eventEmitter = new NativeEventEmitter(GalleryScanModule);

// 监听进度事件
eventEmitter.addListener('GalleryScanProgress', (event) => {
  const { stage, filesProcessed, filesFound, totalImagesToBeClassified, imagesClassified } = event;
  // 更新UI
});

// 监听完成事件
eventEmitter.addListener('GalleryScanCompleted', (event) => {
  const { scanId } = event;
  // 处理完成逻辑
});

// 监听错误事件
eventEmitter.addListener('GalleryScanError', (event) => {
  const { message } = event;
  // 处理错误
});
```

## 四、数据流向

### 4.1 完整扫描流程
```
JS层
  ↓ startScan(options)
原生层 GalleryScanModule.startScan()
  ↓
原生层 GalleryScanService.startScan()
  ├─ 阶段1: 目录扫描（同步）
  ├─ 阶段2: 文件比对（同步）
  └─ 返回: { scanId, totalImagesToBeClassified }
  ↓
原生层 后台线程执行后续阶段
  ├─ 阶段3a: 截图检测 + 位置信息获取（简化版本）
  ├─ 阶段3b: 远端缓存查询
  └─ 阶段3c: 远程推理
  ↓
原生层 发送完成事件到JS层
  └─ GalleryScanCompleted（扫描完成）
  ↓
JS层 接收完成事件，开始后续处理
  ├─ 阶段4: 位置信息补全（降级处理）
  │   ├─ 查询有GPS坐标但没有位置信息的图片
  │   ├─ 使用GPS坐标查询地理位置（降级处理）
  │   │   ├─ 优先使用远程API查询
  │   │   └─ 如果失败，自动降级为本地查询
  │   └─ 批量更新位置信息
    ├─ 阶段5: 本地推理和规则映射（NA分类图片）
    │   ├─ 查询NA分类图片
    │   ├─ 检查是否已有推理结果
    │   ├─ 如果没有，加载ONNX模型并执行本地推理
    │   ├─ 应用规则映射（mapDetectionsToCategory）
    │   └─ 批量更新推理结果和分类信息
    └─ 阶段6: 相似度检测
      ├─ 计算图片Hash或特征
      ├─ 检测相似图片
      └─ 保存相似度分组
  ↓
JS层 刷新缓存并更新UI
  └─ 扫描完全结束
```

### 4.2 数据处理流程

#### **大模型推理结果**
```
远程API返回
  ↓
原生层解析结果
  ├─ category: "single_person"
  ├─ confidence: 0.9
  └─ message: "描述信息"
  ↓
原生层保存到数据库
  └─ batchUpdateClassification()
  ↓
JS层读取数据库
  └─ 显示分类结果
```

#### **小模型推理结果（远程）**
```
远程API返回
  ↓
原生层解析结果
  ├─ local_inference_result
  │   ├─ idCardDetections: []
  │   ├─ generalDetections: [...]
  │   └─ mobileNetV3Detections: {...}
  └─ category: null（未映射）
  ↓
原生层保存到数据库
  ├─ category: "NA"（临时分类）
  └─ 保存原始检测数据
  ↓
JS层后续处理（阶段6）
  └─ 读取并映射分类
```

#### **本地推理和规则映射（JS层，阶段5）**
```
原生层扫描完成
  ↓
JS层查询NA分类图片
  ↓
JS层检查是否已有推理结果
  ├─ 如果有推理结果 → 跳过推理，直接进入映射
  └─ 如果没有推理结果 → 执行本地推理
      ├─ 加载ONNX模型（延迟加载）
      ├─ 执行推理
      └─ 保存检测结果到数据库
  ↓
JS层进行规则映射（同一阶段）
  ├─ 读取检测结果（idCardDetections, generalDetections, mobileNetV3Detections）
  ├─ 应用映射规则（mapDetectionsToCategory）
  └─ 确定最终分类
  ↓
JS层批量更新推理结果和分类
  └─ batchUpdateClassification()
```

**注意**: 无论推理结果是来自远程API还是本地ONNX模型，都需要进行规则映射才能确定最终分类。

#### **位置信息补全流程**
```
原生层阶段3a（截图检测）
  ├─ 提取EXIF GPS坐标
  ├─ 如果有API URL → 尝试调用远程API获取位置信息
  │   ├─ 成功 → 直接保存位置信息到数据库
  │   └─ 失败 → 不保存位置信息，留给JS层处理
  └─ 保存图片数据（包含GPS坐标）
  ↓
原生层扫描完成
  ↓
JS层阶段4（位置信息补全）
  ├─ 查询有GPS坐标但没有位置信息的图片
  ├─ 使用GPS坐标查询地理位置（降级处理）
  │   ├─ 优先使用远程API查询
  │   └─ 如果失败，自动降级为本地查询
  └─ 批量更新位置信息到数据库
```

## 五、关键设计决策

### 5.1 为什么原生层不进行小模型结果映射？

1. **依赖配置文件**: 映射规则依赖JS层的配置文件，原生层维护成本高
2. **灵活性**: JS层可以灵活调整映射规则，无需重新编译
3. **职责分离**: 原生层负责数据获取和存储，JS层负责业务逻辑

### 5.2 为什么使用分批处理？

1. **内存优化**: 避免一次性处理大量图片导致内存溢出
2. **进度反馈**: 每批处理完成后发送进度事件，用户体验更好
3. **错误隔离**: 单批失败不影响其他批次

### 5.3 为什么Hash是可选的？

1. **性能考虑**: 在远程推理阶段，如果图片没有Hash，不强制计算，避免重复计算
2. **服务端支持**: 服务端可以自己计算Hash，所以不是必需的
3. **已有Hash优先**: 如果图片在缓存查询阶段已计算Hash，则上传，帮助服务端快速查询

### 5.4 为什么JS层在原生层扫描完成后进行后续处理？

1. **职责分离**: 
   - 原生层专注于快速扫描和远程推理（网络IO密集型）
   - JS层专注于本地推理和业务逻辑处理（计算密集型）

2. **性能优化**:
   - 原生层扫描完成后立即返回，不阻塞
   - JS层可以异步进行后续处理，不影响用户体验

3. **智能检测**:
   - JS层在本地推理前先检查是否已有推理结果
   - 避免重复推理，节省计算资源

4. **灵活扩展**:
   - JS层可以灵活添加新的处理阶段
   - 无需修改原生层代码

### 5.5 为什么本地推理要检查已有结果？

1. **避免重复计算**: 
   - 远程推理可能已经返回了小模型结果
   - 原生层已保存了检测数据，无需重复推理

2. **性能优化**:
   - 本地ONNX推理需要加载模型，耗时较长
   - 如果已有结果，直接跳过推理，节省时间

3. **资源节约**:
   - 模型加载占用内存
   - 推理过程消耗CPU/GPU资源
   - 只在必要时才进行推理

### 5.6 为什么所有推理结果都需要规则映射？

1. **统一处理**: 
   - 无论是远程小模型结果还是本地ONNX结果，都是原始检测数据
   - 需要统一的映射规则转换为具体分类

2. **业务逻辑**: 
   - 映射规则包含业务逻辑（如人数统计、物体识别等）
   - 这些逻辑更适合在JS层实现，便于维护和调整

3. **配置驱动**: 
   - 映射规则依赖配置文件
   - JS层可以灵活调整规则，无需重新编译原生代码

4. **完整性**: 
   - 即使已有推理结果，也必须经过映射才能确定最终分类
   - 确保所有NA分类图片都能得到正确的分类结果

### 5.7 为什么原生层先尝试获取位置信息，JS层作为降级处理？

1. **性能优化**:
   - 原生层在扫描阶段就可以获取位置信息，减少JS层的处理量
   - 原生层使用远程API，速度快，成功率高

2. **降级策略**:
   - 如果原生层获取失败（网络问题、API错误等），JS层可以降级为本地查询
   - JS层使用本地城市数据库，不依赖网络，确保位置信息能够补全

3. **职责分离**:
   - 原生层负责快速获取（远程API）
   - JS层负责降级处理（本地查询）和复杂业务逻辑

4. **简化实现**:
   - 原生层只调用远程API，实现简单
   - JS层有完整的本地查询逻辑，可以处理所有情况

## 六、接口定义

### 6.1 原生层暴露的接口

#### **GalleryScanModule.startScan(options)**
```typescript
interface ScanOptions {
  scanPaths?: string[];        // 扫描路径数组（相对路径）
  compareLimit?: number;       // 比对限制（0表示不限制）
  remoteApiUrl?: string;       // 远程推理API地址
  cacheApiUrl?: string;        // 远端缓存API地址
}

interface ScanStartResult {
  scanId: string;              // 扫描任务ID
  totalImagesToBeClassified: number;  // 总需要处理的图片数
}
```

### 6.2 原生层发送的事件

#### **GalleryScanProgress**
```typescript
interface ProgressEvent {
  type: 'progress';
  stage: 'screenshot_detection' | 'cache_check' | 'remote_inference';
  filesProcessed: number;      // 当前阶段已处理数量
  filesFound: number;          // 当前阶段总数量
  totalImagesToBeClassified: number;  // 总需要分类的图片数
  imagesClassified: number;    // 已分类成功的图片数
  scanId: string;              // 扫描任务ID
}
```

#### **GalleryScanCompleted**
```typescript
interface CompletedEvent {
  type: 'scan_completed';
  scanId: string;              // 扫描任务ID
}
```

#### **GalleryScanError**
```typescript
interface ErrorEvent {
  type: 'error';
  stage: string;              // 错误发生的阶段
  scanId: string;              // 扫描任务ID
  message: string;             // 错误消息
}
```

## 七、性能优化要点

### 7.1 原生层优化
1. **分批处理**: 缓存查询100张/批，远程推理20张/批
2. **批量数据库操作**: 使用事务批量更新，减少数据库操作次数
3. **Hash去重**: 使用Set去重，减少远程查询次数
4. **并行Hash计算**: 使用MediaStoreModule的批量计算方法
5. **位置信息获取**: 在扫描阶段尝试获取位置信息，减少JS层处理量
   - 仅调用远程API，实现简单
   - 获取失败不阻塞，留给JS层降级处理

### 7.2 JS层优化
1. **延迟加载模型**: 仅在需要时加载ONNX模型，节省启动时间和内存
2. **智能检测**: 本地推理前先检查是否已有推理结果，避免重复计算
3. **缓存管理**: 使用全局缓存避免重复查询数据库
4. **批量处理**: 
   - 批量处理小模型结果映射
   - 批量更新位置信息
   - 批量更新分类信息
5. **异步处理**: 后续处理阶段异步执行，不阻塞UI
6. **位置信息降级处理**: 
   - 只处理原生层未获取到位置信息的图片，减少处理量
   - 使用并发查询（`Promise.all`）提升性能
   - 远程API失败时自动降级为本地查询，确保位置信息能够补全
7. **位置信息缓存**: 相同GPS坐标的位置信息可以缓存，避免重复查询

## 八、未来扩展方向

### 8.1 可能的优化
1. **多线程Hash计算**: 在原生层使用多线程并行计算Hash
2. **增量扫描**: 只扫描新增和修改的图片
3. **后台任务**: 使用WorkManager实现真正的后台扫描

### 8.2 功能扩展
1. **视频扫描**: 扩展支持视频文件扫描
2. **云端同步**: 支持扫描结果云端同步
3. **智能分组**: 基于时间、地点等维度自动分组

