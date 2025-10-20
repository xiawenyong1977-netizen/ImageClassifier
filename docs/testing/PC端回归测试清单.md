# PC端回归测试清单

## 📋 测试目的

验证 Service 层移动端适配改动**不会影响** PC 端现有功能。

---

## 🔍 本次改动回顾

### 已修改的文件
1. ✅ **WebAdapters.js** - 新增适配器，PC端使用原有逻辑
2. ✅ **ImageStorageService.js** - 新增 SQLiteAdapter，PC端继续使用 IndexedDB
3. ✅ **ImageClassifierService.js** - 使用 ModelPathAdapter，PC端路径不变
4. ✅ **GalleryScannerService.js** - 使用统一 Platform，PC端逻辑不变
5. ✅ **ColorHistogramExtractor.js** - 使用 CanvasAdapter，PC端使用浏览器 Canvas
6. ✅ **ConfigService.js** - 新增移动端逻辑，PC端使用原有 fetch 方式
7. ✅ **IPCListenerService.js** - 优化平台检测，PC端逻辑不变

### 改动原则
- ✅ **零破坏性**: 所有改动都是**增量式**的
- ✅ **条件分支**: 通过 `Platform.OS === 'web'` 判断
- ✅ **PC优先**: PC端始终走原有代码路径

---

## 🧪 核心功能测试

### 1. 应用启动测试 🚀

#### 1.1 开发环境启动
```bash
npm start
```

**检查点**：
- [ ] ✅ 应用正常启动（无报错）
- [ ] ✅ 控制台无 React 错误
- [ ] ✅ 首页正常显示

**预期日志**：
```
💻 PC端: 使用 IndexedDB 存储
💻 开始初始化 IndexedDB...
✅ IndexedDB 初始化完成
开始加载配置文件 (平台: web)...
💻 PC端配置文件路径: http://localhost:3000/initialSettings.json
✅ PC端配置文件加载成功
📊 配置统计: models: 3, categories: 10, ...
```

---

### 2. 配置加载测试 ⚙️

#### 2.1 ConfigService 初始化
**测试位置**: `src/services/ConfigService.js`

**检查点**：
- [ ] ✅ 配置文件正常加载
- [ ] ✅ 使用 `fetch` 方式加载（不是 require）
- [ ] ✅ 模型配置正确解析
- [ ] ✅ 分类映射正确加载

**验证方法**：
```javascript
// 在浏览器控制台执行
const configService = require('./services/ConfigService').default;
console.log('Models:', configService.getAllModelConfigs());
console.log('Categories:', configService.getCategoryNameMap());
```

**预期结果**：
- 看到 3 个模型配置（idCard, yolo8s, mobilenetv3）
- 看到完整的分类名称映射

---

### 3. 数据存储测试 💾

#### 3.1 IndexedDB 初始化
**测试位置**: `src/services/ImageStorageService.js`

**检查点**：
- [ ] ✅ IndexedDB 数据库创建成功
- [ ] ✅ 表结构正确（images, settings, stats, similarity_data, similarity_group_index）
- [ ] ✅ **不是** SQLite（移动端才用）

**验证方法**：
```javascript
// 打开浏览器 DevTools -> Application -> IndexedDB
// 应该看到 "ImageClassifierDB" 数据库
// 包含 5 个对象存储：images, settings, stats, similarityData, similarityGroupIndex
```

#### 3.2 数据读写测试
**检查点**：
- [ ] ✅ 图片数据可以保存
- [ ] ✅ 图片数据可以读取
- [ ] ✅ 设置可以保存和读取
- [ ] ✅ 统计信息正确更新

**验证方法**：
```javascript
// 在应用中进行一次扫描，然后检查 IndexedDB
// Application -> IndexedDB -> ImageClassifierDB -> images
// 应该看到扫描的图片记录
```

---

### 4. AI 推理测试 🤖

#### 4.1 模型加载
**测试位置**: `src/services/ImageClassifierService.js`

**检查点**：
- [ ] ✅ 使用 `onnxruntime-node`（不是 onnxruntime-react-native）
- [ ] ✅ 模型路径正确（`./models/xxx.onnx` 或 `http://localhost:3000/models/xxx.onnx`）
- [ ] ✅ 执行提供者正确（CUDA/DirectML/CPU）
- [ ] ✅ 模型加载成功

**预期日志**：
```
💻 Electron环境: 使用本地模型路径
🔍 适配器推荐的执行提供者: cuda, cpu
✅ ONNX Runtime (Node.js) 初始化成功
📦 加载模型: yolo8s from ./models/yolov8s.onnx
✅ 模型加载成功: yolo8s
```

