# Image Classifier App

一个基于React Native开发的智能图片分类应用，使用AI技术自动对手机相册中的图片进行分类管理。

## 🚀 功能特性

### 核心功能
- **智能图片分类**: 使用AI模型自动识别图片内容并分类
- **批量操作**: 支持批量删除、重新分类、移动图片
- **时间轴展示**: 按拍摄时间展示图片历史
- **分类管理**: 自定义分类标签和置信度
- **图片预览**: 高清图片预览和信息展示

### 技术特性
- **Android原生模块**: 自定义MediaStore模块处理文件操作
- **EXIF数据读取**: 提取图片拍摄时间和位置信息
- **权限管理**: 完整的Android权限申请和管理
- **离线存储**: 使用AsyncStorage本地数据存储

## 📱 支持的分类

- **微信截图** (wechat)
- **照片** (photo)
- **截图** (screenshot)
- **文档** (document)
- **其他** (other)

## 🛠️ 技术栈

- **前端框架**: React Native
- **AI分类**: TensorFlow Lite / 自定义分类模型
- **文件操作**: react-native-fs + 自定义Android模块
- **数据存储**: AsyncStorage
- **图片处理**: react-native-image-picker
- **EXIF读取**: react-native-exif, exif-parser

## 📋 系统要求

- Node.js >= 14
- React Native >= 0.70
- Android SDK >= 30
- Android 10+ (推荐)

## 🔧 安装说明

### 1. 克隆项目
```bash
git clone https://github.com/your-username/image-classifier-app.git
cd image-classifier-app
```

### 2. 安装依赖
```bash
npm install
```

### 3. Android环境配置
```bash
# 确保已安装Android Studio和SDK
# 配置ANDROID_HOME环境变量
```

### 4. 运行项目
```bash
# 启动Metro服务器
npx react-native start

# 新开终端，运行Android应用
npx react-native run-android
```

## 📁 项目结构

```
src/
├── components/          # 可复用组件
│   ├── CategoryCard.js  # 分类卡片组件
│   └── RecentImagesGrid.js # 最近图片网格
├── screens/             # 页面组件
│   ├── HomeScreen.js    # 首页
│   ├── CategoryScreen.js # 分类详情页
│   ├── ImagePreviewScreen.js # 图片预览页
│   ├── BatchOperationScreen.js # 批量操作页
│   ├── ImageUploadScreen.js # 图片上传页
│   └── SettingsScreen.js # 设置页
├── services/            # 业务服务
│   ├── GalleryScannerService.js # 相册扫描服务
│   ├── ImageClassifierService.js # 图片分类服务
│   ├── ImageStorageService.js # 图片存储服务
│   └── MediaStoreService.js # MediaStore服务
└── utils/               # 工具函数

android/
├── app/src/main/java/com/imageclassifier/
│   ├── MediaStoreModule.java # 原生MediaStore模块
│   └── MediaStorePackage.java # 模块注册
└── app/src/main/AndroidManifest.xml # Android配置
```

## 🔐 权限说明

应用需要以下Android权限：

- `READ_EXTERNAL_STORAGE`: 读取外部存储
- `WRITE_EXTERNAL_STORAGE`: 写入外部存储
- `READ_MEDIA_IMAGES`: 读取媒体图片 (Android 13+)
- `CAMERA`: 相机权限
- `MANAGE_EXTERNAL_STORAGE`: 管理外部存储

## 🚨 已知问题

### Android 10+ 文件删除限制
由于Android 10+的Scoped Storage限制，某些目录下的文件可能无法直接删除。应用会尝试多种删除策略：

1. 使用Android MediaStore API
2. 使用react-native-fs
3. 复制到临时目录后删除

如果删除失败，建议用户手动删除文件。

### EXIF位置信息
位置信息提取功能目前处于开发阶段，可能存在兼容性问题。

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 项目Issues: [GitHub Issues](https://github.com/your-username/image-classifier-app/issues)
- 邮箱: your-email@example.com

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者和开源社区。

