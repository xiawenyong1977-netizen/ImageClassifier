// 共享适配层 - 根据平台提供不同的API实现
// 在web环境中，Platform来自react-native-web，在移动端来自react-native
import React from 'react';
let Platform;
try {
  // 尝试检测web环境
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Web环境
    Platform = { OS: 'web' };
  } else {
    // 移动端环境
    Platform = eval('require("react-native").Platform');
  }
} catch (error) {
  // 如果检测失败，默认为web环境
  Platform = { OS: 'web' };
}

// URI转换函数 - 将文件URI转换为Web可访问的格式
export const getWebAccessibleUri = (uri) => {
  if (!uri) return null;
  
  // If it's already a web URL, return as is
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  
  // If it's a file:// URI, convert to web-accessible format
  if (uri.startsWith('file://')) {
    // For Electron environment, we can use the file:// protocol
    // but we need to ensure the path is correct for the current platform
    const filePath = uri.replace('file://', '');
    
    // Check if we're in Electron environment
    if (typeof window !== 'undefined' && window.require) {
      // In Electron, we can access local files
      return uri;
    }
    
    // For web environment, we'll show placeholder
    return null;
  }
  
  return uri;
};

// 文件路径标准化函数 - 统一处理不同平台的文件路径格式
export const normalizeFilePath = (filePath) => {
  if (!filePath) return filePath;
  
  let normalizedPath = filePath;
  
  // 移除file://前缀
  if (normalizedPath.startsWith('file://')) {
    normalizedPath = normalizedPath.replace('file://', '');
  }
  
  // Windows路径处理: /D:/path -> D:/path
  if (normalizedPath.startsWith('/') && normalizedPath.length > 1 && normalizedPath[1] === ':') {
    normalizedPath = normalizedPath.substring(1);
  }
  
  return normalizedPath;
};

// 文件信息获取函数 - 统一处理不同平台的文件信息获取
export const getFileStats = async (filePath) => {
  const normalizedPath = normalizeFilePath(filePath);
  
  // 在Electron环境中，只使用Node.js的fs模块
  if (typeof window !== 'undefined' && window.require) {
    try {
      const fs = window.require('fs');
      const stats = fs.statSync(normalizedPath);
      return stats;
    } catch (fsError) {
      console.log(`⚠️ Node.js fs stat failed:`, fsError.message);
      throw new Error(`Failed to get file stats in Electron: ${fsError.message}`);
    }
  }
  
  // 在非Electron环境中使用RNFS方法
  try {
    console.log(`🔄 Using RNFS in non-Electron environment...`);
    const RNFS = eval('require("react-native-fs")');
    const stats = await RNFS.stat(normalizedPath);
    console.log(`📦 RNFS stats read successfully, size: ${stats.size}`);
    return stats;
  } catch (rnfsError) {
    console.log(`⚠️ RNFS stat failed:`, rnfsError.message);
    throw new Error(`Failed to get file stats: ${rnfsError.message}`);
  }
};

// 文件读取函数 - 统一处理不同平台的文件读取
export const readFileForExif = async (filePath) => {
  const normalizedPath = normalizeFilePath(filePath);
  
  // 在Electron环境中，优先使用Node.js的fs模块
  if (typeof window !== 'undefined' && window.require) {
    try {
      const fs = window.require('fs');
      const buffer = fs.readFileSync(normalizedPath);
      
      // 直接返回Node.js Buffer，exif-parser需要这种类型
      return buffer;
    } catch (fsError) {
      console.log(`⚠️ Node.js fs read failed:`, fsError.message);
      // 继续尝试RNFS方法
    }
  }
  
  // 回退到RNFS方法
  try {
    console.log(`🔄 Using RNFS as fallback...`);
    const RNFS = eval('require("react-native-fs")');
    const Buffer = require('buffer').Buffer;
    
    const buffer = await RNFS.read(normalizedPath, 65536, 0, 'base64');
    console.log(`📦 Base64 buffer length: ${buffer.length}`);
    
    const nodeBuffer = Buffer.from(buffer, 'base64');
    console.log(`📦 Node.js Buffer length: ${nodeBuffer.length}`);
    return nodeBuffer;
  } catch (rnfsError) {
    console.log(`⚠️ RNFS read failed:`, rnfsError.message);
    throw new Error(`Failed to read file: ${rnfsError.message}`);
  }
};

