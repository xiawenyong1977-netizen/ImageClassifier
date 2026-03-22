// 共享适配层 - 根据平台提供不同的API实现
// 在web环境中，Platform来自react-native-web，在移动端来自react-native
import React from 'react';

// 统一日志系统
class Logger {
  constructor() {
    // 更宽松的调试模式判断
    this.isDevelopment = process.env.NODE_ENV === 'development' || 
                        (typeof window !== 'undefined' && window.location?.hostname === 'localhost') ||
                        (typeof window !== 'undefined' && window.location?.hostname === '127.0.0.1') ||
                        (typeof window !== 'undefined' && window.location?.protocol === 'file:') ||
                        (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production');
    this.isDebug = this.isDevelopment;
  }

  // 设置调试模式
  setDebugMode(enabled) {
    this.isDebug = enabled;
  }


  // 通用日志方法
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

  // 便捷方法
  error(message, ...args) {
    // 🔥 错误日志在 Release 版本也要输出，便于调试
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [ERROR]`;
    console.error(prefix, message, ...args);
    // 如果调试模式开启，也调用 log 方法（虽然会重复，但保持一致性）
    if (this.isDebug) {
      this.log('error', message, ...args);
    }
  }

  warn(message, ...args) {
    // 🔥 警告日志在 Release 版本也要输出，便于调试
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [WARN]`;
    console.warn(prefix, message, ...args);
    // 如果调试模式开启，也调用 log 方法（虽然会重复，但保持一致性）
    if (this.isDebug) {
      this.log('warn', message, ...args);
    }
  }

  info(message, ...args) {
    this.log('info', message, ...args);
  }

  debug(message, ...args) {
    this.log('debug', message, ...args);
  }

  // 性能监控
  time(label) {
    if (this.isDebug) {
      console.time(label);
    }
  }

  timeEnd(label) {
    if (this.isDebug) {
      console.timeEnd(label);
    }
  }

  // 分组日志
  group(label) {
    if (this.isDebug) {
      console.group(label);
    }
  }

  groupEnd() {
    if (this.isDebug) {
      console.groupEnd();
    }
  }
}

// 创建单例实例
const logger = new Logger();

// URI分隔符：用于拼装contentUri和relativePath
// 使用双竖线 || 作为分隔符，确保在content URI中绝对不会出现
const URI_SEPARATOR = '||';

const isPermissionDenied = (error) => {
  const message = typeof error === 'string' ? error : error?.message;
  const code = typeof error === 'object' ? error?.code : undefined;
  
  const permissionCodes = ['EACCES', 'EPERM', 'PERMISSION_DENIED', 'SECURITY_EXCEPTION'];
  if (code && permissionCodes.includes(String(code).toUpperCase())) {
    return true;
  }
  
  if (!message || typeof message !== 'string') {
    return false;
  }
  
  const lowerMessage = message.toLowerCase();
  return [
    '权限',
    'permission',
    'eacces',
    'eperm',
    'securityexception',
    'operation not permitted',
    'selinux',
    'requires android.permission',
  ].some(keyword => lowerMessage.includes(keyword));
};

// 统一的Platform对象 - 在文件顶部定义，供内部函数使用
// Web环境的Platform对象（移动端会使用WebAdapters.native.js中的实现）
export const Platform = { 
  OS: 'web',
  Version: undefined,
  select: (obj) => obj.web || obj.default
};

/** Web/Electron 无 RN 原生模块；与 WebAdapters.native.js 对齐导出，供共用代码 import（如 PersonIndexingService） */
export const NativeModules = {};

// AppState（Web环境模拟，移动端会使用WebAdapters.native.js中的实现）
export const AppState = {
  currentState: 'active',
  addEventListener: (event, handler) => {
    // Web环境：监听窗口焦点变化
    if (event === 'change') {
      const handleFocus = () => handler('active');
      const handleBlur = () => handler('background');
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);
      return {
        remove: () => {
          window.removeEventListener('focus', handleFocus);
          window.removeEventListener('blur', handleBlur);
        }
      };
    }
    return { remove: () => {} };
  }
};

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
  
  // 移除file://前缀（支持 file:// 和 file:/// 两种格式）
  if (normalizedPath.startsWith('file:///')) {
    normalizedPath = normalizedPath.replace('file:///', '');
  } else if (normalizedPath.startsWith('file://')) {
    normalizedPath = normalizedPath.replace('file://', '');
  }
  
  // Windows路径处理: /D:/path -> D:/path
  // 使用循环确保移除所有前导斜杠
  while (normalizedPath.startsWith('/') && normalizedPath.length > 2 && normalizedPath[2] === ':') {
    normalizedPath = normalizedPath.substring(1);
  }

  // 解码可能存在的URL编码路径（如中文、空格、冒号等）
  // 需要分段解码，因为路径可能部分编码、部分未编码
  try {
    // 对于 Windows 路径，需要分别处理盘符和路径部分
    if (normalizedPath.match(/^[A-Za-z]:/)) {
      const driveMatch = normalizedPath.match(/^([A-Za-z]:)(.*)$/);
      if (driveMatch) {
        const drive = driveMatch[1]; // 盘符，例如 "C:"
        const pathPart = driveMatch[2]; // 路径部分
        
        // 对路径部分分段解码
        const decodedPathPart = pathPart.split('/').map(segment => {
          if (!segment) return segment; // 保留空字符串（用于处理连续斜杠）
          try {
            // 尝试解码每个路径段
            return decodeURIComponent(segment);
          } catch (e) {
            // 如果解码失败（可能已经是未编码的），保留原始值
            return segment;
          }
        }).join('/');
        
        normalizedPath = drive + decodedPathPart;
      }
    } else {
      // 非 Windows 路径：尝试解码整个路径
      normalizedPath = decodeURIComponent(normalizedPath);
    }
  } catch (e) {
    // 如果解码失败，保留原始字符串
    // 这通常意味着路径已经是未编码的格式
  }

  // URI 标准化：统一使用正斜杠（即使是 Windows 路径）
  // Node.js 的 fs 模块和 RNFS 都支持正斜杠路径，即使在 Windows 上
  // 这样保存到数据库的 URI 格式是标准的（使用正斜杠）
  normalizedPath = normalizedPath.replace(/\\/g, '/');
  
  return normalizedPath;
};

