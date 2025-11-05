// 🔧 必须在所有 import 之前设置 polyfill，防止依赖库使用未定义的函数
// 设置 setImmediate polyfill (React Native 不支持 setImmediate)
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = (fn, ...args) => {
    return setTimeout(() => {
      if (typeof fn === 'function') {
        fn(...args);
      }
    }, 0);
  };
  global.clearImmediate = (id) => {
    return clearTimeout(id);
  };
}

// 设置 performance polyfill (React Native 不支持 performance API)
if (typeof global.performance === 'undefined') {
  const startTime = Date.now();
  global.performance = {
    now: () => {
      return Date.now() - startTime;
    },
    timing: {
      navigationStart: startTime,
    },
    mark: () => {},
    measure: () => {},
    clearMarks: () => {},
    clearMeasures: () => {},
    getEntriesByType: () => [],
    getEntriesByName: () => [],
  };
}

// 共享适配层 - 移动端专用版本
// 使用静态导入避免Metro的动态require问题
import React from 'react';
import { View, Text, Alert as RNAlert, Platform, PermissionsAndroid as RN_PermissionsAndroid, NativeModules, AppState as RNAppState } from 'react-native';
import { Buffer } from 'buffer';

// React Native 专用模块 - 静态导入
import RNFS_Native from 'react-native-fs';
import AsyncStorage_Native from '@react-native-async-storage/async-storage';
import SQLite_Native from 'react-native-sqlite-storage';
import { SafeAreaView as SafeAreaView_Native } from 'react-native-safe-area-context';
import { NavigationContainer as NavigationContainer_Native, useFocusEffect as useFocusEffect_Native } from '@react-navigation/native';
import { createStackNavigator as createStackNavigator_Native } from '@react-navigation/stack';
import { createBottomTabNavigator as createBottomTabNavigator_Native } from '@react-navigation/bottom-tabs';
import { launchImageLibrary as launchImageLibrary_Native } from 'react-native-image-picker';
import MaterialIcons_Native from 'react-native-vector-icons/MaterialIcons';
import ImageResizer_Native from 'react-native-image-resizer';
import jpeg from 'jpeg-js';

console.log('✅ React Native modules loaded successfully (native version)');

// ========== 统一日志系统 ==========
class Logger {
  constructor() {
    this.isDevelopment = __DEV__;
    this.isDebug = this.isDevelopment;
  }

  setDebugMode(enabled) {
    this.isDebug = enabled;
  }

  log(level, message, ...args) {
    if (!this.isDebug) return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'error':
        console.error(prefix, message, ...args);
        break;
      case 'warn':
        console.warn(prefix, message, ...args);
        break;
      case 'info':
        console.info(prefix, message, ...args);
        break;
      case 'debug':
        console.log(prefix, message, ...args);
        break;
      default:
        console.log(prefix, message, ...args);
    }
  }

  error(message, ...args) { this.log('error', message, ...args); }
  warn(message, ...args) { this.log('warn', message, ...args); }
  info(message, ...args) { this.log('info', message, ...args); }
  debug(message, ...args) { this.log('debug', message, ...args); }
}

const logger = new Logger();

// ========== 导出 ==========

// Platform（直接重新导出）
export { Platform };

// AppState（用于监听应用状态变化）
export const AppState = RNAppState;

// logger
export { logger };

// URI转换函数
export const getWebAccessibleUri = (uri) => {
  if (!uri) return null;
  return uri.startsWith('file://') ? uri : `file://${uri}`;
};

// 路径标准化
export const normalizeFilePath = (filePath) => {
  if (!filePath) return filePath;
  return filePath.replace(/^file:\/\//, '');
};

// 文件统计信息
export const getFileStats = async (filePath) => {
  const normalizedPath = normalizeFilePath(filePath);
  const stats = await RNFS_Native.stat(normalizedPath);
      return stats;
};

// 读取文件用于EXIF
export const readFileForExif = async (filePath) => {
  const normalizedPath = normalizeFilePath(filePath);
  const buffer = await RNFS_Native.read(normalizedPath, 65536, 0, 'base64');
    const nodeBuffer = Buffer.from(buffer, 'base64');
    return nodeBuffer;
};

// 读取图片文件为Blob
export const readImageFileAsBlob = async (filePath) => {
  const normalizedPath = normalizeFilePath(filePath);
  logger.debug(`Reading image file as blob: ${normalizedPath}`);
  const base64 = await RNFS_Native.readFile(normalizedPath, 'base64');
  return { base64, uri: filePath };
};

// MIME类型获取
export const getMimeTypeFromExtension = (ext) => {
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.webp': 'image/webp'
  };
  return mimeTypes[ext] || 'image/jpeg';
};

