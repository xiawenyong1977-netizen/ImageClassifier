# Android原生扫描架构设计 - JS层与原生层协作方案

## 一、设计原则

### 1.1 核心原则
- **职责分离**：原生层负责所有计算密集型任务，JS层只负责UI展示
- **完全后台**：扫描逻辑完全在原生层运行，不依赖JS线程
- **事件驱动**：使用React Native EventEmitter进行异步通信
- **数据一致性**：原生层直接操作数据库，JS层只读
- **状态同步**：通过事件机制实时同步状态

### 1.2 架构目标
- ✅ 真正的后台扫描（不依赖JS线程）
- ✅ 高性能（原生代码执行）
- ✅ 低耦合（清晰的接口边界）
- ✅ 易维护（职责明确）

---

## 二、职责边界划分

### 2.1 原生层职责（Android Native Layer）

#### ✅ 完全在原生层实现（可后台运行）

1. **目录扫描**
   - MediaStore API查询
   - 路径过滤
   - 文件信息收集

2. **EXIF数据提取**
   - 拍摄时间提取
   - GPS信息提取
   - 图片尺寸提取

3. **文件比对**
   - 与数据库比对
   - 识别新增/删除文件

4. **数据库操作**
   - SQLite读写（完全控制）
   - 批量插入/更新
   - 事务管理

5. **截图检测**
   - 文件名规则判断
   - 尺寸判断
   - 路径判断

6. **哈希计算**
   - 多线程并行计算
   - SHA-256哈希

7. **远程推理**
   - HTTP请求（OkHttp）
   - 图片上传（FormData）
   - 结果解析

8. **前台服务管理**
   - 服务启动/停止
   - 通知更新
   - WakeLock管理

#### ⚠️ 任务转交（一次通知）

9. **扫描完成通知**
   - 完成所有原生层处理（目录扫描、EXIF提取、文件比对、截图检测、哈希计算、远程推理）
   - **发送一次事件通知JS层"扫描完成，可以开始后续处理了"**
   - **不等待结果**，原生层任务结束
   - **后续所有处理（本地推理、相似度检测）完全由JS层接管**

#### 数据管理
- **数据库所有权**：原生层拥有数据库的完全控制权
- **状态持久化**：扫描状态保存在原生层

### 2.2 JS层职责（React Native Layer）

#### UI展示
1. **扫描进度展示**
   - 接收进度事件
   - 更新UI显示
   - 用户交互反馈

2. **扫描控制**
   - 启动扫描（传递参数）
   - 停止扫描
   - 暂停/恢复（可选）

3. **数据展示**
   - 读取数据库（只读）
   - 分类列表展示
   - 图片列表展示

4. **用户交互**
   - 扫描设置配置
   - 扫描路径选择
   - 扫描历史查看

#### 数据访问
- **只读访问**：JS层只能读取数据库，不能写入
- **缓存读取**：读取原生层构建的缓存
- **配置读取**：读取用户设置

---

## 三、通信机制设计

### 3.1 通信方式

#### 方案：React Native EventEmitter（推荐）✅

**优点**：
- 原生层可以主动推送事件（不依赖JS调用）
- 支持后台运行（JS线程被杀死也能发送事件）
- 异步非阻塞
- React Native标准机制

**实现方式**：
```java
// 原生层发送事件
reactContext
    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
    .emit("GalleryScanProgress", eventData);
```

```javascript
// JS层监听事件
import { NativeEventEmitter, NativeModules } from 'react-native';

const { GalleryScanModule } = NativeModules;
const scanEventEmitter = new NativeEventEmitter(GalleryScanModule);

scanEventEmitter.addListener('GalleryScanProgress', (event) => {
  // 处理进度更新
});
```

### 3.2 事件类型定义

#### 3.2.1 扫描进度事件（GalleryScanProgress）

