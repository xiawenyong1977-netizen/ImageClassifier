# AI图像增强功能 - 实现计划

## 📋 项目概览

**目标**：在PC版本的"暂存箱"(tobecleaned)中实现AI图像增强功能

**参考文档**：`docs/AI图像增强功能设计文档.md`

**预计总工作量**：约 800-900 行代码，3-4个工作日

**实现方式**：分阶段开发，每个阶段独立可测试

---

## 🎯 实施策略

### 核心原则
1. **自底向上**：先实现底层服务，再实现UI层
2. **独立可测**：每个阶段完成后可独立测试
3. **最小可用**：优先实现核心功能，再完善体验
4. **渐进式**：先单张测试，再支持批量

### 分阶段计划

```
Phase 1: 基础设施 (P0 - 必须)
  ├─ IPC handlers
  ├─ Settings 扩展
  └─ 测试文件操作

Phase 2: Service 层 (P0 - 必须)
  ├─ ImageEnhanceService
  ├─ UnifiedDataService 扩展
  └─ 单元测试

Phase 3: UI 基础 (P0 - 必须)
  ├─ EnhanceModal (配置+进度)
  ├─ 操作菜单入口
  └─ 基础样式

Phase 4: 核心流程 (P0 - 必须)
  ├─ 提交任务
  ├─ 轮询状态
  └─ 结果展示

Phase 5: 保存功能 (P0 - 必须)
  ├─ 下载增强图
  ├─ 保存到xualbum
  └─ 添加到暂存箱

Phase 6: 体验优化 (P1 - 重要)
  ├─ 后台运行
  ├─ 错误处理
  └─ 进度优化

Phase 7: 测试与修复 (P0 - 必须)
  ├─ 集成测试
  ├─ Bug修复
  └─ 文档完善
```

---

## 📅 详细实施计划

### Phase 1: 基础设施 (0.5天)

**目标**：搭建文件操作和设置存储的基础能力

#### 任务 1.1: 新增 Electron IPC Handlers
**文件**：`public/electron.js`

**工作内容**：
```javascript
// 在 setupIpcHandlers() 函数中新增 2 个 handlers（第 349 行后）

1. ensure-directory
   - 功能：递归创建目录
   - 输入：dirPath (string)
   - 输出：{ success: boolean, path?: string, error?: string }

2. save-file-to-path
   - 功能：保存文件到指定路径
   - 输入：{ path: string, buffer: Buffer }
   - 输出：{ success: boolean, path?: string, error?: string }

注：获取系统图片目录可直接在渲染进程中使用 Node.js API：
  const os = window.require('os');
  const path = window.require('path');
  const picturesDir = path.join(os.homedir(), 'Pictures');
```

**代码量**：约 35-40 行（减少了 get-pictures-directory）

**测试要点**：
- [ ] 创建 `C:/Users/xxx/Pictures/xualbum` 目录成功
- [ ] 保存测试文件到目录成功
- [ ] 处理路径中的特殊字符
- [ ] 处理权限不足的错误

**验收标准**：
```javascript
// 在 CategoryScreen 中测试
const { ipcRenderer } = window.require('electron');

// 测试1: 创建目录
const result1 = await ipcRenderer.invoke('ensure-directory', 'C:/Users/xxx/Pictures/xualbum');
console.assert(result1.success === true, '创建目录失败');

// 测试2: 保存文件
const testBuffer = Buffer.from('test content');
const result2 = await ipcRenderer.invoke('save-file-to-path', {
  path: 'C:/Users/xxx/Pictures/xualbum/test.txt',
  buffer: testBuffer
});
console.assert(result2.success === true, '保存文件失败');
```

---

#### 任务 1.2: 扩展 ImageStorageService - 初始化 AI 预设方案
**文件**：`src/services/ImageStorageService.js`

**工作内容**：
在 `getSettings()` 方法中新增初始化逻辑（约 2023 行后）