// ========== 1. PermissionsAndroid 适配 ==========
export const PermissionsAndroid = {
  PERMISSIONS: RN_PermissionsAndroid.PERMISSIONS,
  RESULTS: RN_PermissionsAndroid.RESULTS,
  request: async (permission, options) => {
    return await RN_PermissionsAndroid.request(permission, options);
  },
  requestMultiple: async (permissions) => {
    return await RN_PermissionsAndroid.requestMultiple(permissions);
  },
  check: async (permission) => {
    return await RN_PermissionsAndroid.check(permission);
  }
};

// ========== 2. AsyncStorage 适配 ==========
export const AsyncStorage = {
  getItem: async (key) => {
    const value = await AsyncStorage_Native.getItem(key);
    // AsyncStorage存储的是字符串，需要parse
      try {
        return value ? JSON.parse(value) : null;
    } catch {
      return value;
    }
  },
  setItem: async (key, value) => {
    // AsyncStorage只能存储字符串，需要stringify
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    return await AsyncStorage_Native.setItem(key, stringValue);
  },
  removeItem: async (key) => {
    return await AsyncStorage_Native.removeItem(key);
  },
  clear: async () => {
    return await AsyncStorage_Native.clear();
  },
  getAllKeys: async () => {
    return await AsyncStorage_Native.getAllKeys();
  }
};

