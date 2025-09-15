import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
  SafeAreaView,
  Dimensions,
  Image,
} from 'react-native';
import UnifiedDataService from '../../services/UnifiedDataService';
import GalleryScannerService from '../../services/GalleryScannerService';
import RecentImagesGrid from '../../components/shared/RecentImagesGrid';

const HomeScreen = ({ appData, onRefreshCache }) => {
  console.log('🚀 HomeScreen 组件开始渲染');
  
  // 检查 appData 是否有效
  if (!appData) {
    console.log('⚠️ HomeScreen: appData 为空，显示加载状态');
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在加载数据...</Text>
        </View>
      </View>
    );
  }
  
  // 页面状态管理
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [screenProps, setScreenProps] = useState({});
  const [loadedScreens, setLoadedScreens] = useState({});
  
  // 数据状态
  const [globalMessage, setGlobalMessage] = useState('图片分类应用已就绪');
  const [lastScanTime, setLastScanTime] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryDataChanged, setCategoryDataChanged] = useState(true);
  
  // 从 appData 中解构数据
  const {
    recentImages = [],
    categoryCounts = {},
    cityCounts = {},
    categoryRecentImages = {},
    cityRecentImages = {},
    hideEmptyCategories: appHideEmptyCategories = false
  } = appData;
  
  // 使用 ref 存储设置值，避免异步状态更新问题
  const hideEmptyCategoriesRef = useRef(appHideEmptyCategories);
  
  // 监听 appHideEmptyCategories 变化，同步更新 ref
  useEffect(() => {
    hideEmptyCategoriesRef.current = appHideEmptyCategories;
    console.log('🔄 更新 hideEmptyCategoriesRef.current:', appHideEmptyCategories);
  }, [appHideEmptyCategories]);
  
  console.log('🏠 HomeScreen 状态初始化完成:', { 
    currentScreen, 
    recentImages: recentImages?.length || 0, 
    categoryCounts: Object.keys(categoryCounts).length,
    appHideEmptyCategories,
    hideEmptyCategoriesRef: hideEmptyCategoriesRef.current,
    appDataKeys: Object.keys(appData || {})
  });
  console.log('🔧 HomeScreen 接收到的 appData.hideEmptyCategories:', appHideEmptyCategories, '类型:', typeof appHideEmptyCategories);

  // 动态加载页面组件
  const loadScreenComponent = useCallback(async (screenName) => {
    setLoadedScreens(prev => {
      if (prev[screenName]) {
        return prev;
      }
      return prev;
    });

    try {
      let ScreenComponent;
      switch (screenName) {
        case 'Category':
          ScreenComponent = (await import('./CategoryScreen.desktop')).default;
          break;
        case 'ImagePreview':
          ScreenComponent = (await import('./ImagePreviewScreen.desktop')).default;
          break;
        case 'Settings':
          ScreenComponent = (await import('./SettingsScreen.desktop')).default;
          break;
        default:
          return null;
      }

      setLoadedScreens(prev => ({
        ...prev,
        [screenName]: ScreenComponent
      }));

      return ScreenComponent;
    } catch (error) {
      console.error(`❌ 加载页面失败 ${screenName}:`, error);
      return null;
    }
  }, []);

  // 监听缓存变化，重新加载数据
  useEffect(() => {
    // 添加初始化延迟，避免在App初始化期间触发刷新
    const initTimer = setTimeout(() => {
      const unsubscribe = UnifiedDataService.addCacheListener((cache) => {
        console.log('🔄 HomeScreen 收到缓存变化通知');
        // 刷新页面以重新加载数据
        window.location.reload();
      });
      
      // 将unsubscribe函数存储到window对象，以便后续清理
      window.homeScreenCacheUnsubscribe = unsubscribe;
    }, 1000); // 延迟1秒，确保App初始化完成
    
    
    return () => {
      clearTimeout(initTimer);
      if (window.homeScreenCacheUnsubscribe) {
        window.homeScreenCacheUnsubscribe();
        delete window.homeScreenCacheUnsubscribe;
      }
    };
  }, []);

  // 监听设置更新
  useEffect(() => {
    const handleSettingsUpdate = (event) => {
      console.log('🔄 HomeScreen 收到设置更新通知:', event.detail);
      if (event.detail.key === 'hideEmptyCategories') {
        // App.desktop.js 会重新加载数据，这里不需要额外处理
        console.log('🔄 设置已更新，App.desktop.js 将重新加载数据');
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('settingsUpdated', handleSettingsUpdate);
      return () => {
        window.removeEventListener('settingsUpdated', handleSettingsUpdate);
      };
    }
  }, []);

  // 监听 Electron IPC 消息
  useEffect(() => {
    const handleIpcMessage = (event, data) => {
      console.log('📨 收到 IPC 消息 - event:', event, 'data:', data);
      
      // 在 Electron 中，第一个参数是事件对象，第二个参数是数据
      // 事件名称通过 ipcRenderer.on 的第一个参数指定
      console.log('⚙️ 通过 IPC 导航到设置页面, 数据:', data);
      setCurrentScreen('Settings');
      setScreenProps({});
    };

    // 检查是否在 Electron 环境中
    if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.on('navigate-to-settings', handleIpcMessage);
        
        console.log('✅ IPC 监听器已设置');
        
        return () => {
          ipcRenderer.removeListener('navigate-to-settings', handleIpcMessage);
          console.log('🧹 IPC 监听器已清理');
        };
      } catch (error) {
        console.log('⚠️ 不在 Electron 环境中，跳过 IPC 设置');
      }
    } else {
      console.log('⚠️ 不在 Electron 环境中，跳过 IPC 设置');
    }
  }, []);

  // 页面切换时加载对应组件
  useEffect(() => {
    if (currentScreen !== 'Home') {
      loadScreenComponent(currentScreen);
    }
  }, [currentScreen, loadScreenComponent]);

  // 处理分类点击
  const handleCategoryPress = (category) => {
    console.log('📂 点击分类:', category);
    setCurrentScreen('Category');
    setScreenProps({ category, city: null });
  };

  // 处理城市点击
  const handleCityPress = (city) => {
    console.log('🏙️ 点击城市:', city);
    setCurrentScreen('Category');
    setScreenProps({ category: null, city });
  };

  // 处理图片点击 - 直接通过URL参数传递图片ID
  const handleImagePress = (image, fromScreen = 'Home', additionalProps = {}) => {
    console.log('🖼️ 点击图片，接收到的参数:', image, '来源页面:', fromScreen);
    
    // 处理不同的参数格式
    let imageId;
    if (typeof image === 'string') {
      imageId = image;
    } else if (image && image.id) {
      imageId = image.id;
    } else {
      console.error('❌ 无效的图片参数:', image);
      return;
    }
    
    console.log('🖼️ 提取的图片ID:', imageId);
    // 进入 ImagePreview 时重置强制刷新标志
    setCategoryDataChanged(false);
    
    // 直接设置URL参数，不依赖screenProps
    const urlParams = new URLSearchParams();
    urlParams.set('imageId', imageId);
    urlParams.set('fromScreen', fromScreen);
    
    // 更新浏览器URL
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `?${urlParams.toString()}`);
    }
    
    setCurrentScreen('ImagePreview');
    console.log('🖼️ 设置URL参数，imageId:', imageId);
  };

  // 处理刷新
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // 刷新页面以重新加载数据
    window.location.reload();
  }, []);

  // 更新全局提示信息
  const updateGlobalMessage = useCallback((message) => {
    setGlobalMessage(message);
  }, []);

  // 处理扫描进度更新 - 添加防抖
  const handleScanProgress = useCallback((progress) => {
    console.log('🔄 HomeScreen 收到扫描进度更新:', progress);
    
    // 防抖：只在消息真正变化时更新
    setGlobalMessage(prevMessage => {
      const newMessage = progress.message || '处理中...';
      if (prevMessage !== newMessage) {
        return newMessage;
      }
      return prevMessage;
    });
    
    // 扫描完成时刷新数据
    if (progress.stage === 'completed') {
      console.log('✅ 扫描完成，刷新数据');
      // 重新加载扫描时间和统计信息
      loadLastScanTime();
      setTimeout(() => {
        // 刷新页面以重新加载数据
        window.location.reload();
      }, 500);
    }
  }, []);

  // 启动智能扫描
  const startSmartScan = useCallback(async () => {
    try {
      console.log('🚀 HomeScreen 启动智能扫描');
      
      // 显示开始扫描消息
      setGlobalMessage('初始化扫描: 准备扫描环境');
      
      // 调用GalleryScannerService的扫描接口
      const galleryScannerService = new GalleryScannerService();
      await galleryScannerService.scanGalleryWithProgress((progress) => {
        console.log('扫描进度:', progress);
        // 更新进度
        handleScanProgress(progress);
      });
      
      console.log('✅ 智能扫描完成');
    } catch (error) {
      console.error('❌ 智能扫描失败:', error);
      setGlobalMessage('扫描失败: ' + error.message);
      throw error;
    }
  }, [handleScanProgress]);

  // 加载最近扫描时间
  const loadLastScanTime = async () => {
    try {
      const settings = await UnifiedDataService.readSettings();
      if (settings && settings.lastScanTime) {
        setLastScanTime(settings.lastScanTime);
        const formattedTime = new Date(settings.lastScanTime).toLocaleString('zh-CN');
        
        // 从缓存获取统计信息，避免触发缓存更新
        const cache = UnifiedDataService.imageCache.getCache();
        const images = cache.allImages || [];
        const totalImages = images.length;
        let totalSize = 0;
        for (const image of images) {
          if (image.size && typeof image.size === 'number') {
            totalSize += image.size;
          }
        }
        
        const formattedSize = formatFileSize(totalSize);
        setGlobalMessage(`最近扫描完成时间: ${formattedTime} | 照片数量: ${totalImages} | 空间大小: ${formattedSize}`);
      } else {
        setGlobalMessage('图片分类应用已就绪');
      }
    } catch (error) {
      console.error('❌ 加载最近扫描时间失败:', error);
      setGlobalMessage('图片分类应用已就绪');
    }
  };


  // 格式化文件大小
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 组件挂载时加载最近扫描时间和统计信息
  useEffect(() => {
    loadLastScanTime();
  }, []);


  // 渲染分类卡片组件
  const CategoryCard = ({ category, count, recentImages }) => {
    return (
      <TouchableOpacity
        style={styles.categoryCard}
        onPress={() => handleCategoryPress(category.id)}
      >
        {/* 缩略图占满整个卡片 */}
        {recentImages.length > 0 ? (
          <Image
            source={{ uri: recentImages[0].uri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: category.color }]}>
            <Text style={styles.emptyThumbnailText}>📷</Text>
          </View>
        )}
        
        {/* 覆盖层显示分类信息 */}
        <View style={styles.categoryOverlay}>
          <Text style={styles.categoryName}>{category.name}</Text>
          <Text style={styles.categoryCount}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // 渲染城市卡片组件
  const CityCard = ({ city, count, recentImages }) => {
    return (
      <TouchableOpacity
        style={styles.categoryCard}
        onPress={() => handleCityPress(city)}
      >
        {/* 缩略图占满整个卡片 */}
        {recentImages.length > 0 ? (
          <Image
            source={{ uri: recentImages[0].uri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: '#FF5722' }]}>
            <Text style={styles.emptyThumbnailText}>🏙️</Text>
          </View>
        )}
        
        {/* 覆盖层显示城市信息 */}
        <View style={styles.categoryOverlay}>
          <Text style={styles.categoryName}>{city}</Text>
          <Text style={styles.categoryCount}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // 渲染首页内容的函数
  const renderHomeContent = () => {
    console.log('🏠 renderHomeContent 被调用');
    console.log('🏠 hideEmptyCategoriesRef.current:', hideEmptyCategoriesRef.current);
    
    return (
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 分类卡片 */}
        <View style={styles.categoriesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>按内容</Text>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={async () => {
                try {
                  console.log('🔄 切换隐藏空分类设置');
                  // 读取当前设置
                  const settings = await UnifiedDataService.readSettings();
                  // 切换设置
                  settings.hideEmptyCategories = !settings.hideEmptyCategories;
                  // 保存设置
                  await UnifiedDataService.writeSettings(settings);
                  // 更新本地引用
                  hideEmptyCategoriesRef.current = settings.hideEmptyCategories;
                  console.log('✅ 隐藏空分类设置已更新:', settings.hideEmptyCategories);
                  // 刷新页面以重新加载数据
                  window.location.reload();
                } catch (error) {
                  console.error('❌ 切换隐藏空分类设置失败:', error);
                }
              }}
            >
              <Text style={styles.toggleButtonText}>
                {appHideEmptyCategories ? '显示空分类' : '隐藏空分类'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoriesContainer}>
            {(() => {
              const categories = [
                { id: 'wechat', name: '微信截图', icon: '💬', color: '#4CAF50' },
                { id: 'meeting', name: '会议场景', icon: '🏢', color: '#FF5722' },
                { id: 'document', name: '工作照片', icon: '📄', color: '#9C27B0' },
                { id: 'people', name: '社交活动', icon: '👥', color: '#E91E63' },
                { id: 'life', name: '生活记录', icon: '📷', color: '#2196F3' },
                { id: 'game', name: '游戏截图', icon: '🎮', color: '#FF9800' },
                { id: 'food', name: '美食记录', icon: '🍽️', color: '#FFC107' },
                { id: 'travel', name: '旅行风景', icon: '✈️', color: '#00BCD4' },
                { id: 'pet', name: '宠物照片', icon: '🐕', color: '#8BC34A' },
                { id: 'other', name: '其他图片', icon: '📦', color: '#607D8B' }
              ];
              
              const visibleCategories = categories.filter(category => {
                const count = categoryCounts[category.id] || 0;
                // 如果开启了隐藏空分类且该分类数量为0，则不显示
                if (hideEmptyCategoriesRef.current && count === 0) {
                  return false;
                }
                return true;
              });
              
              // 如果没有可见的分类，显示空数据提示
              if (visibleCategories.length === 0) {
                return (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateIcon}>📷</Text>
                    <Text style={styles.emptyStateText}>暂无分类图片</Text>
                    <Text style={styles.emptyStateSubtext}>请先扫描图片或调整显示设置</Text>
                  </View>
                );
              }
              
              // 渲染可见的分类
              return visibleCategories.map(category => {
                const count = categoryCounts[category.id] || 0;
                const recentImages = categoryRecentImages[category.id] || [];
                
                return (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    count={count}
                    recentImages={recentImages}
                  />
                );
              });
            })()}
          </View>
        </View>

        {/* 城市分类卡片 */}
        <View style={styles.categoriesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>按城市</Text>
          </View>
          <View style={styles.categoriesContainer}>
            {cityCounts && Object.keys(cityCounts).length > 0 ? (
              Object.entries(cityCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([city, count]) => {
                  const recentImages = cityRecentImages[city] || [];
                  return (
                    <CityCard
                      key={city}
                      city={city}
                      count={count}
                      recentImages={recentImages}
                    />
                  );
                })
            ) : (
              <Text style={styles.emptyMessage}>暂无城市数据</Text>
            )}
          </View>
        </View>

        {/* 最近照片 */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>最近</Text>
          <RecentImagesGrid 
            images={recentImages} 
            onImagePress={handleImagePress}
          />
        </View>
      </ScrollView>
    );
  };

  // 渲染所有页面的函数
  const renderAllScreens = useMemo(() => {
    console.log('🖥️ renderAllScreens 开始执行');
    
    const CategoryScreen = loadedScreens.Category;
    const ImagePreviewScreen = loadedScreens.ImagePreview;
    const SettingsScreen = loadedScreens.Settings;
    
    return (
      <SafeAreaView style={styles.container}>

        {/* 根据当前屏幕渲染对应页面 */}
        {currentScreen === 'Home' && (
          <View style={styles.screenContainer}>
            {/* 消息提示区 - 只在HomeScreen中显示 */}
            <View style={styles.scanProgressBanner}>
              <Text style={styles.scanProgressMessage}>
                {globalMessage}
              </Text>
            </View>
            {renderHomeContent()}
          </View>
        )}
        
        {currentScreen === 'Category' && (
          CategoryScreen ? (
            <CategoryScreen 
              {...screenProps} 
              forceRefresh={categoryDataChanged}
              onBack={() => setCurrentScreen('Home')}
              navigation={{
                onImagePress: (image) => {
                  handleImagePress(image, 'Category', screenProps);
                }
              }}
            />
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>正在加载分类页面...</Text>
            </View>
          )
        )}
        
        {currentScreen === 'ImagePreview' && (
          <View style={styles.screenContainer}>
            {ImagePreviewScreen ? (
              <ImagePreviewScreen 
                onDataChange={() => setCategoryDataChanged(true)}
                onBack={() => {
                  console.log('🔙 ImagePreview 返回按钮被点击');
                  
                  // 从URL参数获取来源页面和图片ID
                  const urlParams = new URLSearchParams(window.location.search);
                  const fromScreen = urlParams.get('fromScreen') || 'Home';
                  const imageId = urlParams.get('imageId');
                  
                  if (fromScreen === 'Category') {
                    console.log('🔙 从分类页面返回，图片ID:', imageId);
                    setCurrentScreen('Category');
                    // 如果有图片ID，设置滚动到该图片
                    if (imageId) {
                      setScreenProps(prev => ({
                        ...prev,
                        scrollToImageId: imageId
                      }));
                    }
                  } else {
                    console.log('🔙 从首页返回');
                    setCurrentScreen('Home');
                  }
                }}
              />
            ) : <View style={styles.loadingContainer}><Text>Loading Preview...</Text></View>}
          </View>
        )}
        
        {currentScreen === 'Settings' && (
          <View style={styles.screenContainer}>
            {SettingsScreen ? (
              <SettingsScreen
                {...screenProps}
                navigation={{
                  goBack: () => setCurrentScreen('Home')
                }}
                onScanProgress={handleScanProgress}
                startSmartScan={startSmartScan}
              />
            ) : <View style={styles.loadingContainer}><Text>Loading Settings...</Text></View>}
          </View>
        )}
      </SafeAreaView>
    );
  }, [loadedScreens, currentScreen, screenProps, globalMessage, handleScanProgress, startSmartScan, appHideEmptyCategories]);

  // 主要的返回语句
  return renderAllScreens;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  screenContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  // 扫描进度提示区样式
  scanProgressBanner: {
    backgroundColor: 'transparent',
    padding: 8,
    margin: 8,
    borderRadius: 4,
  },
  scanningBanner: {
    backgroundColor: 'transparent',
  },
  scanProgressMessage: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontWeight: 'normal',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    marginVertical: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 3,
  },
  stageProgress: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  scanStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  statText: {
    fontSize: 12,
    color: '#666',
    marginHorizontal: 8,
    marginVertical: 2,
  },
  // 分类区域样式
  categoriesSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  toggleButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  toggleButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 12,
  },
  categoryCard: {
    width: 'calc(20% - 9.6px)', // 5列布局，考虑gap
    minWidth: 200,
    maxWidth: 280,
    height: 200,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  categoryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
  },
  categoryCount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  emptyThumbnailText: {
    fontSize: 48,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 200,
  },
  emptyMessage: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
    padding: 20,
  },
  // 最近照片区域样式
  recentSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  // 加载容器样式
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  // 空数据提示样式
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 16,
    opacity: 0.6,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default HomeScreen;