```typescript
interface ScanProgressEvent {
  // 事件类型
  type: 'progress' | 'completed' | 'error' | 'paused';
  
  // 扫描阶段
  stage: 
    | 'initializing'           // 初始化
    | 'directory_scanning'     // 目录扫描
    | 'file_comparison'       // 文件比对
    | 'screenshot_detection'  // 截图检测
    | 'cache_checking'       // 缓存查询
    | 'remote_inference'     // 远程推理
    | 'local_inference'      // 本地推理
    | 'similarity_detection' // 相似度检测
    | 'removing_files'       // 移除文件
    | 'updating_data'        // 数据更新
    | 'completed';          // 完成
  
  // 进度信息
  message: string;           // 用户友好的消息
  filesProcessed: number;   // 已处理文件数
  filesFound: number;       // 总文件数
  filesFailed?: number;     // 失败文件数
  
  // 统计信息
  totalClassified?: number; // 累计分类成功数
  totalImagesToProcess?: number; // 总处理数
  
  // 刷新标记
  shouldRefresh?: boolean;  // 是否需要刷新UI
  
  // 错误信息（仅type='error'时）
  error?: {
    code: string;
    message: string;
    stage: string;
  };
}
```

#### 3.2.2 扫描状态事件（GalleryScanStatus）

```typescript
interface ScanStatusEvent {
  type: 'status';
  status: 'idle' | 'scanning' | 'paused' | 'completed' | 'error';
  scanId?: string;          // 扫描任务ID
  startTime?: number;      // 开始时间戳
  estimatedTimeRemaining?: number; // 预计剩余时间（秒）
}
```

#### 3.2.3 数据更新事件（GalleryDataUpdated）

```typescript
interface DataUpdatedEvent {
  type: 'data_updated';
  updateType: 'images' | 'categories' | 'similarity_groups' | 'all';
  affectedIds?: string[];  // 受影响的数据ID列表
}
```

#### 3.2.4 扫描完成通知事件（GalleryScanCompleted）

**原生层通知JS层扫描完成，可以开始后续处理了（极简版，一次通知）**

```typescript
interface ScanCompletedEvent {
  type: 'scan_completed';
  // 不需要传递任何数据，JS层自己从数据库读取所需数据
  // 不需要requestId，不需要等待响应
  // JS层完全接管后续所有处理（本地推理、相似度检测）
}
```

### 3.3 方法调用（Promise-based）

#### 3.3.1 启动扫描

```java
// 原生层
@ReactMethod
public void startScan(ReadableMap options, Promise promise) {
    // options包含：
    // - scanPaths: string[] (扫描路径数组)
    // - compareLimit?: number (比较限制)
    // - maxImages?: number (测试模式最大图片数)
    
    // 返回扫描任务ID
    String scanId = galleryScanService.startScan(options);
    promise.resolve(scanId);
}
```

```typescript
// JS层
interface ScanOptions {
  scanPaths: string[];      // 扫描路径（空数组表示扫描整个设备）
  compareLimit?: number;    // 比较限制（非会员）
  maxImages?: number;       // 测试模式最大图片数
}

const scanId = await GalleryScanModule.startScan({
  scanPaths: [],
  compareLimit: null
});
```

#### 3.3.2 停止扫描

```java
// 原生层
@ReactMethod
public void stopScan(String scanId, Promise promise) {
    boolean success = galleryScanService.stopScan(scanId);
    promise.resolve(success);
}
```

```typescript
// JS层
await GalleryScanModule.stopScan(scanId);
```

#### 3.3.3 获取扫描状态

```java
// 原生层
@ReactMethod
public void getScanStatus(String scanId, Promise promise) {
    WritableMap status = galleryScanService.getScanStatus(scanId);
    promise.resolve(status);
}
```

```typescript
// JS层
const status = await GalleryScanModule.getScanStatus(scanId);
// 返回: { status: 'scanning', progress: {...}, ... }
```

#### 3.3.4 获取扫描历史

```java
// 原生层
@ReactMethod
public void getScanHistory(Promise promise) {
    WritableArray history = galleryScanService.getScanHistory();
    promise.resolve(history);
}
```

---

## 四、数据流设计

### 4.1 扫描启动流程

```
┌─────────────┐
│   JS Layer  │
│  (UI层)     │
└──────┬──────┘
       │ 1. startScan(options)
       ▼
┌─────────────────────────┐
│  GalleryScanModule       │
│  (React Native Bridge)  │
└──────┬──────────────────┘
       │ 2. 创建扫描任务
       ▼
┌─────────────────────────┐
│  GalleryScanService     │
│  (原生服务)              │
└──────┬──────────────────┘
       │ 3. 启动前台服务
       ▼
┌─────────────────────────┐
│  ScanForegroundService  │
│  (前台服务)              │
└──────┬──────────────────┘
       │ 4. 开始扫描
       ▼
┌─────────────────────────┐
│  扫描逻辑执行             │
│  (完全在原生层)          │
└─────────────────────────┘
```