// 1. PermissionsAndroid 适配
export const PermissionsAndroid = {
  PERMISSIONS: {
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
    CAMERA: 'android.permission.CAMERA',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: async (permission, options) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] 模拟权限请求: ${permission}`, options);
      return 'granted';
    } else {
      // 移动端使用原生API
      const { PermissionsAndroid: RNPermissionsAndroid } = eval('require("react-native")');
      return await RNPermissionsAndroid.request(permission, options);
    }
  },
  check: async (permission) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] 模拟权限检查: ${permission}`);
      return true;
    } else {
      // 移动端使用原生API
      const { PermissionsAndroid: RNPermissionsAndroid } = eval('require("react-native")');
      return await RNPermissionsAndroid.check(permission);
    }
  },
};

// 2. AsyncStorage 适配
export const AsyncStorage = {
  getItem: async (key) => {
    if (Platform.OS === 'web') {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : null;
      } catch (error) {
        console.error('[Web] AsyncStorage.getItem error:', error);
        return null;
      }
    } else {
      // 移动端使用原生API
      const AsyncStorage = eval('require("@react-native-async-storage/async-storage")').default;
      return await AsyncStorage.getItem(key);
    }
  },
  setItem: async (key, value) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] AsyncStorage.setItem: ${key}`);
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error('[Web] AsyncStorage.setItem error:', error);
        return false;
      }
    } else {
      // 移动端使用原生API
      const AsyncStorage = eval('require("@react-native-async-storage/async-storage")').default;
      return await AsyncStorage.setItem(key, value);
    }
  },
  removeItem: async (key) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] AsyncStorage.removeItem: ${key}`);
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.error('[Web] AsyncStorage.removeItem error:', error);
        return false;
      }
    } else {
      // 移动端使用原生API
      const AsyncStorage = eval('require("@react-native-async-storage/async-storage")').default;
      return await AsyncStorage.removeItem(key);
    }
  },
  clear: async () => {
    if (Platform.OS === 'web') {
      console.log('[Web] AsyncStorage.clear');
      try {
        localStorage.clear();
        return true;
      } catch (error) {
        console.error('[Web] AsyncStorage.clear error:', error);
        return false;
      }
    } else {
      // 移动端使用原生API
      const AsyncStorage = eval('require("@react-native-async-storage/async-storage")').default;
      return await AsyncStorage.clear();
    }
  },
  getAllKeys: async () => {
    if (Platform.OS === 'web') {
      console.log('[Web] AsyncStorage.getAllKeys');
      try {
        return Object.keys(localStorage);
      } catch (error) {
        console.error('[Web] AsyncStorage.getAllKeys error:', error);
        return [];
      }
    } else {
      // 移动端使用原生API
      const AsyncStorage = eval('require("@react-native-async-storage/async-storage")').default;
      return await AsyncStorage.getAllKeys();
    }
  },
};

