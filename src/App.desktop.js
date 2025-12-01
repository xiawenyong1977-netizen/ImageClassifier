import React from 'react';
import { View, Text, StyleSheet, StatusBar } from 'react-native';

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
// UnifiedDataService 使用动态导入避免热更新时的循环依赖问题
// import UnifiedDataService from './services/UnifiedDataService';
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
        
        // 初始化配置服务
        await configService.initialize();
        
        // 初始化数据服务（使用动态导入避免热更新时的循环依赖问题）
        const UnifiedDataServiceModule = await import('./services/UnifiedDataService');
        const UnifiedDataService = UnifiedDataServiceModule.default;
        await UnifiedDataService.initialize();
        
        // 初始化 IPC 监听器
        IPCListenerService.initialize();
        
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
    </View>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  mainContent: {
    flex: 1,
    // 主内容区域可以正常滚动
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