```javascript
// 在 getSettings() 的返回前添加

// 🆕 初始化 AI 增强预设方案
if (!result.aiEnhancePresets) {
  result.aiEnhancePresets = {
    portrait: { name: '人像美颜', icon: '👤', prompt: '...', ... },
    enhance: { name: '清晰增强', icon: '✨', prompt: '...', ... },
    color: { name: '色彩优化', icon: '🎨', prompt: '...', ... },
    custom: { name: '自定义', icon: '⚙️', prompt: '', ... }
  };
}

if (!result.aiEnhanceDefaultPreset) {
  result.aiEnhanceDefaultPreset = 'portrait';
}

if (!result.aiEnhanceRecentPrompts) {
  result.aiEnhanceRecentPrompts = [];
}
```

**代码量**：约 50 行

**测试要点**：
- [ ] 首次启动时自动初始化预设方案
- [ ] 已有设置不会被覆盖
- [ ] 读取设置后能获取到完整的预设方案

**验收标准**：
```javascript
// 在任意 Screen 中测试
const settings = await UnifiedDataService.readSettings();
console.log('AI预设方案:', settings.aiEnhancePresets);
console.assert(Object.keys(settings.aiEnhancePresets).length === 4, '预设方案数量错误');
console.assert(settings.aiEnhanceDefaultPreset === 'portrait', '默认预设错误');
```

---

### Phase 2: Service 层 (1天)

**目标**：实现 AI 增强的核心业务逻辑

#### 任务 2.1: 新建 ImageEnhanceService
**文件**：`src/services/ImageEnhanceService.js` (新建)

**工作内容**：
```javascript
// 完整实现 ImageEnhanceService 类

1. 图片预处理
   - resizeImage(imageUri, maxSize, quality)
   - calculateImageHash(blob)
   - prepareImageForEnhance(imageUri)

2. API 交互
   - submitEnhanceTask(imageFile, preset, imageHash, clientId)
   - queryTaskStatus(taskId, clientId)
   - pollTaskStatus(taskId, clientId, onProgress)

3. 文件操作
   - downloadEnhancedImage(resultUrl)
   - saveToXualbum(imageBlob, originalFileName)
```

**代码量**：约 300 行

**实现顺序**：
1. 先实现图片预处理（resize + hash）
2. 再实现 API 调用（submit + query）
3. 最后实现文件保存（download + save）

**测试要点**：
- [ ] Resize 图片到 1024px 长边，保持宽高比
- [ ] 计算 SHA-256 哈希正确
- [ ] 提交任务返回 task_id
- [ ] 查询任务状态返回正确格式
- [ ] 下载图片成功
- [ ] 保存文件到 xualbum 目录，文件名格式正确

**验收标准**：
```javascript
import ImageEnhanceService from './ImageEnhanceService.js';

// 测试1: 预处理图片
const testImageUri = 'file:///path/to/test.jpg';
const { file, hash } = await ImageEnhanceService.prepareImageForEnhance(testImageUri);
console.assert(file instanceof Blob, '文件类型错误');
console.assert(hash.length === 64, '哈希长度错误');

// 测试2: 提交任务
const clientId = await UnifiedDataService.getClientId();
const result = await ImageEnhanceService.submitEnhanceTask(
  file, 'auto', hash, clientId
);
console.assert(result.task_id, '未返回 task_id');

// 测试3: 保存文件
const testBlob = new Blob(['test'], { type: 'image/jpeg' });
const saveResult = await ImageEnhanceService.saveToXualbum(testBlob, 'test.jpg');
console.assert(saveResult.fileName.includes('_xt_'), '文件名格式错误');
```

---

#### 任务 2.2: 扩展 UnifiedDataService - 添加 addImage 方法
**文件**：`src/services/UnifiedDataService.js`

**工作内容**：
在 `writeDeleteImages()` 方法后新增 `addImage()` 方法（约 556 行后）

```javascript
/**
 * 添加单张图片（用于AI增强图）
 */
async addImage(imageData) {
  try {
    logger.debug('添加新图片:', imageData.fileName);
    
    // 1. 写入数据库
    await this.imageStorageService.addOrUpdateSingleImage(imageData);
    logger.debug('✅ 数据库写入完成');
    
    // 2. 增量更新缓存
    this.imageCache.addImageToCache(imageData);
    logger.debug('✅ 缓存增量更新完成');
    
    // 3. 刷新缓存统计
    await this.imageCache.refreshCache();
    logger.debug('✅ 缓存统计刷新完成');
    
    return imageData;
  } catch (error) {
    logger.error('❌ 添加图片失败:', error);
    throw error;
  }
}

```