// ========== 3. RNFS 适配 ==========
export const RNFS = {
  read: async (filePath, start, length, encoding) => {
    return await RNFS_Native.read(filePath, start, length, encoding);
  },
  stat: async (filePath) => {
    return await RNFS_Native.stat(filePath);
  },
  readDir: async (dirPath) => {
    return await RNFS_Native.readDir(dirPath);
  },
  exists: async (filePath) => {
    return await RNFS_Native.exists(filePath);
  },
  mkdir: async (dirPath) => {
    return await RNFS_Native.mkdir(dirPath, { NSURLIsExcludedFromBackupKey: true });
  },
  unlink: async (filePath) => {
      const cleanPath = filePath.replace('file://', '');
      
    // Android：优先使用MediaStore API
    if (Platform.OS === 'android') {
      try {
        const { MediaStoreModule } = NativeModules;
        if (MediaStoreModule) {
          try {
            const result = await MediaStoreModule.deleteFile(cleanPath);
            if (result) {
              return; // 删除成功
            }
            // 删除失败，继续尝试RNFS
          } catch (error) {
            // MediaStore 删除失败，降级到 RNFS
            const errorMessage = error && typeof error === 'object' ? (error.message || String(error)) : String(error || 'Unknown error');
            logger.warn('⚠️ MediaStore删除失败:', errorMessage);
          }
        }
      } catch (error) {
        // MediaStore 删除失败，降级到 RNFS（通常是临时文件）
      }
      
      // 降级到RNFS（用于删除临时文件）
      try {
        // 先检查文件是否存在
        const fileExists = await RNFS_Native.exists(cleanPath);
        if (!fileExists) {
          logger.warn('⚠️ 文件不存在，无需删除:', cleanPath);
          return;
        }
        
        await RNFS_Native.unlink(cleanPath);
        
        // 验证文件是否真的被删除了
        const stillExists = await RNFS_Native.exists(cleanPath);
        if (stillExists) {
          logger.error('❌ RNFS删除失败，文件仍然存在:', cleanPath);
          throw new Error('文件删除失败，文件仍然存在');
        }
        
        logger.debug('🗑️ RNFS删除成功:', cleanPath);
      } catch (error) {
        const errorMessage = error && typeof error === 'object' ? (error.message || String(error)) : String(error || 'Unknown error');
        logger.error('❌ RNFS删除失败:', errorMessage);
        throw error;
      }
    } else {
      // iOS：直接使用RNFS
      try {
        // 先检查文件是否存在
        const fileExists = await RNFS_Native.exists(cleanPath);
        if (!fileExists) {
          logger.warn('⚠️ 文件不存在，无需删除:', cleanPath);
          return;
        }
        
        await RNFS_Native.unlink(cleanPath);
        
        // 验证文件是否真的被删除了
        const stillExists = await RNFS_Native.exists(cleanPath);
        if (stillExists) {
          logger.error('❌ RNFS删除失败，文件仍然存在:', cleanPath);
          throw new Error('文件删除失败，文件仍然存在');
        }
        
        logger.debug('🗑️ RNFS删除成功:', cleanPath);
      } catch (error) {
        const errorMessage = error && typeof error === 'object' ? (error.message || String(error)) : String(error || 'Unknown error');
        logger.error('❌ RNFS删除失败:', errorMessage);
        throw error;
      }
    }
  },
  copyFile: async (from, to) => {
    return await RNFS_Native.copyFile(from, to);
  },
  moveFile: async (from, to) => {
    return await RNFS_Native.moveFile(from, to);
  },
  writeFile: async (filePath, content, encoding) => {
    return await RNFS_Native.writeFile(filePath, content, encoding);
  },
  readFile: async (filePath, encoding) => {
    return await RNFS_Native.readFile(filePath, encoding);
  },
  /**
   * 保存图片到相册（Android 专用）- 使用原生 MediaStoreModule
   * @param {string} imageUrl - 图片URL或base64数据
   * @param {string} fileName - 文件名（可选）
   * @returns {Promise<{uri: string, path?: string, fileName: string}>}
   */
  saveImageToGallery: async (imageUrl, fileName) => {
    if (Platform.OS === 'android') {
      try {
        // 先检查并请求所需权限
        const apiLevel = Platform.Version;
        let hasPermission = true;

        if (apiLevel >= 33) {
          // Android 13+ 需要 READ_MEDIA_IMAGES 和（在部分设备/ROM上）WRITE_MEDIA_IMAGES
          const needs = [];
          const readGranted = await RN_PermissionsAndroid.check('android.permission.READ_MEDIA_IMAGES');
          if (!readGranted) needs.push('android.permission.READ_MEDIA_IMAGES');
          // WRITE_MEDIA_IMAGES 并非所有ROM都实现，但如果在清单中声明了，尝试请求
          const writeGranted = await RN_PermissionsAndroid.check('android.permission.WRITE_MEDIA_IMAGES').catch(() => false);
          if (!writeGranted) needs.push('android.permission.WRITE_MEDIA_IMAGES');
          
          for (const p of needs) {
            const res = await RN_PermissionsAndroid.request(p);
            if (res !== RN_PermissionsAndroid.RESULTS.GRANTED && res !== 'granted') {
              hasPermission = false;
            }
          }
        } else {
          // Android 12 及以下需要 WRITE_EXTERNAL_STORAGE
          const writeGrantedOld = await RN_PermissionsAndroid.check('android.permission.WRITE_EXTERNAL_STORAGE');
          if (!writeGrantedOld) {
            const res = await RN_PermissionsAndroid.request('android.permission.WRITE_EXTERNAL_STORAGE');
            if (res !== RN_PermissionsAndroid.RESULTS.GRANTED && res !== 'granted') {
              hasPermission = false;
            }
          }
        }

        if (!hasPermission) {
          throw new Error('需要相册写入权限，请在系统设置中授予后重试');
        }

        const { MediaStoreModule } = NativeModules;
        
        if (!MediaStoreModule || typeof MediaStoreModule.saveImageToGallery !== 'function') {
          throw new Error('MediaStoreModule.saveImageToGallery 方法不可用');
        }
        
        logger.debug(`[Android] RNFS.saveImageToGallery: ${imageUrl}`);
        const result = await MediaStoreModule.saveImageToGallery(imageUrl, fileName || null);
        logger.debug(`[Android] 图片保存成功:`, result);
        return result;
      } catch (error) {
        logger.error(`[Android] 保存图片到相册失败:`, error);
        throw error;
      }
    } else {
      // iOS或其他平台：暂不支持
      throw new Error(`当前平台 ${Platform.OS} 不支持保存图片到相册`);
    }
  },
  DocumentDirectoryPath: RNFS_Native.DocumentDirectoryPath,
  ExternalDirectoryPath: RNFS_Native.ExternalDirectoryPath,
  PicturesDirectoryPath: RNFS_Native.PicturesDirectoryPath,
  CachesDirectoryPath: RNFS_Native.CachesDirectoryPath,
  MainBundlePath: RNFS_Native.MainBundlePath,
  LibraryDirectoryPath: RNFS_Native.LibraryDirectoryPath,
  ExternalStorageDirectoryPath: RNFS_Native.ExternalStorageDirectoryPath,
};