// 3. RNFS 适配
export const RNFS = {
  read: async (filePath, start, length, encoding) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.read: ${filePath}`);
      return 'mock_file_content';
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.read(filePath, start, length, encoding);
    }
  },
  stat: async (filePath) => {
    if (Platform.OS === 'web') {
      try {
        // 在 Electron 环境中，尝试使用 Node.js fs 模块
        const fs = eval('require("fs")');
        const stats = fs.statSync(filePath);
        
        return {
          size: stats.size,
          isFile: () => stats.isFile(),
          isDirectory: () => stats.isDirectory(),
          mtime: stats.mtime,
          ctime: stats.ctime,
        };
      } catch (error) {
        console.log(`[Web] File stat failed: ${error.message}`);
        return { 
          size: 1024, 
          isFile: () => true,
          isDirectory: () => false,
          mtime: new Date(),
          ctime: new Date(),
        };
      }
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.stat(filePath);
    }
  },
  readDir: async (dirPath) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.readDir: ${dirPath}`);
      try {
        // 在 Electron 环境中，尝试使用 Node.js fs 模块
        const fs = eval('require("fs")');
        const path = eval('require("path")');
        
        const files = fs.readdirSync(dirPath);
        const result = [];
        
        for (const file of files) {
          // 确保路径正确拼接，避免缺少路径分隔符
          const normalizedDirPath = dirPath.replace(/\\/g, '/').replace(/\/$/, '');
          const fullPath = `${normalizedDirPath}/${file}`;
          const stats = fs.statSync(fullPath);
          
          result.push({
            name: file,
            path: fullPath,
            isFile: () => stats.isFile(),
            isDirectory: () => stats.isDirectory(),
            size: stats.size,
            mtime: stats.mtime,
            ctime: stats.ctime,
          });
        }
        
        console.log(`[Web] Found ${result.length} items in ${dirPath}`);
        return result;
      } catch (error) {
        console.log(`[Web] Directory read failed: ${error.message}`);
        return [];
      }
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.readDir(dirPath);
    }
  },
  exists: async (filePath) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.exists: ${filePath}`);
      try {
        // 在 Electron 环境中，尝试使用 Node.js fs 模块
        const fs = eval('require("fs")');
        const path = eval('require("path")');
        
        // 修复Windows路径格式问题
        let normalizedPath = filePath;
        if (filePath.startsWith('/') && filePath.includes(':')) {
          // 处理 /D:/path 格式，转换为 D:/path
          normalizedPath = filePath.substring(1);
        }
        
        console.log(`[Web] RNFS.exists normalized path: ${normalizedPath}`);
        const exists = fs.existsSync(normalizedPath);
        console.log(`[Web] RNFS.exists result: ${exists}`);
        return exists;
      } catch (error) {
        console.log(`[Web] File system access not available: ${error.message}`);
        return false;
      }
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.exists(filePath);
    }
  },
  mkdir: async (dirPath) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.mkdir: ${dirPath}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.mkdir(dirPath);
    }
  },
  unlink: async (filePath) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.unlink: ${filePath}`);
      console.log(`[Web] Electron available:`, !!window.require);
      console.log(`[Web] window.require available:`, !!window.require);
      
      if (!window.require) {
        console.error(`[Web] window.require not available, cannot delete file`);
        throw new Error('Electron environment not available');
      }
      
      try {
        // 修复Windows路径格式问题
        let normalizedPath = filePath;
        if (filePath.startsWith('/') && filePath.includes(':')) {
          // 处理 /D:/path 格式，转换为 D:/path
          normalizedPath = filePath.substring(1);
        }
        
        console.log(`[Web] RNFS.unlink normalized path: ${normalizedPath}`);
        
        // 在PC环境下使用Electron接口删除文件
        console.log(`[Web] Calling ElectronFileAPI.deleteFile...`);
        const result = await ElectronFileAPI.deleteFile(normalizedPath);
        console.log(`[Web] File deleted via Electron: ${normalizedPath}`, result);
        return true;
      } catch (error) {
        console.error(`[Web] Failed to delete file via Electron: ${filePath}`, error);
        throw error;
      }
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.unlink(filePath);
    }
  },
  copyFile: async (from, to) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.copyFile: ${from} -> ${to}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.copyFile(from, to);
    }
  },
  moveFile: async (from, to) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.moveFile: ${from} -> ${to}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.moveFile(from, to);
    }
  },
  writeFile: async (filePath, content, encoding) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.writeFile: ${filePath}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.writeFile(filePath, content, encoding);
    }
  },
  readFile: async (filePath, encoding) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] RNFS.readFile: ${filePath}`);
      return 'mock_file_content';
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.readFile(filePath, encoding);
    }
  },
  DocumentDirectoryPath: Platform.OS === 'web' ? '/mock/documents' : (eval('require("react-native-fs")') || {}).DocumentDirectoryPath,
  ExternalDirectoryPath: Platform.OS === 'web' ? '/mock/external' : (eval('require("react-native-fs")') || {}).ExternalDirectoryPath,
  PicturesDirectoryPath: Platform.OS === 'web' ? '/mock/pictures' : (eval('require("react-native-fs")') || {}).PicturesDirectoryPath,
  CachesDirectoryPath: Platform.OS === 'web' ? '/mock/caches' : (eval('require("react-native-fs")') || {}).CachesDirectoryPath,
  MainBundlePath: Platform.OS === 'web' ? '/mock/bundle' : (eval('require("react-native-fs")') || {}).MainBundlePath,
  LibraryDirectoryPath: Platform.OS === 'web' ? '/mock/library' : (eval('require("react-native-fs")') || {}).LibraryDirectoryPath,
  ExternalStorageDirectoryPath: Platform.OS === 'web' ? '/mock/external_storage' : (eval('require("react-native-fs")') || {}).ExternalStorageDirectoryPath,
};

// 4. SafeAreaView 适配
export const SafeAreaView = ({ children, style, ...props }) => {
  if (Platform.OS === 'web') {
    // Web环境：直接使用 View 组件
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { style: [{ flex: 1 }, style], ...props }, children);
  } else {
    // 移动端使用原生API
    const { SafeAreaView: RNSafeAreaView } = eval('require("react-native-safe-area-context")');
    return <RNSafeAreaView style={style} {...props}>{children}</RNSafeAreaView>;
  }
};

// 5. Navigation 适配
export const useFocusEffect = (callback) => {
  if (Platform.OS === 'web') {
    // Web环境：直接调用callback，因为web页面总是"focused"
    callback();
  } else {
    // 移动端使用原生API
    const { useFocusEffect: RNUseFocusEffect } = eval('require("@react-navigation/native")');
    return RNUseFocusEffect(callback);
  }
};

// 6. 图片选择器适配
export const launchImageLibrary = (options, callback) => {
  if (Platform.OS === 'web') {
    console.log('[Web] launchImageLibrary:', options);
    const mockResult = {
      assets: [
        {
          uri: 'mock://image1.jpg',
          fileName: 'mock_image1.jpg',
          fileSize: 1024,
          type: 'image/jpeg',
          width: 800,
          height: 600,
        }
      ],
      didCancel: false,
      errorMessage: null,
    };
    
    if (callback) {
      setTimeout(() => callback(mockResult), 100);
    }
    
    return Promise.resolve(mockResult);
  } else {
    // 移动端使用原生API
    const { launchImageLibrary: RNLaunchImageLibrary } = Platform.OS === 'web' ? { launchImageLibrary: null } : eval('require("react-native-image-picker")');
    return RNLaunchImageLibrary(options, callback);
  }
};

// 7. 图标库适配
export const Icon = ({ name, size, color, ...props }) => {
  if (Platform.OS === 'web') {
    // Web环境：使用 emoji 图标
    const React = require('react');
    const { Text } = require('react-native');
    const iconMap = {
      'home': '🏠',
      'photo': '📷',
      'settings': '⚙️',
      'search': '🔍',
      'add': '➕',
      'delete': '🗑️',
      'edit': '✏️',
      'save': '💾',
      'close': '❌',
      'check': '✅',
    };
    
    return React.createElement(Text, { style: { fontSize: size, color, ...props.style } }, iconMap[name] || '📦');
  } else {
    // 移动端使用原生API
    const Icon = Platform.OS === 'web' ? null : eval('require("react-native-vector-icons/MaterialIcons")').default;
    return <Icon name={name} size={size} color={color} {...props} />;
  }
};

// 8. 导航适配
export const NavigationContainer = React.forwardRef(({ children }, ref) => {
  if (Platform.OS === 'web') {
    // Web环境：使用简单的 View 容器
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { style: { flex: 1 }, ref }, children);
  } else {
    // 移动端使用原生API
    const { NavigationContainer: RNNavigationContainer } = eval('require("@react-navigation/native")');
    return <RNNavigationContainer ref={ref}>{children}</RNNavigationContainer>;
  }
});

export const createStackNavigator = () => {
  if (Platform.OS === 'web') {
    return {
      Navigator: ({ children }) => {
        // Web环境：使用简单的 View 容器
        const React = require('react');
        const { View } = require('react-native');
        return React.createElement(View, { style: { flex: 1 } }, children);
      },
      Screen: ({ component: Component, ...props }) => {
        return <Component {...props} />;
      },
    };
  } else {
    // 移动端使用原生API
    const { createStackNavigator: RNCreateStackNavigator } = eval('require("@react-navigation/stack")');
    return RNCreateStackNavigator();
  }
};

export const createBottomTabNavigator = () => {
  if (Platform.OS === 'web') {
    return {
      Navigator: ({ children }) => {
        // Web环境：使用简单的 View 容器
        const React = require('react');
        const { View } = require('react-native');
        return React.createElement(View, { style: { flex: 1 } }, children);
      },
      Screen: ({ component: Component, ...props }) => {
        return <Component {...props} />;
      },
    };
  } else {
    // 移动端使用原生API
    const { createBottomTabNavigator: RNCreateBottomTabNavigator } = eval('require("@react-navigation/bottom-tabs")');
    return RNCreateBottomTabNavigator();
  }
};

// 9. 数据库适配
export const SQLite = {
  openDatabase: (name, version, displayName, size) => {
    if (Platform.OS === 'web') {
      console.log(`[Web] SQLite.openDatabase: ${name}`);
      return {
        transaction: (fn) => {
          console.log('[Web] SQLite.transaction');
          fn({
            executeSql: (sql, params, successCallback, errorCallback) => {
              console.log('[Web] SQLite.executeSql:', sql);
              if (successCallback) {
                setTimeout(() => successCallback({ rows: { length: 0, raw: () => [] } }), 100);
              }
            },
          });
        },
        readTransaction: (fn) => {
          console.log('[Web] SQLite.readTransaction');
          fn({
            executeSql: (sql, params, successCallback, errorCallback) => {
              console.log('[Web] SQLite.executeSql:', sql);
              if (successCallback) {
                setTimeout(() => successCallback({ rows: { length: 0, raw: () => [] } }), 100);
              }
            },
          });
        },
      };
    } else {
      // 移动端使用原生API
      const SQLite = eval('require("react-native-sqlite-storage")');
      return SQLite.openDatabase(name, version, displayName, size);
    }
  },
};

// 10. 平台检测
export const isWeb = Platform.OS === 'web';
export const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

// 11. Alert 适配
export const Alert = {
  alert: (title, message, buttons, options) => {
    if (Platform.OS === 'web') {
      // Web环境使用自定义模态对话框
      const createCustomAlert = () => {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.style.cssText = `
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          z-index: 10000;
          display: flex;
          justify-content: center;
          align-items: center;
        `;

        // 创建对话框
        const dialog = document.createElement('div');
        dialog.style.cssText = `
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          min-width: 400px;
          max-width: 500px;
          max-height: 80vh;
          overflow: hidden;
        `;

        // 创建标题栏
        const titleBar = document.createElement('div');
        titleBar.style.cssText = `
          background: #f5f5f5;
          padding: 12px 16px;
          border-bottom: 1px solid #e0e0e0;
          font-weight: bold;
          font-size: 16px;
          color: #333;
        `;
        titleBar.textContent = title;

        // 创建内容区域
        const content = document.createElement('div');
        content.style.cssText = `
          padding: 20px 16px;
          font-size: 14px;
          line-height: 1.5;
          color: #333;
          white-space: pre-line;
        `;
        content.textContent = message;

        // 创建按钮区域
        const buttonArea = document.createElement('div');
        buttonArea.style.cssText = `
          padding: 12px 16px;
          border-top: 1px solid #e0e0e0;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        `;

        // 添加按钮
        if (buttons && buttons.length > 0) {
          buttons.forEach((button, index) => {
            const btn = document.createElement('button');
            btn.textContent = button.text;
            btn.style.cssText = `
              padding: 8px 16px;
              border: 1px solid #ccc;
              border-radius: 4px;
              background: white;
              cursor: pointer;
              font-size: 14px;
              min-width: 60px;
            `;

            // 设置按钮样式
            if (button.style === 'destructive') {
              btn.style.background = '#dc3545';
              btn.style.color = 'white';
              btn.style.borderColor = '#dc3545';
            } else if (button.style === 'cancel') {
              btn.style.background = '#f8f9fa';
              btn.style.color = '#6c757d';
            }

            // 按钮点击事件
            btn.onclick = () => {
              if (button.onPress) {
                button.onPress();
              }
              document.body.removeChild(overlay);
            };

            buttonArea.appendChild(btn);
          });
        } else {
          // 默认确定按钮
          const defaultBtn = document.createElement('button');
          defaultBtn.textContent = '确定';
          defaultBtn.style.cssText = `
            padding: 8px 16px;
            border: 1px solid #007bff;
            border-radius: 4px;
            background: #007bff;
            color: white;
            cursor: pointer;
            font-size: 14px;
            min-width: 60px;
          `;
          defaultBtn.onclick = () => {
            document.body.removeChild(overlay);
          };
          buttonArea.appendChild(defaultBtn);
        }

        // 组装对话框
        dialog.appendChild(titleBar);
        dialog.appendChild(content);
        dialog.appendChild(buttonArea);
        overlay.appendChild(dialog);

        // 添加到页面
        document.body.appendChild(overlay);

        // 点击遮罩层关闭（可选）
        overlay.onclick = (e) => {
          if (e.target === overlay) {
            document.body.removeChild(overlay);
          }
        };
      };

      createCustomAlert();
    } else {
      // 移动端使用原生Alert
      const { Alert: RNAlert } = require('react-native');
      RNAlert.alert(title, message, buttons, options);
    }
  }
};