**代码量**：约 20 行

**测试要点**：
- [ ] 添加图片到数据库成功
- [ ] 图片立即显示在暂存箱中
- [ ] metadata 正确保存

**验收标准**：
```javascript
// 测试添加图片
const testImageData = {
  id: `img_${Date.now()}_test`,
  fileName: 'test_xt_1234567890.jpg',
  uri: 'file:///C:/Users/xxx/Pictures/xualbum/test_xt_1234567890.jpg',
  path: 'C:\\Users\\xxx\\Pictures\\xualbum\\test_xt_1234567890.jpg',
  category: 'tobecleaned',
  timestamp: Date.now(),
  takenAt: Date.now(),
  tags: ['ai_enhanced'],
  metadata: {
    source: 'ai_enhanced',
    originalImageId: 'img_original_test',
    enhancePreset: 'auto'
  }
};

await UnifiedDataService.addImage(testImageData);

// 验证图片已添加
const images = await UnifiedDataService.readImagesByCategory('tobecleaned');
const addedImage = images.find(img => img.id === testImageData.id);
console.assert(addedImage !== undefined, '图片未添加到数据库');
console.assert(addedImage.tags.includes('ai_enhanced'), '标签未保存');
```

---

### Phase 3: UI 基础 (0.5天)

**目标**：实现 UI 框架和基础交互

#### 任务 3.1: 添加操作菜单入口
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
在 `HeaderComponent` 的操作菜单中添加"AI图像增强"选项（约 1284 行后）

```javascript
{/* tobecleaned 分类特有的操作 */}
{categoryId === 'tobecleaned' && (
  <>
    <TouchableOpacity 
      style={styles.menuItem}
      onPress={handleOpenEnhance}
      disabled={selectedCount < 1 || selectedCount > 9}
    >
      <Text style={styles.menuItemText}>
        ✨ AI图像增强 ({selectedCount}/9)
      </Text>
    </TouchableOpacity>
  </>
)}
```

**代码量**：约 15 行

**测试要点**：
- [ ] 仅在 tobecleaned 分类中显示
- [ ] 选中 0 张图片时禁用
- [ ] 选中 1-9 张图片时可用
- [ ] 选中超过 9 张图片时禁用
- [ ] 显示当前选中数量

---

#### 任务 3.2: 实现 EnhanceModal 基础结构
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
1. 定义状态变量（约 320 行后）
2. 实现 Modal 组件结构
3. 实现配置视图（预设方案选择）
4. 实现进度视图（处理中）

**代码量**：约 350 行

**状态定义**：
```javascript
// ========== AI图像增强相关状态 ==========
const [showEnhanceModal, setShowEnhanceModal] = useState(false);
const [enhanceStep, setEnhanceStep] = useState('config'); // 'config' | 'processing'
const [enhancePreset, setEnhancePreset] = useState('portrait');
const [customPrompt, setCustomPrompt] = useState('');
const [enhanceProgress, setEnhanceProgress] = useState({ total: 0, completed: 0 });
const [currentTaskId, setCurrentTaskId] = useState(null);
const [enhanceResults, setEnhanceResults] = useState([]);

// 预设方案（从设置加载）
const [enhancePresets, setEnhancePresets] = useState(DEFAULT_ENHANCE_PRESETS);
```

**测试要点**：
- [ ] Modal 打开和关闭正常
- [ ] 预设方案卡片显示正确
- [ ] 选择预设方案后自动填充提示词
- [ ] 自定义预设可以输入提示词
- [ ] 配置状态和进度状态切换正常

---

### Phase 4: 核心流程 (1天)

**目标**：实现完整的增强处理流程