// ========== 4. SafeAreaView 适配 ==========
export const SafeAreaView = ({ children, style, ...props }) => {
  return <SafeAreaView_Native style={style} {...props}>{children}</SafeAreaView_Native>;
};

// ========== 5. Navigation 适配 ==========
export const useFocusEffect = (callback) => {
  return useFocusEffect_Native(callback);
};

// ========== 6. 图片选择器适配 ==========
export const launchImageLibrary = (options, callback) => {
  return launchImageLibrary_Native(options, callback);
};

// ========== 7. 图标库适配 ==========
export const Icon = ({ name, size, color, ...props }) => {
  return <MaterialIcons_Native name={name} size={size} color={color} {...props} />;
};

// ========== 8. 导航适配 ==========
export const NavigationContainer = React.forwardRef(({ children }, ref) => {
  return <NavigationContainer_Native ref={ref}>{children}</NavigationContainer_Native>;
});

export const createStackNavigator = () => {
  return createStackNavigator_Native();
};

export const createBottomTabNavigator = () => {
  return createBottomTabNavigator_Native();
};

// ========== 9. 数据库适配 ==========
export const SQLite = {
  openDatabase: (name, version, displayName, size) => {
    // Prefer object-form (official recommended): { name, location }
    let db;
    try {
      db = SQLite_Native.openDatabase({ name, location: 'default' });
    } catch (e) {
      // Fallback to legacy 4-arg signature
      db = SQLite_Native.openDatabase(name, version, displayName, size);
    }
    
    // 包装 executeSql 方法，将回调转换为 Promise
    // react-native-sqlite-storage 需要在 transaction 中执行 SQL
    const originalTransaction = db.transaction.bind(db);
    const originalExecuteSql = db.executeSql ? db.executeSql.bind(db) : null;
    
    db.executeSql = (sql, params = []) => {
      // PRAGMA 语句不能在 transaction 中执行，需要直接调用
      if (sql.trim().toUpperCase().startsWith('PRAGMA')) {
        if (!originalExecuteSql) {
          // 如果没有原生的 executeSql，PRAGMA 无法执行，直接返回空结果
          logger.warn('⚠️ PRAGMA not supported without transaction, skipping:', sql);
          return Promise.resolve([{ rows: { length: 0 } }]);
        }
        // 直接使用原生的 executeSql（不在 transaction 中）
        return new Promise((resolve, reject) => {
          originalExecuteSql(
            sql,
            params,
            (results) => {
              resolve([results]);
            },
            (error) => {
              // 安全地处理错误对象，避免传递 undefined 给 logger
              const safeError = error && typeof error === 'object' 
                ? (error.message || JSON.stringify(error)) 
                : String(error || 'Unknown error');
              logger.error('SQLite PRAGMA error:', { sql, error: safeError });
              reject(error);
            }
          );
        });
      }
      
      // 普通 SQL 语句在 transaction 中执行
      return new Promise((resolve, reject) => {
        originalTransaction(
          (tx) => {
            tx.executeSql(
              sql,
              params,
              (tx, results) => {
                // 返回结果数组格式: [results]
                resolve([results]);
              },
              (tx, error) => {
                // 安全地处理错误对象，避免传递 undefined 给 logger
                const safeError = error && typeof error === 'object' 
                  ? (error.message || JSON.stringify(error)) 
                  : String(error || 'Unknown error');
                logger.error('SQLite executeSql error:', { sql, error: safeError });
                reject(error);
              }
            );
          },
          (error) => {
            // Transaction error callback
            // 安全地处理错误对象，避免传递 undefined 给 logger
            const safeError = error && typeof error === 'object' 
              ? (error.message || JSON.stringify(error)) 
              : String(error || 'Unknown error');
            logger.error('SQLite transaction error:', { sql, error: safeError });
            reject(error);
          }
        );
      });
    };
    
    return db;
  },
};

// ========== 10. 平台检测 ==========
export const isWeb = false;
export const isMobile = true;

// ========== 11. Alert 适配 ==========
export const Alert = {
  alert: (title, message, buttons, options) => {
      RNAlert.alert(title, message, buttons, options);
  }
};

