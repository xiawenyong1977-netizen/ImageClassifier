import React from 'react';
import { View, Text, StyleSheet, StatusBar, TouchableOpacity, Animated } from 'react-native';

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
const { useEffect, useState, useRef } = React;

// Import desktop screens
import HomeScreen from './screens/desktop/HomeScreen.desktop';
import UnifiedDataService from './services/UnifiedDataService';
import IPCListenerService from './services/IPCListenerService';
import configService from './services/ConfigService';
import GalleryScannerService from './services/GalleryScannerService';
import { logger } from './adapters/WebAdapters';

export default function App() {
  logger.debug('App.desktop.js 开始渲染');
  
  const [isServiceReady, setIsServiceReady] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const rotationValue = useRef(new Animated.Value(0)).current;

  // 初始化服务
  useEffect(() => {
    const initApp = async () => {
      try {
        logger.debug('App.desktop.js 开始初始化服务...');
        
        // 初始化配置服务
        await configService.initialize();
        
        // 初始化数据服务
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

  // 开始旋转动画
  const startRotation = () => {
    rotationValue.setValue(0);
    Animated.loop(
      Animated.timing(rotationValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false, // 在web环境下可能需要设置为false
      })
    ).start();
  };

  // 停止旋转动画
  const stopRotation = () => {
    rotationValue.stopAnimation();
    rotationValue.setValue(0);
  };

  // 监听扫描状态变化，控制动画
  useEffect(() => {
    if (isScanning) {
      logger.debug('开始旋转动画');
      startRotation();
    } else {
      logger.debug('停止旋转动画');
      stopRotation();
    }
  }, [isScanning]);

  // 智能扫描处理函数
  const handleSmartScan = async () => {
    try {
      // 先检查是否正在扫描
      if (isScanning) {
        logger.debug('扫描正在进行中，跳过新的扫描请求');
        return;
      }

      logger.debug('App.desktop.js 启动智能扫描');
      
      setIsScanning(true);
      
      // 调用GalleryScannerService的扫描接口
      const galleryScannerService = new GalleryScannerService();
      await galleryScannerService.scanGalleryWithProgress((progress) => {
        logger.debug('扫描进度:', progress);
        
        // 检查是否需要刷新页面
        if (progress.shouldRefresh) {
          logger.debug('🔄 收到刷新标记，主动刷新页面数据...');
          // 异步刷新，不阻塞扫描进度
          setImmediate(async () => {
            try {
              // 发送数据刷新事件
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('dataRefreshed'));
              }
            } catch (error) {
              logger.error('❌ 发送刷新事件失败:', error);
            }
          });
        }
        
        // 发送扫描进度事件给HomeScreen
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('scanProgress', { detail: progress }));
        }
      });
      
      logger.debug('智能扫描完成');
      setIsScanning(false);
      
    } catch (error) {
      logger.error('智能扫描失败:', error);
      setIsScanning(false);
      throw error;
    }
  };

  // IPC 监听器现在由 IPCListenerService 统一管理

  if (!isServiceReady) {
    return (
      <View style={styles.appContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        {/* 加载状态 */}
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在初始化...</Text>
        </View>
        
        {/* FAB扫描按钮 - 固定在视口右下角，不受滚动影响 */}
        <TouchableOpacity 
          style={styles.settingsButton}
          onPress={handleSmartScan}
          disabled={isScanning}
        >
          <Animated.View
            style={{
              transform: [{
                rotate: rotationValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                })
              }]
            }}
          >
            <Text style={styles.settingsButtonText}>⟳</Text>
          </Animated.View>
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
      
      {/* FAB扫描按钮 - 固定在视口右下角，不受滚动影响 */}
      <TouchableOpacity 
        style={styles.settingsButton}
        onPress={handleSmartScan}
        disabled={isScanning}
      >
        <Animated.View
          style={{
            transform: [{
              rotate: rotationValue.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              })
            }]
          }}
        >
          <Text style={styles.settingsButtonText}>⟳</Text>
        </Animated.View>
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
    position: 'fixed', // 使用 fixed 定位，相对于视口固定
    bottom: 80, // 距离底部80px（与移动端一致）
    right: 16,  // 距离右边16px（与移动端一致）
    width: 56,  // 与移动端FAB大小一致
    height: 56, // 与移动端FAB大小一致
    backgroundColor: '#007AFF', // 与移动端FAB颜色一致
    borderRadius: 28, // 圆形按钮
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6, // 与移动端elevation一致
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, // 与移动端阴影一致
    shadowRadius: 4,
    zIndex: 9999, // 更高的层级
  },
  settingsButtonText: {
    fontSize: 24, // 与移动端FAB图标大小一致
    color: '#fff', // 白色图标，在蓝色背景上更清晰
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