// 将文件路径转换为 file:// URI，正确处理路径中的特殊字符（包括冒号、中文等）
// Windows路径中的冒号（除了盘符）需要被编码为 %3A
// 中文和其他特殊字符需要被正确编码
export const pathToFileUri = (filePath) => {
  if (!filePath) return filePath;
  
  // 如果已经是 file:// URI，需要确保它被正确编码
  if (filePath.startsWith('file://')) {
    // 调用 ensureEncodedFileUri 确保编码正确
    return ensureEncodedFileUri(filePath);
  }
  
  // 规范化路径：将反斜杠转换为正斜杠
  let normalizedPath = filePath.replace(/\\/g, '/');
  
  // Windows路径处理：保留盘符后的冒号，但编码路径中其他位置的冒号
  // 例如：C:/test:image/中文/photo.jpg -> file:///C:/test%3Aimage/%E4%B8%AD%E6%96%87/photo.jpg
  if (Platform.OS === 'web' && normalizedPath.match(/^[A-Za-z]:/)) {
    // Windows路径：分离盘符和路径部分
    const driveMatch = normalizedPath.match(/^([A-Za-z]:)(.*)$/);
    if (driveMatch) {
      const drive = driveMatch[1]; // 例如 "C:"
      let pathPart = driveMatch[2]; // 例如 "/test:image/中文/photo.jpg"
      
      // 确保路径部分以 / 开头（如果没有）
      if (!pathPart.startsWith('/')) {
        pathPart = '/' + pathPart;
      }
      
      // 对路径部分进行编码，分段处理每个路径段
      // 这样可以正确处理中文、冒号、空格等特殊字符
      const encodedPath = pathPart.split('/').map((segment, index) => {
        // 第一个空字符串（由于 split 产生的）保留为空字符串
        if (!segment) {
          return segment;
        }
        
        // 对每个路径段进行编码，处理冒号、中文等特殊字符
        // encodeURIComponent 会正确编码：冒号(:) -> %3A，中文 -> %E4%B8%AD%E6%96%87 等
        return encodeURIComponent(segment);
      }).join('/');
      
      // PC端使用 file:/// 格式（三个斜杠）
      return `file:///${drive}${encodedPath}`;
    }
  }
  
  // 非Windows路径或无法识别的格式：分段编码路径
  // 使用 split 和 map 确保每个路径段都被正确编码
  const encodedPath = normalizedPath.split('/').map(segment => {
    if (!segment) {
      return segment; // 保留空字符串
    }
    return encodeURIComponent(segment);
  }).join('/');
  
  // PC端使用 file:/// 格式，移动端使用 file:// 格式
  return Platform.OS === 'web' ? `file:///${encodedPath}` : `file://${encodedPath}`;
};

const ensureEncodedFileUri = (uri) => {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  if (!uri.startsWith('file://')) {
    return pathToFileUri(uri);
  }

  try {
    const tripleSlash = uri.startsWith('file:///');
    const prefix = tripleSlash ? 'file:///' : 'file://';
    let pathPart = uri.slice(prefix.length);

    // 移除前导斜杠（如果有）
    if (pathPart.startsWith('/')) {
      pathPart = pathPart.replace(/^\/+/, '');
    }

    // 对于 Windows 路径，需要特殊处理盘符
    if (pathPart.match(/^[A-Za-z]:/)) {
      const driveMatch = pathPart.match(/^([A-Za-z]:)(.*)$/);
      if (driveMatch) {
        const drive = driveMatch[1]; // 盘符，例如 "C:"
        let pathSegments = driveMatch[2]; // 路径部分
        
        // 确保路径部分以 / 开头（如果没有）
        if (!pathSegments.startsWith('/')) {
          pathSegments = '/' + pathSegments;
        }
        
        // 分段解码和重新编码，确保所有特殊字符（包括中文、冒号）都被正确编码
        const encodedPath = pathSegments.split('/').map((segment) => {
          if (!segment) {
            return segment; // 保留空字符串
          }
          
          // 先解码（如果已经编码），然后重新编码
          // 这样可以确保所有路径段都被正确编码
          let decodedSegment = segment;
          try {
            decodedSegment = decodeURIComponent(segment);
          } catch (decodeError) {
            // 如果解码失败（可能已经是未编码的），使用原始值
            decodedSegment = segment;
          }
          
          // 重新编码，确保冒号、中文等特殊字符都被正确编码
          return encodeURIComponent(decodedSegment);
        }).join('/');
        
        return `file:///${drive}${encodedPath}`;
      }
    }
    
    // 非 Windows 路径：分段解码和重新编码
    const segments = pathPart.split('/').map((segment) => {
      if (!segment) {
        return segment; // 保留空字符串
      }
      
      // 先解码（如果已经编码），然后重新编码
      let decodedSegment = segment;
      try {
        decodedSegment = decodeURIComponent(segment);
      } catch (decodeError) {
        // 如果解码失败（可能已经是未编码的），使用原始值
        decodedSegment = segment;
      }
      
      // 重新编码，确保所有特殊字符都被正确编码
      return encodeURIComponent(decodedSegment);
    });
    
    return `${prefix}${segments.join('/')}`;
  } catch (error) {
    logger.warn(`⚠️ ensureEncodedFileUri failed: ${error.message}`);
    return uri;
  }
};

/**
 * 统一处理路径参数，将字符串或对象转换为统一的URI字符串
 * @param {string|object} input - 可以是URI字符串或图片对象
 * @returns {string|null} URI字符串（从对象的uri字段提取，或直接返回字符串）
 */
const normalizePathParams = (input) => {
  if (!input) {
    return null;
  }

  // 字符串输入：直接返回（URI字符串，如 "content://..." 或 "file://..."）
  if (typeof input === 'string') {
    return input.trim();
  }

  // 对象输入：提取uri字段（图片对象，如 { uri: '...', fileName: '...', ... }）
  if (typeof input === 'object') {
    return input.uri ?? null;
  }

  return null;
};

/**
 * 解析拼装的URI（contentUri||relativePath 格式）
 * @param {string} uri - 可能是拼装的URI或普通URI
 * @returns {Object} { contentUri, relativePath, isCombined }
 */
const parseCombinedUri = (uri) => {
  if (!uri || typeof uri !== 'string') {
    return { contentUri: null, relativePath: null, isCombined: false };
  }
  
  // 检查是否包含分隔符 ||
  const separatorIndex = uri.indexOf(URI_SEPARATOR);
  if (separatorIndex === -1) {
    // 没有分隔符，说明是普通URI
    return { 
      contentUri: uri.startsWith('content://') ? uri : null,
      relativePath: null, 
      isCombined: false 
    };
  }
  
  // 有分隔符，拆分
  const contentUri = uri.substring(0, separatorIndex);
  const relativePath = uri.substring(separatorIndex + URI_SEPARATOR.length);
  
  return { 
    contentUri, 
    relativePath, 
    isCombined: true 
  };
};