#### 4.2 图片分类
**检查点**：
- [ ] ✅ 图片可以正常分类
- [ ] ✅ 置信度正确
- [ ] ✅ 分类结果准确
- [ ] ✅ 推理速度正常（无明显变慢）

**验证方法**：
- 扫描一个测试文件夹
- 查看分类结果是否正确
- 记录推理时间（与之前版本对比）

---

### 5. 图片扫描测试 📸

#### 5.1 扫描功能
**测试位置**: `src/services/GalleryScannerService.js`

**检查点**：
- [ ] ✅ 可以选择扫描路径
- [ ] ✅ 文件扫描正常
- [ ] ✅ 图片识别正常
- [ ] ✅ 进度显示正常
- [ ] ✅ 扫描完成后数据正确保存

**验证方法**：
```
1. 点击"开始扫描"
2. 选择一个包含图片的文件夹
3. 观察扫描进度
4. 等待扫描完成
5. 检查结果是否正确
```

#### 5.2 远程推理降级
**检查点**：
- [ ] ✅ 远程推理服务可用时，使用远程推理
- [ ] ✅ 远程推理失败时，自动降级到本地推理
- [ ] ✅ 降级逻辑正常工作

---

### 6. 相似度检测测试 🔍

#### 6.1 ColorHistogramExtractor
**测试位置**: `src/services/ColorHistogramExtractor.js`

**检查点**：
- [ ] ✅ 使用浏览器 Canvas API（不是 react-native-canvas）
- [ ] ✅ 颜色直方图提取正常
- [ ] ✅ 特征向量生成正确

**验证方法**：
```javascript
// 在控制台测试
const extractor = new ColorHistogramExtractor();
const histogram = await extractor.extractHistogram('图片路径');
console.log('Histogram:', histogram);
// 应该看到 64 维的特征向量
```

#### 6.2 相似度分组
**检查点**：
- [ ] ✅ 相似图片可以正确分组
- [ ] ✅ 相似度分数准确
- [ ] ✅ 相似组显示正常

---

### 7. IPC 通信测试 📡

#### 7.1 IPCListenerService
**测试位置**: `src/services/IPCListenerService.js`

**检查点**：
- [ ] ✅ IPC 监听器正常初始化
- [ ] ✅ Electron 环境检测正确
- [ ] ✅ 标题栏按钮点击正常
- [ ] ✅ 文件操作 IPC 通信正常

**预期日志**：
```
💻 开始初始化 PC 端 IPCListenerService...
✅ 标题栏监听器设置完成
✅ 文件操作监听器设置完成
✅ PC 端 IPCListenerService 初始化完成
```

#### 7.2 文件删除
**检查点**：
- [ ] ✅ 删除图片时发送 IPC 消息
- [ ] ✅ 主进程接收并处理
- [ ] ✅ 文件被正确删除
- [ ] ✅ 数据库记录被删除

---

### 8. UI 功能测试 🎨

#### 8.1 首页功能
**检查点**：
- [ ] ✅ 图片数量统计正确
- [ ] ✅ 分类统计正确
- [ ] ✅ 最近图片显示正常
- [ ] ✅ 扫描按钮正常工作

#### 8.2 分类页面
**检查点**：
- [ ] ✅ 各分类图片正确显示
- [ ] ✅ 点击图片查看详情正常
- [ ] ✅ 图片预览正常
- [ ] ✅ 分类切换流畅

#### 8.3 设置页面
**检查点**：
- [ ] ✅ 扫描路径设置正常
- [ ] ✅ 设置保存成功
- [ ] ✅ 设置读取正确
- [ ] ✅ 界面无异常

---

## ⚡ 性能测试

### 1. 启动性能
**检查点**：
- [ ] ✅ 应用启动时间 < 3秒
- [ ] ✅ 首页渲染时间 < 2秒
- [ ] ✅ 无明显卡顿

### 2. 扫描性能
**检查点**：
- [ ] ✅ 扫描速度与之前版本相当
- [ ] ✅ 内存占用正常
- [ ] ✅ CPU 使用率正常

### 3. 数据库性能
**检查点**：
- [ ] ✅ IndexedDB 读写速度正常
- [ ] ✅ 大量图片（1000+）处理正常
- [ ] ✅ 查询响应时间 < 100ms

---

## 🐛 错误日志检查