// ========== 12. Electron 文件操作接口（移动端不需要） ==========
export const ElectronFileAPI = {
  readFile: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  writeFile: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  deleteFile: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  exists: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  mkdir: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  readDir: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  stat: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  openFileDialog: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
  openDirectoryDialog: async () => { throw new Error('ElectronFileAPI not available on mobile'); },
};

// ========== 13. 样式辅助 ==========
export const createFixedStyle = (style) => style;

// ========== 14. 权限适配器（移动端专用） ==========
export const PermissionAdapter = {
  requestStoragePermission: async () => {
    if (Platform.OS !== 'android') return true;
        
        const apiLevel = Platform.Version;
    logger.debug(`📱 Android API级别: ${apiLevel}`);
    
    // Android 13+ (API 33+)
        if (apiLevel >= 33) {
      try {
          const hasMediaImages = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
        
        if (!hasMediaImages) {
          const mediaGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            {
              title: '需要访问相册权限',
              message: '芯图相册需要访问您的照片以进行智能分类',
              buttonNeutral: '稍后询问',
              buttonNegative: '拒绝',
              buttonPositive: '允许',
            }
          );
          return mediaGranted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
      } catch (error) {
        logger.error('请求媒体权限失败:', error);
        return false;
      }
    }
    
    // Android 10-12 (API 29-32)
    if (apiLevel >= 29) {
      try {
          const hasStoragePermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
          );
          
        if (!hasStoragePermission) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            {
              title: '需要访问存储权限',
              message: '芯图相册需要访问存储以读取照片',
              buttonNeutral: '稍后询问',
              buttonNegative: '拒绝',
              buttonPositive: '允许',
            }
          );
          return granted === PermissionsAndroid.RESULTS.GRANTED;
        }
        return true;
      } catch (error) {
        logger.error('请求存储权限失败:', error);
        return false;
      }
    }
    
    // Android 9及以下 (API 28-)
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ];
      
      const grantedResults = await PermissionsAndroid.requestMultiple(permissions);
      
      return (
        grantedResults[PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED &&
        grantedResults[PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE] === PermissionsAndroid.RESULTS.GRANTED
      );
      } catch (error) {
      logger.error('请求存储权限失败:', error);
      return false;
    }
  },

  checkStoragePermission: async () => {
    if (Platform.OS !== 'android') return true;
    
    const apiLevel = Platform.Version;
    
    // Android 13+
    if (apiLevel >= 33) {
      const hasMediaImages = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
            );
      return hasMediaImages;
    }
    
    // Android 10-12
    if (apiLevel >= 29) {
      const hasReadStorage = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );
      return hasReadStorage;
    }
    
    // Android 9及以下
    const hasReadStorage = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
    );
    const hasWriteStorage = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
    );
    
    return hasReadStorage && hasWriteStorage;
  },
};

// ========== 15. 模型路径适配器 ==========
export const ModelPathAdapter = {
  detectEnvironment: () => 'react-native',
  
  loadOnnxRuntime: async () => {
    // 移动端使用 onnxruntime-react-native
    const ort = require('onnxruntime-react-native');
    logger.debug('📱 加载 onnxruntime-react-native');
    return ort;
  },
  
  getModelPath: (modelRelativePath) => {
    if (Platform.OS === 'android') {
      // Android: 返回带 file:// 协议的URI
      // assets 中的文件需要复制到可读写目录才能被 ONNX Runtime 访问
      const destPath = `${RNFS_Native.DocumentDirectoryPath}/models/${modelRelativePath}`;
      const fileUri = `file://${destPath}`;
      logger.debug(`📱 Android: ${destPath} -> ${fileUri}`);
      return fileUri;
      } else {
      // iOS: 使用 MainBundle 路径
      const fullPath = `${RNFS_Native.MainBundlePath}/models/${modelRelativePath}`;
      return fullPath;
    }
  },
  
  // Android: 从 APK assets 复制模型到文档目录（只复制一次）
  ensureModelExists: async (modelRelativePath) => {
    if (Platform.OS !== 'android') {
      logger.debug(`📱 非Android平台，跳过模型复制: ${modelRelativePath}`);
      return; // iOS/Web 无需复制
    }
    
    const destPath = `${RNFS_Native.DocumentDirectoryPath}/models/${modelRelativePath}`;
    const dirPath = `${RNFS_Native.DocumentDirectoryPath}/models`;
    
    logger.debug(`🔍 检查模型文件: ${destPath}`);
    
    try {
      // 检查文件是否已复制
      const fileExists = await RNFS_Native.exists(destPath);
      logger.debug(`📋 文件存在检查: ${modelRelativePath} = ${fileExists}`);
      if (fileExists) {
        return; // 已存在，跳过
      }
      
      // 确保目录存在
      const dirExists = await RNFS_Native.exists(dirPath);
      if (!dirExists) {
        await RNFS_Native.mkdir(dirPath);
      }
      
      // 从 APK assets 复制到文档目录（一次性操作）
      const sourcePath = `models/${modelRelativePath}`;
      logger.debug(`📋 从 APK 复制模型: ${modelRelativePath}`);
      await RNFS_Native.copyFileAssets(sourcePath, destPath);
      logger.debug(`✅ 模型复制完成: ${modelRelativePath}`);
    } catch (error) {
      const errorMessage = error && typeof error === 'object' ? (error.message || String(error)) : String(error || 'Unknown error');
      logger.error(`❌ 模型复制失败 (${modelRelativePath}): ${errorMessage}`);
      throw error;
    }
  },
  
  getExecutionProviders: () => {
    // React Native环境：优先使用XNNPACK，降级为CPU
    // 注意：GPU推理可能因为内存拷贝开销而比CPU更慢
    // 特别是对于轻量级模型，建议先进行性能测试
    return ['cpu'];
  },
};