/**
 * 从输入中提取本地文件路径
 * @param {string|object} input - 可以是URI字符串或图片对象
 * @returns {string|null} 本地文件路径（相对路径或绝对路径），如果是content:// URI则返回null
 */
export const getLocalPath = (input) => {
  const originalUri = normalizePathParams(input);
  
  // 如果没有originalUri，返回null
  if (!originalUri || typeof originalUri !== 'string') {
    return null;
  }
  
  // 检查是否是拼装格式（contentUri||path）
  // path可能是相对路径（Android 10+）或绝对路径（Android 9及以下）
  const { relativePath, isCombined } = parseCombinedUri(originalUri);
  
  if (isCombined && relativePath) {
    // 是拼装格式，直接返回path部分（MediaStore返回的路径已经是标准格式）
    return relativePath;
  }
  
  // 不是拼装格式，按原逻辑处理
  if (originalUri.startsWith('content://')) {
    // content:// URI 无法直接获取本地路径
    return null;
  }
  
  // 普通路径或file:// URI，标准化后返回
  return normalizeFilePath(originalUri);
};

/**
 * 从输入中提取file:// URI
 * @param {string|object} input - 可以是URI字符串或图片对象
 * @returns {string|null} file:// URI，如果是content:// URI则返回null
 */
export const getFileUri = (input) => {
  const originalUri = normalizePathParams(input);

  if (!originalUri || typeof originalUri !== 'string') {
    return null;
  }

  // 检查是否是拼装格式（fileUri||path 或 contentUri||path）
  const { contentUri, relativePath, isCombined } = parseCombinedUri(originalUri);
  
  if (isCombined) {
    // 拼装格式：检查第一部分是否是 file:// URI
    if (contentUri && contentUri.startsWith('file://')) {
      // 第一部分是 file:// URI，直接返回（确保编码正确）
      return ensureEncodedFileUri(contentUri);
    }
    
    // 如果第一部分不是 file://，但有路径部分，尝试从路径构建 file:// URI
    if (relativePath) {
      const normalizedPath = normalizeFilePath(relativePath);
      return normalizedPath ? pathToFileUri(normalizedPath) : null;
    }
    
    // 拼装格式但第一部分是 content://，无法转换为 file:// URI
    return null;
  }

  // 不是拼装格式，按原逻辑处理
  if (originalUri.startsWith('content://')) {
    return null;
  }

  if (originalUri.startsWith('file://')) {
    return ensureEncodedFileUri(originalUri);
  }

  const normalizedPath = normalizeFilePath(originalUri);
  return normalizedPath ? pathToFileUri(normalizedPath) : null;
};

/**
 * 从输入中提取content:// URI
 * @param {string|object} input - 可以是URI字符串或图片对象
 * @returns {string|null} content:// URI，如果不是content:// URI则返回null
 */
export const getContentUri = (input) => {
  const originalUri = normalizePathParams(input);
  
  if (!originalUri || typeof originalUri !== 'string') {
    return null;
  }
  
  // 检查originalUri是否是拼装格式（contentUri||relativePath）
  const { contentUri: parsedContentUri, isCombined } = parseCombinedUri(originalUri);
  
  if (isCombined && parsedContentUri) {
    // 是拼装格式，返回contentUri部分
    return parsedContentUri;
  }
  
  // 不是拼装格式，按原逻辑处理
  if (originalUri.startsWith('content://')) {
    return originalUri;
  }

  return null;
};

/**
 * 获取图片URI（自动选择content://或file://）
 * 移动端返回content:// URI，PC端返回file:// URI
 * @param {string|Object} input - originalUri字符串或包含uri字段的对象
 * @returns {string|null} content:// URI 或 file:// URI，如果无法获取则返回null
 */
