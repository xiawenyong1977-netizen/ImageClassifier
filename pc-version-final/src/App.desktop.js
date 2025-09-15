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
const { useEffect, useRef, useState, useCallback } = React;

import { NavigationContainer, createStackNavigator } from './adapters/WebAdapters';
import { Icon } from './adapters/WebAdapters';

// Import desktop screens
import HomeScreen from './screens/desktop/HomeScreen.desktop';
import UnifiedDataService from './services/UnifiedDataService';

const Stack = createStackNavigator();

export default function App() {
  console.log('🚀 App.desktop.js 开始渲染');
  
  const navigationRef = useRef(null);
  const [appData, setAppData] = useState(null); // 初始为null，表示未加载
  const [isLoading, setIsLoading] = useState(true);

  // 更新应用数据的函数
  const updateAppData = useCallback(async () => {
    try {
      console.log('🔄 App.desktop.js 开始更新应用数据...');
      
      // 加载设置
      const settings = await UnifiedDataService.readSettings();
      console.log('🔧 App.desktop.js 读取到的完整设置:', settings);
      const shouldHideEmpty = settings.hideEmptyCategories === true;
      console.log('🔧 App.desktop.js 解析 hideEmptyCategories:', shouldHideEmpty, typeof shouldHideEmpty);
      
      // 并行加载所有数据
      const [recentImagesData, categoryCountsData, cityCountsData] = await Promise.all([
        UnifiedDataService.readRecentImages(20),
        UnifiedDataService.readCategoryCounts(),
        UnifiedDataService.readCityCounts()
      ]);
      
      // 加载各分类的最近图片
      const categoryIds = ['wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'];
      const categoryImagesPromises = categoryIds.map(async (categoryId) => {
        try {
          const images = await UnifiedDataService.readRecentImagesByCategory(categoryId, 1);
          return { categoryId, images };
        } catch (error) {
          console.error(`❌ 加载分类 ${categoryId} 最近图片失败:`, error);
          return { categoryId, images: [] };
        }
      });
      
      const categoryImagesResults = await Promise.all(categoryImagesPromises);
      const categoryImagesMap = {};
      categoryImagesResults.forEach(({ categoryId, images }) => {
        categoryImagesMap[categoryId] = images;
      });
      
      // 加载各城市的最近图片
      const cityIds = Object.keys(cityCountsData).slice(0, 10);
      const cityImagesPromises = cityIds.map(async (cityName) => {
        try {
          const images = await UnifiedDataService.readRecentImagesByCity(cityName, 1);
          return { cityName, images };
        } catch (error) {
          console.error(`❌ 加载城市 ${cityName} 最近图片失败:`, error);
          return { cityName, images: [] };
        }
      });
      
      const cityImagesResults = await Promise.all(cityImagesPromises);
      const cityImagesMap = {};
      cityImagesResults.forEach(({ cityName, images }) => {
        cityImagesMap[cityName] = images;
      });
      
      // 更新应用数据
      setAppData({
        recentImages: recentImagesData,
        categoryCounts: categoryCountsData,
        cityCounts: cityCountsData,
        categoryRecentImages: categoryImagesMap,
        cityRecentImages: cityImagesMap,
        hideEmptyCategories: shouldHideEmpty
      });
      
      console.log('✅ App.desktop.js 数据更新完成');
    } catch (error) {
      console.error('❌ App.desktop.js 更新数据失败:', error);
    }
  }, []);

  // 将更新函数暴露到全局
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.updateAppData = updateAppData;
    }
  }, [updateAppData]);

  // 初始化应用数据
  useEffect(() => {
    const initApp = async () => {
      try {
        console.log('🔄 App.desktop.js 开始初始化应用...');
        
        // 初始化统一数据服务
        console.log('🔄 App.desktop.js 开始初始化统一数据服务...');
        await UnifiedDataService.initialize();
        
        // 使用 updateAppData 函数来加载数据
        await updateAppData();
        
        console.log('✅ App.desktop.js 初始化完成');
        setIsLoading(false);
        
      } catch (error) {
        console.error('❌ App.desktop.js 初始化失败:', error);
        // 即使失败也要设置一个空的数据，避免应用卡住
        setAppData({
          recentImages: [],
          categoryCounts: {},
          cityCounts: {},
          categoryRecentImages: {},
          cityRecentImages: {},
          hideEmptyCategories: false
        });
        setIsLoading(false); // 即使失败也要停止加载状态
      }
    };

    initApp();
  }, [updateAppData]);

  // 监听设置变化，重新加载数据
  useEffect(() => {
    const handleSettingsUpdate = async (event) => {
      console.log('🔄 App.desktop.js 收到设置更新通知:', event.detail);
      if (event.detail.key === 'hideEmptyCategories') {
        console.log('🔄 重新加载应用数据以应用新的隐藏空分类设置');
        // 重新加载设置和数据
        try {
          const settings = await UnifiedDataService.readSettings();
          const shouldHideEmpty = settings.hideEmptyCategories === true;
          
          // 重新加载数据
          const [recentImagesData, categoryCountsData, cityCountsData] = await Promise.all([
            UnifiedDataService.readRecentImages(20),
            UnifiedDataService.readCategoryCounts(),
            UnifiedDataService.readCityCounts()
          ]);
          
          // 重新加载各分类的最近图片
          const categoryIds = ['wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'];
          const categoryImagesPromises = categoryIds.map(async (categoryId) => {
            try {
              const images = await UnifiedDataService.readRecentImagesByCategory(categoryId, 1);
              return { categoryId, images };
            } catch (error) {
              console.error(`❌ 加载分类 ${categoryId} 最近图片失败:`, error);
              return { categoryId, images: [] };
            }
          });
          
          const categoryImagesResults = await Promise.all(categoryImagesPromises);
          const categoryImagesMap = {};
          categoryImagesResults.forEach(({ categoryId, images }) => {
            categoryImagesMap[categoryId] = images;
          });
          
          // 重新加载各城市的最近图片
          const cityIds = Object.keys(cityCountsData).slice(0, 10);
          const cityImagesPromises = cityIds.map(async (cityName) => {
            try {
              const images = await UnifiedDataService.readRecentImagesByCity(cityName, 1);
              return { cityName, images };
            } catch (error) {
              console.error(`❌ 加载城市 ${cityName} 最近图片失败:`, error);
              return { cityName, images: [] };
            }
          });
          
          const cityImagesResults = await Promise.all(cityImagesPromises);
          const cityImagesMap = {};
          cityImagesResults.forEach(({ cityName, images }) => {
            cityImagesMap[cityName] = images;
          });
          
          // 更新应用数据
          setAppData({
            recentImages: recentImagesData,
            categoryCounts: categoryCountsData,
            cityCounts: cityCountsData,
            categoryRecentImages: categoryImagesMap,
            cityRecentImages: cityImagesMap,
            hideEmptyCategories: shouldHideEmpty
          });
          
          console.log('✅ App.desktop.js 设置更新后数据重新加载完成');
        } catch (error) {
          console.error('❌ App.desktop.js 设置更新后重新加载数据失败:', error);
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('settingsUpdated', handleSettingsUpdate);
      return () => {
        window.removeEventListener('settingsUpdated', handleSettingsUpdate);
      };
    }
  }, []);

  console.log('🚀 App.desktop.js 准备渲染，isLoading:', isLoading, 'appData:', appData ? '已加载' : '未加载');
  
  // 如果正在加载或数据未准备好，显示加载状态
  if (isLoading || !appData) {
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
          <Text style={styles.loadingText}>正在加载数据...</Text>
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
      
      <HomeScreen 
        appData={appData}
        onRefreshCache={() => window.location.reload()}
      />
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