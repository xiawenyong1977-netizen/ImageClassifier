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
import configService from '../../services/ConfigService';
import RecentImagesGrid from '../../components/shared/RecentImagesGrid';

const HomeScreen = () => {
  console.log('🚀 HomeScreen 组件开始渲染');
  
  // 页面状态管理
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [screenProps, setScreenProps] = useState({});
  const [loadedScreens, setLoadedScreens] = useState({});
  
  // 数据状态
  const [recentImages, setRecentImages] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [cityCounts, setCityCounts] = useState({});
  const [categoryRecentImages, setCategoryRecentImages] = useState({});
  const [cityRecentImages, setCityRecentImages] = useState({});
  const [similarityGroups, setSimilarityGroups] = useState([]);
  const [hideEmptyCategories, setHideEmptyCategories] = useState(false);
  const [globalMessage, setGlobalMessage] = useState('图片分类应用已就绪');
  const [lastScanTime, setLastScanTime] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryDataChanged, setCategoryDataChanged] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  
  // 使用 ref 存储设置值，避免异步状态更新问题
  const hideEmptyCategoriesRef = useRef(hideEmptyCategories);
  
  // 数据加载函数
  const loadData = useCallback(async () => {
    try {
      console.log('🔄 HomeScreen 开始加载数据...');
      setIsLoading(true);
      
      // 并行加载所有数据
      const [recentImagesData, categoryCountsData, cityCountsData, similarityGroupsData, settings] = await Promise.all([
        UnifiedDataService.readRecentImages(20),
        UnifiedDataService.readCategoryCounts(),
        UnifiedDataService.readCityCounts(),
        UnifiedDataService.getSimilarityGroupsStats(),
        UnifiedDataService.readSettings()
      ]);
      
      // 加载各分类的最近图片
      const categoryIds = UnifiedDataService.getAllCategoryIds();
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
      
      // 更新状态
      console.log('📊 准备更新状态 - 分类统计:', categoryCountsData);
      console.log('📊 准备更新状态 - 最近图片数量:', recentImagesData.length);
      console.log('📊 准备更新状态 - 相似照片组数量:', similarityGroupsData.length);
      
      setRecentImages(recentImagesData);
      setCategoryCounts(categoryCountsData);
      setCityCounts(cityCountsData);
      setSimilarityGroups(similarityGroupsData);
      setCategoryRecentImages(categoryImagesMap);
      setCityRecentImages(cityImagesMap);
      setHideEmptyCategories(settings.hideEmptyCategories === true);
      hideEmptyCategoriesRef.current = settings.hideEmptyCategories === true;
      
      console.log('✅ HomeScreen 数据加载完成');
      
      // 使用 setTimeout 确保状态更新后再设置 isLoading
      setTimeout(() => {
        setIsLoading(false);
      }, 0);
      
    } catch (error) {
      console.error('❌ HomeScreen 数据加载失败:', error);
      setIsLoading(false);
    }
  }, []);
  
  // 监听 hideEmptyCategories 变化，同步更新 ref
  useEffect(() => {
    hideEmptyCategoriesRef.current = hideEmptyCategories;
    console.log('🔄 更新 hideEmptyCategoriesRef.current:', hideEmptyCategories);
  }, [hideEmptyCategories]);
  
  // 初始化数据加载
  useEffect(() => {
    loadData();
  }, [loadData]);
  
  // 页面重新挂载时重新加载数据（通过页面切换实现）
  // 不再监听缓存变化，每次挂载都重新建立快照

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
      // 重新加载数据
      loadData();
    }
  }, [loadData]);

  // 监听自定义事件（由 IPCListenerService 发送）
  useEffect(() => {
    const handleNavigateToSettings = (event) => {
      console.log('📨 收到导航到设置页面事件:', event.detail);
      setCurrentScreen('Settings');
      setScreenProps({});
    };

    const handleScanProgressEvent = (event) => {
      console.log('📨 收到扫描进度事件:', event.detail);
      handleScanProgress(event.detail);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('navigate-to-settings', handleNavigateToSettings);
      window.addEventListener('scanProgress', handleScanProgressEvent);
      
      return () => {
        window.removeEventListener('navigate-to-settings', handleNavigateToSettings);
        window.removeEventListener('scanProgress', handleScanProgressEvent);
      };
    }
  }, [handleScanProgress]);

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
    setScreenProps(prev => ({
      ...prev,
      category, 
      city: null,
      similarityGroupId: null,
      fromScreen: 'Category'
    }));
  };

  // 处理城市点击
  const handleCityPress = (city) => {
    console.log('🏙️ 点击城市:', city);
    setCurrentScreen('Category');
    setScreenProps(prev => ({
      ...prev,
      category: null, 
      city,
      similarityGroupId: null,
      fromScreen: 'City'
    }));
  };

  // 处理图片点击 - 直接通过URL参数传递图片ID和上下文信息
  const handleImagePress = (image, fromScreen = 'Home', additionalProps = {}) => {
    console.log('🖼️ 点击图片，接收到的参数:', image, '来源页面:', fromScreen, '额外属性:', additionalProps);
    
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
    
    // 设置screenProps，包含上下文信息
    setScreenProps(prev => ({
      ...prev,
      category: additionalProps.category || null,
      city: additionalProps.city || null,
      similarityGroupId: additionalProps.similarityGroupId || null,
      fromScreen: fromScreen
    }));
    
    // 直接设置URL参数，不依赖screenProps
    const urlParams = new URLSearchParams();
    urlParams.set('imageId', imageId);
    urlParams.set('fromScreen', fromScreen);
    
    // 保存上下文信息到URL参数
    if (additionalProps.category) {
      urlParams.set('category', additionalProps.category);
    }
    if (additionalProps.city) {
      urlParams.set('city', additionalProps.city);
    }
    if (additionalProps.similarityGroupId) {
      urlParams.set('similarityGroupId', additionalProps.similarityGroupId);
    }
    
    // 更新浏览器URL
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `?${urlParams.toString()}`);
    }
    
    setCurrentScreen('ImagePreview');
    console.log('🖼️ 设置URL参数，imageId:', imageId, '上下文:', additionalProps);
  };

  // 处理刷新
  const onRefresh = useCallback(async () => {
    console.log('🔄 HomeScreen 开始刷新数据');
    setRefreshing(true);
    try {
      await loadData();
    } catch (error) {
      console.error('❌ 刷新数据失败:', error);
    } finally {
    setRefreshing(false);
    }
  }, [loadData]);

  // 更新全局提示信息
  const updateGlobalMessage = useCallback((message) => {
    setGlobalMessage(message);
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

  // 渲染相似照片卡片组件
  const SimilarityCard = ({ group }) => {
    return (
      <TouchableOpacity
        style={styles.categoryCard}
        onPress={() => {
          // 导航到相似照片详情页面
          console.log('点击相似照片组:', group.groupId);
          setCurrentScreen('Category');
          setScreenProps(prev => ({
            ...prev,
            category: null, 
            city: null, 
            similarityGroupId: group.groupId,
            fromScreen: 'SimilarityGroup'
          }));
        }}
      >
        {/* 缩略图占满整个卡片 */}
        {group.latestImageUri ? (
          <Image
            source={{ uri: group.latestImageUri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: '#9C27B0' }]}>
            <Text style={styles.emptyThumbnailText}>🔗</Text>
          </View>
        )}
        
        {/* 覆盖层显示相似照片信息 */}
        <View style={styles.categoryOverlay}>
          <Text style={styles.categoryName}>相似照片</Text>
          <Text style={styles.categoryCount}>{group.imageCount}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  // 渲染首页内容的函数
  const renderHomeContent = () => {
    console.log('🏠 renderHomeContent 被调用');
    console.log('🏠 hideEmptyCategoriesRef.current:', hideEmptyCategoriesRef.current);
    console.log('🏠 当前分类统计状态:', categoryCounts);
    console.log('🏠 当前最近图片数量:', recentImages.length);
    
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
                  // 重新加载数据以应用新设置
                  await loadData();
                  console.log('✅ 隐藏空分类设置已更新:', settings.hideEmptyCategories);
                } catch (error) {
                  console.error('❌ 切换隐藏空分类设置失败:', error);
                }
              }}
            >
              <Text style={styles.toggleButtonText}>
                {hideEmptyCategories ? '显示空分类' : '隐藏空分类'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.categoriesContainer}>
            {(() => {
              if (!configService || !configService.isConfigLoaded()) {
                return <Text>配置服务未初始化</Text>;
              }
              const categories = configService.getAllCategoriesWithUI().map(category => ({
                id: category.id,
                name: category.chinese || category.english || category.id,
                icon: '📷', // 默认图标
                color: '#607D8B' // 默认颜色
              }));
              
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

        {/* 相似照片板块 - 只有当有相似照片组时才显示 */}
        {similarityGroups && similarityGroups.length > 0 && (
          <View style={styles.categoriesSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>相似照片</Text>
            </View>
            <View style={styles.categoriesContainer}>
              {similarityGroups.slice(0, 10).map((group) => (
                <SimilarityCard
                  key={group.groupId}
                  group={group}
                />
              ))}
            </View>
          </View>
        )}

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
                // 调试日志
                onDataChange={() => {
                  console.log('🔍 CategoryScreen screenProps:', screenProps);
                  setCategoryDataChanged(true);
                }}
                onBack={() => {
                  setCurrentScreen('Home');
                  console.log('🏠 从分类页面返回，重新加载数据');
                  loadData();
                }}
                navigation={{
                  onImagePress: (image, fromScreen, contextProps) => {
                    console.log('🔍 CategoryScreen onImagePress 参数:', { image, fromScreen, contextProps, screenProps });
                    // 直接使用CategoryScreen传递的参数，不要使用screenProps
                    handleImagePress(image, fromScreen, contextProps);
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
                onDataChange={() => {
                  console.log('🔍 ImagePreviewScreen screenProps:', screenProps);
                  setCategoryDataChanged(true);
                }}
                onBack={() => {
                  console.log('🔙 ImagePreview 返回按钮被点击');
                  
                  // 从URL参数获取来源页面和图片ID
                  const urlParams = new URLSearchParams(window.location.search);
                  const fromScreen = urlParams.get('fromScreen') || 'Home';
                  const imageId = urlParams.get('imageId');
                  const category = urlParams.get('category');
                  const city = urlParams.get('city');
                  const similarityGroupId = urlParams.get('similarityGroupId');
                  
                  console.log('🔙 从URL参数获取的上下文:', { fromScreen, imageId, category, city, similarityGroupId });
                  
                  if (fromScreen === 'Category' || fromScreen === 'SimilarityGroup' || fromScreen === 'City') {
                    console.log('🔙 从分类/相似组/城市页面返回，图片ID:', imageId);
                    setCurrentScreen('Category');
                    
                    // 恢复上下文信息到screenProps
                    setScreenProps(prev => ({
                      ...prev,
                      category: category || null,
                      city: city || null,
                      similarityGroupId: similarityGroupId || null,
                      fromScreen: fromScreen,
                      scrollToImageId: imageId || null
                    }));
                  } else {
                    console.log('🔙 从首页返回');
                    setCurrentScreen('Home');
                    console.log('🏠 从图片预览返回，重新加载数据');
                    loadData();
                  }
                }}
                // 传递上下文参数
                category={screenProps.category}
                city={screenProps.city}
                similarityGroupId={screenProps.similarityGroupId}
                fromScreen={screenProps.fromScreen || 'Home'}
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
                  goBack: () => {
                    setCurrentScreen('Home');
                    console.log('🏠 从设置页面返回，重新加载数据');
                    loadData();
                  }
                }}
                onScanProgress={handleScanProgress}
                startSmartScan={startSmartScan}
              />
            ) : <View style={styles.loadingContainer}><Text>Loading Settings...</Text></View>}
          </View>
        )}
      </SafeAreaView>
    );
  }, [loadedScreens, currentScreen, screenProps, globalMessage, handleScanProgress, startSmartScan, hideEmptyCategories, categoryCounts, recentImages, categoryRecentImages, cityCounts, cityRecentImages, similarityGroups]);

  // 显示加载状态
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>正在加载数据...</Text>
        </View>
      </View>
    );
  }

  console.log('🏠 HomeScreen 状态初始化完成:', { 
    currentScreen, 
    recentImages: recentImages?.length || 0, 
    categoryCounts: Object.keys(categoryCounts).length,
    hideEmptyCategories,
    hideEmptyCategoriesRef: hideEmptyCategoriesRef.current
  });

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
    width: 140, // 固定宽度，比最近照片稍大
    height: 140, // 固定高度，正方形
    borderRadius: 8,
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
    padding: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
  },
  categoryCount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  emptyThumbnailText: {
    fontSize: 32,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 140,
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
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 20,
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