export const getUri = (input) => {
  // 优先尝试获取content:// URI（移动端）
  // getContentUri内部已经处理了拼装格式的解析
  const contentUri = getContentUri(input);
  if (contentUri) {
    return contentUri;
  }
  
  // 如果没有content:// URI，尝试获取file:// URI（PC端）
  return getFileUri(input);
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
      logger.warn(`Node.js fs stat failed:`, fsError.message);
      throw new Error(`Failed to get file stats in Electron: ${fsError.message}`);
    }
  }
  
  // 在非Electron环境中使用RNFS方法
  try {
    logger.debug(`Using RNFS in non-Electron environment...`);
    const RNFS = eval('require("react-native-fs")');
    const stats = await RNFS.stat(normalizedPath);
    logger.debug(`RNFS stats read successfully, size: ${stats.size}`);
    return stats;
  } catch (rnfsError) {
    logger.warn(`RNFS stat failed:`, rnfsError.message);
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

// 图片文件读取函数 - 返回Blob格式，用于图片处理
export const readImageFileAsBlob = async (filePath) => {
  const normalizedPath = normalizeFilePath(filePath);
  
  // 检测环境：Electron vs 浏览器
  const isElectron = typeof window !== 'undefined' && window.require;
  
  if (isElectron) {
    // Electron环境：使用Node.js的fs模块
    try {
      const fs = window.require('fs');
      const path = window.require('path');
      
      const fileBuffer = fs.readFileSync(normalizedPath);
      const ext = path.extname(normalizedPath).toLowerCase();
      const mimeType = getMimeTypeFromExtension(ext);
      
      return new Blob([fileBuffer], { type: mimeType });
    } catch (error) {
      logger.error('❌ Electron环境读取本地图片文件失败:', error);
      throw error;
    }
  } else {
    // 浏览器环境：无法直接读取本地文件
    const error = new Error('浏览器环境无法直接读取本地文件，请使用Electron环境');
    logger.error('❌ 浏览器环境限制:', error.message);
    throw error;
  }
};

// 根据文件扩展名获取MIME类型
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

// 1. PermissionsAndroid 适配
export const PermissionsAndroid = {
  PERMISSIONS: {
    READ_EXTERNAL_STORAGE: 'android.permission.READ_EXTERNAL_STORAGE',
    WRITE_EXTERNAL_STORAGE: 'android.permission.WRITE_EXTERNAL_STORAGE',
    READ_MEDIA_IMAGES: 'android.permission.READ_MEDIA_IMAGES',
    ACCESS_MEDIA_LOCATION: 'android.permission.ACCESS_MEDIA_LOCATION',
    POST_NOTIFICATIONS: 'android.permission.POST_NOTIFICATIONS',
    CAMERA: 'android.permission.CAMERA',
  },
  RESULTS: {
    GRANTED: 'granted',
    DENIED: 'denied',
    NEVER_ASK_AGAIN: 'never_ask_again',
  },
  request: async (permission, options) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] 模拟权限请求: ${permission}`, options);
      return 'granted';
    } else {
      // 移动端使用原生API
      const { PermissionsAndroid: RNPermissionsAndroid } = eval('require("react-native")');
      return await RNPermissionsAndroid.request(permission, options);
    }
  },
  check: async (permission) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] 模拟权限检查: ${permission}`);
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
        if (value === null) {
          return null;
        }
        // 尝试解析 JSON，如果失败则返回原始字符串（兼容旧数据）
        try {
          return JSON.parse(value);
        } catch (parseError) {
          // 如果解析失败，可能是旧数据直接存储的字符串，直接返回
          logger.debug(`[Web] AsyncStorage.getItem: 无法解析 JSON，返回原始值: ${key}`);
          return value;
        }
      } catch (error) {
        logger.error('[Web] AsyncStorage.getItem error:', error);
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
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        logger.error('[Web] AsyncStorage.setItem error:', error);
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
      try {
        localStorage.removeItem(key);
        return true;
      } catch (error) {
        logger.error('[Web] AsyncStorage.removeItem error:', error);
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
      logger.debug('[Web] AsyncStorage.clear');
      try {
        localStorage.clear();
        return true;
      } catch (error) {
        logger.error('[Web] AsyncStorage.clear error:', error);
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
      try {
        return Object.keys(localStorage);
      } catch (error) {
        logger.error('[Web] AsyncStorage.getAllKeys error:', error);
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
      logger.debug(`[Web] RNFS.read: ${filePath}`);
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
        const pathModule = eval('require("path")');
        
        // 使用已有的 normalizeFilePath() 函数（已经处理了 file:// 前缀和 Windows 路径）
        let normalizedPath = normalizeFilePath(filePath);
        
        // 使用 path.resolve 确保绝对路径格式正确
        normalizedPath = pathModule.resolve(normalizedPath);
        
        const stats = fs.statSync(normalizedPath);
        
        return {
          size: stats.size,
          isFile: () => stats.isFile(),
          isDirectory: () => stats.isDirectory(),
          mtime: stats.mtime,
          ctime: stats.ctime,
          birthtime: stats.birthtime, // Windows上这是真正的创建时间
        };
      } catch (error) {
        // 记录路径与错误码，便于排查：ENOENT=文件不存在，EACCES=权限，ENAMETOOLONG=路径过长，EINVAL=路径非法等
        const errCode = error.code || error.errno;
        logger.warn(`[Web] File stat failed: path=${filePath}, code=${errCode}, message=${error.message}`);
        // 不返回当前时间，避免 stat 失败时照片被错误归入「本周」
        return {
          size: 1024,
          isFile: () => true,
          isDirectory: () => false,
          mtime: null,
          ctime: null,
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
      try {
        // 在 Electron 环境中，尝试使用 Node.js fs 模块
        const fs = eval('require("fs")');
        const pathModule = eval('require("path")');
        
        // 使用已有的 normalizeFilePath() 函数（已经处理了 file:// 前缀和 Windows 路径）
        let normalizedDirPath = normalizeFilePath(dirPath);
        
        // 使用 path.resolve 确保绝对路径格式正确
        normalizedDirPath = pathModule.resolve(normalizedDirPath);
        
        // 使用 path.join 确保路径正确拼接（处理包含冒号的路径）
        const files = fs.readdirSync(normalizedDirPath);
        const result = [];
        
        for (const file of files) {
          // 使用 path.join 确保路径正确拼接，正确处理包含冒号的路径
          const fullPath = pathModule.join(normalizedDirPath, file);
          const stats = fs.statSync(fullPath);
          
          const item = {
            name: file,
            path: fullPath,
            isFile: () => stats.isFile(),
            isDirectory: () => stats.isDirectory(),
            size: stats.size,
            mtime: stats.mtime,
            ctime: stats.ctime,
          };
          
          // 验证关键字段（只在发现问题时记录，避免大量日志）
          if (!item.path) {
            logger.error('❌ RNFS.readDir 返回了没有路径的项目:', {
              file: file,
              fullPath: fullPath,
              dirPath: dirPath
            });
          }
          
          result.push(item);
        }
        
        return result;
      } catch (error) {
        logger.error(`[Web] Directory read failed: ${error.message}`);
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
      try {
        // 在 Electron 环境中，尝试使用 Node.js fs 模块
        const fs = eval('require("fs")');
        const pathModule = eval('require("path")');
        
        // 使用已有的 normalizeFilePath() 函数（已经处理了 file:// 前缀和 Windows 路径）
        let normalizedPath = normalizeFilePath(filePath);
        
        // 使用 path.resolve 确保绝对路径格式正确
        normalizedPath = pathModule.resolve(normalizedPath);
        
        const exists = fs.existsSync(normalizedPath);
        return exists;
      } catch (error) {
        logger.error(`[Web] File system access not available: ${error.message}`);
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
      logger.debug(`[Web] RNFS.mkdir: ${dirPath}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.mkdir(dirPath);
    }
  },
  unlink: async (filePath) => {
    if (Platform.OS === 'web') {
      // ✅ PC端：保持原有逻辑不变（已经很完善）
      logger.debug(`[Web] RNFS.unlink: ${filePath}`);
      
      if (!window.require) {
        console.error(`[Web] window.require not available, cannot delete file`);
        throw new Error('Electron environment not available');
      }
      
      try {
        // 修复Windows路径格式问题
        let normalizedPath = filePath;
        if (filePath.startsWith('/') && filePath.includes(':')) {
          normalizedPath = filePath.substring(1);
        }
        
        logger.debug(`[Web] RNFS.unlink normalized path: ${normalizedPath}`);
        
        // 在PC环境下使用Electron接口删除文件
        const result = await ElectronFileAPI.deleteFile(normalizedPath);
        logger.debug(`[Web] File deleted via Electron: ${normalizedPath}`, result);
        return true;
      } catch (error) {
        logger.error(`[Web] Failed to delete file via Electron: ${filePath}`, error);
        throw error;
      }
    } else if (Platform.OS === 'android') {
      // 🆕 Android：优先使用MediaStore API（解决Android 10+删除限制）
      const cleanPath = filePath.replace('file://', '');
      
      try {
        // 策略1: 尝试MediaStore API
        const { NativeModules } = eval('require("react-native")');
        const { MediaStoreModule } = NativeModules;
        
        if (MediaStoreModule) {
          logger.debug('📱 尝试使用MediaStore API删除');
          try {
            const result = await MediaStoreModule.deleteFile(cleanPath);
            if (result) {
              logger.debug('✅ MediaStore删除成功');
              return true;
            }
            logger.warn('⚠️ MediaStore删除失败，降级到RNFS');
          } catch (error) {
            const mediaStoreLog = isPermissionDenied(error) ? logger.info.bind(logger) : logger.warn.bind(logger);
            mediaStoreLog('⚠️ MediaStore删除失败:', error?.message || error);
            // 继续尝试RNFS
          }
        }
      } catch (error) {
        const mediaStoreLog = isPermissionDenied(error) ? logger.info.bind(logger) : logger.warn.bind(logger);
        mediaStoreLog('⚠️ MediaStore删除失败:', error?.message || error);
      }
      
      // 策略2: 降级到RNFS（Android 9及以下，或MediaStore失败时）
      try {
        const RNFS = eval('require("react-native-fs")');
        logger.debug('📁 使用RNFS删除');
        
        // 先检查文件是否存在
        const fileExists = await RNFS.exists(cleanPath);
        if (!fileExists) {
          logger.debug('ℹ️ 文件不存在，无需删除:', cleanPath);
          return true;
        }
        
        await RNFS.unlink(cleanPath);
        
        // 验证文件是否真的被删除了
        const stillExists = await RNFS.exists(cleanPath);
        if (stillExists) {
          logger.info('ℹ️ RNFS删除失败，文件仍然存在（可能缺少删除权限）:', cleanPath);
          const error = new Error('文件删除失败，文件仍然存在');
          error.code = 'PERMISSION_DENIED';
          throw error;
        }
        
        logger.debug('🗑️ RNFS删除成功:', cleanPath);
        return true;
      } catch (error) {
        const isPerm = isPermissionDenied(error);
        // 删除失败通常是权限问题，属于正常情况，统一使用 debug 级别
        logger.debug('RNFS删除失败（可能是权限问题）:', error?.message || error);
        const errObj = error instanceof Error ? error : new Error(error?.message || String(error || '删除失败'));
        if (isPerm && !errObj.code) {
          errObj.code = 'PERMISSION_DENIED';
        }
        throw errObj;
      }
    } else {
      // iOS或其他平台：直接使用RNFS
      const RNFS = eval('require("react-native-fs")');
      const cleanPath = filePath.replace('file://', '');
      return await RNFS.unlink(cleanPath);
    }
  },
  copyFile: async (from, to) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] RNFS.copyFile: ${from} -> ${to}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.copyFile(from, to);
    }
  },
  moveFile: async (from, to) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] RNFS.moveFile: ${from} -> ${to}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.moveFile(from, to);
    }
  },
  writeFile: async (filePath, content, encoding) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] RNFS.writeFile: ${filePath}`);
      return true;
    } else {
      // 移动端使用原生API
      const RNFS = Platform.OS === 'web' ? null : eval('require("react-native-fs")');
      return await RNFS.writeFile(filePath, content, encoding);
    }
  },
  readFile: async (filePath, encoding) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] RNFS.readFile: ${filePath}`);
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
  /**
   * 保存图片到相册（Android 专用）
   * @param {string} imageUrl - 图片URL或base64数据
   * @param {string} fileName - 文件名（可选）
   * @returns {Promise<{uri: string, path?: string, fileName: string}>}
   */
  saveImageToGallery: async (imageUrl, fileName) => {
    if (Platform.OS === 'web') {
      logger.debug(`[Web] RNFS.saveImageToGallery: 模拟保存图片`);
      // PC端：返回模拟结果
      return {
        uri: `content://media/external/images/media/${Date.now()}`,
        fileName: fileName || `saved_image_${Date.now()}.png`,
      };
    } else if (Platform.OS === 'android') {
      try {
        // Android：使用原生MediaStore模块
        const { NativeModules } = eval('require("react-native")');
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
    logger.debug('[Web] launchImageLibrary:', options);
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
      logger.debug(`[Web] SQLite.openDatabase: ${name}`);
      
      // 创建模拟的数据库对象
      const db = {
        transaction: (fn) => {
          logger.debug('[Web] SQLite.transaction');
          fn({
            executeSql: (sql, params, successCallback, errorCallback) => {
              logger.debug('[Web] SQLite.executeSql:', sql);
              if (successCallback) {
                setTimeout(() => successCallback({ rows: { length: 0, raw: () => [] } }), 100);
              }
            },
          });
        },
        readTransaction: (fn) => {
          logger.debug('[Web] SQLite.readTransaction');
          fn({
            executeSql: (sql, params, successCallback, errorCallback) => {
              logger.debug('[Web] SQLite.executeSql:', sql);
              if (successCallback) {
                setTimeout(() => successCallback({ rows: { length: 0, raw: () => [] } }), 100);
              }
            },
          });
        },
      };
      
      // 添加 executeSql 方法，与移动端保持一致
      db.executeSql = (sql, params = []) => {
        logger.debug('[Web] SQLite.executeSql (direct):', sql);
        
        // 在PC端，我们模拟数据库操作
        // 对于批量插入等操作，我们返回成功结果
        return new Promise((resolve, reject) => {
          try {
            // 模拟执行成功
            const mockResult = {
              rows: {
                length: 0,
                raw: () => [],
                item: (index) => null
              },
              insertId: Math.floor(Math.random() * 1000), // 模拟插入ID
              rowsAffected: params.length || 1 // 模拟影响的行数
            };
            
            logger.debug('[Web] SQLite.executeSql completed successfully');
            resolve([mockResult]);
          } catch (error) {
            logger.error('[Web] SQLite.executeSql error:', error);
            reject(error);
          }
        });
      };
      
      return db;
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

// BackHandler 适配（Web 版本不支持退出应用）
export const BackHandler = {
  exitApp: () => {
    // Web 环境无法退出应用，只能关闭窗口（如果是在 Electron 中）
    if (typeof window !== 'undefined' && window.close) {
      window.close();
    } else {
      logger.warn('Web 环境无法退出应用');
    }
  },
  addEventListener: () => {
    // Web 环境不支持返回键监听
    return { remove: () => {} };
  },
  removeEventListener: () => {},
};

// 11. Alert 适配
export const Alert = {
  alert: (title, message, buttons, options) => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
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
      try {
        // 动态导入React Native的Alert，避免循环依赖
        const RNAlert = require('react-native').Alert;
        RNAlert.alert(title, message, buttons, options);
      } catch (error) {
        // 如果导入失败，使用console.log作为后备
        console.log(`Alert: ${title} - ${message}`);
        if (buttons && buttons.length > 0) {
          buttons.forEach(button => {
            if (button.text) {
              console.log(`Button: ${button.text}`);
            }
          });
        }
      }
    }
  }
};

// 12. Electron 文件操作接口
export const ElectronFileAPI = {
  deleteFile: (filePath) => {
    return new Promise((resolve, reject) => {
      logger.debug(`[ElectronFileAPI] 开始删除文件: ${filePath}`);
      logger.debug(`[ElectronFileAPI] Platform.OS: ${Platform.OS}`);
      logger.debug(`[ElectronFileAPI] window.require 可用:`, !!window.require);
      logger.debug(`[ElectronFileAPI] window 对象:`, typeof window);
      logger.debug(`[ElectronFileAPI] process 对象:`, typeof process);
      
      if (Platform.OS === 'web' && window.require) {
        try {
          logger.debug(`[ElectronFileAPI] 尝试获取 electron 模块...`);
          const electron = window.require('electron');
          logger.debug(`[ElectronFileAPI] electron 模块:`, electron);
          
          const { ipcRenderer } = electron;
          logger.debug(`[ElectronFileAPI] ipcRenderer 获取成功:`, !!ipcRenderer);
          
          if (!ipcRenderer) {
            throw new Error('ipcRenderer not available');
          }
          
          // 监听删除结果
          const handleResult = (event, result) => {
            logger.debug(`[ElectronFileAPI] 收到删除结果:`, result);
            ipcRenderer.removeListener('delete-file-result', handleResult);
            if (result.success) {
              resolve(result);
            } else {
              reject(new Error(result.message));
            }
          };
          
          // 监听文件删除结果 - 使用ipcRenderer.on而不是window.addEventListener
          let timeoutId;
          const handleDeleteResult = (event, result) => {
            logger.debug(`[ElectronFileAPI] 收到删除结果 (ipcRenderer):`, result);
            
            // 清除超时
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            // 移除事件监听器
            ipcRenderer.removeListener('delete-file-result', handleDeleteResult);
            
            if (result && typeof result.success === 'boolean') {
              if (result.success) {
                logger.debug(`[ElectronFileAPI] 文件删除成功: ${filePath}`);
                resolve(result);
              } else {
                logger.error(`[ElectronFileAPI] 文件删除失败: ${filePath}, ${result.message}`);
                reject(new Error(result.message));
              }
            } else {
              logger.error(`[ElectronFileAPI] 删除结果格式错误:`, result);
              reject(new Error('删除结果格式错误'));
            }
          };
          
          // 监听IPC事件
          ipcRenderer.on('delete-file-result', handleDeleteResult);
          
          logger.debug(`[ElectronFileAPI] 已注册结果监听器`);
          
          // 发送删除请求
          logger.debug(`[ElectronFileAPI] 发送删除请求: ${filePath}`);
          ipcRenderer.send('delete-file', filePath);
          logger.debug(`[ElectronFileAPI] 删除请求已发送`);
          
          // 设置超时
          timeoutId = setTimeout(() => {
            logger.warn(`[ElectronFileAPI] 删除超时`);
            // 移除事件监听器
            ipcRenderer.removeListener('delete-file-result', handleDeleteResult);
            reject(new Error('文件删除超时'));
          }, 10000); // 10秒超时
          
        } catch (error) {
          logger.error(`[ElectronFileAPI] 错误:`, error);
          reject(error);
        }
      } else {
        logger.error(`[ElectronFileAPI] Electron环境不可用 - Platform.OS: ${Platform.OS}, window.require: ${!!window.require}`);
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
        logger.error('Permission request failed:', error);
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

// ---------- PC/Electron：人脸模型 CDN 缓存（onnxruntime-node 只能读本地文件）----------
const PC_FACE_MODEL_CDN_BASE = 'https://m.xintuxiangce.top/models';
const PC_FACE_MODEL_FILES = new Set(['face_embedding.onnx', 'face_detector.onnx']);
/** 与 electron-builder productName 一致，便于与 app.getPath('userData') 目录对齐 */
const PC_ELECTRON_USERDATA_APP_FOLDER = 'XinTuAlbum';
const pcFaceModelDownloadPromises = new Map();

function tryGetNodeRequire() {
  if (typeof window !== 'undefined' && typeof window.require === 'function') {
    return window.require;
  }
  if (typeof require !== 'undefined') {
    return require;
  }
  return null;
}

function resolvePcFaceModelsCacheDir() {
  const nodeReq = tryGetNodeRequire();
  if (!nodeReq) {
    return null;
  }
  try {
    const pathMod = nodeReq('path');
    const os = nodeReq('os');
    if (typeof process !== 'undefined' && process.platform === 'win32') {
      const base = process.env.APPDATA || pathMod.join(os.homedir(), 'AppData', 'Roaming');
      return pathMod.join(base, PC_ELECTRON_USERDATA_APP_FOLDER, 'models');
    }
    if (typeof process !== 'undefined' && process.platform === 'darwin') {
      return pathMod.join(os.homedir(), 'Library', 'Application Support', PC_ELECTRON_USERDATA_APP_FOLDER, 'models');
    }
    return pathMod.join(os.homedir(), '.config', PC_ELECTRON_USERDATA_APP_FOLDER, 'models');
  } catch (e) {
    return null;
  }
}

function getPcPublicModelsPath(modelFileName) {
  const nodeReq = tryGetNodeRequire();
  if (!nodeReq) {
    return null;
  }
  try {
    const pathMod = nodeReq('path');
    return pathMod.join(process.cwd(), 'public', 'models', modelFileName);
  } catch (e) {
    return null;
  }
}

function downloadUrlToFile(url, destPath) {
  const nodeReq = tryGetNodeRequire();
  if (!nodeReq) {
    return Promise.reject(new Error('Node require 不可用'));
  }
  const https = nodeReq('https');
  const http = nodeReq('http');
  const fs = nodeReq('fs');

  const doRequest = (currentUrl, redirectCount) => {
    if (redirectCount > 5) {
      return Promise.reject(new Error('下载重定向次数过多'));
    }
    return new Promise((resolve, reject) => {
      const isHttps = currentUrl.startsWith('https:');
      const lib = isHttps ? https : http;
      const tmpPath = `${destPath}.download`;
      const fileStream = fs.createWriteStream(tmpPath);

      const req = lib.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fileStream.close();
          try {
            if (fs.existsSync(tmpPath)) {
              fs.unlinkSync(tmpPath);
            }
          } catch (_) {}
          const nextUrl = new URL(res.headers.location, currentUrl).href;
          doRequest(nextUrl, redirectCount + 1).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          fileStream.close();
          try {
            if (fs.existsSync(tmpPath)) {
              fs.unlinkSync(tmpPath);
            }
          } catch (_) {}
          reject(new Error(`下载失败 HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              fs.renameSync(tmpPath, destPath);
            } catch (err) {
              reject(err);
              return;
            }
            resolve();
          });
        });
      });
      req.on('error', (err) => {
        fileStream.close();
        try {
          if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
          }
        } catch (_) {}
        reject(err);
      });
    });
  };

  return doRequest(url, 0);
}

async function ensurePcFaceModelOnDisk(modelFileName) {
  if (!PC_FACE_MODEL_FILES.has(modelFileName)) {
    return;
  }
  const env = ModelPathAdapter.detectEnvironment();
  if (env !== 'electron' && env !== 'node') {
    return;
  }

  if (pcFaceModelDownloadPromises.has(modelFileName)) {
    await pcFaceModelDownloadPromises.get(modelFileName);
    return;
  }

  const promise = (async () => {
    const nodeReq = tryGetNodeRequire();
    if (!nodeReq) {
      throw new Error('当前环境无法下载模型（缺少 Node require）');
    }
    const fs = nodeReq('fs');
    const pathMod = nodeReq('path');

    const cacheDir = resolvePcFaceModelsCacheDir();
    if (!cacheDir) {
      throw new Error('无法解析模型缓存目录');
    }
    const destPath = pathMod.join(cacheDir, modelFileName);

    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      logger.debug(`💻 人脸模型已缓存: ${destPath}`);
      return;
    }

    fs.mkdirSync(cacheDir, { recursive: true });

    const bundledPath = getPcPublicModelsPath(modelFileName);
    if (bundledPath && fs.existsSync(bundledPath) && fs.statSync(bundledPath).size > 0) {
      logger.debug(`💻 从 public/models 复制人脸模型到缓存: ${modelFileName}`);
      fs.copyFileSync(bundledPath, destPath);
      return;
    }

    const url = `${PC_FACE_MODEL_CDN_BASE}/${encodeURIComponent(modelFileName)}`;
    logger.info(`💻 从 CDN 下载人脸模型: ${modelFileName}`, url);
    await downloadUrlToFile(url, destPath);
    logger.info(`💻 人脸模型下载完成: ${destPath}`);
  })();

  pcFaceModelDownloadPromises.set(modelFileName, promise);
  try {
    await promise;
  } finally {
    pcFaceModelDownloadPromises.delete(modelFileName);
  }
}

// 16. 模型路径适配器
export const ModelPathAdapter = {
  /**
   * 获取模型基础路径
   * @returns {string} 模型基础路径
   */
  getModelBasePath() {
    // React Native环境
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      const RNPlatform = eval('require("react-native").Platform');
      
      if (RNPlatform.OS === 'android') {
        // Android: 使用 assets 目录
        logger.debug('📱 Android环境: 使用 assets 目录');
        return 'file:///android_asset/models';
      } else if (RNPlatform.OS === 'ios') {
        // iOS: 使用 bundle 目录
        const RNFS = eval('require("react-native-fs")');
        logger.debug('📱 iOS环境: 使用 bundle 目录');
        return `${RNFS.MainBundlePath}/models`;
      }
    }
    
    // Web浏览器 / Electron渲染进程环境
    if (typeof window !== 'undefined' && window.location) {
      const isElectron = typeof window.require !== 'undefined';
      const isDevelopment = window.location.hostname === 'localhost' && 
                           window.location.port === '3000';
      
      if (isElectron) {
        // Electron（开发/生产）都优先使用本地文件路径，onnxruntime-node 不能加载 HTTP URL
        logger.debug('💻 Electron环境: 使用本地 public/models 路径');
        return './public/models';
      } else if (isDevelopment) {
        // 开发环境（npm start）：使用开发服务器路径
        logger.debug('🔧 开发环境: 使用开发服务器路径');
        return 'http://localhost:3000/models';
      } else {
        // Web浏览器生产环境：使用相对路径
        logger.debug('🌐 Web浏览器环境: 使用相对路径 ./models');
        return './models';
      }
    }
    
    // 纯Node.js环境（fallback，一般不会到这里）
    logger.debug('⚙️ Node.js环境: 使用 ./public/models');
    return './public/models';
  },

  /**
   * 获取完整的模型文件路径
   * @param {string} modelFileName - 模型文件名（如 'yolov8s.onnx'）
   * @param {string} configPath - 配置文件中的路径（可选）
   * @returns {string} 完整的模型文件路径
   */
  getModelPath(modelFileName, configPath = null) {
    // 如果提供了配置路径，先处理配置路径
    if (configPath) {
      // 如果是完整路径（http/https/绝对路径），直接返回
      if (configPath.startsWith('http://') || 
          configPath.startsWith('https://') || 
          configPath.startsWith('/')) {
        return configPath;
      }
      
      // 如果配置路径以 ./ 开头，提取文件名
      if (configPath.startsWith('./')) {
        const fileName = configPath.substring(2);
        // 如果包含 models/ 前缀，移除它
        if (fileName.startsWith('models/')) {
          modelFileName = fileName.substring(7);
        } else {
          modelFileName = fileName;
        }
      } else {
        modelFileName = configPath;
      }
    }

    const env = this.detectEnvironment();
    // Electron / Node：人脸模型走 userData 缓存目录（由 ensureModelExists 从 CDN 或 public 复制）
    if ((env === 'electron' || env === 'node') && PC_FACE_MODEL_FILES.has(modelFileName)) {
      const cacheDir = resolvePcFaceModelsCacheDir();
      const nodeReq = tryGetNodeRequire();
      if (cacheDir && nodeReq) {
        const pathMod = nodeReq('path');
        return pathMod.join(cacheDir, modelFileName);
      }
    }

    const basePath = this.getModelBasePath();

    // 拼接完整路径
    return `${basePath}/${modelFileName}`;
  },

  /**
   * PC/Electron：将 CDN 人脸模型下载（或从 public/models 复制）到本地缓存，供 onnxruntime-node 加载
   * @param {string} modelRelativePath 例如 face_embedding.onnx
   */
  async ensureModelExists(modelRelativePath) {
    await ensurePcFaceModelOnDisk(modelRelativePath);
  },

  /**
   * 获取ONNX Runtime执行提供者
   * @returns {string[]} 可用的执行提供者列表
   */
  getExecutionProviders() {
    // React Native环境
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      const RNPlatform = eval('require("react-native").Platform');
      
      if (RNPlatform.OS === 'ios') {
        // iOS: 优先CoreML，fallback到CPU
        return ['coreml', 'cpu'];
      } else if (RNPlatform.OS === 'android') {
        // Android: 优先NNAPI，fallback到CPU
        return ['nnapi', 'cpu'];
      }
    }

    // Electron 渲染进程：优先使用 node 版 ORT，固定走 CPU 避免开发态/HMR 下 provider 初始化不稳定
    if (typeof window !== 'undefined' && typeof window.require === 'function') {
      return ['cpu'];
    }
    
    // Web环境（包括Electron）
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      // 浏览器和Electron：优先WebGPU -> WebGL -> WASM -> CPU
      return ['webgpu', 'webgl', 'wasm', 'cpu'];
    }
    
    // 纯Node.js环境
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      // 纯Node.js: 优先CUDA -> DirectML -> CPU
      return ['cuda', 'dml', 'cpu'];
    }
    
    // Fallback
    return ['cpu'];
  },

  /**
   * 检测当前环境类型
   * @returns {string} 环境类型: 'react-native' | 'web' | 'electron' | 'node'
   */
  detectEnvironment() {
    // React Native
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      return 'react-native';
    }
    
    // Electron (优先检测，因为Electron也有window和document)
    if (typeof window !== 'undefined' && window.require) {
      return 'electron';
    }
    
    // Node.js (在Electron中，process.versions.node也存在)
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      // 检查是否在Electron环境中
      if (typeof window !== 'undefined' && window.require) {
        return 'electron'; // Electron环境
      }
      return 'node'; // 纯Node.js环境
    }
    
    // Web浏览器
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      return 'web';
    }
    
    return 'unknown';
  },

  /**
   * 加载ONNX Runtime模块
   * @returns {Promise<any>} ONNX Runtime实例
   */
  async loadOnnxRuntime() {
    const env = this.detectEnvironment();
    
    logger.debug(`检测到环境: ${env}`);
    
    try {
      switch (env) {
        case 'react-native':
          logger.debug('加载 onnxruntime-react-native...');
          return await import('onnxruntime-react-native');
        
        case 'electron':
          logger.debug('加载 onnxruntime-node (Electron环境)...');
          // Electron 渲染进程优先使用 window.require 直接加载 Node 版本，避免被 webpack/bundler 处理后出现运行时兼容问题
          try {
            if (typeof window !== 'undefined' && window.__XINTU_ORT_NODE__) {
              return window.__XINTU_ORT_NODE__;
            }
            if (typeof window !== 'undefined' && typeof window.require === 'function') {
              const ortNode = window.require('onnxruntime-node');
              if (typeof window !== 'undefined') {
                window.__XINTU_ORT_NODE__ = ortNode;
              }
              return ortNode;
            }
            const ortNodeModule = await import('onnxruntime-node');
            if (typeof window !== 'undefined') {
              window.__XINTU_ORT_NODE__ = ortNodeModule;
            }
            return ortNodeModule;
          } catch (error) {
            logger.warn('onnxruntime-node 加载失败，回退到 onnxruntime-web:', error.message);
            // If node version fails, fall back to web version
            const electronOrtModule = await import('onnxruntime-web');
            return electronOrtModule.default || electronOrtModule;
          }
        
        case 'web':
          logger.debug('加载 onnxruntime-web...');
          const webOrtModule = await import('onnxruntime-web');
          return webOrtModule.default || webOrtModule;
        
        case 'node':
          logger.debug('加载 onnxruntime-node...');
          return await import('onnxruntime-node');
        
        default:
          throw new Error(`不支持的环境: ${env}`);
      }
    } catch (error) {
      logger.error(`加载ONNX Runtime失败 (${env}):`, error);
      throw error;
    }
  }
};

// 17. Canvas 适配器
export const CanvasAdapter = {
  /**
   * 创建Canvas元素
   * @param {number} width - 宽度
   * @param {number} height - 高度
   * @returns {Canvas} Canvas实例
   */
  async createCanvas(width, height) {
    const env = ModelPathAdapter.detectEnvironment();
    
    if (env === 'react-native') {
      // React Native环境
      logger.debug('📱 使用 react-native-canvas 创建Canvas');
      const Canvas = eval('require("react-native-canvas")').default;
      const canvas = new Canvas(width, height);
      return canvas;
    } else {
      // PC/Web环境（Electron/浏览器）
      logger.debug('💻 使用浏览器 Canvas API');
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }
  },

  /**
   * 加载图片
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Image>} Image实例
   */
  async loadImage(imageUri) {
    const env = ModelPathAdapter.detectEnvironment();
    
    if (env === 'react-native') {
      // React Native环境
      logger.debug(`📱 使用 react-native-canvas 加载图片: ${imageUri}`);
      const Canvas = eval('require("react-native-canvas")');
      const img = new Canvas.Image();
      
      return new Promise((resolve, reject) => {
        img.addEventListener('load', () => {
          logger.debug(`✅ 图片加载成功: ${img.width}x${img.height}`);
          resolve(img);
        });
        img.addEventListener('error', (error) => {
          logger.error('❌ 图片加载失败:', error);
          reject(new Error(`图片加载失败: ${imageUri}`));
        });
        img.src = imageUri;
      });
    } else {
      // PC/Web环境（Electron/浏览器）
      logger.debug(`💻 使用浏览器 Image 加载图片: ${imageUri}`);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          logger.debug(`✅ 图片加载成功: ${img.width}x${img.height}`);
          resolve(img);
        };
        img.onerror = (error) => {
          logger.error('❌ 图片加载失败:', error);
          reject(new Error(`图片加载失败: ${imageUri}`));
        };
        img.src = imageUri;
      });
    }
  }
};

// 18. Logger 导出（Platform已在文件顶部定义和导出）
export { logger };

// 19. 移动端图片处理模块占位符（PC端不使用）
export const ImageResizer = undefined;
// RNFS 已在前面导出
export const jpegJs = undefined;
export const RNImage = undefined;
