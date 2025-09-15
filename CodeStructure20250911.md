# 图片分类整理应用 - 代码结构文档

**生成时间**: 2025年9月11日  
**项目类型**: 跨平台图片分类整理应用  
**架构模式**: 三层架构 (UI层、中间层、适配层) + 符号链接代码复用

---

## 📁 项目整体结构

```
D:\ImageClassifierApp\
├── src/                                    # 项目源码库 (核心代码)
│   ├── index.js                           # 移动端入口文件 (React Native)
│   ├── index.desktop.js                   # PC端入口文件 (React Web)
│   ├── App.js                             # 共享的App组件
│   ├── components/                        # 组件层
│   │   ├── shared/                        # 共享组件
│   │   │   ├── CategoryCard.js            # 分类卡片组件
│   │   │   └── RecentImagesGrid.js        # 最近图片网格组件
│   │   ├── mobile/                        # 移动端特化组件
│   │   └── desktop/                       # PC端特化组件
│   ├── screens/                           # 屏幕层
│   │   ├── mobile/                        # 移动端屏幕
│   │   │   ├── HomeScreen.mobile.js       # 首页
│   │   │   ├── CategoryScreen.mobile.js   # 分类页面
│   │   │   ├── ImagePreviewScreen.mobile.js # 图片预览
│   │   │   ├── ImageUploadScreen.mobile.js # 图片上传
│   │   │   ├── SettingsScreen.mobile.js   # 设置页面
│   │   │   └── BatchOperationScreen.mobile.js # 批量操作
│   │   └── desktop/                       # PC端屏幕
│   │       ├── HomeScreen.desktop.js      # 首页
│   │       ├── CategoryScreen.desktop.js  # 分类页面
│   │       ├── ImagePreviewScreen.desktop.js # 图片预览
│   │       ├── ImageUploadScreen.desktop.js # 图片上传
│   │       ├── SettingsScreen.desktop.js  # 设置页面
│   │       └── BatchOperationScreen.desktop.js # 批量操作
│   ├── services/                          # 业务逻辑层 (中间层)
│   │   ├── GalleryScannerService.js       # 相册扫描服务
│   │   ├── ImageStorageService.js         # 图片存储服务
│   │   ├── ImageClassifierService.js      # 图片分类服务
│   │   └── MediaStoreService.js           # 媒体存储服务
│   ├── adapters/                          # 平台适配层
│   │   └── WebAdapters.js                 # Web平台适配器
│   ├── utils/                             # 工具函数
│   ├── styles/                            # 样式文件
│   │   ├── mobile/                        # 移动端样式
│   │   └── shared/                        # 共享样式
│   └── assets/                            # 资源文件
│
├── package.json                           # 移动端项目配置
├── metro.config.js                        # 移动端构建配置
│
└── pc-version-final/                       # PC端项目
    ├── src/                                # 符号链接 → ..\src
    ├── package.json                        # PC端项目配置
    ├── craco.config.js                     # PC端构建配置
    ├── public/
    │   ├── electron.js                     # Electron主进程
    │   └── index.html                      # HTML模板
    └── node_modules/                       # PC端依赖
```

---

## 🏗️ 架构设计

### 三层架构模式

#### 1. **UI层 (用户界面层)**
- **位置**: `src/screens/` 和 `src/components/`
- **职责**: 处理用户界面和交互
- **特点**: 平台特化，移动端和PC端有不同的实现
- **文件结构**:
  - `screens/mobile/` - 移动端屏幕组件
  - `screens/desktop/` - PC端屏幕组件
  - `components/shared/` - 共享UI组件
  - `components/mobile/` - 移动端特化组件
  - `components/desktop/` - PC端特化组件

#### 2. **中间层 (业务逻辑层)**
- **位置**: `src/services/`
- **职责**: 处理业务逻辑和数据管理
- **特点**: 平台无关，完全共享
- **核心服务**:
  - `GalleryScannerService.js` - 相册扫描逻辑
  - `ImageStorageService.js` - 图片存储管理
  - `ImageClassifierService.js` - 图片分类算法
  - `MediaStoreService.js` - 媒体存储操作

#### 3. **适配层 (平台适配层)**
- **位置**: `src/adapters/`
- **职责**: 提供平台特定的API适配
- **特点**: 统一接口，不同平台不同实现
- **核心适配器**:
  - `WebAdapters.js` - Web/Electron平台适配器

---

## 🔗 代码复用机制

