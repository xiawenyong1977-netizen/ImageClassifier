# 项目文档索引

## 📁 文档目录结构

```
docs/
├── architecture/          # 架构设计文档
│   ├── Canvas统一适配方案.md
│   ├── CodeStructure20250911.md
│   ├── service层移动端适配分析报告.md
│   ├── service层移动端适配改动总结.md
│   ├── WebAdapters统一Platform对象说明.md
│   ├── YOLOv8_DEPENDENCIES.md
│   ├── 分页功能使用示例.md
│   ├── 动态布局简化总结.md
│   ├── 技术实现方案.md
│   ├── 移动端重写分析报告.md
│   ├── 移动端移植最终改动汇总.md
│   ├── 移动端移植完整改动清单.md
│   ├── 移动端适配改动总结.md
│   ├── 照片分类APP20250910.md
│   └── 照片分类APP20250911.md
│
├── design/               # UI/UX 设计文档
│   ├── APP_UI设计原型.md
│   ├── PC端UI设计.md
│   └── 手机图片分类APP设计方案.md
│
├── testing/              # 测试文档
│   ├── CLASSIFICATION_TEST_GUIDE.md
│   ├── IndexedDB修复说明.md
│   ├── PC端回归测试清单.md
│   └── 测试用例文档-漏斗式扫描流程.md
│
└── README.md            # 本文档
```

---

## 📚 文档分类说明

### 🏗️ 架构设计文档 (architecture/)

#### 移动端适配系列
- **service层移动端适配分析报告.md** - Service 层移动端适配详细分析
- **service层移动端适配改动总结.md** - Service 层适配改动总结和测试指南
- **移动端重写分析报告.md** - 移动端重写的完整技术分析
- **移动端移植最终改动汇总.md** - 移动端移植的最终改动汇总
- **移动端移植完整改动清单.md** - 移动端移植的完整改动清单
- **移动端适配改动总结.md** - 移动端适配的总体改动总结

#### 适配器系列
- **Canvas统一适配方案.md** - Canvas API 跨平台适配方案
- **WebAdapters统一Platform对象说明.md** - WebAdapters 平台检测说明

#### 项目架构
- **CodeStructure20250911.md** - 项目代码结构文档
- **YOLOv8_DEPENDENCIES.md** - YOLOv8 依赖说明
- **技术实现方案.md** - 整体技术实现方案
- **照片分类APP20250910.md** - 项目早期设计文档
- **照片分类APP20250911.md** - 项目设计更新版

#### 功能特性
- **分页功能使用示例.md** - 分页功能实现示例
- **动态布局简化总结.md** - 动态布局优化总结

---

### 🎨 设计文档 (design/)

- **APP_UI设计原型.md** - 应用 UI 设计原型
- **PC端UI设计.md** - PC 端 UI 设计规范
- **手机图片分类APP设计方案.md** - 移动端 UI 设计方案

---

### 🧪 测试文档 (testing/)

#### 测试指南
- **PC端回归测试清单.md** - PC 端回归测试完整清单
- **CLASSIFICATION_TEST_GUIDE.md** - 分类功能测试指南
- **测试用例文档-漏斗式扫描流程.md** - 漏斗式扫描流程测试用例

#### 问题修复
- **IndexedDB修复说明.md** - IndexedDB 保存错误修复文档

---

## 📖 快速导航

### 对于新开发者
1. 先阅读: `architecture/技术实现方案.md`
2. 了解结构: `architecture/CodeStructure20250911.md`
3. 了解移动端: `architecture/移动端重写分析报告.md`

### 对于移动端开发
1. 适配分析: `architecture/service层移动端适配分析报告.md`
2. 改动总结: `architecture/service层移动端适配改动总结.md`
3. WebAdapters: `architecture/WebAdapters统一Platform对象说明.md`
4. Canvas 适配: `architecture/Canvas统一适配方案.md`

### 对于测试人员
1. PC 端测试: `testing/PC端回归测试清单.md`
2. 分类测试: `testing/CLASSIFICATION_TEST_GUIDE.md`
3. 扫描测试: `testing/测试用例文档-漏斗式扫描流程.md`

### 对于 UI 设计师
1. 移动端设计: `design/手机图片分类APP设计方案.md`
2. PC 端设计: `design/PC端UI设计.md`
3. UI 原型: `design/APP_UI设计原型.md`

---

## 🔄 最近更新 (2025-01-20)

### 新增文档
- ✨ `architecture/service层移动端适配分析报告.md` - 详细的 Service 层适配分析
- ✨ `architecture/service层移动端适配改动总结.md` - Service 层改动总结
- ✨ `testing/PC端回归测试清单.md` - 完整的 PC 端回归测试指南
- ✨ `testing/IndexedDB修复说明.md` - IndexedDB 保存问题修复文档

### 文档整理
- 📦 将根目录的文档移动到 `docs/` 目录
- 📦 按类型分类到 `architecture/`、`design/`、`testing/` 目录
- 📦 创建本索引文档方便查找

---

## 🎯 文档维护规范

### 文档命名
- 使用清晰的中文或英文名称
- 日期格式统一使用 YYYYMMDD
- 版本号使用 v1.0、v2.0 格式

### 文档分类
- **architecture/** - 架构、设计、技术方案
- **design/** - UI/UX 设计、原型
- **testing/** - 测试用例、测试指南、问题修复

### 更新规范
- 文档底部注明更新日期和版本
- 重要改动需要在本 README 记录
- 废弃文档移动到 `archive/` 目录

---

## 📞 联系方式

如有文档相关问题，请联系项目维护者。

---

**最后更新**: 2025-01-20  
**文档版本**: v1.0