### 4.2 进度更新流程

```
┌─────────────────────────┐
│  扫描逻辑执行             │
│  (原生层)                │
└──────┬──────────────────┘
       │ 1. 处理进度更新
       │    (每批次/每阶段)
       ▼
┌─────────────────────────┐
│  EventEmitter.emit()    │
│  (发送原始进度数据)      │
└──────┬──────────────────┘
       │ 2. 通过Bridge发送
       ▼
┌─────────────────────────┐
│  JS EventListener       │
│  (接收事件)             │
└──────┬──────────────────┘
       │ 3. 复用processProgressData处理
       ▼
┌─────────────────────────┐
│  processProgressData() │
│  (生成用户友好消息)      │
└──────┬──────────────────┘
       │ 4. 更新UI状态
       ▼
┌─────────────┐
│   UI更新    │
│  (React)    │
└─────────────┘
```

### 4.3 任务转交流程（极简版）

```
┌─────────────────────────┐
│  扫描逻辑执行             │
│  (原生层)                │
└──────┬──────────────────┘
       │ 1. 完成所有原生层处理
       │    (目录扫描、EXIF、文件比对、
       │     截图检测、哈希计算、远程推理)
       ▼
┌─────────────────────────┐
│  EventEmitter.emit()    │
│  (发送一次通知事件)      │
│  GalleryScanCompleted   │
└──────┬──────────────────┘
       │ 2. 通过Bridge发送
       │    (原生层任务结束，不等待)
       ▼
┌─────────────────────────┐
│  JS EventListener       │
│  (接收通知，完全接管)    │
└──────┬──────────────────┘
       │
       │ 3. JS层自主决定处理顺序
       │
       ├─▶ 本地推理
       │   - 从数据库读取NA图片
       │   - 加载ONNX模型
       │   - 执行推理
       │   - 保存结果到数据库
       │
       └─▶ 相似度检测
           - 从数据库读取图片
           - 特征提取
           - 相似度计算
           - 保存结果到数据库
       
       (JS层完全独立处理，不依赖原生层)
```

### 4.5 数据库访问流程

```
┌─────────────────────────┐
│  扫描逻辑执行             │
│  (原生层)                │
└──────┬──────────────────┘
       │ 1. 批量写入数据
       ▼
┌─────────────────────────┐
│  ImageDataService       │
│  (原生SQLite)            │
└──────┬──────────────────┘
       │ 2. 事务提交
       ▼
┌─────────────────────────┐
│  SQLite Database         │
│  (共享数据库)            │
└──────┬──────────────────┘
       │ 3. 发送数据更新事件
       ▼
┌─────────────────────────┐
│  EventEmitter.emit()    │
│  ('GalleryDataUpdated') │
└──────┬──────────────────┘
       │ 4. JS层接收事件
       ▼
┌─────────────────────────┐
│  UnifiedDataService     │
│  (JS层，只读+缓存管理)    │
└──────┬──────────────────┘
       │ 5. 从数据库读取数据
       │ 6. 构建/刷新缓存
       ▼
┌─────────────┐
│   UI更新    │
└─────────────┘
```

---

## 五、接口定义

### 5.1 原生模块接口（GalleryScanModule）

```java
public class GalleryScanModule extends ReactContextBaseJavaModule {
    
    // ========== 扫描控制 ==========
    
    /**
     * 启动扫描
     * @param options 扫描选项
     * @param promise Promise对象
     */
    @ReactMethod
    public void startScan(ReadableMap options, Promise promise);
    
    /**
     * 停止扫描
     * @param scanId 扫描任务ID
     * @param promise Promise对象
     */
    @ReactMethod
    public void stopScan(String scanId, Promise promise);
    
    /**
     * 暂停扫描（可选功能）
     * @param scanId 扫描任务ID
     * @param promise Promise对象
     */
    @ReactMethod
    public void pauseScan(String scanId, Promise promise);
    
    /**
     * 恢复扫描（可选功能）
     * @param scanId 扫描任务ID
     * @param promise Promise对象
     */
    @ReactMethod
    public void resumeScan(String scanId, Promise promise);
    
    // ========== 状态查询 ==========
    
    /**
     * 获取扫描状态
     * @param scanId 扫描任务ID
     * @param promise Promise对象
     */
    @ReactMethod
    public void getScanStatus(String scanId, Promise promise);
    
    /**
     * 获取当前活动的扫描任务
     * @param promise Promise对象
     */
    @ReactMethod
    public void getActiveScan(Promise promise);
    
    /**
     * 获取扫描历史
     * @param promise Promise对象
     */
    @ReactMethod
    public void getScanHistory(Promise promise);
    
    // ========== 配置 ==========
    
    /**
     * 获取扫描配置
     * @param promise Promise对象
     */
    @ReactMethod
    public void getScanConfig(Promise promise);
    
    /**
     * 更新扫描配置
     * @param config 配置对象
     * @param promise Promise对象
     */
    @ReactMethod
    public void updateScanConfig(ReadableMap config, Promise promise);
    
    // 注意：简化后不再需要JS层回调方法
    // JS层独立处理，直接操作数据库，无需返回结果给原生层
}
```

