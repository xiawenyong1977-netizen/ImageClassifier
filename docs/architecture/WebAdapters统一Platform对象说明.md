# WebAdapters 统一 Platform 对象说明

## 🎯 问题背景

在之前的代码中，每个Service文件都需要手动检测平台：

```javascript
// ❌ 旧方案 - 每个文件都重复这段代码
let Platform;
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    Platform = { OS: 'web' };
  } else {
    Platform = eval('require("react-native").Platform');
  }
} catch (error) {
  Platform = { OS: 'web' };
}
```

**问题**：
- ❌ 代码重复（每个Service都要写一遍）
- ❌ 不一致（有些用 `detectEnvironment()`，有些用手动检测）
- ❌ 维护困难（修改逻辑需要改多处）

## ✅ 新方案 - 统一 Platform 对象

### 实现代码

```javascript
// src/adapters/WebAdapters.js

// 17. 统一的Platform对象导出
export const Platform = (() => {
  // 检测环境
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    // React Native环境 - 使用原生Platform
    try {
      return eval('require("react-native").Platform');
    } catch (error) {
      logger.warn('无法加载React Native Platform，使用fallback');
      return { OS: 'web' };
    }
  }
  
  // Web/Electron/Node环境 - 创建兼容的Platform对象
  return { 
    OS: 'web',
    Version: undefined,
    select: (obj) => obj.web || obj.default
  };
})();
```

### 使用方式

```javascript
// ✅ 新方案 - 从WebAdapters导入
import { Platform } from '../adapters/WebAdapters.js';

// 直接使用
if (Platform.OS === 'web') {
  // Web/Electron环境
  const fileUri = `file:///${normalizedPath}`;
} else if (Platform.OS === 'android') {
  // Android环境
  const fileUri = `file://${normalizedPath}`;
} else if (Platform.OS === 'ios') {
  // iOS环境
  const fileUri = `file://${normalizedPath}`;
}

// 也可以使用Platform.select
const fileUri = Platform.select({
  web: `file:///${normalizedPath}`,
  default: `file://${normalizedPath}`
});
```

## 📊 对比

### 旧方案
```javascript
// GalleryScannerService.js
import { logger, RNFS } from '../adapters/WebAdapters.js';

// 🔴 手动检测平台（15行代码）
let Platform;
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    Platform = { OS: 'web' };
  } else {
    Platform = eval('require("react-native").Platform');
  }
} catch (error) {
  Platform = { OS: 'web' };
}

// 使用
const fileUri = Platform.OS === 'web' ? 
  `file:///${path}` : `file://${path}`;
```

### 新方案
```javascript
// GalleryScannerService.js
import { logger, RNFS, Platform } from '../adapters/WebAdapters.js';

// 🟢 直接使用（0行额外代码）

// 使用
const fileUri = Platform.OS === 'web' ? 
  `file:///${path}` : `file://${path}`;
```

## 🎁 优势

| 优势 | 说明 |
|------|------|
| ✅ **单一数据源** | 只在WebAdapters中检测一次 |
| ✅ **代码复用** | 所有Service共享同一个Platform对象 |
| ✅ **类型一致** | 始终返回兼容的Platform对象 |
| ✅ **易于维护** | 修改检测逻辑只需改一处 |
| ✅ **易于测试** | 可以mock WebAdapters.Platform |
| ✅ **自动适配** | React Native环境自动使用原生Platform |

## 🔧 兼容性

### React Native 环境
```javascript
Platform.OS        // 'ios' | 'android'
Platform.Version   // iOS: '14.0' | Android: 29
Platform.select()  // 原生方法
```

### Web/Electron 环境
```javascript
Platform.OS        // 'web'
Platform.Version   // undefined
Platform.select()  // 兼容方法
```

## 📝 使用示例

### 示例1: 文件URI格式

```javascript
import { Platform } from '../adapters/WebAdapters.js';

function getFileUri(path) {
  // Web环境需要三个斜杠，移动端需要两个
  return Platform.OS === 'web' 
    ? `file:///${path}` 
    : `file://${path}`;
}
```

### 示例2: 使用 Platform.select

```javascript
import { Platform } from '../adapters/WebAdapters.js';

const maxImageSize = Platform.select({
  ios: 4096,
  android: 2048,
  web: 8192,
  default: 2048
});
```

### 示例3: 平台特定逻辑

```javascript
import { Platform } from '../adapters/WebAdapters.js';

async function scanGallery() {
  if (Platform.OS === 'android') {
    // 使用Android MediaStore API
    return await scanAndroidMediaStore();
  } else if (Platform.OS === 'ios') {
    // 使用iOS Photos Framework
    return await scanIOSPhotos();
  } else {
    // 使用文件系统API (Electron)
    return await scanFileSystem();
  }
}
```

## 🔄 迁移指南

### 步骤1: 移除旧的平台检测代码

```diff
// GalleryScannerService.js

- let Platform;
- try {
-   if (typeof window !== 'undefined' && typeof document !== 'undefined') {
-     Platform = { OS: 'web' };
-   } else {
-     Platform = eval('require("react-native").Platform');
-   }
- } catch (error) {
-   Platform = { OS: 'web' };
- }
```

### 步骤2: 从WebAdapters导入Platform

```diff
- import { logger, RNFS } from '../adapters/WebAdapters.js';
+ import { logger, RNFS, Platform } from '../adapters/WebAdapters.js';
```

### 步骤3: 使用导入的Platform

```javascript
// 无需修改使用代码，直接使用即可
const fileUri = Platform.OS === 'web' ? 
  `file:///${path}` : `file://${path}`;
```

## 🎯 总结

通过导出统一的 `Platform` 对象：

1. ✅ **消除了代码重复** - 每个文件减少15行代码
2. ✅ **统一了接口** - 与 `ModelPathAdapter.detectEnvironment()` 协同工作
3. ✅ **提高了可维护性** - 单一数据源，修改一处即可
4. ✅ **保持了兼容性** - 与React Native的Platform API完全兼容
5. ✅ **简化了使用** - 开发者无需关心平台检测细节

---

**创建时间**: 2025-01-19  
**版本**: v1.0

