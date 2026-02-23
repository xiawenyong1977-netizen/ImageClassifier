# 芯图相册 - AI智能照片分类管理工具

[![Website](https://img.shields.io/badge/website-https://www.xintuxiangce.top-blue.svg)](https://www.xintuxiangce.top)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Android%20%7C%20iOS-lightgrey.svg)](https://www.xintuxiangce.top)
[![AI](https://img.shields.io/badge/AI-90%25%2B%20Accuracy-brightgreen.svg)](https://www.xintuxiangce.top)

## 📖 项目简介

**芯图相册**是一款基于AI技术的智能照片分类管理工具，能够自动识别和分类您的照片，帮助用户高效整理海量照片，释放存储空间。

### 核心优势

- 🤖 **AI智能识别** - 采用先进的深度学习技术，准确率高达90%以上
- 🔒 **隐私绝对安全** - 所有处理完全在本地进行，无需联网，零上传
- ⚡ **高效快速** - 优化的算法确保处理速度，大批量照片也能快速完成（扫描速度提升9.75倍）
- 🎯 **多维度分类** - 支持8大分类维度：内容、城市、颜色、存储、格式、分辨率、方向、相似组
- ✨ **AI图像增强** - PC端支持批量图像增强，人像美颜、清晰增强、色彩优化
- ✏️ **灵活可控** - AI分类结果支持手动调整
- 🎨 **简洁易用** - 清晰直观的界面设计，简单四步即可完成照片整理
- 💰 **完全免费** - 无广告、无内购、开源免费

## ✨ 核心功能

### 📋 多维度智能分类

芯图相册支持**8大分类维度**，从多个角度智能管理您的照片：

| 分类维度 | 图标 | 分类方式 | 说明 |
|---------|------|---------|------|
| **按内容分类** | 📷 | 🤖 AI分类 | 使用AI大模型识别照片内容，支持单人照、社交活动、宠物、美食、旅行风景、证件照等 |
| **按城市分类** | 🏙️ | 💻 本地算法 | 从照片EXIF信息提取GPS坐标，通过本地数据库匹配城市，按拍摄地点归类 |
| **按颜色分类** | 🎨 | 🤖 AI分类 | AI识别照片的主要颜色，按颜色主题分类（蓝色、绿色、红色等） |
| **按存储分类** | 📁 | 💻 本地算法 | 从文件路径提取目录信息，按存储位置分类（相机、微信、QQ等） |
| **按格式分类** | 🖼️ | 💻 本地算法 | 从文件MIME类型或扩展名提取格式信息（JPEG、PNG、HEIC等） |
| **按分辨率分类** | 📐 | 💻 本地算法 | 从图片元数据提取宽高像素，智能识别标准分辨率（4K、1080p、720p等） |
| **按方向分类** | 🔄 | 💻 本地算法 | 根据照片宽高比计算方向，自动分类（横屏、竖屏、全景、正方形） |
| **相似组分类** | 🔗 | 💻 本地算法 | 使用颜色直方图、时间窗口、文本相似度等算法，自动识别相似照片并分组 |

**分类方式说明：**
- **🤖 AI分类**：使用AI大模型进行智能识别，需要联网（或使用本地推理模型）
- **💻 本地算法**：使用本地算法处理，无需联网，速度快，保护隐私

### 📋 内容分类详情

自动识别照片内容，支持以下分类：

- 📱 **手机截图** - 自动识别手机屏幕截图，准确率98%+
- 🪪 **证件照片** - 身份证、护照、驾照等重要证件
- 👤 **单人照** - 个人照、自拍、肖像照片
- 👥 **社交活动** - 聚会、合影、多人互动场景
- 🏞️ **旅行风景** - 旅游景点、山川湖海、自然风光
- 🍔 **美食** - 食物、餐饮、烹饪相关照片
- 🐱 **萌宠** - 猫、狗等宠物照片
- 🔲 **二维码** - 二维码图片
- 📷 **其它** - 其他类型的照片

### ⚙️ 分类控制面板

在设置页面提供**分类控制面板**，您可以根据个人使用场景，自由选择需要显示哪些维度的分类：

- 🏙️ **城市分类** - 按拍摄城市分类
- 🎨 **颜色分类** - 按颜色主题分类
- 📁 **存储分类** - 按存储位置分类
- 📄 **格式分类** - 按文件格式分类
- 📏 **分辨率分类** - 按分辨率分类
- 🧭 **方向分类** - 按拍摄方向分类
- 🔗 **相似照片** - 相似照片分组
- 📸 **最近照片** - 最近添加的照片

所有分类维度都可以独立开启或关闭，让首页更加简洁和个性化。

### ✨ AI图像增强（PC端）

为暂存箱提供AI图像增强功能，支持批量美化处理：

- 👤 **人像美颜** - 修复面部瑕疵、提亮肤色，保持人物原貌
- ✨ **清晰增强** - 去除模糊、锐化细节，提升整体质量
- 🎨 **色彩优化** - 优化饱和度和对比度，使图片更加鲜艳生动
- ⚙️ **自定义编辑** - 支持自定义提示词，满足个性化需求
- 📦 **批量处理** - 一次处理1-9张图片，支持后台运行
- 💾 **灵活保存** - 支持保存到本地或添加回暂存箱方便对比

## 🚀 快速开始

### 系统要求

#### Windows版本
- Windows 10 或更高版本
- 4GB 以上内存（推荐8GB）
- 500MB 可用磁盘空间

#### macOS版本
- macOS 12 或更高版本
- 4GB 以上内存（推荐8GB）
- 500MB 可用磁盘空间

#### Android版本
- Android 10 或更高版本
- 2GB 以上内存
- 100MB 可用存储空间

### 下载安装

**方式1：官网下载（推荐）**
1. 访问官网：https://www.xintuxiangce.top
2. 点击下载按钮，选择对应平台版本
3. 运行安装程序
4. 按照提示完成安装

**方式2：GitHub Release**
1. 访问 [Releases](https://github.com/xiawenyong1977-netizen/ImageClassifier/releases)
2. 下载最新版本
3. 安装并运行

### 使用步骤

1. **连接与设置** - 使用数据线连接手机与电脑，选定需要整理的相册目录
2. **一键智能分类** - 点击"开始智能分类"，AI将自动扫描识别
3. **便捷拣选暂存** - 分类完成后，勾选需要处理的照片，一键移入暂存箱
4. **最终清理或归档** - 进入暂存箱二次确认，删除或归档

## 📊 性能指标

| 指标 | 数据 |
|------|------|
| 分类准确率 | **90%+** |
| 支持分类类别 | **9大类**（内容分类） |
| 多维度分类 | **8大维度**（内容、城市、颜色、存储、格式、分辨率、方向、相似组） |
| AI分类维度 | **2个**（内容、颜色） |
| 本地算法维度 | **6个**（城市、存储、格式、分辨率、方向、相似组） |
| 隐私保护 | **100%本地处理**（AI分类支持本地推理降级） |
| 测试规模 | **1800+张照片** |
| Android扫描速度 | **提升20-50倍**（MediaStore优化） |
| 哈希计算速度 | **提升5-10倍**（原生多线程） |
| 整体扫描时间 | **从78秒优化到8秒**（提升9.75倍） |

## 🛠️ 技术架构

### 前端技术

- **React Native** - 跨平台移动应用开发框架
- **React** - Web/PC端界面框架
- **Electron** - 桌面应用封装

### AI技术

- **ONNX Runtime** - 高性能AI模型推理引擎
- **YOLOv8** - 物体检测模型，识别照片中的物体
- **MobileNetV3** - 图像分类模型，场景识别
- **自定义模型** - 证件检测专用模型

### 数据存储

- **IndexedDB** - 浏览器端结构化数据存储
- **AsyncStorage** - React Native本地存储
- **SQLite** - 移动端数据库（可选）

### 性能优化

- **智能缓存** - 推理结果缓存，避免重复计算
- **批量处理** - 批量API调用，减少网络开销
- **分层处理** - 截图检测→缓存查询→远程推理→本地降级
- **相似度优化** - 基于推理结果的快速相似度检测
- **MediaStore集成** - Android平台使用MediaStore API，扫描速度提升20-50倍
- **原生多线程哈希** - Android平台原生多线程并行计算，哈希速度提升5-10倍
- **并行处理** - 充分利用多核CPU，大幅提升处理效率

## 📁 项目结构

```
ImageClassifierApp/
├── src/
│   ├── components/             # 可复用组件
│   │   ├── CategoryCard.js     # 分类卡片组件
│   │   └── shared/             # 共享组件
│   ├── screens/                # 页面组件
│   │   ├── desktop/            # 桌面端页面
│   │   └── mobile/             # 移动端页面
│   ├── services/               # 业务服务
│   │   ├── ImageClassifierService.js    # 图片分类核心服务
│   │   ├── ImageSimilarityService.js    # 相似度检测服务
│   │   ├── ImageStorageService.js       # 存储服务
│   │   ├── GalleryScannerService.js     # 相册扫描服务
│   │   ├── CityLocationService.js       # 城市定位服务
│   │   ├── UnifiedDataService.js        # 统一数据服务
│   │   ├── ConfigService.js             # 配置服务
│   │   ├── ImageEnhanceService.js        # AI图像增强服务（PC端）
│   │   ├── MediaStoreService.js          # MediaStore服务（Android）
│   │   ├── ParallelHashCalculator.js    # 并行哈希计算服务
│   │   ├── ImageProcessor.js             # 图像处理服务
│   │   ├── ColorHistogramExtractor.js    # 颜色直方图提取服务
│   │   ├── WakeLockService.js            # 唤醒锁服务
│   │   └── WeChatAuthService.js          # 微信认证服务
│   ├── adapters/               # 平台适配器
│   │   └── WebAdapters.js      # Web平台适配
│   └── workers/                # Web Worker
│       └── hashWorker.js       # 哈希计算Worker
├── public/                     # 公共资源
│   ├── models/                 # AI模型文件
│   │   ├── yolov8s.onnx       # YOLOv8模型
│   │   ├── mobilenetv3_rw_Opset17.onnx # MobileNetV3模型
│   │   └── id_card_detection.onnx # 身份证检测模型
│   └── index.html              # 入口HTML
├── pc-version-final/           # PC桌面版本
│   ├── src/                    # PC版源码
│   ├── build/                  # 构建输出
│   └── dist/                   # 打包文件
├── android/                    # Android原生代码
└── package.json                # 项目配置
```

## 🔐 隐私保护

- ✅ **本地AI处理** - 所有推理计算在本地完成
- ✅ **零数据上传** - 不上传任何照片到服务器（图像增强功能需联网，但仅上传处理后的图片用于增强）
- ✅ **不收集信息** - 不收集用户个人信息
- ✅ **无广告追踪** - 无广告、无第三方追踪
- ✅ **开源透明** - 代码完全开源，可审计

> **注意**：AI图像增强功能需要联网调用云端API，但所有增强后的图片都保存在本地，不会上传原始照片。

## 🔧 开发指南

### 环境准备

```bash
# 安装Node.js依赖
npm install

# PC版本开发
cd pc-version-final
npm install
npm start              # 开发模式
npm run build          # 构建生产版本
npm run electron-dev   # Electron开发模式
npm run electron-pack  # 打包桌面应用

# macOS版本打包
cd pc-version-final
npm run electron:build-mac      # 打包macOS DMG
npm run electron:build-mac-zip  # 打包macOS ZIP

# 移动版本开发
npx react-native start          # 启动Metro服务器
npx react-native run-android    # 运行Android版本
npx react-native run-ios        # 运行iOS版本
```

### 技术文档

- [分类规则配置](src/services/README_ConfigService.md)
- [远程分类使用](REMOTE_CLASSIFICATION_USAGE.md)
- [客户端调用指南](CLIENT_ID_USAGE.md)
- [测试用例文档](测试用例文档-漏斗式扫描流程.md)
- [MediaStore集成说明](docs/MediaStore集成说明.md) - Android性能优化
- [AI图像增强功能设计](docs/AI图像增强功能设计文档.md) - PC端图像增强功能
- [原生多线程哈希计算说明](docs/原生多线程哈希计算说明.md) - 性能优化文档

## 📊 分类效果

### 内容分类准确率

| 分类类型 | 准确率 | 说明 |
|---------|--------|------|
| 手机截图 | 98%+ | 手机屏幕截图、应用界面 |
| 证件照 | 95%+ | 身份证、护照、驾照等证件 |
| 单人照片 | 92%+ | 个人照、自拍、肖像 |
| 社交活动 | 90%+ | 聚会、合影、多人互动场景 |
| 旅行风景 | 90%+ | 旅游景点、自然风光 |
| 美食记录 | 88%+ | 食物、餐饮、烹饪相关 |
| 宠物萌照 | 85%+ | 猫、狗等宠物照片 |
| 二维码 | 95%+ | 二维码图片自动识别 |
| 其它 | 80%+ | 无法归类到上述类别 |

### 多维度分类支持

- **按内容分类** - AI智能识别，准确率90%+
- **按城市分类** - GPS定位+本地数据库匹配，支持全球主要城市
- **按颜色分类** - AI识别主色调，支持多种颜色分类
- **按存储分类** - 文件路径分析，支持按目录分类
- **按格式分类** - 文件格式识别，支持JPEG、PNG、HEIC、WEBP等
- **按分辨率分类** - 智能识别标准分辨率（4K、1080p、720p等）
- **按方向分类** - 宽高比计算，支持横屏、竖屏、全景、正方形
- **相似组分类** - 多算法融合，准确识别相似照片

## 🎯 使用场景

- 📸 **手机相册整理** - 快速清理手机中的海量照片
- 🗂️ **照片批量分类** - 8大维度自动分类，告别手动整理
- 💾 **存储空间清理** - 找出重复和相似照片，释放空间
- 🔍 **快速查找照片** - 按内容、城市、颜色、存储、格式、分辨率、方向等多维度快速定位照片
- 🎨 **个性化分类** - 通过分类控制面板自定义显示的分类维度
- ✨ **图像美化增强** - PC端批量美化照片，提升照片质量
- 📱 **隐私保护** - 本地处理，绝不上传

## 📱 界面预览

### PC桌面版

![主界面](https://www.xintuxiangce.top/images/首页-1.jpg)
*主界面 - 查看分类统计和最近照片*

![分类详情](https://www.xintuxiangce.top/images/分类进展和统计信息.jpg)
*分类详情 - 查看各个类别的照片*

![暂存箱](https://www.xintuxiangce.top/images/暂存.jpg)
*暂存箱 - 批量处理照片*

## 🤝 贡献指南

我们欢迎各种形式的贡献：

- 🐛 **报告Bug** - 在[Issues](https://github.com/xiawenyong1977-netizen/ImageClassifier/issues)中提交问题
- 💡 **功能建议** - 提出新功能想法和改进建议
- 📝 **文档改进** - 完善使用说明和开发文档
- 🔧 **提交代码** - 修复Bug或添加新功能
- 🌟 **Star支持** - 给项目点星，支持项目发展

### 贡献步骤

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

## 📚 相关资源

- 🌐 [官方网站](https://www.xintuxiangce.top) - 软件下载和使用指南
- 📖 [使用教程](https://www.xintuxiangce.top/blog.html) - 详细的使用教程
- 💡 [技术博客](https://www.xintuxiangce.top/blog.html) - AI照片分类技术解析
- ❓ [常见问题](https://www.xintuxiangce.top/#faq) - FAQ解答
- 📦 [更新日志](https://github.com/xiawenyong1977-netizen/ImageClassifier/releases) - 版本更新记录

## 🔐 权限说明

### Android权限

应用需要以下Android权限：

- `READ_EXTERNAL_STORAGE` - 读取外部存储中的照片
- `WRITE_EXTERNAL_STORAGE` - 写入处理结果
- `READ_MEDIA_IMAGES` - 读取媒体图片（Android 13+）
- `ACCESS_MEDIA_LOCATION` - 读取媒体位置信息（用于城市分类，Android 10+）
- `MANAGE_EXTERNAL_STORAGE` - 管理外部存储（可选）

### Windows/macOS权限

- 文件系统读写权限（安装时自动申请）

## 🏗️ 技术实现

### 架构设计

**分层处理架构：**
```
第1层：截图检测（快速识别手机截图）
  ↓
第2层：缓存查询（智能缓存，避免重复推理）
  ↓
第3层：远程推理（云端AI服务，高准确率）
  ↓
第4层：本地推理（本地模型降级，保证可用性）
  ↓
第5层：相似度检测（智能去重）
```

### AI模型

| 模型 | 用途 | 输入尺寸 | 准确率 |
|------|------|---------|--------|
| YOLOv8s | 物体检测 | 640×640 | 90%+ |
| MobileNetV3 | 场景分类 | 224×224 | 88%+ |
| Custom ID Card | 证件检测 | 640×640 | 95%+ |

### 性能优化

- **智能缓存机制** - 推理结果缓存，避免重复计算
- **批量API调用** - 减少网络请求，提升处理速度
- **相似度算法优化** - 基于推理结果的快速相似度检测，性能提升57%
- **GPU加速支持** - 自动检测并使用GPU加速（WebGL/DirectML）
- **并行哈希计算** - 使用Web Worker（PC端）和原生多线程（Android）并行计算图片哈希
- **MediaStore优化** - Android平台使用MediaStore API替代文件系统遍历，扫描速度提升20-50倍
- **原生多线程处理** - Android平台使用原生Java多线程并行处理，充分利用多核CPU
- **整体性能提升** - 综合优化后，整体扫描时间从78秒优化到8秒，提升9.75倍

## 📦 部署说明

### PC桌面版打包

```bash
cd pc-version-final

# 构建应用
npm run build

# 打包Windows应用
npm run electron-pack

# 打包APPX（Microsoft Store）
npm run electron-pack-appx

# 打包macOS应用
npm run electron:build-mac      # DMG格式
npm run electron:build-mac-zip  # ZIP格式
```

### Android APK打包

```bash
cd android

# 生成Release APK
./gradlew assembleRelease

# APK输出路径
# android/app/build/outputs/apk/release/app-release.apk
```

## 🐛 已知问题

### Android 10+ 文件删除限制

由于Android 10+的Scoped Storage限制，某些目录下的文件可能无法直接删除。应用会尝试多种删除策略：

1. 使用Android MediaStore API
2. 使用react-native-fs
3. 复制到临时目录后删除

如果删除失败，建议用户手动删除文件。

### EXIF位置信息

部分照片可能缺少GPS位置信息，导致无法按城市分类。

## 🔄 更新日志

查看 [CHANGELOG](CHANGELOG.md) 了解版本更新详情。

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系我们

- 🌐 **官网**：https://www.xintuxiangce.top
- 📧 **邮箱**：xiawenyong@xintuxiangce.top
- 💬 **问题反馈**：[GitHub Issues](https://github.com/xiawenyong1977-netizen/ImageClassifier/issues)
- 📱 **技术支持**：通过官网联系表单获取帮助

## 🙏 致谢

感谢所有使用和支持芯图相册的用户！

特别感谢：
- ONNX Runtime 团队提供的高性能推理引擎
- Ultralytics 团队的YOLOv8模型
- React Native 社区的优秀框架
- 所有开源项目的贡献者

## 🌟 Star History

如果这个项目对您有帮助，请给我们一个Star！⭐

---

**© 2025 芯图相册. 保留所有权利.**

*让照片管理更智能，让隐私更安全*

# Test build trigger
