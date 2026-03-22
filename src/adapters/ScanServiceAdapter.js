// 安全导入：PC端使用 react-native-web，可能没有 NativeModules
let NativeModules, Platform, ScanServiceModule, PersonIndexForegroundModule;

try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // PC/Web环境：使用 react-native-web
    Platform = { OS: 'web' };
    NativeModules = {};
    ScanServiceModule = null;
    PersonIndexForegroundModule = null;
  } else {
    // 移动端环境：使用 react-native
    const RN = require('react-native');
    NativeModules = RN.NativeModules || {};
    Platform = RN.Platform;
    ScanServiceModule = NativeModules.ScanServiceModule || null;
    PersonIndexForegroundModule = NativeModules.PersonIndexForeground || null;
  }
} catch (error) {
  // 如果导入失败，设置为默认值
  Platform = { OS: 'web' };
  NativeModules = {};
  ScanServiceModule = null;
  PersonIndexForegroundModule = null;
}

/**
 * 扫描服务适配器
 * 用于在Android平台启动前台服务，支持后台扫描
 */
export const ScanService = {
  /**
   * 独占任务是否占用：相册扫描前台或人物分组前台任一在跑即为 true（防止并发写库）
   * @returns {Promise<boolean>}
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
   * @param {string} message - 进度消息（已国际化的消息）
   * @param {number} processed - 已处理数量
   * @param {number} total - 总数量
   * @param {string} title - 通知标题（已国际化，可选）
   */
  updateProgress: (message, processed, total, title = null) => {
    if (Platform.OS === 'android' && ScanServiceModule) {
      try {
        // 使用传入的已国际化消息和标题，如果没有则让原生层使用资源文件的默认值
        ScanServiceModule.updateScanProgress(
          message || null, // 传递null让原生层使用默认值（已国际化）
          processed || 0,
          total || 0,
          title || null // 传递null让原生层使用资源文件的默认值（已国际化）
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

/**
 * Android 人物分组专用前台服务（通知渠道/文案与相册扫描分离）
 * isRunning 与 ScanService.isRunning 语义一致（全局独占）
 */
export const PersonIndexForeground = {
  isRunning: () => ScanService.isRunning(),

  start: () => {
    if (Platform.OS === 'android' && PersonIndexForegroundModule?.startPersonIndexForeground) {
      try {
        PersonIndexForegroundModule.startPersonIndexForeground();
      } catch (error) {
        console.warn('启动人物分组前台服务失败:', error);
      }
    }
  },

  updateProgress: (message, processed, total, title = null) => {
    if (Platform.OS === 'android' && PersonIndexForegroundModule?.updatePersonIndexProgress) {
      try {
        PersonIndexForegroundModule.updatePersonIndexProgress(
          message || null,
          processed || 0,
          total || 0,
          title || null
        );
      } catch (error) {
        console.warn('更新人物分组通知失败:', error);
      }
    }
  },

  stop: () => {
    if (Platform.OS === 'android' && PersonIndexForegroundModule?.stopPersonIndexForeground) {
      try {
        PersonIndexForegroundModule.stopPersonIndexForeground();
      } catch (error) {
        console.warn('停止人物分组前台服务失败:', error);
      }
    }
  }
};