#### 任务 4.1: 实现"开始增强"逻辑
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
const handleStartEnhance = useCallback(async () => {
  try {
    // 1. 准备图片数据
    const selectedImages = getSelectedImages();
    const imagesToEnhance = selectedImages.map(...);
    
    // 2. 预处理图片（resize + hash）
    const imageFiles = await Promise.all(
      imagesToEnhance.map(img => 
        ImageEnhanceService.prepareImageForEnhance(img.uri)
      )
    );
    
    // 3. 获取提示词
    const prompt = enhancePreset === 'custom' 
      ? customPrompt 
      : enhancePresets[enhancePreset].prompt;
    
    // 4. 提交任务到 API
    const clientId = await UnifiedDataService.getClientId();
    const result = await submitImageEdit(imageFiles, prompt, clientId);
    
    // 5. 切换到进度状态
    setCurrentTaskId(result.task_id);
    setEnhanceStep('processing');
    setEnhanceProgress({ total: imagesToEnhance.length, completed: 0 });
    
    // 6. 开始轮询
    pollEnhanceStatus(result.task_id, imagesToEnhance);
    
  } catch (error) {
    logger.error('开始增强失败:', error);
    Alert.alert('错误', error.message);
  }
}, [enhancePreset, customPrompt, enhancePresets]);
```

**代码量**：约 80 行

**测试要点**：
- [ ] 选中的图片正确传递
- [ ] 图片预处理成功（resize + hash）
- [ ] API 提交成功，返回 task_id
- [ ] 进度状态正确初始化
- [ ] 错误处理正确（网络错误、API 错误）

---

#### 任务 4.2: 实现轮询任务状态
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
const pollEnhanceStatus = useCallback(async (taskId, imagesToEnhance) => {
  const pollingInterval = 2000; // 2秒
  const maxRetries = 60; // 最多2分钟
  let retries = 0;

  const poll = async () => {
    try {
      retries++;
      
      // 查询任务状态
      const clientId = await UnifiedDataService.getClientId();
      const status = await ImageEnhanceService.queryTaskStatus(taskId, clientId);
      
      // 更新进度
      setEnhanceProgress({
        total: imagesToEnhance.length,
        completed: status.completed || 0,
        processing: status.processing || 0,
        failed: status.failed || 0
      });
      
      // 检查状态
      if (status.status === 'completed') {
        // 完成
        setEnhanceResults(status.results);
        setShowEnhanceModal(false);
        setShowEnhanceResult(true);
        return;
      } else if (status.status === 'failed') {
        throw new Error(status.error || '任务失败');
      } else if (retries >= maxRetries) {
        throw new Error('任务超时');
      }
      
      // 继续轮询
      setTimeout(poll, pollingInterval);
      
    } catch (error) {
      logger.error('轮询失败:', error);
      Alert.alert('错误', error.message);
      setEnhanceStep('config');
    }
  };
  
  poll();
}, []);
```

**代码量**：约 60 行

**测试要点**：
- [ ] 每 2 秒查询一次状态
- [ ] 进度实时更新
- [ ] 任务完成后停止轮询
- [ ] 任务失败时显示错误
- [ ] 超时后自动停止

---

#### 任务 4.3: 实现结果展示 Modal
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
实现 `EnhanceResultModal` 组件，展示增强前后对比

```javascript
<Modal visible={showEnhanceResult} ...>
  <View style={styles.enhanceResultModal}>
    {/* 标题栏 */}
    <View style={styles.enhanceResultHeader}>
      <Text>增强结果 ({currentResultIndex + 1}/{enhanceResults.length})</Text>
    </View>
    
    {/* 对比展示 */}
    <View style={styles.enhanceResultCompare}>
      <View style={styles.enhanceResultImageContainer}>
        <Text>原图</Text>
        <Image source={{ uri: currentResult.originalUrl }} />
      </View>
      <View style={styles.enhanceResultImageContainer}>
        <Text>增强后</Text>
        <Image source={{ uri: currentResult.resultUrl }} />
      </View>
    </View>
    
    {/* 操作按钮 */}
    <View style={styles.enhanceResultActions}>
      <TouchableOpacity onPress={handlePrevResult}>上一张</TouchableOpacity>
      <TouchableOpacity onPress={() => handleSaveEnhancedImage(currentResultIndex, 'local')}>
        💾 保存到本地
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleSaveEnhancedImage(currentResultIndex, 'add')}>
        ➕ 添加为新图
      </TouchableOpacity>
      <TouchableOpacity onPress={handleNextResult}>下一张</TouchableOpacity>
    </View>
  </View>
</Modal>
```

**代码量**：约 150 行