// 12. Electron 文件操作接口
export const ElectronFileAPI = {
  deleteFile: (filePath) => {
    return new Promise((resolve, reject) => {
      console.log(`[ElectronFileAPI] 开始删除文件: ${filePath}`);
      console.log(`[ElectronFileAPI] Platform.OS: ${Platform.OS}`);
      console.log(`[ElectronFileAPI] window.require 可用:`, !!window.require);
      console.log(`[ElectronFileAPI] window 对象:`, typeof window);
      console.log(`[ElectronFileAPI] process 对象:`, typeof process);
      
      if (Platform.OS === 'web' && window.require) {
        try {
          console.log(`[ElectronFileAPI] 尝试获取 electron 模块...`);
          const electron = window.require('electron');
          console.log(`[ElectronFileAPI] electron 模块:`, electron);
          
          const { ipcRenderer } = electron;
          console.log(`[ElectronFileAPI] ipcRenderer 获取成功:`, !!ipcRenderer);
          
          if (!ipcRenderer) {
            throw new Error('ipcRenderer not available');
          }
          
          // 监听删除结果
          const handleResult = (event, result) => {
            console.log(`[ElectronFileAPI] 收到删除结果:`, result);
            ipcRenderer.removeListener('delete-file-result', handleResult);
            if (result.success) {
              resolve(result);
            } else {
              reject(new Error(result.message));
            }
          };
          
          // 监听文件删除结果（通过 IPCListenerService 统一管理）
          let timeoutId;
          const handleDeleteResult = (event) => {
            const result = event.detail;
            console.log(`[ElectronFileAPI] 收到删除结果:`, result);
            
            // 由于 IPCListenerService 发送的是全局事件，我们需要通过其他方式匹配
            // 这里我们假设每个删除请求都是独立的，直接处理第一个结果
            if (result && typeof result.success === 'boolean') {
              // 清除超时
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              // 移除事件监听器
              if (typeof window !== 'undefined') {
                window.removeEventListener('file-delete-result', handleDeleteResult);
              }
              if (result.success) {
                console.log(`[ElectronFileAPI] 文件删除成功: ${filePath}`);
                resolve(result);
              } else {
                console.log(`[ElectronFileAPI] 文件删除失败: ${filePath}, ${result.message}`);
                reject(new Error(result.message));
              }
            }
          };
          
          // 监听自定义事件
          if (typeof window !== 'undefined') {
            window.addEventListener('file-delete-result', handleDeleteResult);
          }
          
          console.log(`[ElectronFileAPI] 已注册结果监听器`);
          
          // 发送删除请求
          console.log(`[ElectronFileAPI] 发送删除请求: ${filePath}`);
          ipcRenderer.send('delete-file', filePath);
          console.log(`[ElectronFileAPI] 删除请求已发送`);
          
          // 设置超时
          timeoutId = setTimeout(() => {
            console.log(`[ElectronFileAPI] 删除超时`);
            if (typeof window !== 'undefined') {
              window.removeEventListener('file-delete-result', handleDeleteResult);
            }
            reject(new Error('文件删除超时'));
          }, 10000); // 10秒超时
          
        } catch (error) {
          console.error(`[ElectronFileAPI] 错误:`, error);
          reject(error);
        }
      } else {
        console.error(`[ElectronFileAPI] Electron环境不可用 - Platform.OS: ${Platform.OS}, window.require: ${!!window.require}`);
        reject(new Error('Electron环境不可用'));
      }
    });
  }
};

