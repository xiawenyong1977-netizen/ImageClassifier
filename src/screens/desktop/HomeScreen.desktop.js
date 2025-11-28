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
  Animated,
} from 'react-native';
import UnifiedDataService from '../../services/UnifiedDataService';
import GalleryScannerService from '../../services/GalleryScannerService';
import WeChatAuthService from '../../services/WeChatAuthService';
import configService from '../../services/ConfigService';
import RecentImagesGrid from '../../components/shared/RecentImagesGrid';
import { logger, getUri } from '../../adapters/WebAdapters';

const HomeScreen = () => {
  
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
  // 隐藏空分类设置（默认隐藏空分类）
  const [hideEmptyCategories, setHideEmptyCategories] = useState(true);
  const [globalMessage, setGlobalMessage] = useState('图片分类应用已就绪');
  const [showScanTip, setShowScanTip] = useState(false);
  const [lastScanTime, setLastScanTime] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [categoryDataChanged, setCategoryDataChanged] = useState(true);
  const [totalImagesCount, setTotalImagesCount] = useState(0);
  const [readmeContent, setReadmeContent] = useState('');
  const [forceShowReadme, setForceShowReadme] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const rotationValue = useRef(new Animated.Value(0)).current;
  
  // 使用 ref 存储设置值，避免异步状态更新问题
  const hideEmptyCategoriesRef = useRef(hideEmptyCategories);
  
  // 数据加载函数（异步读取，但无loading状态）
  const loadData = useCallback(async () => {
    try {
      logger.debug('HomeScreen 开始加载数据...');
      
      // 并行加载所有数据
      const [recentImagesData, categoryCountsData, cityCountsData, similarityGroupsData, settings, allImages] = await Promise.all([
        UnifiedDataService.readRecentImages(20),
        UnifiedDataService.readCategoryCounts(),
        UnifiedDataService.readCityCounts(),
        UnifiedDataService.getSimilarityGroupsStats(),
        UnifiedDataService.readSettings(),
        UnifiedDataService.readAllImages()
      ]);
      
      // 加载各分类的最近图片（只在有图片时加载）
      const categoryImagesMap = {};
      if (Object.keys(categoryCountsData).length > 0) {
        const categoryIds = UnifiedDataService.getAllCategoryIds();
        const categoryImagesPromises = categoryIds.map(async (categoryId) => {
          try {
            const images = await UnifiedDataService.readRecentImagesByCategory(categoryId, 1);
            return { categoryId, images };
          } catch (error) {
            logger.error(`加载分类 ${categoryId} 最近图片失败:`, error);
            return { categoryId, images: [] };
          }
        });
        
        const categoryImagesResults = await Promise.all(categoryImagesPromises);
        categoryImagesResults.forEach(({ categoryId, images }) => {
          categoryImagesMap[categoryId] = images;
        });
      } else {
        logger.debug('没有分类数据，跳过加载分类最近图片');
      }
      
      // 加载各城市的最近图片（按数量排序取前10个）
      const sortedCities = Object.entries(cityCountsData).sort(([,a], [,b]) => b - a);
      const cityIds = sortedCities.slice(0, 10).map(([cityName]) => cityName);
      const cityImagesPromises = cityIds.map(async (cityName) => {
        try {
          const images = await UnifiedDataService.readRecentImagesByCity(cityName, 1);
          return { cityName, images };
        } catch (error) {
          logger.error(`加载城市 ${cityName} 最近图片失败:`, error);
          return { cityName, images: [] };
        }
      });
      
      const cityImagesResults = await Promise.all(cityImagesPromises);
      const cityImagesMap = {};
      cityImagesResults.forEach(({ cityName, images }) => {
        cityImagesMap[cityName] = images;
      });
      
      // 更新状态
      logger.debug('准备更新状态 - 分类统计:', categoryCountsData);
      logger.debug('准备更新状态 - 最近图片数量:', recentImagesData.length);
      logger.debug('准备更新状态 - 相似照片组数量:', similarityGroupsData.length);
      
      
      setRecentImages(recentImagesData);
      setCategoryCounts(categoryCountsData);
      setCityCounts(cityCountsData);
      setSimilarityGroups(similarityGroupsData);
      setCategoryRecentImages(categoryImagesMap);
      setCityRecentImages(cityImagesMap);
      // 如果设置未定义，默认为 true（隐藏空分类）
      // 只有当用户明确设置为 false 时才显示空分类
      const shouldHide = settings.hideEmptyCategories !== false;
      setHideEmptyCategories(shouldHide);
      hideEmptyCategoriesRef.current = shouldHide;
      
      const totalCount = Array.isArray(allImages) ? allImages.length : 0;
      setTotalImagesCount(totalCount);
      
      logger.debug('HomeScreen 数据加载完成, 图片总数:', totalCount);
      logger.debug('allImages 类型:', typeof allImages, 'isArray:', Array.isArray(allImages));
      
    } catch (error) {
      logger.error('HomeScreen 数据加载失败:', error);
    }
  }, []);

  // 使用 useMemo 稳定 recentImages 引用，避免不必要的重新渲染
  const stableRecentImages = useMemo(() => recentImages, [recentImages]);
  
  // 监听 hideEmptyCategories 变化，同步更新 ref
  useEffect(() => {
    hideEmptyCategoriesRef.current = hideEmptyCategories;
    logger.debug('更新 hideEmptyCategoriesRef.current:', hideEmptyCategories);
  }, [hideEmptyCategories]);
  
  // 加载 readme 内容
  const loadReadme = useCallback(async () => {
    try {
      // 方法1: 尝试从 public 目录通过 fetch 加载（推荐）
      try {
        logger.debug('尝试从 public 目录加载 readme');
        const response = await fetch('./readme/readme.md');
        if (response.ok) {
          let content = await response.text();
          logger.debug('从 public 目录读取 readme 成功，长度:', content.length);
          
          // 处理图片路径，将相对路径转换为 public 目录下的路径
          content = content.replace(/src="\.\/([^"]+)"/g, (match, filename) => {
            const imagePath = `./readme/${filename}`;
            return `src="${imagePath}"`;
          });
          
          setReadmeContent(content);
          return;
        }
      } catch (fetchError) {
        logger.debug('从 public 目录加载失败:', fetchError);
      }

      // 方法2: 尝试从文件系统读取（fallback）
      if (typeof window !== 'undefined' && window.require) {
        const fs = window.require('fs');
        const path = window.require('path');
        
        // 尝试不同的路径
        const possiblePaths = [
          path.join(process.cwd(), 'public', 'readme', 'readme.md'),
          path.join(process.cwd(), 'readme', 'readme.md'),
          path.join(process.cwd(), '..', 'readme', 'readme.md'), // 上一级目录
          path.join(__dirname, 'readme', 'readme.md'),
          path.join(__dirname, '..', '..', 'readme', 'readme.md'), // 上两级目录
          path.join(process.resourcesPath || '', 'readme', 'readme.md'),
          path.join(process.cwd(), '..', '..', 'readme', 'readme.md'), // 项目根目录
          'readme/readme.md',
          '../readme/readme.md',
          '../../readme/readme.md'
        ];
        
        let content = '';
        let readmePath = '';
        let readmeDir = '';
        
        for (const testPath of possiblePaths) {
          try {
            logger.debug('尝试读取 readme 文件:', testPath);
            if (fs.existsSync(testPath)) {
              content = fs.readFileSync(testPath, 'utf-8');
              readmePath = testPath;
              readmeDir = path.dirname(testPath);
              logger.debug('readme 文件读取成功，路径:', readmePath);
              break;
            }
          } catch (e) {
            logger.debug('路径不存在或读取失败:', testPath);
          }
        }
        
        if (content) {
          // 处理图片路径，将相对路径转换为绝对路径
          content = content.replace(/src="\.\/([^"]+)"/g, (match, filename) => {
            const imagePath = path.join(readmeDir, filename).replace(/\\/g, '/');
            return `src="file:///${imagePath}"`;
          });
          
          setReadmeContent(content);
          logger.debug('readme 内容设置成功，长度:', content.length);
          return;
        }
      }

      // 方法3: 使用 fallback 内容
      logger.warn('未找到 readme 文件，使用 fallback 内容');
      const fallbackContent = `您是否也曾经历过这样的时刻？

在旅途中，我们举起镜头，想要留住山河壮阔的壮丽瞬间；在聚会时，我们按下快门，渴望定格与好友欢聚的每一张笑脸；回到家中，我们随手一拍，记录下家人的温情陪伴与宠物的暖心依赖；甚至当美食上桌，我们也习惯性地"咔嚓"一声，将色香味俱全的体验封存为永恒的记忆……

科技让拍照变得轻而易举，却也带来了"幸福的烦恼"。为了捕捉最完美的瞬间，我们常常对同一场景连拍数张；工作之中，相机也成为得力助手——会议实录、资料拍摄、事实留存、沟通截图……大量的图片无声地堆积在手机相册中，其中有珍贵的文档、美好的回忆，也有重要的凭证。

日积月累，手机存储空间频频告急，而云备份又让人担忧隐私安全。如何高效整理海量照片，在释放空间的同时，守护每一份珍贵记忆，已成为我们每个人都需要面对的日常课题。

芯图相册，正是为您解决这一难题而生的智能伙伴。

我们运用最新AI技术，在您的设备本地即可对照片进行智能识别与分类。无需登录、无需网络、更无任何内嵌广告——从根源上杜绝隐私泄露风险，给您纯粹、安心的整理体验。

📁 核心功能：智能分类，便捷管理

· 第一版已支持按内容、城市、相似度三大维度进行分类
· 内容识别覆盖七大常见类别：手机截图、证件照片、单人照、社会活动（多人照）、自然风景、美食与萌宠
· 经过严格测试，分类准确率稳定在90%以上
· 如有个别分类有误，您也可手动调整，灵活又贴心

操作指引：四步完成相册焕新

以手机相册清理为例，轻松上手：

1. 连接与设置
       使用数据线连接手机与电脑，在设置页面选定需要整理的相册目录。

2. 一键智能分类
       点击"开始智能分类"，AI将自动扫描识别，首页清晰展示分类进度与图片统计。

3. 便捷拣选暂存
       分类完成后，可逐类浏览，轻松勾选需要处理的作品，一键移入暂存箱。

4. 最终清理或归档
       进入暂存箱二次确认，无误后全选删除，或复制到指定文件夹完成归档。`;
      setReadmeContent(fallbackContent);
      
    } catch (error) {
      logger.error('读取 readme 文件失败:', error);
      setReadmeContent('');
    }
  }, []);

  // 检查是否需要强制显示 readme（用于测试）
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const showReadme = urlParams.get('showReadme');
      if (showReadme === 'true') {
        setForceShowReadme(true);
        logger.debug('强制显示 readme 模式已启用');
      }
    }
  }, []);

  // 初始化数据加载
  useEffect(() => {
    const initializeData = async () => {
      await loadData();
      loadReadme();
    };
    initializeData();
  }, []);
  
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
      logger.error(`加载页面失败 ${screenName}:`, error);
      return null;
    }
  }, []);

  // 处理扫描进度更新 - 添加防抖
  const handleScanProgress = useCallback((progress) => {
    logger.debug('HomeScreen 收到扫描进度更新:', progress);
    
    // 如果开始扫描，立即切换到扫描模式
    if (progress.stage === 'started' || progress.stage === 'scanning' || progress.stage === 'processing' ||
        progress.stage === 'directory_scanning' || progress.stage === 'file_comparison' ||
        progress.stage === 'screenshot_detection' || progress.stage === 'cache_checking' ||
        progress.stage === 'remote_inference' || progress.stage === 'local_inference' ||
        progress.stage === 'processing_images' || progress.stage === 'removing_files' ||
        progress.stage === 'similarity_detection' || progress.stage === 'updating_data') {
      setForceShowReadme(false);
      setIsScanning(true);
    }
    
    // 扫描完成时切换回正常模式
    if (progress.stage === 'completed') {
      setIsScanning(false);
      logger.debug('扫描完成，切换到正常模式');
      // 只有在shouldRefresh为true时才重新加载数据
      if (progress.shouldRefresh) {
        loadData();
      }
      // 显示扫描完成时间
      loadLastScanTime();
    }
    
    // 防抖：只在消息真正变化时更新
    setGlobalMessage(prevMessage => {
      const newMessage = progress.message || '处理中...';
      if (prevMessage !== newMessage) {
        return newMessage;
      }
      return prevMessage;
    });
  }, [loadData]);

  // 监听自定义事件（由 IPCListenerService 发送）
  useEffect(() => {
    const handleNavigateToSettings = (event) => {
      logger.debug('收到导航到设置页面事件:', event.detail);
      setCurrentScreen('Settings');
      setScreenProps({});
    };

    const handleScanProgressEvent = (event) => {
      logger.debug('收到扫描进度事件:', event.detail);
      handleScanProgress(event.detail);
    };

    const handleDataCleared = () => {
      logger.debug('收到数据清空事件，立即刷新数据');
      loadData();
    };

    const handleDataRefreshed = () => {
      logger.debug('收到数据刷新事件，立即刷新数据');
      loadData();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('navigate-to-settings', handleNavigateToSettings);
      window.addEventListener('scanProgress', handleScanProgressEvent);
      window.addEventListener('dataCleared', handleDataCleared);
      window.addEventListener('dataRefreshed', handleDataRefreshed);
      
      return () => {
        window.removeEventListener('navigate-to-settings', handleNavigateToSettings);
        window.removeEventListener('scanProgress', handleScanProgressEvent);
        window.removeEventListener('dataCleared', handleDataCleared);
        window.removeEventListener('dataRefreshed', handleDataRefreshed);
      };
    }
  }, [handleScanProgress, loadData]);

  // 页面切换时加载对应组件
  useEffect(() => {
    if (currentScreen !== 'Home') {
      loadScreenComponent(currentScreen);
    }
  }, [currentScreen, loadScreenComponent]);

  // 处理分类点击
  const handleCategoryPress = (category) => {
    logger.debug('点击分类:', category);
    setCurrentScreen('Category');
    setScreenProps(prev => ({
      ...prev,
      category, 
      city: null,
      similarityGroupId: null,
      fromScreen: 'Category',
      currentImageId: null, // 清除返回时的图片ID
      currentPage: null, // 清除返回时的页码
      viewMode: null // 清除返回时的视图模式
    }));
  };

  // 处理城市点击
  const handleCityPress = (city) => {
    logger.debug('点击城市:', city);
    setCurrentScreen('Category');
    setScreenProps(prev => ({
      ...prev,
      category: null, 
      city,
      similarityGroupId: null,
      fromScreen: 'City',
      currentImageId: null, // 清除返回时的图片ID
      currentPage: null, // 清除返回时的页码
      viewMode: null // 清除返回时的视图模式
    }));
  };

  // 处理图片点击 - 直接通过URL参数传递图片ID和上下文信息
  const handleImagePress = useCallback((image, fromScreen = 'Home', additionalProps = {}) => {
    logger.debug('点击图片，接收到的参数:', image, '来源页面:', fromScreen, '额外属性:', additionalProps);
    
    // 处理不同的参数格式
    let imageId;
    if (typeof image === 'string') {
      imageId = image;
    } else if (image && image.id) {
      imageId = image.id;
    } else {
      logger.error('无效的图片参数:', image);
      return;
    }
    
    logger.debug('提取的图片ID:', imageId);
    // 进入 ImagePreview 时重置强制刷新标志
    setCategoryDataChanged(false);
    
    // 设置screenProps，包含上下文信息
    setScreenProps(prev => ({
      ...prev,
      category: additionalProps.category || null,
      city: additionalProps.city || null,
      similarityGroupId: additionalProps.similarityGroupId || null,
      fromScreen: fromScreen,
      currentImageId: null // 清除之前的currentImageId
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
    if (additionalProps.currentPage !== undefined && additionalProps.currentPage !== null) {
      urlParams.set('currentPage', additionalProps.currentPage.toString());
    }
    if (additionalProps.viewMode) {
      urlParams.set('viewMode', additionalProps.viewMode);
    }
    
    // 更新浏览器URL
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `?${urlParams.toString()}`);
    }
    
    setCurrentScreen('ImagePreview');
    logger.debug('设置URL参数，imageId:', imageId, '上下文:', additionalProps);
  }, []);


  // 处理刷新
  const onRefresh = useCallback(async () => {
    logger.debug('HomeScreen 开始刷新数据');
    
    // 如果正在扫描，不执行刷新
    if (isScanning) {
      logger.debug('正在扫描中，跳过刷新');
      return;
    }
    
    // 移除setRefreshing(true)，避免UI闪烁
    try {
      // 重新加载数据（不再重建缓存，不显示loading状态）
      await loadData();
    } catch (error) {
      logger.error('刷新数据失败:', error);
    }
    // 移除setRefreshing(false)
  }, [loadData, isScanning]);


  // 更新全局提示信息
  const updateGlobalMessage = useCallback((message) => {
    setGlobalMessage(message);
  }, []);

  // 启动智能扫描
  const startSmartScan = useCallback(async () => {
    try {
      logger.debug('HomeScreen 启动智能扫描');
      
      // 先检查是否正在扫描
      if (isScanning) {
        logger.debug('扫描正在进行中，跳过新的扫描请求');
        return;
      }
      
      // 查询会员状态
      let compareLimitOption = null;
      try {
        const { isMember } = await WeChatAuthService.getMembershipStatus();
        if (!isMember) {
          // 非会员提示与限制：在扫描按钮附近显示浮窗提示
          setShowScanTip(true);
          setTimeout(() => setShowScanTip(false), 4000);
          compareLimitOption = { compareLimit: 100 };
        }
      } catch (e) {
        // 查询失败按非会员策略处理，但不阻断扫描
        logger.debug('会员状态查询失败，按非会员处理:', e?.message || e);
        setShowScanTip(true);
        setTimeout(() => setShowScanTip(false), 4000);
        compareLimitOption = { compareLimit: 100 };
      }

      // 立即设置扫描状态，清除强制显示 readme 状态
      setForceShowReadme(false);
      setIsScanning(true);
      setGlobalMessage('初始化扫描: 准备扫描环境');
      
      logger.debug('扫描状态已设置，切换到正常显示模式');
      
      // 调用GalleryScannerService的扫描接口
      const galleryScannerService = new GalleryScannerService();
      await galleryScannerService.scanGalleryWithProgress((progress) => {
        logger.debug('扫描进度:', progress);
        // 更新进度
        handleScanProgress(progress);
        
        // 🆕 检查是否需要刷新页面
        if (progress.shouldRefresh) {
          logger.debug('🔄 收到刷新标记，主动刷新页面数据...');
          // 异步刷新，不阻塞扫描进度
          setTimeout(async () => {
            try {
              await loadData();
            } catch (error) {
              logger.error('❌ 定期刷新失败:', error);
            }
          }, 0);
        }
      }, compareLimitOption);
      
      logger.debug('智能扫描完成');
      setIsScanning(false);
    } catch (error) {
      logger.error('智能扫描失败:', error);
      setGlobalMessage('扫描失败: ' + error.message);
      setIsScanning(false); // 扫描失败时也要重置状态
      throw error;
    }
  }, [handleScanProgress, isScanning, loadData]);

  // 开始旋转动画
  const startRotation = useCallback(() => {
    rotationValue.setValue(0);
    Animated.loop(
      Animated.timing(rotationValue, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: false, // 在web环境下可能需要设置为false
      })
    ).start();
  }, [rotationValue]);

  // 停止旋转动画
  const stopRotation = useCallback(() => {
    rotationValue.stopAnimation();
    rotationValue.setValue(0);
  }, [rotationValue]);

  // 监听扫描状态变化，控制动画
  useEffect(() => {
    if (isScanning) {
      logger.debug('开始旋转动画');
      startRotation();
    } else {
      logger.debug('停止旋转动画');
      stopRotation();
    }
  }, [isScanning, startRotation, stopRotation]);

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
        
        // 添加耗时信息显示
        let durationText = '';
        if (settings.lastScanDurationSeconds) {
          if (settings.lastScanDurationMinutes >= 1) {
            durationText = ` | 耗时: ${settings.lastScanDurationMinutes}分钟`;
          } else {
            durationText = ` | 耗时: ${settings.lastScanDurationSeconds}秒`;
          }
        }
        
        setGlobalMessage(`最近扫描完成时间: ${formattedTime} | 照片数量: ${totalImages} | 空间大小: ${formattedSize}${durationText}`);
      } else {
        setGlobalMessage('图片分类应用已就绪');
      }
    } catch (error) {
      logger.error('加载最近扫描时间失败:', error);
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

  // 渲染 Readme 内容的组件
  const ReadmeView = () => {
    logger.debug('ReadmeView 被渲染，readmeContent 长度:', readmeContent.length);
    
    // 如果 readme 内容为空，显示提示信息
    if (!readmeContent || readmeContent.length === 0) {
      return (
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View style={styles.readmeContainer}>
            <Text style={styles.readmeH1}>欢迎使用芯图相册</Text>
            <Text style={styles.readmeParagraph}>智能分类，便捷管理，仅你可见</Text>
            <TouchableOpacity
              style={styles.getStartedButton}
              onPress={() => {
                setCurrentScreen('Settings');
                setScreenProps({});
              }}
            >
              <Text style={styles.getStartedButtonText}>进入设置 →</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      );
    }
    
    return (
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.readmeContainer}>
          <View style={styles.readmeContent}>
            {/* 解析并渲染 markdown 内容 */}
            {readmeContent.split('\n').map((line, index) => {
              // 标题
              if (line.startsWith('# ')) {
                return <Text key={index} style={styles.readmeH1}>{line.substring(2)}</Text>;
              } else if (line.startsWith('## ')) {
                return <Text key={index} style={styles.readmeH2}>{line.substring(3)}</Text>;
              } else if (line.startsWith('### ')) {
                return <Text key={index} style={styles.readmeH3}>{line.substring(4)}</Text>;
              }
              // 列表项
              else if (line.startsWith('· ')) {
                return <Text key={index} style={styles.readmeListItem}>• {line.substring(2)}</Text>;
              }
              // 数字列表
              else if (/^\d+\.\s/.test(line)) {
                return <Text key={index} style={styles.readmeNumberedItem}>{line}</Text>;
              }
              // HTML 图片标签 - 解析并渲染为 React Native 组件
              else if (line.includes('<div') || line.includes('<img') || line.includes('</div>')) {
                // 解析 HTML 内容，提取图片路径
                const imgMatches = line.match(/src="([^"]+)"/g);
                if (imgMatches && imgMatches.length > 0) {
                  const imageSources = imgMatches.map(match => {
                    const src = match.replace('src="', '').replace('"', '');
                    return src;
                  });
                  
                  // 如果是水平排列的图片（2张图片）
                  if (imageSources.length === 2) {
                    return (
                      <View key={index} style={styles.readmeHorizontalImages}>
                        <Image 
                          source={{ uri: imageSources[0] }} 
                          style={styles.readmeImageHorizontal}
                          resizeMode="cover"
                        />
                        <Image 
                          source={{ uri: imageSources[1] }} 
                          style={styles.readmeImageHorizontal}
                          resizeMode="cover"
                        />
                      </View>
                    );
                  } 
                  // 如果是单张图片
                  else if (imageSources.length === 1) {
                    return (
                      <View key={index} style={styles.readmeSingleImage}>
                        <Image 
                          source={{ uri: imageSources[0] }} 
                          style={styles.readmeImageSingle}
                          resizeMode="contain"
                        />
                      </View>
                    );
                  }
                }
                
                // 如果无法解析，尝试使用 dangerouslySetInnerHTML（fallback）
                if (typeof window !== 'undefined') {
                  return (
                    <View key={index} style={styles.readmeImageContainer}>
                      <div dangerouslySetInnerHTML={{ __html: line }} />
                    </View>
                  );
                }
                return null;
              }
              // 空行
              else if (line.trim() === '') {
                return <View key={index} style={styles.readmeEmptyLine} />;
              }
              // 普通段落
              else {
                // 检查是否包含加粗文本 **文本**
                if (line.includes('**')) {
                  const parts = line.split(/(\*\*[^*]+\*\*)/g);
                  return (
                    <Text key={index} style={styles.readmeParagraph}>
                      {parts.map((part, partIndex) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                          // 加粗文本
                          const boldText = part.slice(2, -2);
                          return (
                            <Text key={partIndex} style={styles.readmeBoldText}>
                              {boldText}
                            </Text>
                          );
                        } else {
                          // 普通文本
                          return part;
                        }
                      })}
                    </Text>
                  );
                } else {
                  return <Text key={index} style={styles.readmeParagraph}>{line}</Text>;
                }
              }
            })}
          </View>
          
          {/* 开始使用按钮 */}
          <TouchableOpacity
            style={styles.getStartedButton}
            onPress={() => {
              setCurrentScreen('Settings');
              setScreenProps({});
            }}
          >
            <Text style={styles.getStartedButtonText}>进入设置 →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  };

  // 渲染首页内容的函数
  const renderHomeContent = () => {
    logger.debug('hideEmptyCategoriesRef.current:', hideEmptyCategoriesRef.current);
    logger.debug('当前分类统计状态:', categoryCounts);
    logger.debug('当前最近图片数量:', recentImages.length);
    
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
          <Text style={styles.sectionTitle}>📁 按内容</Text>
            <TouchableOpacity
              style={styles.toggleButton}
              onPress={async () => {
                try {
                  logger.debug('切换隐藏空分类设置');
                  // 读取当前设置
                  const settings = await UnifiedDataService.readSettings();
                  // 切换设置
                  settings.hideEmptyCategories = !settings.hideEmptyCategories;
                  // 保存设置
                  await UnifiedDataService.writeSettings(settings);
                  // 重新加载数据以应用新设置
                  await loadData();
                  logger.debug('隐藏空分类设置已更新:', settings.hideEmptyCategories);
                } catch (error) {
                  logger.error('切换隐藏空分类设置失败:', error);
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
                // PC端显示暂存箱，移动端不显示（移动端有专门的底部导航入口）
                // 这里PC端需要显示暂存箱，所以不过滤
                
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
                    onPress={handleCategoryPress}
                  />
                );
              });
            })()}
          </View>
        </View>

        {/* 城市分类卡片 */}
        <View style={styles.categoriesSection}>
          <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏙️ 按城市</Text>
          </View>
          <View style={styles.categoriesContainer}>
            {cityCounts && Object.keys(cityCounts).length > 0 ? (
              Object.entries(cityCounts)
                .sort(([,a], [,b]) => b - a)
                .map(([city, count]) => {
                  const recentImages = cityRecentImages[city] || [];
                  return (
                    <CityCard
                      key={city}
                      city={city}
                      count={count}
                      recentImages={recentImages}
                      onPress={handleCityPress}
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
              <Text style={styles.sectionTitle}>🔗 相似照片</Text>
            </View>
            <View style={styles.categoriesContainer}>
              {similarityGroups.slice(0, 10).map((group) => (
                <SimilarityCard
                  key={group.groupId}
                  group={group}
                  onPress={(group) => {
                    // 导航到相似照片详情页面
                    logger.debug('点击相似照片组:', group.groupId);
                    setCurrentScreen('Category');
                    setScreenProps(prev => ({
                      ...prev,
                      category: null, 
                      city: null, 
                      similarityGroupId: group.groupId,
                      fromScreen: 'SimilarityGroup'
                    }));
                  }}
                />
              ))}
            </View>
          </View>
        )}

        {/* 最近照片 */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>📸 最近照片</Text>
          <RecentImagesGrid 
            images={stableRecentImages} 
            onImagePress={handleImagePress}
          />
        </View>
      </ScrollView>
    );
  };

  // 渲染所有页面的函数
  const renderAllScreens = useMemo(() => {
    
    const CategoryScreen = loadedScreens.Category;
    const ImagePreviewScreen = loadedScreens.ImagePreview;
    const SettingsScreen = loadedScreens.Settings;
    
    return (
      <SafeAreaView style={styles.container}>
        {/* 自定义标题栏 */}
        <View style={styles.customTitleBar}>
          <View style={styles.titleBarLeft}>
            <Image 
              source={{ uri: './icon.png' }}
              style={styles.titleBarIcon}
              resizeMode="contain"
            />
            <Text style={styles.titleBarTitle}>芯图相册</Text>
          </View>
          <View style={styles.titleBarRight}>
            {/* 设置按钮 */}
            <TouchableOpacity 
              style={styles.titleBarSettingsButton}
              onPress={() => {
                logger.debug('标题栏设置按钮被点击');
                setCurrentScreen('Settings');
                setScreenProps({});
              }}
            >
              <Text style={styles.titleBarSettingsIcon}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 根据当前屏幕渲染对应页面 */}
        {currentScreen === 'Home' && (
          <View style={styles.screenContainer}>
            {/* 消息提示区 */}
            {!(forceShowReadme && !isScanning) && (
              <View style={styles.scanProgressBanner}>
                <Text style={styles.scanProgressMessage}>
                  {globalMessage}
                </Text>
              </View>
            )}
            {/* 主内容区域 */}
            {forceShowReadme && !isScanning ? (
              <ReadmeView />
            ) : (
              renderHomeContent()
            )}
            
            {/* FAB扫描按钮 - 只在Home页面显示 */}
            <TouchableOpacity 
              style={styles.fabButton}
              onPress={startSmartScan}
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
                <Text style={styles.fabButtonText}>⟳</Text>
              </Animated.View>
            </TouchableOpacity>
            {showScanTip && (
              <View style={styles.scanTipContainer}>
                <Text style={styles.scanTipText}>为相册智能分类100张，在设置页面开通终身会员后，无限制</Text>
              </View>
            )}
          </View>
        )}
        
        {currentScreen === 'Category' && (
          <View style={styles.screenContainer}>
            {CategoryScreen ? (
                <CategoryScreen 
                  {...screenProps} 
                  forceRefresh={categoryDataChanged}
                  onDataChange={() => setCategoryDataChanged(true)}
                  onBack={async () => {
                    setCurrentScreen('Home');
                    logger.debug('从分类页面返回，重新加载数据');
                    await loadData();
                  }}
                  navigation={{
                    onImagePress: (image, fromScreen, contextProps) => {
                      // 直接使用CategoryScreen传递的参数，不要使用screenProps
                      handleImagePress(image, fromScreen, contextProps);
                    }
                  }}
                />
            ) : (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>正在加载分类页面...</Text>
              </View>
            )}
          </View>
        )}
        
        {currentScreen === 'ImagePreview' && (
          <View style={styles.screenContainer}>
            {ImagePreviewScreen ? (
              <ImagePreviewScreen 
                onDataChange={() => setCategoryDataChanged(true)}
                onBack={async (returnedImageId) => {
                  logger.debug('ImagePreview 返回按钮被点击，返回的图片ID:', returnedImageId);
                  
                  // 从URL参数获取来源页面和图片ID
                  const urlParams = new URLSearchParams(window.location.search);
                  const fromScreen = urlParams.get('fromScreen') || 'Home';
                  const imageId = returnedImageId || urlParams.get('imageId');
                  const category = urlParams.get('category');
                  const city = urlParams.get('city');
                  const similarityGroupId = urlParams.get('similarityGroupId');
                  const savedCurrentPage = urlParams.get('currentPage');
                  const savedViewMode = urlParams.get('viewMode');
                  
                  
                  if (fromScreen === 'Category' || fromScreen === 'SimilarityGroup' || fromScreen === 'City') {
                    logger.debug('从分类/相似组/城市页面返回', { 
                      imageId, 
                      currentPage: savedCurrentPage, 
                      viewMode: savedViewMode 
                    });
                    
                    setCurrentScreen('Category');
                    
                    // 恢复上下文信息到screenProps，包括页码、视图模式和当前图片ID
                    setScreenProps(prev => ({
                      ...prev,
                      category: category || null,
                      city: city || null,
                      similarityGroupId: similarityGroupId || null,
                      fromScreen: fromScreen,
                      currentImageId: imageId || null, // 传递当前图片ID
                      currentPage: savedCurrentPage ? parseInt(savedCurrentPage, 10) : null, // 恢复页码
                      viewMode: savedViewMode || null // 恢复视图模式
                    }));
                  } else {
                    logger.debug('从首页返回');
                    setCurrentScreen('Home');
                    logger.debug('从图片预览返回，重新加载数据');
                    await loadData();
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
                  goBack: async () => {
                    setCurrentScreen('Home');
                    logger.debug('从设置页面返回，重新加载数据');
                    await loadData();
                  }
                }}
                onScanProgress={handleScanProgress}
                isScanning={isScanning}
              />
            ) : <View style={styles.loadingContainer}><Text>Loading Settings...</Text></View>}
          </View>
        )}
      </SafeAreaView>
    );
  }, [loadedScreens, currentScreen, screenProps, globalMessage, handleScanProgress, startSmartScan, hideEmptyCategories, categoryCounts, recentImages, categoryRecentImages, cityCounts, cityRecentImages, similarityGroups, totalImagesCount, readmeContent, forceShowReadme, isScanning, refreshing, onRefresh, rotationValue]);

  logger.debug('HomeScreen 状态初始化完成:', { 
    currentScreen, 
    recentImages: recentImages?.length || 0, 
    categoryCounts: Object.keys(categoryCounts).length,
    hideEmptyCategories,
    hideEmptyCategoriesRef: hideEmptyCategoriesRef.current
  });

  // 主要的返回语句
  return renderAllScreens;
};

// 渲染分类卡片组件
const CategoryCard = React.memo(({ category, count, recentImages, onPress }) => {
  // 稳定化图片源对象，避免不必要的重新渲染
  const imageSource = useMemo(() => {
    if (recentImages.length === 0) return null;
    const imageUri = getUri(recentImages[0]);
    return imageUri ? { uri: imageUri } : null;
  }, [recentImages[0]]);

  return (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => onPress(category.id)}
    >
      {/* 缩略图占满整个卡片 */}
      {imageSource ? (
        <Image
          source={imageSource}
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
});

// 渲染城市卡片组件
const CityCard = React.memo(({ city, count, recentImages, onPress }) => {
  // 稳定化图片源对象，避免不必要的重新渲染
  const imageSource = useMemo(() => {
    if (recentImages.length === 0) return null;
    const imageUri = getUri(recentImages[0]);
    return imageUri ? { uri: imageUri } : null;
  }, [recentImages[0]]);

  return (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => onPress(city)}
    >
      {/* 缩略图占满整个卡片 */}
      {imageSource ? (
        <Image
          source={imageSource}
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
});

// 渲染相似照片卡片组件
const SimilarityCard = React.memo(({ group, onPress }) => {
  // 稳定化图片源对象，避免不必要的重新渲染
  const imageSource = useMemo(() => {
    if (!group.latestImageUri) return null;
    const imageUri = getUri(group.latestImageUri);
    return imageUri ? { uri: imageUri } : null;
  }, [group.latestImageUri]);

  return (
    <TouchableOpacity
      style={styles.categoryCard}
      onPress={() => onPress(group)}
    >
      {/* 缩略图占满整个卡片 */}
      {imageSource ? (
        <Image
          source={imageSource}
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
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 60, // 为 titleBarOverlay 留出空间
  },
  screenContainer: {
    flex: 1,
    height: '100%', // 明确设置高度
  },
  scrollView: {
    flex: 1,
  },
  // 混合模式自定义标题栏样式
  customTitleBar: {
    position: 'fixed', // 使用 fixed 定位，相对于视口固定
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#2f3241', // 恢复背景色，与 titleBarOverlay 一致
    height: 60,
    paddingRight: 160, // 为系统控制按钮和设置按钮留出空间
    zIndex: 1000,
  },
  titleBarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBarIcon: {
    width: 32, // 使用32x32px图标，更清晰
    height: 32,
    marginRight: 12,
  },
  titleBarTitle: {
    fontSize: 16, // 增大字体
    fontWeight: '600',
    color: '#74b1be',
    lineHeight: 22,
  },
  titleBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleBarSettingsButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(116, 177, 190, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  titleBarSettingsIcon: {
    fontSize: 16,
    color: '#74b1be',
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
  // Readme 样式
  readmeContainer: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
    margin: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  readmeContent: {
    flex: 1,
  },
  readmeH1: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginVertical: 8,
    lineHeight: 24,
  },
  readmeH2: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#444',
    marginVertical: 10,
    lineHeight: 30,
  },
  readmeH3: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginVertical: 8,
    lineHeight: 26,
  },
  readmeParagraph: {
    fontSize: 14,
    color: '#666',
    lineHeight: 24,
    marginVertical: 4,
  },
  readmeBoldText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    lineHeight: 24,
  },
  readmeListItem: {
    fontSize: 14,
    color: '#666',
    lineHeight: 24,
    marginLeft: 16,
    marginVertical: 2,
  },
  readmeNumberedItem: {
    fontSize: 15,
    fontWeight: '600',
    color: '#555',
    lineHeight: 26,
    marginVertical: 6,
  },
  readmeEmptyLine: {
    height: 8,
  },
  readmeImageContainer: {
    marginVertical: 12,
    alignItems: 'center',
  },
  readmeHorizontalImages: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 12,
    gap: 10,
  },
  readmeImageHorizontal: {
    width: '48%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  readmeSingleImage: {
    alignItems: 'center',
    marginVertical: 12,
  },
  readmeImageSingle: {
    width: '80%',
    maxWidth: 400,
    height: 250,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  getStartedButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 8,
    marginTop: 24,
    alignSelf: 'center',
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  getStartedButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  // FAB按钮样式
  fabButton: {
    position: 'fixed',
    bottom: 80,
    right: 16,
    width: 56,
    height: 56,
    backgroundColor: '#007AFF',
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 9999,
  },
  fabButtonText: {
    fontSize: 24,
    color: '#fff',
  },
  // 扫描浮窗提示样式（贴近扫描按钮）
  scanTipContainer: {
    position: 'fixed',
    bottom: 144, // 比按钮高出约64px
    right: 16,
    maxWidth: 320,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    zIndex: 10000,
  },
  scanTipText: {
    fontSize: 12,
    color: '#fff',
    lineHeight: 18,
  },
});

export default HomeScreen;