**测试要点**：
- [ ] 原图和增强图对比显示
- [ ] 支持左右切换查看多张结果
- [ ] 操作按钮正常工作
- [ ] 图片加载正常（显示 loading 状态）

---

### Phase 5: 保存功能 (0.5天)

**目标**：实现增强图的保存逻辑

#### 任务 5.1: 实现"保存到本地"功能
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
const handleSaveEnhancedImage = useCallback(async (index, saveMode) => {
  try {
    const result = enhanceResults[index];
    
    if (saveMode === 'local') {
      // 使用 Electron 的保存对话框
      const { ipcRenderer } = window.require('electron');
      const { dialog } = window.require('@electron/remote');
      
      const savePath = await dialog.showSaveDialog({
        defaultPath: result.filename,
        filters: [{ name: 'Images', extensions: ['jpg', 'png'] }]
      });
      
      if (savePath.canceled) return;
      
      // 下载图片
      const blob = await ImageEnhanceService.downloadEnhancedImage(result.resultUrl);
      const arrayBuffer = await blob.arrayBuffer();
      
      // 保存文件
      await ipcRenderer.invoke('save-file-to-path', {
        path: savePath.filePath,
        buffer: Buffer.from(arrayBuffer)
      });
      
      Alert.alert('成功', '图片已保存到本地');
    }
    
    // ... saveMode === 'add' 的逻辑在任务 5.2
    
  } catch (error) {
    logger.error('保存图片失败:', error);
    Alert.alert('错误', error.message);
  }
}, [enhanceResults]);
```

**代码量**：约 50 行

**测试要点**：
- [ ] 保存对话框正常弹出
- [ ] 可以选择保存位置
- [ ] 文件正确保存到指定位置
- [ ] 取消操作正常处理

---

#### 任务 5.2: 实现"添加为新图"功能
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
// 在 handleSaveEnhancedImage 中添加 'add' 分支

if (saveMode === 'add') {
  // 1. 下载增强图
  const blob = await ImageEnhanceService.downloadEnhancedImage(result.resultUrl);
  
  // 2. 保存到 xualbum 目录
  const saveResult = await ImageEnhanceService.saveToXualbum(
    blob, 
    result.filename
  );
  
  // 3. 添加到数据库（tobecleaned 分类）
  const timestamp = Date.now();
  const imageData = {
    id: `img_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
    fileName: saveResult.fileName,
    uri: `file:///${saveResult.filePath.replace(/\\/g, '/')}`,
    path: saveResult.filePath,
    category: 'tobecleaned',
    timestamp: timestamp,
    takenAt: timestamp,
    
    tags: ['ai_enhanced'],
    
    metadata: {
      source: 'ai_enhanced',
      originalImageId: result.originalImageId,
      enhancePreset: enhancePreset,
      enhancedAt: timestamp
    }
  };
  
  await UnifiedDataService.addImage(imageData);
  
  Alert.alert(
    '添加成功',
    `增强图片已添加到暂存箱\n\n文件已保存到：\n${saveResult.directory}\n\n您可以对比原图和增强图，然后删除不需要的版本`
  );
}
```

**代码量**：约 70 行

**测试要点**：
- [ ] 图片下载成功
- [ ] 文件保存到 `Pictures/xualbum/` 目录
- [ ] 文件名格式正确：`原文件名_xt_时间戳.扩展名`
- [ ] 图片立即显示在暂存箱中
- [ ] tags 和 metadata 正确保存
- [ ] 可以查看和删除原图/增强图

---

### Phase 6: 体验优化 (0.5天)

**目标**：完善用户体验和错误处理

#### 任务 6.1: 实现后台运行功能
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
// 1. 添加浮动进度状态
const [showFloatingProgress, setShowFloatingProgress] = useState(false);

// 2. 在 Modal 中添加"后台运行"按钮
<TouchableOpacity onPress={handleBackgroundRun}>
  后台运行
</TouchableOpacity>

// 3. 实现后台运行逻辑
const handleBackgroundRun = useCallback(() => {
  setShowEnhanceModal(false);  // 关闭Modal
  setShowFloatingProgress(true);  // 显示浮动进度
  // 轮询继续在后台运行
}, []);

// 4. 添加浮动进度组件
{showFloatingProgress && (
  <View style={styles.floatingProgress}>
    <Text>照片创玩中...</Text>
    <Text>{enhanceProgress.completed}/{enhanceProgress.total}</Text>
    <TouchableOpacity onPress={() => {
      setShowFloatingProgress(false);
      setShowEnhanceModal(true);
    }}>
      查看详情
    </TouchableOpacity>
  </View>
)}
```