// 13. CSS Fixed 定位支持
export const createFixedStyle = (style) => {
  if (Platform.OS === 'web') {
    // Web环境：使用CSS fixed定位
    return {
      ...style,
      position: 'fixed',
    };
  } else {
    // 移动端：使用React Native的absolute定位
    return {
      ...style,
      position: 'absolute',
    };
  }
};

// 14. 权限管理适配器
export const PermissionAdapter = {
  async initialize() {
    if (Platform.OS === 'android') {
      // 移动端权限初始化
      await this.requestPermissions();
    }
    // PC端无需权限处理
  },

  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        console.log('🔐 Starting permission check and request...');
        
        const apiLevel = Platform.Version;
        console.log(`📱 Detected Android API level: ${apiLevel}`);
        
        console.log('📋 Current permission status check');
        
        const hasReadStorage = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        console.log(`   📁 READ_EXTERNAL_STORAGE: ${hasReadStorage ? '✅ Granted' : '❌ Not granted'}`);
        
        const hasWriteStorage = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        console.log(`   📝 WRITE_EXTERNAL_STORAGE: ${hasWriteStorage ? '✅ Granted' : '❌ Not granted'}`);
        
        if (apiLevel >= 33) {
          const hasMediaImages = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          console.log(`   🖼️ READ_MEDIA_IMAGES: ${hasMediaImages ? '✅ Granted' : '❌ Not granted'}`);
        }
        
        const hasCamera = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        console.log(`   📷 CAMERA: ${hasCamera ? '✅ Granted' : '❌ Not granted'}`);
        
        console.log('📋 Permission status check completed\n');
        
        if (apiLevel >= 33) {
          console.log('✅ Android 13+ detected, using READ_MEDIA_IMAGES permission');
          
          const hasMediaPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          
          console.log(`📋 READ_MEDIA_IMAGES permission status: ${hasMediaPermission ? 'Granted' : 'Not granted'}`);
          
          if (hasMediaPermission) {
            console.log('✅ Media permission already exists, no need to request');
            return;
          }
          
          console.log('🔄 Starting to request READ_MEDIA_IMAGES permission...');
          
          const mediaGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            {
              title: 'Gallery Permission',
              message: 'The app needs to access your gallery to scan and classify images. Please select "Allow" in the permission popup.',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          
          console.log(`📋 Permission request result: ${mediaGranted}`);
          
          if (mediaGranted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ Media permission granted');
            return;
          } else if (mediaGranted === PermissionsAndroid.RESULTS.DENIED) {
            console.log('❌ Media permission denied, please manually grant permission');
            throw new Error('Gallery permission denied, please manually grant gallery permission in system settings');
          } else {
            console.log('⚠️ Media permission request cancelled');
            throw new Error('Gallery permission request cancelled, please manually grant gallery permission in system settings');
          }
        } else {
          console.log('✅ Android 12 and below, using READ_EXTERNAL_STORAGE permission');
          
          const hasStoragePermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
          );
          
          console.log(`📋 READ_EXTERNAL_STORAGE permission status: ${hasStoragePermission ? 'Granted' : 'Not granted'}`);
          
          if (hasStoragePermission) {
            console.log('✅ Storage permission already exists, no need to request');
            return;
          }
          
          console.log('🔄 Starting to request READ_EXTERNAL_STORAGE permission...');
          
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            {
              title: 'Storage Permission',
              message: 'The app needs to access your gallery to scan and classify images. Please select "Allow" in the permission popup.',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          
          console.log(`📋 Permission request result: ${granted}`);
          
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ Storage permission granted');
          } else if (granted === PermissionsAndroid.RESULTS.DENIED) {
            console.log('❌ Storage permission denied, please manually grant permission');
            throw new Error('Storage permission denied, please manually grant storage permission in system settings');
          } else {
            console.log('⚠️ Storage permission request cancelled');
            throw new Error('Storage permission request cancelled, please manually grant storage permission in system settings');
          }
        }
        
        console.log('🔄 Trying to request advanced permissions...');
        
        if (!hasWriteStorage) {
          console.log('🔄 Requesting WRITE_EXTERNAL_STORAGE permission...');
          
          const writeGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            {
              title: 'Write Permission',
              message: 'The app needs write permission to delete image files. Please select "Allow" in the permission popup.',
              buttonNeutral: 'Ask Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          
          console.log(`📋 Write permission request result: ${writeGranted}`);
          
          if (writeGranted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ Write permission granted');
          } else {
            console.log('⚠️ Write permission not granted, delete functionality may be limited');
          }
        }
        
        console.log('📋 Advanced permission instructions:');
        console.log('   Some permissions need to be manually granted in system settings');
        console.log('   1. Settings -> Apps -> Image Classifier App -> Permissions');
        console.log('   2. Allow "Storage" or "Manage all files" permissions');
        console.log('   3. Or use file manager to manually delete images');
        
      } catch (error) {
        console.error('❌ Permission request failed:', error);
        console.log('📋 Please follow these steps to manually grant permissions:');
        if (Platform.Version >= 33) {
          console.log('1. Long press app icon');
          console.log('2. Select "App Info"');
          console.log('3. Tap "Permissions"');
          console.log('4. Allow "Gallery" permission');
        } else {
          console.log('1. Long press app icon');
          console.log('2. Select "App Info"');
          console.log('3. Tap "Permissions"');
          console.log('4. Allow "Storage" permission');
        }
        throw error;
      }
    }
    // PC端无需权限
  },

  async checkPermissions() {
    if (Platform.OS === 'android') {
      try {
        console.log('=== Starting permission status check ===');
        
        const storagePermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        console.log(`Storage permission status: ${storagePermission ? 'Granted' : 'Not granted'}`);
        
        let mediaPermission = false;
        if (Platform.Version >= 33) {
          try {
            mediaPermission = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
            );
            console.log(`Media permission status: ${mediaPermission ? 'Granted' : 'Not granted'}`);
          } catch (error) {
            console.log(`Check media permission failed: ${error.message}`);
          }
        }
        
        console.log(`Android API level: ${Platform.Version}`);
        
        if (!storagePermission && !mediaPermission) {
          console.log('=== Permission setup instructions ===');
          console.log('Please follow these steps to manually grant permissions:');
          console.log('');
          console.log('Step 1 - Look in current permission page:');
          console.log('1. Scroll down to see if there are "Not allowed" permission categories');
          console.log('2. Tap the three dots menu (:) in the top right, check "All permissions" option');
          console.log('3. Tap "Camera" permission to see if there are "Related permissions"');
          console.log('');
          console.log('Step 2 - If not found, through Settings app:');
          console.log('1. Go back to home screen (press Home button)');
          console.log('2. Open Settings app (gear icon)');
          console.log('3. Find "Apps" or "Apps"');
          console.log('4. Find "ImageClassifier" app');
          console.log('5. Tap "Permissions" or "Permissions"');
          console.log('6. View complete permission list');
          console.log('');
          console.log('Step 3 - Look for these permissions (may have different names):');
          console.log('- "Gallery" or "Photos"');
          console.log('- "Media" or "Media"');
          console.log('- "Files" or "Files"');
          console.log('- "Storage" or "Storage"');
          console.log('- "Images" or "Images"');
          console.log('');
          console.log('Step 4 - Grant permissions:');
          console.log('After finding related permissions, set them to "Allow" or "Allow"');
          console.log('');
          console.log('If still not found, try:');
          console.log('1. Restart emulator');
          console.log('2. Check emulator settings for permission configuration');
          console.log('3. Check if there are "Advanced permissions" options');
          console.log('');
          console.log('After granting permissions, please restart the app!');
        } else if (storagePermission || mediaPermission) {
          console.log('✅ Permissions granted, can scan gallery normally');
        }
        
        console.log('=== Permission check completed ===');
      } catch (error) {
        console.error('Permission check failed:', error);
      }
    }
    return true; // PC端默认有权限
  }
};

// 15. React Hooks 导出
export { useEffect, useState, useCallback, useMemo, useRef } from 'react';