### 5.2 JS层接口（GalleryScanService.js）

```typescript
// src/services/GalleryScanService.js (Android专用)

import { NativeModules, NativeEventEmitter } from 'react-native';

const { GalleryScanModule } = NativeModules;
const scanEventEmitter = new NativeEventEmitter(GalleryScanModule);

export interface ScanOptions {
  scanPaths: string[];      // 扫描路径（空数组=整个设备）
  compareLimit?: number;    // 比较限制
  maxImages?: number;       // 测试模式最大图片数
}

export interface ScanProgress {
  type: 'progress' | 'completed' | 'error' | 'paused';
  stage: string;
  message: string;
  filesProcessed: number;
  filesFound: number;
  filesFailed?: number;
  totalClassified?: number;
  totalImagesToProcess?: number;
  shouldRefresh?: boolean;
  error?: {
    code: string;
    message: string;
    stage: string;
  };
}

class GalleryScanService {
  private listeners: Map<string, Function[]> = new Map();
  private currentScanId: string | null = null;
  
  /**
   * 启动扫描
   */
  async startScan(options: ScanOptions): Promise<string> {
    const scanId = await GalleryScanModule.startScan(options);
    this.currentScanId = scanId;
    return scanId;
  }
  
  /**
   * 停止扫描
   */
  async stopScan(scanId: string): Promise<boolean> {
    const success = await GalleryScanModule.stopScan(scanId);
    if (success && scanId === this.currentScanId) {
      this.currentScanId = null;
    }
    return success;
  }
  
  /**
   * 获取扫描状态
   */
  async getScanStatus(scanId: string): Promise<any> {
    return await GalleryScanModule.getScanStatus(scanId);
  }
  
  /**
   * 监听扫描进度
   */
  onProgress(callback: (progress: ScanProgress) => void): () => void {
    const listener = scanEventEmitter.addListener(
      'GalleryScanProgress',
      callback
    );
    
    return () => {
      listener.remove();
    };
  }
  
  /**
   * 监听数据更新
   */
  onDataUpdated(callback: (event: any) => void): () => void {
    const listener = scanEventEmitter.addListener(
      'GalleryDataUpdated',
      callback
    );
    
    return () => {
      listener.remove();
    };
  }
  
  /**
   * 监听扫描状态变化
   */
  onStatusChanged(callback: (status: any) => void): () => void {
    const listener = scanEventEmitter.addListener(
      'GalleryScanStatus',
      callback
    );
    
    return () => {
      listener.remove();
    };
  }
  
  /**
   * 监听扫描完成通知（原生层通知JS层可以开始后续处理了）
   * JS层收到通知后，完全接管后续所有处理（本地推理、相似度检测）
   */
  onScanCompleted(callback: () => void): () => void {
    const listener = scanEventEmitter.addListener(
      'GalleryScanCompleted',
      callback
    );
    
    return () => {
      listener.remove();
    };
  }
}

export default new GalleryScanService();
```

---

## 六、数据库访问策略

### 6.1 访问模式

#### 原生层：完全控制（读写）
- ✅ 所有写入操作在原生层
- ✅ 事务管理在原生层
- ✅ 缓存构建在原生层

#### JS层：只读访问
- ✅ 只能读取数据
- ✅ 通过UnifiedDataService统一接口
- ✅ 读取原生层构建的缓存

### 6.2 并发控制