**代码量**：约 50 行

**测试要点**：
- [ ] 点击"后台运行"关闭 Modal
- [ ] 浮动进度显示在右下角
- [ ] 进度实时更新
- [ ] 点击浮动进度可以重新打开 Modal
- [ ] 任务完成后自动打开结果 Modal

---

#### 任务 6.2: 完善错误处理
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
// 在各个关键点添加错误处理

1. 图片预处理失败
   - 提示：图片处理失败，请重试
   - 继续处理其他图片

2. API 提交失败
   - 提示：网络错误，请检查网络连接
   - 返回配置状态

3. 轮询超时
   - 提示：处理超时，请稍后在任务列表中查看
   - 提供重试选项

4. 文件保存失败
   - 提示：文件保存失败，请检查磁盘空间和权限
   - 提供重试选项

5. 数据库写入失败
   - 提示：添加到数据库失败，但文件已保存到 xualbum
   - 记录错误日志
```

**代码量**：约 50 行

**测试要点**：
- [ ] 各种错误场景都有友好提示
- [ ] 错误不会导致应用崩溃
- [ ] 部分失败不影响其他图片
- [ ] 错误信息清晰易懂

---

#### 任务 6.3: 添加加载状态和进度提示
**文件**：`src/screens/desktop/CategoryScreen.desktop.js`

**工作内容**：
```javascript
// 1. 添加加载状态
const [isEnhancing, setIsEnhancing] = useState(false);

// 2. 在按钮上显示加载状态
<TouchableOpacity 
  onPress={handleStartEnhance}
  disabled={isEnhancing}
>
  <Text>{isEnhancing ? '处理中...' : '开始增强'}</Text>
  {isEnhancing && <ActivityIndicator />}
</TouchableOpacity>

// 3. 显示预计耗时
<Text style={styles.enhanceEstimateTime}>
  ⏱️ 预计耗时：约 {selectedCount * 18} 秒
</Text>

// 4. 进度条可视化
<View style={styles.enhanceProgressBar}>
  <View 
    style={[
      styles.enhanceProgressBarFill,
      { width: `${(enhanceProgress.completed / enhanceProgress.total) * 100}%` }
    ]}
  />