// ========== 16. Canvas适配器（移动端：使用原生图片处理） ==========
export const CanvasAdapter = {
  /**
   * 移动端：返回模拟的 Canvas 对象
   * 实际使用 ImageResizer + jpeg-js 处理图片
   */
  async createCanvas(width, height) {
    logger.debug(`📱 创建模拟 Canvas (${width}x${height})`);
    return {
      width,
      height,
      _targetWidth: width,
      _targetHeight: height,
      _imageData: null,
      getContext: () => ({
        // 模拟的 2d context，实际由 getImageData 提供数据
        getImageData: async (x, y, w, h) => {
          return this._imageData;
        },
        fillStyle: null,
        fillRect: () => {},
        drawImage: () => {},
      })
    };
  },

  /**
   * 移动端：加载并解码图片为像素数据
   * 使用 ImageResizer 调整大小 + jpeg-js 解码像素
   */
  async loadImage(imageUri, canvas = null) {
    logger.debug(`📱 处理图片: ${imageUri}`);
    
    try {
      const filePath = imageUri.startsWith('file://') 
        ? imageUri.replace('file://', '') 
        : imageUri;
      
      const targetWidth = canvas?._targetWidth || 640;
      const targetHeight = canvas?._targetHeight || 640;
      
      // 1. 使用原生 ImageResizer 调整图片大小
      logger.debug(`📋 调整图片大小: ${targetWidth}x${targetHeight}`);
      const resized = await ImageResizer_Native.createResizedImage(
        filePath,
        targetWidth,
        targetHeight,
        'JPEG',
        100, // 质量
        0,   // 旋转角度
        null, // 输出路径
        false, // 保持透明度
        {
          mode: 'contain', // 保持宽高比，填充黑边
          onlyScaleDown: false
        }
      );
      
      logger.debug(`✅ 图片调整完成: ${resized.uri}`);
      
      // 2. 读取调整后的图片为 Buffer
      const resizedPath = resized.uri.replace('file://', '');
      const buffer = await RNFS_Native.readFile(resizedPath, 'base64');
      const imageBuffer = Buffer.from(buffer, 'base64');
      
      logger.debug(`📋 解码 JPEG (${Math.round(imageBuffer.length / 1024)} KB)`);
      
      // 3. 使用 jpeg-js 解码为像素数据
      const rawImageData = jpeg.decode(imageBuffer, { useTArray: true });
      
      logger.debug(`✅ 图片解码成功: ${rawImageData.width}x${rawImageData.height}`);
      
      // 4. 返回包含像素数据的对象
      return {
        width: rawImageData.width,
        height: rawImageData.height,
        data: rawImageData.data, // Uint8Array: RGBA 格式
        _rawImageData: rawImageData
      };
    } catch (error) {
      logger.error(`❌ 图片处理失败: ${imageUri}`, error);
      throw error;
    }
  },
};

// ========== 导出图片处理模块供 ImageProcessor 使用 ==========
export const ImageResizer = ImageResizer_Native;
// RNFS 已在第166行导出
export const jpegJs = jpeg;
export const RNImage = { getSize: require('react-native').Image.getSize };