#### 方案：单例数据库连接 + WAL模式

```java
// 原生层：单例数据库连接
public class ImageDatabaseHelper {
    private static ImageDatabaseHelper instance;
    private SQLiteDatabase database;
    
    // 使用WAL模式支持并发读取
    private ImageDatabaseHelper(Context context) {
        database = context.openOrCreateDatabase(
            "ImageClassifier.db",
            Context.MODE_PRIVATE,
            null
        );
        database.enableWriteAheadLogging(); // WAL模式
    }
    
    // 写入操作（原生层独占）
    public synchronized void writeImages(List<ImageData> images) {
        // 批量写入
    }
    
    // 读取操作（JS层和原生层共享）
    public synchronized Cursor readImages() {
        // 读取数据
    }
}
```

### 6.3 数据同步机制

#### 事件驱动同步
1. **原生层写入数据** → 发送`GalleryDataUpdated`事件
2. **JS层接收事件** → 刷新缓存 → 更新UI

```java
// 原生层：写入后发送事件
private void notifyDataUpdated(String updateType, List<String> affectedIds) {
    WritableMap eventData = Arguments.createMap();
    eventData.putString("updateType", updateType);
    eventData.putArray("affectedIds", convertToArray(affectedIds));
    
    reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit("GalleryDataUpdated", eventData);
}
```

```typescript
// JS层：监听数据更新
scanService.onDataUpdated((event) => {
  if (event.updateType === 'images' || event.updateType === 'all') {
    // 刷新缓存
    UnifiedDataService.imageCache.refreshCache();
    // 更新UI
    // ...
  }
});
```

---

## 七、错误处理机制

### 7.1 错误分类

#### 可恢复错误
- 网络超时 → 自动重试
- 单张图片处理失败 → 跳过继续
- 数据库写入失败 → 重试

#### 不可恢复错误
- 权限被拒绝 → 发送错误事件，停止扫描
- 数据库损坏 → 发送错误事件，停止扫描
- 内存不足 → 发送错误事件，停止扫描

### 7.2 错误事件格式

```typescript
interface ScanErrorEvent {
  type: 'error';
  stage: string;           // 出错阶段
  error: {
    code: string;          // 错误代码
    message: string;       // 错误消息
    recoverable: boolean;  // 是否可恢复
    retryable: boolean;   // 是否可重试
  };
  scanId: string;          // 扫描任务ID
}
```

### 7.3 错误处理流程

```
┌─────────────────────────┐
│  扫描逻辑执行             │
│  (原生层)                │
└──────┬──────────────────┘
       │ 发生错误
       ▼
┌─────────────────────────┐
│  错误分类判断             │
│  (可恢复/不可恢复)        │
└──────┬──────────────────┘
       │
       ├─ 可恢复 → 自动重试/跳过
       │
       └─ 不可恢复 → 发送错误事件
                      ▼
              ┌─────────────────┐
              │  JS层接收错误    │
              │  显示错误提示    │
              │  停止扫描        │
              └─────────────────┘
```

---

## 八、状态管理

### 8.1 扫描状态机

```
┌─────────┐
│  IDLE   │ (空闲)
└────┬────┘
     │ startScan()
     ▼
┌─────────────┐
│  SCANNING   │ (扫描中)
└────┬────────┘
     │
     ├─ pauseScan() → PAUSED (暂停)
     │
     ├─ stopScan() → IDLE (停止)
     │
     ├─ error → ERROR (错误)
     │
     └─ completed → COMPLETED (完成)
```

### 8.2 状态持久化

#### 原生层保存状态
- 扫描进度（已处理文件数）
- 扫描配置
- 错误信息

#### 状态恢复
- APP重启后可以恢复未完成的扫描
- 通过`getActiveScan()`查询

---

## 九、后台运行与JS层恢复机制

### 9.1 后台运行能力分析

#### 9.1.1 原生层后台运行 ✅

**原生层可以独立后台运行**，不依赖JS线程：

1. **Foreground Service保证**
   - 使用`ScanForegroundService`前台服务
   - 系统不会轻易杀死前台服务
   - 即使APP切换到后台，服务继续运行

2. **WakeLock防止休眠**
   - 使用`PARTIAL_WAKE_LOCK`防止CPU休眠
   - 保证扫描任务持续执行