</View>
```

**代码量**：约 30 行

**测试要点**：
- [ ] 加载状态显示正确
- [ ] 按钮在处理中禁用
- [ ] 预计耗时计算正确
- [ ] 进度条实时更新

---

### Phase 7: 测试与修复 (0.5天)

**目标**：全面测试和修复问题

#### 任务 7.1: 集成测试
**测试用例**：

**场景1：单张图片增强**
```
1. 进入暂存箱
2. 选中 1 张图片
3. 点击"AI图像增强"
4. 选择"人像美颜"
5. 点击"开始增强"
6. 等待处理完成
7. 查看结果对比
8. 点击"添加为新图"
9. 验证图片出现在暂存箱中
10. 验证文件保存在 xualbum 目录
11. 验证文件名格式正确
```

**场景2：多张图片批量增强**
```
1. 选中 5 张图片
2. 选择"清晰增强"
3. 开始增强
4. 点击"后台运行"
5. 浏览其他分类
6. 任务完成后自动弹出结果
7. 逐张查看对比效果
8. 批量保存所有增强图
```

**场景3：自定义提示词**
```
1. 选中 2 张图片
2. 选择"自定义"
3. 输入自定义提示词
4. 开始增强
5. 验证结果符合预期
```

**场景4：错误处理**
```
1. 断网状态下提交任务 → 显示网络错误
2. 处理超大图片 → 正常处理或友好提示
3. 磁盘空间不足 → 显示磁盘空间不足错误
4. 同时处理多个任务 → 正常排队或提示
```

**测试清单**：
- [ ] 单张图片增强成功
- [ ] 多张图片批量增强成功
- [ ] 自定义提示词生效
- [ ] 保存到本地功能正常
- [ ] 添加为新图功能正常
- [ ] 后台运行功能正常
- [ ] 进度显示准确
- [ ] 结果对比清晰
- [ ] 错误处理完善
- [ ] 性能表现良好

---

#### 任务 7.2: Bug 修复和优化
**重点检查项**：

1. **内存泄漏**
   - 图片加载后及时释放
   - Modal 关闭后清理状态
   - 轮询停止后清理定时器

2. **UI 响应性**
   - 大图片加载时显示 loading
   - 长时间处理不卡顿
   - 动画流畅

3. **数据一致性**
   - 数据库和文件系统同步
   - 缓存及时更新
   - 选中状态正确

4. **边界情况**
   - 选中 0 张图片
   - 选中 9 张图片（最大值）
   - 选中 10 张图片（超出限制）
   - 图片不存在
   - 权限不足

---

#### 任务 7.3: 文档完善
**更新内容**：

1. **用户文档**（可选）
   - 功能介绍
   - 使用指南
   - 常见问题

2. **开发文档**
   - API 文档
   - 代码注释
   - 架构说明

3. **更新日志**
   - 新增功能列表
   - 已知问题
   - 后续计划

---

## 📊 进度跟踪表

| 阶段 | 任务 | 预计时间 | 实际时间 | 状态 | 备注 |
|------|------|---------|---------|------|------|
| Phase 1 | 1.1 IPC Handlers | 2h | - | ⬜ 待开始 | |
| Phase 1 | 1.2 Settings 扩展 | 1h | - | ⬜ 待开始 | |
| Phase 2 | 2.1 ImageEnhanceService | 5h | - | ⬜ 待开始 | |
| Phase 2 | 2.2 UnifiedDataService 扩展 | 1h | - | ⬜ 待开始 | |
| Phase 3 | 3.1 操作菜单入口 | 0.5h | - | ⬜ 待开始 | |
| Phase 3 | 3.2 EnhanceModal 基础 | 3h | - | ⬜ 待开始 | |
| Phase 4 | 4.1 开始增强逻辑 | 2h | - | ⬜ 待开始 | |
| Phase 4 | 4.2 轮询任务状态 | 2h | - | ⬜ 待开始 | |
| Phase 4 | 4.3 结果展示 Modal | 2h | - | ⬜ 待开始 | |
| Phase 5 | 5.1 保存到本地 | 1h | - | ⬜ 待开始 | |
| Phase 5 | 5.2 添加为新图 | 2h | - | ⬜ 待开始 | |
| Phase 6 | 6.1 后台运行 | 1h | - | ⬜ 待开始 | |
| Phase 6 | 6.2 错误处理 | 1.5h | - | ⬜ 待开始 | |
| Phase 6 | 6.3 加载状态 | 1h | - | ⬜ 待开始 | |
| Phase 7 | 7.1 集成测试 | 2h | - | ⬜ 待开始 | |
| Phase 7 | 7.2 Bug 修复 | 2h | - | ⬜ 待开始 | |
| Phase 7 | 7.3 文档完善 | 1h | - | ⬜ 待开始 | |
| **总计** | **17 个任务** | **~30h** | **-** | **⬜** | **约 3-4 天** |

**状态说明**：
- ⬜ 待开始
- 🟦 进行中
- ✅ 已完成
- ⚠️ 遇到问题
- ❌ 已取消

---

## 🎯 里程碑

### Milestone 1: 基础能力就绪 (Day 1)
**完成标志**：
- ✅ IPC handlers 可用
- ✅ Settings 扩展完成
- ✅ ImageEnhanceService 核心功能完成
- ✅ 可以提交任务并查询状态

**验收**：
```javascript
// 可以成功执行完整流程的前半部分
const { file, hash } = await ImageEnhanceService.prepareImageForEnhance(testUri);
const result = await ImageEnhanceService.submitEnhanceTask(file, 'auto', hash, clientId);
const status = await ImageEnhanceService.queryTaskStatus(result.task_id, clientId);
console.log('任务状态:', status);
```

---

### Milestone 2: UI 可用 (Day 2)
**完成标志**：
- ✅ 操作菜单入口可见
- ✅ EnhanceModal 可以打开
- ✅ 可以选择预设方案
- ✅ 可以提交任务并看到进度

**验收**：
- 在暂存箱中选择图片
- 点击"AI图像增强"打开 Modal
- 选择预设方案，点击"开始增强"
- 看到进度条更新

---

### Milestone 3: 核心流程打通 (Day 3)
**完成标志**：
- ✅ 完整的增强流程可以走通
- ✅ 结果可以展示
- ✅ 可以保存到本地
- ✅ 可以添加为新图到暂存箱

**验收**：
- 完成一次完整的增强流程
- 增强图保存到 xualbum 目录
- 增强图显示在暂存箱中
- 可以对比和删除原图/增强图

---

### Milestone 4: 功能完善 (Day 4)
**完成标志**：
- ✅ 后台运行功能可用
- ✅ 错误处理完善
- ✅ 加载状态完善
- ✅ 集成测试通过
- ✅ 主要 Bug 已修复

**验收**：
- 所有测试场景通过
- 错误场景有友好提示
- 性能表现良好
- 可以发布使用

---

## 🚨 风险与应对

### 风险1：API 调用失败率高
**应对**：
- 添加重试机制（最多3次）
- 提供清晰的错误提示
- 记录失败日志供分析

### 风险2：大图片处理性能问题
**应对**：
- 限制图片大小（最大 1024px）
- 使用 Web Worker 处理（可选）
- 显示处理进度

### 风险3：文件保存权限问题
**应对**：
- 检查目录权限
- 提供友好的错误提示
- 支持选择其他目录

### 风险4：用户中断操作
**应对**：
- 支持后台运行
- 任务状态持久化（可选）
- 支持取消任务

---

## ✅ 完成标准

### 功能完整性
- [ ] 可以选择 1-9 张图片进行增强
- [ ] 支持 4 种预设方案 + 自定义
- [ ] 可以提交任务并实时查看进度
- [ ] 可以查看增强前后对比
- [ ] 可以保存到本地
- [ ] 可以添加为新图到暂存箱
- [ ] 支持后台运行

### 用户体验
- [ ] 操作流程流畅
- [ ] 进度显示准确
- [ ] 错误提示友好
- [ ] 加载状态明确
- [ ] 结果展示清晰

### 代码质量
- [ ] 代码结构清晰
- [ ] 注释完整
- [ ] 错误处理完善
- [ ] 性能表现良好
- [ ] 无内存泄漏

### 测试覆盖
- [ ] 核心功能测试通过
- [ ] 边界情况测试通过
- [ ] 错误场景测试通过
- [ ] 性能测试通过

---

## 📝 开发建议

1. **优先级原则**
   - 先实现 P0 功能（基础能力 + 核心流程）
   - 再实现 P1 功能（体验优化）
   - 最后实现 P2 功能（锦上添花）

2. **测试驱动**
   - 每完成一个模块就测试
   - 不要等到最后才集成测试
   - 发现问题立即修复

3. **小步快跑**
   - 每天完成 1-2 个 Phase
   - 每个 Phase 完成后提交代码
   - 及时同步进度

4. **日志记录**
   - 关键节点添加日志
   - 错误信息详细记录
   - 方便排查问题

5. **性能优先**
   - 避免不必要的重新渲染
   - 图片及时释放内存
   - 长时间操作使用后台线程

---

## 🎉 预期成果

完成后，用户可以：
1. ✨ 在暂存箱中选择 1-9 张图片
2. 🎨 选择 AI 增强方案（人像美颜/清晰增强/色彩优化/自定义）
3. ⏱️ 实时查看处理进度，支持后台运行
4. 🔍 查看增强前后对比效果
5. 💾 保存增强图到本地或添加回暂存箱
6. 🗑️ 对比后删除原图，保留增强图

**预期效果**：
- 处理速度：平均 18 秒/张
- 用户满意度：显著提升图片质量
- 使用频率：每次整理照片时使用

---

## 📞 支持与反馈

遇到问题时：
1. 查看设计文档：`docs/AI图像增强功能设计文档.md`
2. 查看 API 文档：`docs/客户端调用指南.md`
3. 查看代码注释
4. 搜索相关错误日志

---

**文档版本**：v1.0  
**创建日期**：2025-01-27  
**最后更新**：2025-01-27

