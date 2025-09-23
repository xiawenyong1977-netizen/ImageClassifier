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

export default function App() {
  console.log('🚀 App.desktop.js 开始渲染');
  
  const [isServiceReady, setIsServiceReady] = useState(false);

  // 初始化服务
  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('🚀 App.desktop.js 开始初始化服务...');
        
        // 首先初始化 ConfigService
        await configService.initialize();
        console.log('✅ ConfigService 初始化完成');
        
        // 初始化 UnifiedDataService
        await UnifiedDataService.initialize();
        console.log('✅ UnifiedDataService 初始化完成');
        
        // 初始化 IPC 监听器
        IPCListenerService.initialize();
        console.log('✅ IPCListenerService 初始化完成');
        
        setIsServiceReady(true);
      } catch (error) {
        console.error('❌ 服务初始化失败:', error);
        console.error('❌ 错误堆栈:', error.stack);
        // 如果是热更新相关错误，强制继续
        if (error.message && error.message.includes('hot-update')) {
          console.log('🔄 检测到热更新错误，强制继续...');
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
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        {/* 自定义标题栏 */}
        <View style={styles.titleBar}>
          <View style={styles.titleBarLeft}>
            <Text style={styles.titleBarTitle}>图片分类助手</Text>
          </View>
          <View style={styles.titleBarRight}>
            <TouchableOpacity 
              style={styles.titleBarButton}
              onPress={() => {
                console.log('🔧 设置按钮被点击');
                if (window.require) {
                  window.require('electron').ipcRenderer.send('titlebar-settings-click');
                }
              }}
            >
              <Text style={styles.titleBarButtonText}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.titleBarButton}
              onPress={() => {
                if (window.require) {
                  const { remote } = window.require('electron');
                  remote.getCurrentWindow().minimize();
                }
              }}
            >
              <Text style={styles.titleBarButtonText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.titleBarButton}
              onPress={() => {
                if (window.require) {
                  const { remote } = window.require('electron');
                  const win = remote.getCurrentWindow();
                  if (win.isMaximized()) {
                    win.unmaximize();
                  } else {
                    win.maximize();
                  }
                }
              }}
            >
              <Text style={styles.titleBarButtonText}>□</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.titleBarCloseButton}
              onPress={() => {
                if (window.require) {
                  const { remote } = window.require('electron');
                  remote.getCurrentWindow().close();
                }
              }}
            >
              <Text style={styles.titleBarCloseButtonText}>×</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 加载状态 */}
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在初始化...</Text>
        </View>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* 自定义标题栏 */}
      <View style={styles.titleBar}>
        <View style={styles.titleBarLeft}>
          <Text style={styles.titleBarTitle}>图片分类助手</Text>
        </View>
        <View style={styles.titleBarRight}>
          <TouchableOpacity 
            style={styles.titleBarButton}
            onPress={() => {
              console.log('🔧 设置按钮被点击');
              if (window.require) {
                window.require('electron').ipcRenderer.send('titlebar-settings-click');
              }
            }}
          >
            <Text style={styles.titleBarButtonText}>⚙️</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.titleBarButton}
            onPress={() => {
              if (window.require) {
                const { remote } = window.require('electron');
                remote.getCurrentWindow().minimize();
              }
            }}
          >
            <Text style={styles.titleBarButtonText}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.titleBarButton}
            onPress={() => {
              if (window.require) {
                const { remote } = window.require('electron');
                const win = remote.getCurrentWindow();
                if (win.isMaximized()) {
                  win.unmaximize();
                } else {
                  win.maximize();
                }
              }
            }}
          >
            <Text style={styles.titleBarButtonText}>□</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.titleBarCloseButton}
            onPress={() => {
              if (window.require) {
                const { remote } = window.require('electron');
                remote.getCurrentWindow().close();
              }
            }}
          >
            <Text style={styles.titleBarCloseButtonText}>×</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      <HomeScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
    paddingTop: 32, // 为标题栏留出空间
  },
  titleBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    WebkitAppRegion: 'drag', // 整个标题栏可拖拽
    zIndex: 1000,
  },
  titleBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    WebkitAppRegion: 'drag',
  },
  titleBarTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    WebkitAppRegion: 'drag',
  },
  titleBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    WebkitAppRegion: 'no-drag', // 按钮区域不可拖拽
  },
  titleBarButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    WebkitAppRegion: 'no-drag',
  },
  titleBarButtonText: {
    fontSize: 16,
    color: '#333',
    fontWeight: 'bold',
  },
  titleBarCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    WebkitAppRegion: 'no-drag',
  },
  titleBarCloseButtonText: {
    fontSize: 18,
    color: '#333',
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