### 符号链接复用
- **PC端项目**通过符号链接访问**项目源码库**
- **实现方式**: `mklink /J src ..\src`
- **优势**: 真正的代码复用，修改源码库立即生效

### 平台特化策略
- **共享代码**: 业务逻辑、服务、适配器
- **特化代码**: UI组件、屏幕、样式
- **命名规范**: `.mobile.js` / `.desktop.js` 后缀

---

## 📱 移动端项目

### 入口文件
```javascript
// src/index.js
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from '../package.json';

AppRegistry.registerComponent(appName, () => App);
```

### 配置
- **主入口**: `package.json` → `"main": "index.js"`
- **构建工具**: Metro Bundler
- **配置文件**: `metro.config.js`

---

## 💻 PC端项目

### 入口文件
```javascript
// src/index.desktop.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### 配置
- **主入口**: `craco.config.js` → `webpackConfig.entry`
- **构建工具**: Create React App + CRACO
- **桌面框架**: Electron
- **配置文件**: `craco.config.js`

---

## 🎯 核心特性

### 1. **真正的代码复用**
- 业务逻辑层完全共享
- 平台适配层统一接口
- 通过符号链接实现零拷贝

### 2. **平台特化UI**
- 移动端和PC端有不同的用户体验
- 共享组件和特化组件并存
- 响应式设计适配不同屏幕

### 3. **模块化架构**
- 清晰的三层分离
- 高内聚低耦合
- 易于维护和扩展

### 4. **跨平台兼容**
- React Native (移动端)
- React Web (PC端)
- Electron (桌面应用)

---

## 🛠️ 开发工作流

### 移动端开发
```bash
cd D:\ImageClassifierApp
npm start                    # 启动Metro服务器
npm run android             # 运行Android应用
npm run ios                 # 运行iOS应用
```

### PC端开发
```bash
cd D:\ImageClassifierApp\pc-version-final
npm start                   # 启动开发服务器
npm run electron            # 启动Electron应用
```

### 代码修改流程
1. 修改 `src/` 目录中的源码
2. 移动端立即生效 (直接使用源码)
3. PC端立即生效 (通过符号链接)

---

## 📋 文件命名规范

### 入口文件
- `index.js` - 移动端入口 (React Native)
- `index.desktop.js` - PC端入口 (React Web)

### 屏幕文件
- `HomeScreen.mobile.js` - 移动端首页
- `HomeScreen.desktop.js` - PC端首页

### 组件文件
- `CategoryCard.js` - 共享组件
- `CategoryCard.mobile.js` - 移动端特化组件
- `CategoryCard.desktop.js` - PC端特化组件

---

## 🎨 样式管理

### 样式文件结构
```
src/styles/
├── mobile/                 # 移动端样式
├── desktop/                # PC端样式
└── shared/                 # 共享样式
```

### 样式使用
- 移动端: 使用 `StyleSheet.create()` (React Native)
- PC端: 使用 CSS 或 styled-components (React Web)

---

## 🔧 配置说明

### 移动端配置
- **Metro**: `metro.config.js`
- **依赖**: `package.json`
- **入口**: `index.js`

### PC端配置
- **Webpack**: `craco.config.js`
- **Electron**: `public/electron.js`
- **入口**: `index.desktop.js`

---

## 📊 项目统计

### 代码复用率
- **业务逻辑**: 100% 复用
- **平台适配**: 100% 复用
- **UI组件**: 60% 复用 (共享组件)
- **屏幕组件**: 0% 复用 (完全特化)

### 文件数量
- **共享文件**: 15+ 个
- **移动端特化**: 10+ 个
- **PC端特化**: 10+ 个
- **配置文件**: 8+ 个

---

## 🚀 部署说明

### 移动端部署
- Android: `npm run android`
- iOS: `npm run ios`
- 发布: 使用 React Native 发布流程

### PC端部署
- 开发: `npm run electron`
- 构建: `npm run build`
- 打包: 使用 Electron Builder

---

## 📝 维护说明

### 添加新功能
1. 在 `src/services/` 中添加业务逻辑
2. 在 `src/adapters/` 中添加平台适配
3. 在 `src/screens/` 中添加UI屏幕
4. 在 `src/components/` 中添加UI组件

### 修改现有功能
1. 修改 `src/` 目录中的源码
2. 移动端和PC端自动同步更新
3. 测试两个平台的功能

### 添加新平台
1. 创建新的适配器文件
2. 创建新的入口文件
3. 创建新的构建配置
4. 创建新的项目目录

---

**文档版本**: v1.0  
**最后更新**: 2025年9月11日  
**维护者**: 开发团队
