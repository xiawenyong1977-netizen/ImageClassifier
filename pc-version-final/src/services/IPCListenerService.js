/**
 * IPC 监听器集中管理服务
 * 负责管理所有 Electron IPC 监听器
 */

class IPCListenerService {
  constructor() {
    this.listeners = new Map();
    this.isInitialized = false;
  }

  /**
   * 初始化所有 IPC 监听器
   */
  initialize() {
    if (this.isInitialized) {
      console.log('⚠️ IPCListenerService 已经初始化');
      return;
    }

    if (typeof window === 'undefined' || !window.require) {
      console.log('⚠️ 非 Electron 环境，跳过 IPC 监听器初始化');
      return;
    }

    try {
      const { ipcRenderer } = window.require('electron');
      
      // 1. 自定义标题栏设置按钮监听器
      this.setupTitleBarListeners(ipcRenderer);
      
      // 2. 文件操作监听器
      this.setupFileOperationListeners(ipcRenderer);
      
      this.isInitialized = true;
      console.log('✅ IPCListenerService 初始化完成');
    } catch (error) {
      console.error('❌ IPCListenerService 初始化失败:', error);
    }
  }

  /**
   * 设置标题栏相关监听器
   */
  setupTitleBarListeners(ipcRenderer) {
    // 监听设置按钮点击
    const handleSettingsClick = (event, data) => {
      console.log('📨 收到标题栏设置按钮点击消息:', data);
      
      // 发送自定义事件给页面处理
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('navigate-to-settings', {
          detail: { screen: 'Settings' }
        }));
      }
    };

    ipcRenderer.on('navigate-to-settings', handleSettingsClick);
    this.listeners.set('navigate-to-settings', handleSettingsClick);
    
    console.log('✅ 标题栏监听器设置完成');
  }

  /**
   * 设置文件操作相关监听器
   */
  setupFileOperationListeners(ipcRenderer) {
    // 监听文件删除结果
    const handleDeleteFileResult = (event, result) => {
      console.log('📨 收到文件删除结果:', result);
      
      // 发送自定义事件给页面处理
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('file-delete-result', {
          detail: result
        }));
      }
    };

    ipcRenderer.on('delete-file-result', handleDeleteFileResult);
    this.listeners.set('delete-file-result', handleDeleteFileResult);
    
    console.log('✅ 文件操作监听器设置完成');
  }

  /**
   * 清理所有监听器
   */
  cleanup() {
    if (typeof window === 'undefined' || !window.require) {
      return;
    }

    try {
      const { ipcRenderer } = window.require('electron');
      
      // 移除所有监听器
      for (const [eventName, handler] of this.listeners) {
        ipcRenderer.removeListener(eventName, handler);
        console.log(`🗑️ 移除 IPC 监听器: ${eventName}`);
      }
      
      this.listeners.clear();
      this.isInitialized = false;
      console.log('✅ IPCListenerService 清理完成');
    } catch (error) {
      console.error('❌ IPCListenerService 清理失败:', error);
    }
  }

  /**
   * 获取监听器状态
   */
  getStatus() {
    return {
      isInitialized: this.isInitialized,
      listenerCount: this.listeners.size,
      listeners: Array.from(this.listeners.keys())
    };
  }
}

// 创建单例实例
const ipcListenerService = new IPCListenerService();

export default ipcListenerService;
