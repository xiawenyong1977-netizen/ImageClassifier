# ConfigService 配置管理服务

## 概述

`ConfigService` 是一个配置管理服务，负责读取和管理 `initialSettings.json` 配置文件。它提供了统一的接口来访问应用的各种配置项。

## 功能特性

- ✅ 自动加载 `initialSettings.json` 配置文件
- ✅ 支持浏览器和 Node.js 环境
- ✅ 提供类型安全的配置访问方法
- ✅ 支持配置验证和重新加载
- ✅ 单例模式，全局共享配置

## 配置结构

```json
{
  "models": {
    "yolo8s": { "confidenceThreshold": 0.25, ... },
    "mobilenetv3": { "confidenceThreshold": 0.3, ... }
  },
  "categoryNameMap": { "people": { "id": "CAT001", "chinese": "社交活动", "english": "Social Activities" } },
  "yoloObjectNameMap": { "person": { "id": 0, "chinese": "人", "english": "Person" } },
  "mobilenetv3Classes": { "tench, Tinca tinca": { "id": 0, "chinese": "鱼", "english": "tench, Tinca tinca" } }
}
```

## 使用方法

### 1. 初始化配置服务

```javascript
import configService from './ConfigService.js';

// 初始化配置
const success = await configService.initialize();
if (!success) {
  console.error('配置加载失败');
}
```

### 2. 获取模型配置

```javascript
// 获取特定模型配置
const yoloConfig = configService.getModelConfig('yolo8s');
console.log('YOLO置信度阈值:', yoloConfig.confidenceThreshold);

// 获取所有模型配置
const allModels = configService.getAllModelConfigs();
```

### 3. 获取分类信息

```javascript
// 获取分类名称映射
const categoryMap = configService.getCategoryNameMap();

// 根据ID获取分类信息
const category = configService.getCategoryById('CAT001');
console.log('分类名称:', category.chinese, category.english);
```

### 4. 获取YOLO物体信息

```javascript
// 获取YOLO物体映射
const yoloMap = configService.getYoloObjectNameMap();

// 根据ID获取物体信息
const object = configService.getYoloObjectById(0);
console.log('物体名称:', object.chinese, object.english);
```

### 5. 获取MobileNetV3类别信息

```javascript
// 获取ImageNet类别映射
const imagenetClasses = configService.getMobileNetV3Classes();

// 根据ID获取类别信息
const classInfo = configService.getMobileNetV3ClassById(0);
console.log('类别名称:', classInfo.chinese, classInfo.english);

// 根据英文名称获取类别信息
const classInfo2 = configService.getMobileNetV3ClassByEnglishName('tench, Tinca tinca');
```

### 6. 配置状态检查

```javascript
// 检查配置是否已加载
if (configService.isConfigLoaded()) {
  console.log('配置已加载');
}

// 获取完整配置对象
const fullConfig = configService.getFullConfig();

// 重新加载配置
await configService.reload();
```

## API 参考

### 方法列表

| 方法名 | 参数 | 返回值 | 描述 |
|--------|------|--------|------|
| `initialize()` | 无 | `Promise<boolean>` | 初始化配置服务 |
| `getModelConfig(modelName)` | `string` | `Object\|null` | 获取模型配置 |
| `getAllModelConfigs()` | 无 | `Object` | 获取所有模型配置 |
| `getCategoryNameMap()` | 无 | `Object` | 获取分类名称映射 |
| `getYoloObjectNameMap()` | 无 | `Object` | 获取YOLO物体映射 |
| `getMobileNetV3Classes()` | 无 | `Object` | 获取MobileNetV3类别映射 |
| `getCategoryById(categoryId)` | `string` | `Object\|null` | 根据ID获取分类信息 |
| `getYoloObjectById(objectId)` | `number` | `Object\|null` | 根据ID获取YOLO物体信息 |
| `getMobileNetV3ClassById(classId)` | `number` | `Object\|null` | 根据ID获取MobileNetV3类别信息 |
| `getMobileNetV3ClassByEnglishName(englishName)` | `string` | `Object\|null` | 根据英文名称获取MobileNetV3类别信息 |
| `isConfigLoaded()` | 无 | `boolean` | 检查配置是否已加载 |
| `getFullConfig()` | 无 | `Object\|null` | 获取完整配置对象 |
| `reload()` | 无 | `Promise<boolean>` | 重新加载配置 |

## 注意事项

1. **初始化顺序**: 在使用任何配置方法之前，必须先调用 `initialize()` 方法
2. **错误处理**: 所有方法都会在配置未加载时返回 `null` 或空对象，并输出警告日志
3. **单例模式**: 全局共享同一个配置实例，避免重复加载
4. **环境兼容**: 自动检测浏览器和Node.js环境，使用相应的文件加载方式

## 配置统计

当前配置文件包含：
- **模型配置**: 2个 (yolo8s, mobilenetv3)
- **分类映射**: 11个分类
- **YOLO物体映射**: 80个物体
- **ImageNet类别映射**: 999个类别