### 控制台检查
**检查点**：
- [ ] ✅ 无红色错误（Error）
- [ ] ✅ 无未处理的 Promise rejection
- [ ] ✅ 无 React 警告（Warning）

### 关键日志
**必须出现的日志**：
```
✅ 💻 PC端: 使用 IndexedDB 存储
✅ 💻 PC端配置文件加载成功
✅ 💻 开始初始化 PC 端 IPCListenerService...
✅ IndexedDB 初始化完成
```

**不应出现的日志**：
```
❌ 📱 移动端环境...
❌ 📱 使用 SQLite 存储
❌ onnxruntime-react-native
```

---

## 🎯 关键验证点

### ✅ 必须通过的测试
1. **配置加载**: PC端使用 fetch，不是 require
2. **数据存储**: 使用 IndexedDB，不是 SQLite
3. **AI推理**: 使用 onnxruntime-node，不是 onnxruntime-react-native
4. **Canvas操作**: 使用浏览器 Canvas，不是 react-native-canvas
5. **IPC通信**: 正常初始化，不被跳过
6. **模型路径**: `./models/` 或 `http://localhost:3000/models/`

### ⚠️ 常见问题排查

#### 问题1: 配置加载失败
**症状**: 控制台显示 "配置文件加载失败"
**检查**:
- `Platform.OS` 是否正确识别为 'web'
- fetch 请求是否成功
- 配置文件路径是否正确

#### 问题2: IndexedDB 初始化失败
**症状**: 数据无法保存
**检查**:
- 浏览器是否支持 IndexedDB
- 是否被 SQLiteAdapter 替换（不应该）
- 数据库版本是否正确

#### 问题3: 模型加载失败
**症状**: AI推理不工作
**检查**:
- 是否使用了正确的 ONNX Runtime 版本
- 模型文件路径是否正确
- 执行提供者是否可用

#### 问题4: IPC 通信失败
**症状**: 标题栏按钮无响应
**检查**:
- IPC 监听器是否初始化
- Electron 环境是否正确检测
- 是否被移动端检测误判

---

## 📊 测试报告模板

### 测试环境
- **操作系统**: Windows 10 / macOS / Linux
- **Node.js 版本**: v18.x
- **Electron 版本**: 查看 package.json
- **浏览器**: Chrome / Electron

### 测试结果
| 测试项 | 状态 | 备注 |
|--------|------|------|
| 应用启动 | ⬜ 通过 / ❌ 失败 | |
| 配置加载 | ⬜ 通过 / ❌ 失败 | |
| 数据存储 | ⬜ 通过 / ❌ 失败 | |
| AI推理 | ⬜ 通过 / ❌ 失败 | |
| 图片扫描 | ⬜ 通过 / ❌ 失败 | |
| 相似度检测 | ⬜ 通过 / ❌ 失败 | |
| IPC通信 | ⬜ 通过 / ❌ 失败 | |
| UI功能 | ⬜ 通过 / ❌ 失败 | |

### 发现的问题
1. 
2. 
3. 

---

## 🚀 快速回归测试流程

如果时间有限，优先测试这些核心功能：

### 快速测试步骤（15分钟）
1. **启动应用** (2分钟)
   - `npm start`
   - 检查控制台日志
   - 确认首页正常显示

2. **配置和存储** (3分钟)
   - 检查 IndexedDB 是否创建
   - 查看配置加载日志
   - 确认使用的是 PC 端路径

3. **图片扫描** (5分钟)
   - 选择一个测试文件夹
   - 扫描 10-20 张图片
   - 检查分类结果

4. **查看结果** (3分钟)
   - 查看首页统计
   - 浏览各分类页面
   - 点击图片查看详情

5. **删除测试** (2分钟)
   - 删除一张图片
   - 确认文件和数据都被删除

---

## ✅ 测试通过标准

### 必须满足的条件
- ✅ 所有核心功能正常工作
- ✅ 无控制台错误
- ✅ PC 端特有逻辑未被破坏
- ✅ 性能无明显下降
- ✅ 数据持久化正常

### 可以接受的情况
- ⚠️ 轻微的日志格式变化（更清晰的平台标识）
- ⚠️ 性能提升（如果有）

### 不可接受的情况
- ❌ 任何功能失效
- ❌ PC 端使用了移动端逻辑
- ❌ 数据丢失或损坏
- ❌ 性能明显下降

---

**测试人**: _____________  
**测试日期**: 2025-01-20  
**测试版本**: Service 层移动端适配版本  
**测试结果**: ⬜ 通过 / ❌ 失败

