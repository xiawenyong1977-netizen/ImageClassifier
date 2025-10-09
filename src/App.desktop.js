import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity } from 'react-native';

// Platform detection for web and mobile
let Platform;
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Web environment
    Platform = { OS: 'web' };
  } else {
    // Mobile environment
    Platform = eval('require("react-native").Platform');
  }
} catch (error) {
  // If detection fails, default to web environment
  Platform = { OS: 'web' };
}

// Direct React hooks import to avoid version conflicts
const { useEffect, useState } = React;

// Import desktop screens
import HomeScreen from './screens/desktop/HomeScreen.desktop';
import UnifiedDataService from './services/UnifiedDataService';
import IPCListenerService from './services/IPCListenerService';
import configService from './services/ConfigService';
import { logger } from './adapters/WebAdapters';

export default function App() {
  logger.debug('App.desktop.js 开始渲染');
  
  const [isServiceReady, setIsServiceReady] = useState(false);

  // 初始化服务
  useEffect(() => {
    const initApp = async () => {
      try {
        logger.debug('App.desktop.js 开始初始化服务...');
        
        // 首先初始化 ConfigService
        await configService.initialize();
        logger.debug('ConfigService 初始化完成');
        
        // 初始化 UnifiedDataService
        await UnifiedDataService.initialize();
        logger.debug('UnifiedDataService 初始化完成');
        
        // 初始化 IPC 监听器
        IPCListenerService.initialize();
        logger.debug('IPCListenerService 初始化完成');
        
        setIsServiceReady(true);
      } catch (error) {
        logger.error('服务初始化失败:', error);
        logger.error('错误堆栈:', error.stack);
        // 如果是热更新相关错误，强制继续
        if (error.message && error.message.includes('hot-update')) {
          logger.debug('检测到热更新错误，强制继续...');
          setIsServiceReady(true);
        } else {
          throw error;
        }
      }
    };
    
    initApp();
    
    // 清理函数
    return () => {
      IPCListenerService.cleanup();
    };
  }, []);

  // IPC 监听器现在由 IPCListenerService 统一管理

  if (!isServiceReady) {
    return (
      <View style={styles.appContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        {/* 加载状态 */}
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在初始化...</Text>
        </View>
        
        {/* 设置按钮 - 固定在视口右下角，不受滚动影响 */}
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={() => {
            logger.debug('设置按钮被点击');
            if (window.require) {
              window.require('electron').ipcRenderer.send('titlebar-settings-click');
            }
          }}
        >
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <View style={styles.appContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* 主内容区域 */}
      <View style={styles.mainContent}>
        <HomeScreen />
      </View>
      
      {/* 设置按钮 - 固定在视口右上角，不受滚动影响 */}
      <TouchableOpacity 
        style={styles.settingsButton}
        onPress={() => {
          logger.debug('设置按钮被点击');
          if (window.require) {
            window.require('electron').ipcRenderer.send('titlebar-settings-click');
          }
        }}
      >
        <Text style={styles.settingsButtonText}>⚙️</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#F5FCFF',
    position: 'relative', // 为绝对定位的子元素提供参考
  },
  mainContent: {
    flex: 1,
    // 主内容区域可以正常滚动
  },
  settingsButton: {
    position: 'fixed', // 使用fixed定位，相对于视口固定
    bottom: 24, // 距离底部24px（稍微靠上一点）
    right: 24,  // 距离右边24px
    width: 48,  // 保持原来的大小
    height: 48, // 保持原来的大小
    backgroundColor: '#2196F3', // 蓝色背景，更醒目
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, // 稍微深一点的阴影
    shadowRadius: 4,
    elevation: 5,
    zIndex: 9999, // 更高的层级
    cursor: 'pointer',
  },
  settingsButtonText: {
    fontSize: 20, // 保持原来的图标大小
    color: '#fff', // 白色图标，在蓝色背景上更清晰
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 20,
  },
});