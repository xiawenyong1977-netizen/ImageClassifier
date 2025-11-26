// 安全导入：PC端使用 react-native-web，可能没有 NativeModules
let NativeModules, Platform, ScanServiceModule;

try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // PC/Web环境：使用 react-native-web
    Platform = { OS: 'web' };
    NativeModules = {};
    ScanServiceModule = null;
  } else {
    // 移动端环境：使用 react-native
    const RN = require('react-native');
    NativeModules = RN.NativeModules || {};
    Platform = RN.Platform;
    ScanServiceModule = NativeModules.ScanServiceModule || null;
  }
} catch (error) {
  // 如果导入失败，设置为默认值
  Platform = { OS: 'web' };
  NativeModules = {};
  ScanServiceModule = null;
}

/**
 * 扫描服务适配器
 * 用于在Android平台启动前台服务，支持后台扫描
 */
export const ScanService = {
  /**
   * 检查扫描服务是否正在运行
   * @returns {Promise<boolean>} 服务是否运行
   */
  isRunning: () => {
    if (Platform.OS === 'android' && ScanServiceModule) {
      try {
        return ScanServiceModule.isScanServiceRunning();
      } catch (error) {
        console.warn('检查服务状态失败:', error);
        return Promise.resolve(false);
      }
    }
    return Promise.resolve(false);
  },
  
  /**
   * 强制停止扫描服务（如果正在运行）
   * 用于在启动新扫描前清理旧的服务状态
   */
  forceStop: () => {
    if (Platform.OS === 'android' && ScanServiceModule) {
      try {
        ScanServiceModule.forceStopScanService();
      } catch (error) {
        console.warn('强制停止服务失败:', error);
      }
    }
  },
  
  /**
   * 启动扫描前台服务
   */
  start: () => {
    if (Platform.OS === 'android' && ScanServiceModule) {
      try {
        ScanServiceModule.startScanService();
      } catch (error) {
        console.warn('启动扫描服务失败:', error);
      }
    }
  },
  
  /**
   * 更新扫描进度
   * @param {string} message - 进度消息
   * @param {number} processed - 已处理数量
   * @param {number} total - 总数量
   */
  updateProgress: (message, processed, total) => {
    if (Platform.OS === 'android' && ScanServiceModule) {
      try {
        ScanServiceModule.updateScanProgress(
          message || '扫描中...',
          processed || 0,
          total || 0
        );
      } catch (error) {
        console.warn('更新扫描进度失败:', error);
      }
    }
  },
  
  /**
   * 停止扫描前台服务
   */
  stop: () => {
    if (Platform.OS === 'android' && ScanServiceModule) {
      try {
        ScanServiceModule.stopScanService();
      } catch (error) {
        console.warn('停止扫描服务失败:', error);
      }
    }
  }
};