3. **独立线程执行**
   - 扫描逻辑在原生层独立线程执行
   - 不依赖React Native的JS线程

**结论**：✅ **原生层可以完全独立后台运行，即使JS线程被杀死也不影响扫描**

#### 9.1.2 事件发送机制 ⚠️

**当JS线程被杀死时，事件发送的行为**：

```java
// 原生层发送事件
reactContext
    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
    .emit("GalleryScanCompleted", eventData);
```

**行为分析**：
- ✅ **原生层继续执行**：事件发送失败不影响原生层扫描任务
- ⚠️ **事件可能丢失**：如果JS线程不存在，事件会被丢弃（静默失败）
- ✅ **不抛异常**：React Native的EventEmitter不会因为JS线程不存在而抛异常

**影响**：
- 进度更新事件丢失 → **不影响**（原生层继续扫描）
- 扫描完成通知丢失 → **需要处理**（JS层恢复时需要检查）

#### 9.1.3 任务移交问题 ⚠️

**场景**：APP切换到后台 → JS线程被杀死 → 原生层完成扫描 → 发送`GalleryScanCompleted`事件失败

**问题**：
- JS层收不到"扫描完成"通知
- JS层不知道需要执行后续处理（本地推理、相似度检测）

**解决方案**：数据库状态标记 + JS层恢复检查

### 9.2 数据库状态标记机制

#### 9.2.1 扫描状态表设计

在`settings`表中添加扫描状态标记：

```sql
-- 扫描状态标记
INSERT OR REPLACE INTO settings (key, value) VALUES 
  ('scan_status', 'completed'),           -- 扫描状态：scanning | completed | error
  ('scan_completed_at', '2024-01-01T12:00:00Z'),  -- 扫描完成时间
  ('scan_needs_post_processing', 'true');  -- 是否需要后续处理
```

#### 9.2.2 原生层状态更新

```java
// 原生层：扫描完成时更新状态
public void onScanCompleted() {
    // 1. 更新扫描状态
    ImageDataService.updateSetting("scan_status", "completed");
    ImageDataService.updateSetting("scan_completed_at", getCurrentTimestamp());
    ImageDataService.updateSetting("scan_needs_post_processing", "true");
    
    // 2. 尝试发送事件（如果JS线程存在）
    try {
        sendScanCompletedEvent();
    } catch (Exception e) {
        // 事件发送失败不影响，状态已保存到数据库
        Log.w(TAG, "Failed to send scan completed event: " + e.getMessage());
    }
}
```

### 9.3 JS层恢复检查机制

#### 9.3.1 APP启动/恢复时检查

```typescript
// JS层：APP启动/恢复时检查
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
        
        // 2. 执行后续处理
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
    // 1. 本地推理
    const naImages = await UnifiedDataService.readImagesByCategory('NA');
    if (naImages.length > 0) {
      // 执行本地推理...
    }
    
    // 2. 相似度检测
    const allImages = await UnifiedDataService.readAllImages();
    // 执行相似度检测...
  }
}
```

#### 9.3.2 监听APP状态变化

```typescript
// JS层：监听APP前后台切换
import { AppState } from 'react-native';

AppState.addEventListener('change', async (nextAppState) => {
  if (nextAppState === 'active') {
    // APP回到前台，检查是否有未处理任务
    await scanService.checkPendingPostProcessing();
  }
});
```

#### 9.3.3 初始化时检查

```typescript
// JS层：APP启动时检查
useEffect(() => {
  const init = async () => {
    // 初始化服务...
    
    // 检查是否有未处理的后续任务
    await scanService.checkPendingPostProcessing();
  };
  
  init();
}, []);
```

### 9.4 完整流程设计

#### 9.4.1 正常流程（JS线程存在）

```
原生层完成扫描
    │
    ├─ 更新数据库状态（scan_status = 'completed', scan_needs_post_processing = 'true'）
    │
    ├─ 发送 GalleryScanCompleted 事件 ✅
    │
    └─ JS层接收事件
           │
           └─ 执行后续处理（本地推理、相似度检测）
                  │
                  └─ 清除标记（scan_needs_post_processing = 'false'）
```

#### 9.4.2 后台流程（JS线程被杀死）

```
原生层完成扫描
    │
    ├─ 更新数据库状态（scan_status = 'completed', scan_needs_post_processing = 'true'）
    │
    ├─ 尝试发送 GalleryScanCompleted 事件 ❌（JS线程不存在，事件丢失）
    │
    └─ 原生层任务结束（状态已保存到数据库）

[APP回到前台，JS线程恢复]
    │
    ├─ APP状态变为 'active'
    │
    ├─ 检查数据库状态
    │   - scan_status = 'completed' ✅
    │   - scan_needs_post_processing = 'true' ✅
    │
    └─ 执行后续处理（本地推理、相似度检测）
           │
           └─ 清除标记（scan_needs_post_processing = 'false'）
```

### 9.5 关键设计点总结

| 场景 | 原生层行为 | JS层行为 | 数据一致性 |
|------|-----------|----------|-----------|
| **正常前台运行** | 发送事件 ✅ | 接收事件并处理 ✅ | ✅ 一致 |
| **切换到后台** | 继续扫描 ✅ | 线程被杀死 ❌ | ⚠️ 事件丢失 |
| **后台完成扫描** | 更新数据库状态 ✅ | 线程不存在 ❌ | ✅ 状态已保存 |
| **回到前台** | 无操作 | 检查数据库状态 ✅ | ✅ 恢复处理 |

**核心原则**：
1. ✅ **原生层完全独立**：不依赖JS线程，可以后台运行
2. ✅ **数据库作为通信媒介**：状态保存在数据库，JS层恢复时检查
3. ✅ **事件作为优化**：事件成功发送是优化路径，失败时通过数据库恢复
4. ✅ **幂等性保证**：JS层检查和处理是幂等的，可以安全重复执行

---

## 十、性能优化

### 10.1 事件发送优化

#### 防抖机制
```java
// 原生层：防抖发送进度事件
private Handler progressHandler = new Handler(Looper.getMainLooper());
private Runnable progressRunnable;

private void sendProgressDebounced(ScanProgress progress) {
    if (progressRunnable != null) {
        progressHandler.removeCallbacks(progressRunnable);
    }
    
    progressRunnable = () -> {
        emitProgressEvent(progress);
    };
    
    // 每500ms发送一次（避免过于频繁）
    progressHandler.postDelayed(progressRunnable, 500);
}
```

### 9.2 批量操作

#### 数据库批量写入
```java
// 原生层：批量写入，减少事件发送
private void batchWriteImages(List<ImageData> images, int batchSize) {
    for (int i = 0; i < images.size(); i += batchSize) {
        List<ImageData> batch = images.subList(i, 
            Math.min(i + batchSize, images.size()));
        
        // 批量写入
        databaseHelper.writeImages(batch);
        
        // 每批次发送一次更新事件
        if (i % (batchSize * 10) == 0) {
            notifyDataUpdated("images", getAffectedIds(batch));
        }
    }
}
```

---

## 十、实施建议

### 10.1 开发顺序

1. **阶段1：基础通信**（1周）
   - 实现GalleryScanModule基础接口
   - 实现EventEmitter事件发送
   - JS层事件监听和UI更新

2. **阶段2：扫描逻辑迁移**（3-4周）
   - 目录扫描
   - EXIF提取
   - 文件比对
   - 数据库操作

3. **阶段3：分类功能**（2-3周）
   - 截图检测
   - 远程推理
   - 本地推理

4. **阶段4：完善和优化**（1-2周）
   - 错误处理
   - 性能优化
   - 状态管理

### 10.2 测试策略

#### 单元测试
- 原生层：JUnit测试
- JS层：Jest测试

#### 集成测试
- 端到端测试（E2E）
- 后台运行测试
- 错误恢复测试

#### 性能测试
- 大量图片扫描测试（1万+）
- 内存使用监控
- 电池消耗测试

---

## 十一、总结

### 11.1 核心设计要点

1. **完全分离**：原生层负责所有计算，JS层只负责UI
2. **事件驱动**：使用EventEmitter进行异步通信
3. **数据一致性**：原生层控制数据库，JS层只读
4. **后台运行**：完全不依赖JS线程

### 11.2 优势

- ✅ 真正的后台扫描
- ✅ 高性能（原生代码）
- ✅ 低耦合（清晰接口）
- ✅ 易维护（职责明确）

### 11.3 关键成功因素

1. 完善的错误处理和恢复机制
2. 高效的事件通信（防抖、批量）
3. 稳定的数据库并发控制
4. 充分的测试覆盖

