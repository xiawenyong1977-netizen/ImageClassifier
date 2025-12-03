/**
 * 芯图相册 - 移动端首页
 * 
 * 功能（与PC端保持一致）：
 * 1. 消息提示区（显示扫描进度或最近扫描信息）
 * 2. 按内容分类浏览
 * 3. 相似图片分组
 * 4. 按城市分类
 * 5. 最近照片
 * 6. FAB扫描按钮
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Image,
  RefreshControl,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, Platform, PermissionsAndroid, Alert } from '../../adapters/WebAdapters';
import WeChatAuthService from '../../services/WeChatAuthService';
import { useFocusEffect } from '@react-navigation/native';
import UnifiedDataService from '../../services/UnifiedDataService';
import GlobalImageCache from '../../services/GlobalImageCache';
import configService from '../../services/ConfigService';
import GalleryScannerService from '../../services/GalleryScannerService';
import WakeLockService from '../../services/WakeLockService';
import { logger, getUri, getLocalPath } from '../../adapters/WebAdapters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  // ==================== 状态管理 ====================
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // 分类数据
  const [categories, setCategories] = useState([]);
  
  // 城市数据
  const [cities, setCities] = useState([]);
  
  // 相似组数据
  const [similarityGroups, setSimilarityGroups] = useState([]);
  
  // 颜色分类数据
  const [colorCounts, setColorCounts] = useState({});
  const [colorRecentImages, setColorRecentImages] = useState({});
  
  // 目录分类数据
  const [directoryCounts, setDirectoryCounts] = useState({});
  const [directoryRecentImages, setDirectoryRecentImages] = useState({});
  
  // 最近照片
  const [recentImages, setRecentImages] = useState([]);
  const [recentImagesTotal, setRecentImagesTotal] = useState(0); // 新发现照片的总数
  
  // 扫描状态
  const [isScanning, setIsScanning] = useState(false);
  
  // 消息提示
  const [globalMessage, setGlobalMessage] = useState('图片分类应用已就绪');
  
  
  // 隐藏空分类设置（默认隐藏空分类）
  const [hideEmptyCategories, setHideEmptyCategories] = useState(true);
  
  // 显示设置
  const [showCityCategories, setShowCityCategories] = useState(true);
  const [showColorCategories, setShowColorCategories] = useState(true);
  const [showSimilarityGroups, setShowSimilarityGroups] = useState(true);
  const [showRecentPhotos, setShowRecentPhotos] = useState(true);
  const [showDirectoryCategories, setShowDirectoryCategories] = useState(true);

  // ==================== 初始化加载 ====================
  useEffect(() => {
    initializeData();
    loadLastScanTime();
    loadHideEmptyCategoriesSetting();
    loadDisplaySettings();
    
    // 调试：检查当前权限状态
    checkCurrentPermissionStatus();
    
    // 监听设置更新事件（使用多种方式确保兼容性）
    const handleSettingsUpdate = (eventData) => {
      // 处理Web环境的CustomEvent
      const detail = eventData?.detail || eventData;
      const { key, settings: newSettings } = detail || {};
      if (key === 'showCityCategories' || key === 'showColorCategories' || 
          key === 'showSimilarityGroups' || key === 'showRecentPhotos' || 
          key === 'showDirectoryCategories') {
        if (newSettings) {
          setShowCityCategories(newSettings.showCityCategories !== false);
          setShowColorCategories(newSettings.showColorCategories !== false);
          setShowSimilarityGroups(newSettings.showSimilarityGroups !== false);
          setShowRecentPhotos(newSettings.showRecentPhotos !== false);
          setShowDirectoryCategories(newSettings.showDirectoryCategories !== false);
        }
      }
    };
    
    // 方式1: Web环境的CustomEvent
    if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
      window.addEventListener('settingsUpdated', handleSettingsUpdate);
    }
    
    // 方式2: React Native的DeviceEventEmitter
    let deviceEventSubscription = null;
    try {
      const { DeviceEventEmitter } = require('react-native');
      if (DeviceEventEmitter && DeviceEventEmitter.addListener) {
        deviceEventSubscription = DeviceEventEmitter.addListener('settingsUpdated', handleSettingsUpdate);
      }
    } catch (e) {
      // DeviceEventEmitter不可用，忽略
    }
    
    return () => {
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        window.removeEventListener('settingsUpdated', handleSettingsUpdate);
      }
      if (deviceEventSubscription) {
        deviceEventSubscription.remove();
      }
    };
  }, []);

  /**
   * 检查当前权限状态（调试用）
   */
  const checkCurrentPermissionStatus = async () => {
    if (Platform.OS !== 'android') {
      return;
    }

    try {
      logger.debug('🔍 检查当前权限状态...');
      
      let permissions = [];
      if (Platform.Version >= 33) {
        permissions = [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION,
        ];
      } else {
        permissions = [
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION,
        ];
      }

      const checkResults = await Promise.all(
        permissions.map(p => PermissionsAndroid.check(p))
      );

      logger.debug('📋 当前权限状态:', {
        permissions,
        results: checkResults,
        allGranted: checkResults.every(result => result === true)
      });
    } catch (error) {
      logger.error('❌ 检查权限状态失败:', error);
    }
  };
  
  // 监听页面焦点，当从其他页面返回时刷新数据
  useFocusEffect(
    useCallback(() => {
      // 页面获得焦点时，刷新数据（避免初次加载时重复刷新）
      // 如果正在扫描，不要刷新（避免覆盖扫描进度消息）
      if (!loading && !isScanning) {
        logger.debug('🔄 首页获得焦点，刷新数据...');
        loadAllData();
        loadLastScanTime();
        // 重新加载显示设置，确保从设置页面返回时立即生效
        loadDisplaySettings();
      }
    }, [loading, isScanning])
  );
  
  /**
   * 加载"隐藏空分类"设置
   * 默认隐藏空分类（true），只有用户主动设置为显示空分类时才是 false
   */
  const loadHideEmptyCategoriesSetting = async () => {
    try {
      const settings = await UnifiedDataService.readSettings();
      // 如果设置未定义，默认为 true（隐藏空分类）
      // 只有当用户明确设置为 false 时才显示空分类
      const shouldHide = settings.hideEmptyCategories !== false;
      setHideEmptyCategories(shouldHide);
    } catch (error) {
      logger.error('加载隐藏空分类设置失败:', error);
      // 出错时默认隐藏空分类
      setHideEmptyCategories(true);
    }
  };

  /**
   * 加载显示设置
   */
  const loadDisplaySettings = async () => {
    try {
      const settings = await UnifiedDataService.readSettings();
      setShowCityCategories(settings.showCityCategories !== false);
      setShowColorCategories(settings.showColorCategories !== false);
      setShowSimilarityGroups(settings.showSimilarityGroups !== false);
      setShowRecentPhotos(settings.showRecentPhotos !== false);
      setShowDirectoryCategories(settings.showDirectoryCategories !== false);
    } catch (error) {
      logger.error('加载显示设置失败:', error);
      // 出错时默认全部显示
      setShowCityCategories(true);
      setShowColorCategories(true);
      setShowSimilarityGroups(true);
      setShowRecentPhotos(true);
    }
  };
  
  /**
   * 当 hideEmptyCategories 改变时，重新加载分类
   */
  useEffect(() => {
    if (loading) return; // 初始化时不重新加载
    loadCategories();
  }, [hideEmptyCategories]);

  /**
   * 初始化数据加载
   */
  const initializeData = async () => {
    try {
      setLoading(true);
      
      // ConfigService 和 UnifiedDataService 已在 App.js 启动时初始化
      // 这里直接加载数据即可
      await loadAllData();
      
    } catch (error) {
      logger.error('❌ 首页初始化失败:', error);
      Alert.alert('初始化失败', error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载所有数据（第一优先级：立即加载）
   */
  const loadAllData = async () => {
    try {
      // 并行加载核心数据
      await Promise.all([
        loadCategories(),
        loadRecentImages(),
      ]);
      
      // 延迟加载次要数据（第二优先级）
      setTimeout(() => {
        loadCities();
        loadSimilarityGroups();
        loadColors();
        loadDirectories();
        }, 100);
        
          } catch (error) {
      logger.error('❌ 加载数据失败:', error);
      throw error;
    }
  };


  /**
   * 加载分类列表（按配置文件顺序）
   */
  const loadCategories = async () => {
    try {
      const cache = GlobalImageCache.getCache();
      const categoryCounts = cache.categoryCounts || {};
      
      // 获取所有分类配置（按配置文件中的显示顺序）
      const allCategories = configService.getAllCategoriesWithUI();
      
      // 按配置文件顺序构建分类列表
      // 注意：暂存箱不是分类，不会出现在 getAllCategoriesWithUI() 返回的列表中
      const categoryList = allCategories
        .filter(categoryConfig => {
          const count = categoryCounts[categoryConfig.id] || 0;
          // 如果开启了隐藏空分类且该分类数量为0，则不显示
          if (hideEmptyCategories && count === 0) {
            return false;
          }
          return true;
        })
        .map(categoryConfig => ({
          id: categoryConfig.id,
          name: categoryConfig.chinese || categoryConfig.english || categoryConfig.id,
          count: categoryCounts[categoryConfig.id] || 0,
          color: categoryConfig.color || '#666666',
          recentImages: [], // 稍后加载
        }));
      
      // 并行加载每个分类的最近一张照片（只加载有照片的分类）
      const categoryWithImagesPromises = categoryList.map(async (category) => {
        if (category.count === 0) {
          // 空分类不需要加载照片
          return category;
        }
        
        try {
          const recentImages = await UnifiedDataService.readRecentImagesByCategory(category.id, 1);
          return {
            ...category,
            recentImages: recentImages || []
          };
        } catch (error) {
          logger.error(`加载分类 ${category.id} 最近照片失败:`, error);
          return {
            ...category,
            recentImages: []
          };
        }
      });
      
      const categoryWithImages = await Promise.all(categoryWithImagesPromises);
      setCategories(categoryWithImages);
      
    } catch (error) {
      logger.error('❌ 加载分类列表失败:', error);
    }
  };

  /**
   * 加载城市列表（包含最近一张照片）
   */
  const loadCities = async () => {
    try {
      const cache = GlobalImageCache.getCache();
      const cityCounts = cache.cityCounts || {};
      const allImages = cache.allImages || [];
      
      // 构建城市列表并按数量降序排序
      const cityList = Object.keys(cityCounts)
        .map(cityName => {
          // 找到这个城市最近的一张照片（按时间戳降序）
          // 暂存箱图片不通过 category 标记，所以不需要过滤
          const cityImages = allImages
            .filter(img => img.city === cityName)
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          
          const latestImage = cityImages.length > 0 ? cityImages[0] : null;
          
          return {
            name: cityName,
            count: cityCounts[cityName],
            latestImageUri: latestImage ? getUri(latestImage) : null,
          };
        })
        .sort((a, b) => b.count - a.count);
      
      setCities(cityList);
      
    } catch (error) {
      logger.error('❌ 加载城市列表失败:', error);
    }
  };

  /**
   * 加载颜色分类数据
   */
  const loadColors = async () => {
    try {
      // 加载颜色统计
      const colorCountsData = await UnifiedDataService.readColorCounts();
      setColorCounts(colorCountsData);
      
      // 加载各颜色的最近图片（按数量排序取前10个）
      const sortedColors = Object.entries(colorCountsData).sort(([,a], [,b]) => b - a);
      const colorIds = sortedColors.slice(0, 10).map(([colorName]) => colorName);
      const colorImagesPromises = colorIds.map(async (colorName) => {
        try {
          const images = await UnifiedDataService.readRecentImagesByColor(colorName, 1);
          return { colorName, images };
        } catch (error) {
          logger.error(`加载颜色 ${colorName} 最近图片失败:`, error);
          return { colorName, images: [] };
        }
      });
      
      const colorImagesResults = await Promise.all(colorImagesPromises);
      const colorImagesMap = {};
      colorImagesResults.forEach(({ colorName, images }) => {
        colorImagesMap[colorName] = images;
      });
      
      setColorRecentImages(colorImagesMap);
      
    } catch (error) {
      logger.error('❌ 加载颜色分类失败:', error);
    }
  };

  /**
   * 加载目录分类数据
   */
  const loadDirectories = async () => {
    try {
      // 加载目录统计
      const directoryCountsData = await UnifiedDataService.readDirectoryCounts();
      setDirectoryCounts(directoryCountsData);
      
      // 加载所有目录的最近图片（每个目录只加载1张用于缩略图）
      const allDirectoryIds = Object.keys(directoryCountsData);
      
      const directoryImagesPromises = allDirectoryIds.map(async (dirName) => {
        try {
          const images = await UnifiedDataService.readRecentImagesByDirectory(dirName, 1);
          return { dirName, images };
        } catch (error) {
          logger.error(`加载目录 ${dirName} 的图片失败:`, error);
          return { dirName, images: [] };
        }
      });
      
      const directoryImagesResults = await Promise.all(directoryImagesPromises);
      const directoryImagesMap = {};
      directoryImagesResults.forEach(({ dirName, images }) => {
        directoryImagesMap[dirName] = images;
      });
      setDirectoryRecentImages(directoryImagesMap);
    } catch (error) {
      logger.error('❌ 加载目录分类失败:', error);
    }
  };

  /**
   * 加载相似组
   */
  const loadSimilarityGroups = async () => {
    try {
      // 使用 PC 端相同的方法获取相似组统计（与 PC 端保持一致）
      const allGroups = await UnifiedDataService.getSimilarityGroupsStats();
      // 只取前8组
      const groups = allGroups.slice(0, 8);
      setSimilarityGroups(groups);
      
      
    } catch (error) {
      logger.error('❌ 加载相似组失败:', error);
    }
  };

  /**
   * 加载新发现的照片（从上次扫描之后新发现的照片）
   */
  const loadRecentImages = async () => {
    try {
      // 改为调用 readNewDiscoveredImages 获取从上次扫描之后新发现的照片
      const result = await UnifiedDataService.readNewDiscoveredImages(12);
      setRecentImages(result.images || []);
      setRecentImagesTotal(result.total || 0);
    } catch (error) {
      logger.error('❌ 加载新发现照片失败:', error);
      setRecentImages([]);
      setRecentImagesTotal(0);
    }
  };

  /**
   * 刷新新发现照片
   */
  const refreshNewDiscoveredImages = useCallback(async () => {
    try {
      const result = await UnifiedDataService.readNewDiscoveredImages(12);
      setRecentImages(result.images || []);
      setRecentImagesTotal(result.total || 0);
    } catch (error) {
      logger.error('刷新新发现照片失败:', error);
    }
  }, []);

  /**
   * 加载最近扫描时间和信息
   */
  const loadLastScanTime = async (preserveCurrentMessage = false) => {
    try {
      const settings = await UnifiedDataService.readSettings();
      logger.debug('🔍 检查扫描完成信息:', {
        hasLastScanTime: !!settings?.lastScanTime,
        lastScanTime: settings?.lastScanTime,
        lastScanDuration: settings?.lastScanDurationSeconds
      });
      
      if (settings && settings.lastScanTime) {
        // 手动格式化时间（确保在 React Native 中显示中文格式）
        const date = new Date(settings.lastScanTime);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        const formattedTime = `${year}-${month}-${day} ${hour}:${minute}`;
        
        // 从缓存获取统计信息
        const cache = GlobalImageCache.getCache();
        const images = cache.allImages || [];
        const totalImages = images.length;
        let totalSize = 0;
        for (const image of images) {
          if (image.size && typeof image.size === 'number') {
            totalSize += image.size;
          }
        }
        
        const formattedSize = formatFileSize(totalSize);
        
        // 添加耗时信息
        let durationText = '';
        if (settings.lastScanDurationSeconds) {
          if (settings.lastScanDurationMinutes >= 1) {
            durationText = ` | 耗时: ${settings.lastScanDurationMinutes}分钟`;
        } else {
            durationText = ` | 耗时: ${settings.lastScanDurationSeconds}秒`;
          }
        }
        
        setGlobalMessage(`上次扫描: ${formattedTime} | 共 ${totalImages} 张 | ${formattedSize}${durationText}`);
      } else {
        logger.debug('⚠️ 没有扫描完成记录');
        // 如果 preserveCurrentMessage 为 true，不更新消息，保持当前消息
        if (!preserveCurrentMessage) {
          setGlobalMessage('图片分类应用已就绪');
        }
      }
    } catch (error) {
      logger.error('加载最近扫描时间失败:', error);
      // 如果 preserveCurrentMessage 为 true，不更新消息，保持当前消息
      if (!preserveCurrentMessage) {
        setGlobalMessage('图片分类应用已就绪');
      }
      throw error; // 重新抛出错误，让调用方知道失败了
    }
  };

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  /**
   * 切换"隐藏空分类"设置
   */
  const toggleHideEmptyCategories = async () => {
    try {
      logger.debug('切换隐藏空分类设置');
      // 读取当前设置
      const settings = await UnifiedDataService.readSettings();
      // 切换设置
      const newValue = !hideEmptyCategories;
      settings.hideEmptyCategories = newValue;
      // 保存设置
      await UnifiedDataService.writeSettings(settings);
      // 更新状态
      setHideEmptyCategories(newValue);
      // 重新加载分类列表
      await loadCategories();
      logger.debug('隐藏空分类设置已更新:', newValue);
    } catch (error) {
      logger.error('切换隐藏空分类设置失败:', error);
    }
  };

  /**
   * 下拉刷新
   */
  const onRefresh = useCallback(async () => {
    // 如果正在扫描，不执行刷新
    if (isScanning) {
      logger.debug('🔄 正在扫描中，跳过下拉刷新');
      setRefreshing(false);
      return;
    }
    
    setRefreshing(true);
    try {
      // 只重新加载数据（从缓存读取），不重建缓存
      // 缓存只在数据真正变化时（扫描、删除）才重建
      await loadAllData();
      
      // 显式重新加载新发现照片（确保刷新时重新查询 MediaStore）
      await loadRecentImages();
      
      // 重新加载扫描信息（如果失败则保持当前消息不变）
      await loadLastScanTime(true); // 传入 true，失败时保持当前消息
    } catch (error) {
      logger.error('❌ 刷新失败:', error);
      Alert.alert('刷新失败', error.message);
    } finally {
      setRefreshing(false);
    }
  }, [isScanning]);

  // 扫描按钮浮窗提示（非会员限制说明）
  const [showScanTip, setShowScanTip] = useState(false);

  /**
   * 检查并请求所有需要的权限（一次性请求）
   * Android 13+: 媒体访问权限、位置权限、通知权限
   * Android 12-: 存储权限、位置权限
   */
  const checkAndRequestPermissions = async () => {
    if (Platform.OS !== 'android') {
      return true; // iOS 权限在 Info.plist 中配置
    }

    try {
      logger.debug('📋 检查相册访问权限、位置权限和通知权限...');
      logger.debug(`📱 Android 版本: API ${Platform.Version}`);
      
      // 根据 Android 版本请求不同的权限
      let permissions = [];
      
      if (Platform.Version >= 33) {
        // Android 13+ (API 33+): 使用新的媒体权限 + 通知权限
        logger.debug('📋 Android 13+，请求新的媒体权限和通知权限');
        permissions = [
          PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
          PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION, // 读取照片GPS信息
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, // 通知权限（用于前台服务）
        ];
      } else {
        // Android 12 及以下: 使用旧的存储权限（不需要通知权限，因为 Android 12 及以下不需要）
        logger.debug('📋 Android 12-，请求旧的存储权限');
        permissions = [
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
          PermissionsAndroid.PERMISSIONS.ACCESS_MEDIA_LOCATION, // 读取照片GPS信息
        ];
      }

      logger.debug('📋 需要检查的权限:', permissions);

      // 检查是否所有权限都已授权
      const checkResults = await Promise.all(
        permissions.map(p => PermissionsAndroid.check(p))
      );

      logger.debug('📋 权限检查结果:', checkResults);

      if (checkResults.every(result => result === true)) {
        logger.debug('✅ 所有权限已授权');
        return true;
      }

      // 请求权限（一次性请求所有需要的权限）
      logger.debug('📋 开始一次性请求所有权限...');
      const grantResults = await PermissionsAndroid.requestMultiple(permissions);
      
      logger.debug('📋 权限请求结果:', grantResults);
      
      const allGranted = Object.values(grantResults).every(
        result => result === PermissionsAndroid.RESULTS.GRANTED
      );

      if (allGranted) {
        logger.debug('✅ 所有权限已授权');
        return true;
      } else {
        logger.warn('⚠️ 部分权限被拒绝');
        const permissionText = Platform.Version >= 33 
          ? '需要访问相册权限、位置权限和通知权限才能扫描图片并显示扫描进度。请在设置中授予权限。'
          : '需要访问相册权限和位置权限才能扫描图片并获取GPS信息。请在设置中授予权限。';
        Alert.alert(
          '权限不足',
          permissionText,
          [
            { text: '取消', style: 'cancel' },
            { 
              text: '去设置', 
              onPress: () => {
                // TODO: 打开应用设置页面
                const settingText = Platform.Version >= 33
                  ? '请手动进入系统设置 → 应用管理 → 芯图相册 → 权限，开启存储权限、位置权限和通知权限'
                  : '请手动进入系统设置 → 应用管理 → 芯图相册 → 权限，开启存储权限和位置权限';
                Alert.alert('提示', settingText);
              }
            }
          ]
        );
        return false;
      }
    } catch (error) {
      logger.error('❌ 权限检查失败:', error);
      return false;
    }
  };

  /**
   * 触发扫描
   */
  const handleScan = async () => {
    try {
      // 先检查并请求权限
      const hasPermission = await checkAndRequestPermissions();
      if (!hasPermission) {
        logger.warn('⚠️ 没有相册访问权限，取消扫描');
        return;
      }

      // 查询会员状态，非会员提示并限制比较数量
      let compareLimitOption = null;
      try {
        const { isMember } = await WeChatAuthService.getMembershipStatus();
        if (!isMember) {
          setShowScanTip(true);
          setTimeout(() => setShowScanTip(false), 4000);
          compareLimitOption = { compareLimit: 100 };
        }
      } catch (e) {
        logger.debug('会员状态查询失败，按非会员处理:', e?.message || e);
        setShowScanTip(true);
        setTimeout(() => setShowScanTip(false), 4000);
        compareLimitOption = { compareLimit: 100 };
      }

      setIsScanning(true);
      // 🔥 设置全局变量，供设置页面检查扫描状态
      if (typeof window !== 'undefined') {
        window.isScanning = true;
      }
      setGlobalMessage('正在初始化...');
      logger.debug('🔍 开始扫描相册...');
      
      // 使用唤醒锁防止手机休眠影响扫描性能
      const wakeLockAcquired = await WakeLockService.acquire(30 * 60 * 1000); // 30分钟超时
      if (wakeLockAcquired) {
        logger.info('🔋 已获取唤醒锁，防止手机休眠影响扫描性能');
      }
      
      const galleryScannerService = new GalleryScannerService();
      
      // 🆕 检查使用的扫描版本
      const scanVersion = galleryScannerService.getScanVersion();
      const isNativeScan = galleryScannerService.isUsingNativeScan();
      logger.info(`📱 扫描服务版本: ${scanVersion}`);
      logger.info(`📱 是否使用原生扫描: ${isNativeScan ? '是 ✅' : '否 ❌'}`);
      
      // 初始化服务
      await galleryScannerService.initialize();
      
      // 开始扫描，显示进度（使用和PC端一致的进度消息）
      await galleryScannerService.scanGalleryWithProgress((progress) => {
        // progress已经包含了simpleMessage字段，这是PC端格式化后的消息
        if (progress) {
          const message = progress.simpleMessage || progress.message || '处理中...';
          setGlobalMessage(message);
          
          // 🆕 检查是否需要刷新页面数据（缓存重建已在 processProgressData 中完成）
          if (progress.shouldRefresh) {
            // 使用 setTimeout 确保状态更新不被阻塞
            setTimeout(async () => {
              try {
                // 只刷新页面数据，不重建缓存（缓存重建已在 processProgressData 中完成）
                await loadAllData();
              } catch (error) {
                logger.error('❌ 刷新页面数据失败:', error);
              }
            }, 0);
          }
        }
      }, compareLimitOption);
      
      logger.debug('✅ 扫描完成');
      setGlobalMessage('扫描完成，正在刷新数据...');
      
      // 扫描完成后刷新数据
      await onRefresh();
      
      // 加载最近扫描信息
      await loadLastScanTime();
    } catch (error) {
      logger.error('❌ 扫描失败:', error);
      setGlobalMessage('扫描失败');
      Alert.alert('扫描失败', error.message);
    } finally {
      // 释放唤醒锁
      await WakeLockService.release();
      setIsScanning(false);
      // 🔥 清除全局变量
      if (typeof window !== 'undefined') {
        window.isScanning = false;
      }
    }
  };

  // ==================== 渲染函数 ====================


  /**
   * 渲染分类卡片（与PC端一致的设计）
   */
  const renderCategoryCard = (category) => (
    <TouchableOpacity
      key={category.id}
      style={styles.categoryCard}
      onPress={() => {
        try {
          // 🆕 添加空值检查
          if (!category || !category.id || !navigation) {
            logger.warn('❌ 分类数据无效或导航对象为空:', { category, navigation: !!navigation });
            return;
          }
          
          logger.debug('📁 点击分类卡片:', category.id);
          // 注意：暂存箱不是分类，不会出现在分类列表中，所以这里不需要判断 stagingBox
          navigation.navigate('Category', {
            filterType: 'category',
            filterValue: category.id,
            fromScreen: 'Home',
          });
        } catch (error) {
          logger.error('❌ 分类卡片点击失败:', error);
        }
      }}
    >
      {/* 缩略图占满整个卡片 */}
      {category.recentImages && category.recentImages.length > 0 ? (
        <Image
          source={{ uri: getUri(category.recentImages[0]) || category.recentImages[0]?.uri }}
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
        <Text style={styles.categoryName} numberOfLines={1}>{category.name}</Text>
        <Text style={styles.categoryCount}>{category.count}</Text>
            </View>
            </TouchableOpacity>
  );

  /**
   * 渲染按内容分类区（4列网格）
   */
  const renderCategoriesSection = () => {
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📁 按内容</Text>
          <TouchableOpacity 
            style={styles.toggleButton}
            onPress={toggleHideEmptyCategories}
          >
            <Text style={styles.toggleButtonText}>
              {hideEmptyCategories ? '显示空分类' : '隐藏空分类'}
            </Text>
            </TouchableOpacity>
          </View>
        
        {categories.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📷</Text>
            <Text style={styles.emptyStateText}>暂无分类图片</Text>
            <Text style={styles.emptyStateSubtext}>请先扫描图片或调整显示设置</Text>
          </View>
        ) : (
          <View style={styles.categoriesGrid}>
            {categories.map(renderCategoryCard)}
          </View>
        )}
        </View>
    );
  };

  /**
   * 渲染相似组卡片（与 PC 端保持一致：显示 1 张代表图片）
   */
  const renderSimilarityGroupCard = (group) => (
    <TouchableOpacity
      key={group.groupId}
      style={styles.categoryCard}
      onPress={() => {
        try {
          // 🆕 添加空值检查
          if (!group || !group.groupId || !navigation) {
            logger.warn('❌ 相似组数据无效或导航对象为空:', { group, navigation: !!navigation });
            return;
          }
          
          logger.debug('🔗 点击相似组卡片:', group.groupId);
          navigation.navigate('Category', {
            filterType: 'similarityGroup',
            filterValue: group.groupId,
            fromScreen: 'SimilarityGroup',
          });
        } catch (error) {
          logger.error('❌ 相似组卡片点击失败:', error);
        }
      }}
    >
      {/* 缩略图占满整个卡片 */}
      {group.latestImageUri ? (
        <Image
          source={{ uri: group.latestImageUri }}
          style={styles.thumbnail}
          resizeMode="cover"
          onError={(error) => {
            logger.error(`❌ 相似组缩略图加载失败:`, { 
              groupId: group.groupId, 
              latestImageUri: group.latestImageUri,
              error: error.nativeEvent?.error || error
            });
          }}
        />
      ) : (
        <View style={[styles.thumbnail, { backgroundColor: '#9C27B0' }]}>
          <Text style={styles.emptyThumbnailText}>🔗</Text>
        </View>
      )}
      
      {/* 覆盖层显示相似照片信息（与 PC 端一致）*/}
      <View style={styles.categoryOverlay}>
        <Text style={styles.categoryName}>相似照片</Text>
        <Text style={styles.categoryCount}>{group.imageCount}</Text>
        </View>
    </TouchableOpacity>
  );

  /**
   * 渲染相似照片区（与"按内容"保持一致：4列网格布局）
   */
  const renderSimilarityGroupsSection = () => {
    if (similarityGroups.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12, paddingHorizontal: 16 }]}>🔗 相似照片</Text>
        <View style={styles.categoriesGrid}>
          {similarityGroups.map(renderSimilarityGroupCard)}
        </View>
        </View>
    );
  };

  /**
   * 渲染颜色卡片（与PC端保持一致）
   */
  const renderColorCard = (color) => {
    const count = colorCounts[color] || 0;
    const recentImages = colorRecentImages[color] || [];
    
    return (
      <TouchableOpacity
        key={color}
        style={styles.categoryCard}
        onPress={() => {
          try {
            if (!color || !navigation) {
              logger.warn('❌ 颜色数据无效或导航对象为空:', { color, navigation: !!navigation });
              return;
            }
            
            logger.debug('🎨 点击颜色卡片:', color);
            navigation.navigate('Category', {
              filterType: 'color',
              filterValue: color,
              fromScreen: 'Home',
            });
          } catch (error) {
            logger.error('❌ 颜色卡片点击失败:', error);
          }
        }}
      >
        {/* 缩略图占满整个卡片 */}
        {recentImages.length > 0 ? (
          <Image
            source={{ uri: getUri(recentImages[0]) || recentImages[0]?.uri }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: color || '#9E9E9E' }]}>
            <Text style={styles.emptyThumbnailText}>🎨</Text>
          </View>
        )}
        
        {/* 覆盖层显示颜色信息 */}
        <View style={styles.categoryOverlay}>
          <Text style={styles.categoryName}>{color}</Text>
          <Text style={styles.categoryCount}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * 渲染颜色分类区（与"按内容"保持一致：4列网格布局）
   */
  const renderColorsSection = () => {
    // 过滤掉 null、undefined 和空字符串
    const filteredColorCounts = Object.entries(colorCounts).filter(([color]) => {
      return color && 
             typeof color === 'string' && 
             color.trim() !== '' && 
             color !== 'null' && 
             color !== 'undefined';
    });
    
    if (filteredColorCounts.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12, paddingHorizontal: 16 }]}>🎨 按颜色</Text>
        <View style={styles.categoriesGrid}>
          {filteredColorCounts
            .sort(([,a], [,b]) => b - a)
            .map(([color]) => renderColorCard(color))}
        </View>
      </View>
    );
  };

  /**
   * 渲染目录卡片
   */
  const renderDirectoryCard = (directory) => {
    const count = directoryCounts[directory] || 0;
    const recentImages = directoryRecentImages[directory] || [];
    // 提取目录名（最后一个路径段）
    const directoryName = directory.split('/').pop() || directory;
    
    return (
      <TouchableOpacity
        key={directory}
        style={styles.categoryCard}
        onPress={() => {
          try {
            if (!directory || !navigation) {
              logger.warn('❌ 目录数据无效或导航对象为空:', { directory, navigation: !!navigation });
              return;
            }
            
            logger.debug('📁 点击目录卡片:', directory);
            navigation.navigate('Category', {
              filterType: 'directory',
              filterValue: directory,
              fromScreen: 'Home',
            });
          } catch (error) {
            logger.error('❌ 目录卡片点击失败:', error);
          }
        }}
      >
        {/* 缩略图占满整个卡片 */}
        {recentImages.length > 0 ? (
          <Image
            source={{ uri: getUri(recentImages[0]) }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumbnail, { backgroundColor: '#9E9E9E' }]}>
            <Text style={styles.emptyThumbnailText}>📁</Text>
          </View>
        )}
        
        {/* 覆盖层显示目录信息 */}
        <View style={styles.categoryOverlay}>
          <Text style={styles.categoryName} numberOfLines={1}>{directoryName}</Text>
          <Text style={styles.categoryCount}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  /**
   * 渲染目录分类区（与"按内容"保持一致：4列网格布局）
   */
  const renderDirectoriesSection = () => {
    // 过滤掉无效目录
    const filteredDirectoryCounts = Object.entries(directoryCounts).filter(([directory]) => {
      return directory && 
             typeof directory === 'string' && 
             directory.trim() !== '' && 
             directory !== 'null' && 
             directory !== 'undefined';
    });
    
    if (filteredDirectoryCounts.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12, paddingHorizontal: 16 }]}>📁 按存储</Text>
        <View style={styles.categoriesGrid}>
          {filteredDirectoryCounts
            .sort(([,a], [,b]) => b - a)
            .map(([directory]) => renderDirectoryCard(directory))}
        </View>
      </View>
    );
  };

  /**
   * 渲染城市卡片（与"按内容"保持一致：4列网格布局）
   */
  const renderCityCard = (city) => (
    <TouchableOpacity
      key={city.name}
      style={styles.categoryCard}
      onPress={() => {
        try {
          // 🆕 添加空值检查
          if (!city || !city.name || !navigation) {
            logger.warn('❌ 城市数据无效或导航对象为空:', { city, navigation: !!navigation });
            return;
          }
          
          logger.debug('🏙️ 点击城市卡片:', city.name);
          navigation.navigate('Category', {
            filterType: 'city',
            filterValue: city.name,
            fromScreen: 'Home',
          });
        } catch (error) {
          logger.error('❌ 城市卡片点击失败:', error);
        }
      }}
    >
      {/* 显示缩略图或城市背景色 */}
      {city.latestImageUri ? (
        <Image
          source={{ uri: city.latestImageUri }}
          style={styles.thumbnail}
          resizeMode="cover"
        />
      ) : (
        <View style={[styles.thumbnail, { backgroundColor: '#FF9800' }]}>
          <Text style={styles.emptyThumbnailText}>📍</Text>
        </View>
      )}
      
      {/* 覆盖层显示城市信息 */}
      <View style={styles.categoryOverlay}>
        <Text style={styles.categoryName}>{city.name}</Text>
        <Text style={styles.categoryCount}>{city.count}</Text>
      </View>
    </TouchableOpacity>
  );

  /**
   * 渲染按城市区（与"按内容"保持一致：4列网格布局）
   */
  const renderCitiesSection = () => {
    if (cities.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { marginBottom: 12, paddingHorizontal: 16 }]}>🏙️ 按城市</Text>
        <View style={styles.categoriesGrid}>
          {cities.map(renderCityCard)}
        </View>
        </View>
    );
  };

  /**
   * 渲染新发现的照片（从上次扫描之后新发现的照片）
   */
  const renderRecentPhotos = () => {
    // 从图片对象中提取目录名的辅助函数
    const getDirectoryName = (image) => {
      if (!image) return '未知目录';
      
      // 使用 getLocalPath 提取路径（支持 contentUri||path 格式）
      const path = getLocalPath(image);
      if (!path) {
        return '未知目录';
      }
      
      // 从路径中提取目录名（倒数第二级目录）
      // 例如：/storage/emulated/0/DCIM/Camera/IMG_001.jpg -> Camera
      // 或者：DCIM/Camera/IMG_001.jpg -> Camera
      const pathParts = path.split('/').filter(p => p && p.trim());
      if (pathParts.length >= 2) {
        // 取倒数第二级目录
        return pathParts[pathParts.length - 2];
      } else if (pathParts.length === 1) {
        return pathParts[0];
      }
      return '未知目录';
    };
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleContainer}>
            <Text style={styles.sectionTitle}>📸 新发现照片</Text>
            {recentImagesTotal > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{recentImagesTotal}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity 
            style={styles.toggleButton}
            onPress={refreshNewDiscoveredImages}
          >
            <Text style={styles.toggleButtonText}>重新检测</Text>
          </TouchableOpacity>
        </View>
        
        {recentImages.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateIcon}>📷</Text>
            <Text style={styles.emptyStateText}>暂无新照片</Text>
            <Text style={styles.emptyStateSubtext}>请点击右下角扫描按钮开始扫描相册</Text>
          </View>
        ) : (
          <View style={styles.recentGrid}>
            {recentImages.map((image, index) => {
              const directoryName = getDirectoryName(image);
              
              return (
                <View
                  key={image.id || image.uri || index}
                  style={styles.recentGridItem}
                >
                  <Image
                    source={{ uri: getUri(image) || image?.uri }}
                    style={styles.recentGridImage}
                    resizeMode="cover"
                  />
                  {/* 目录标签覆盖层 */}
                  <View style={styles.categoryOverlay}>
                    <Text style={styles.categoryName} numberOfLines={1}>
                      {directoryName}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  /**
   * 渲染FAB扫描按钮
   */
  const renderFAB = () => (
    <>
      {/* 扫描按钮 */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleScan}
        disabled={isScanning}
      >
        {isScanning ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.fabIcon}>🔄</Text>
        )}
      </TouchableOpacity>
      {showScanTip && (
        <View style={styles.scanTipContainer}>
          <Text style={styles.scanTipText}>为相册智能分类100张，在设置页面开通终身会员后，无限制</Text>
        </View>
      )}
    </>
  );

  // ==================== 主渲染 ====================

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>芯图相册</Text>
      </View>

      {/* 消息提示区 */}
      <View style={styles.messageBanner}>
        <Text style={styles.messageText}>{globalMessage}</Text>
        </View>

      {/* 主内容区 */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            enabled={!isScanning}
          />
        }
      >
        {renderCategoriesSection()}
        {showCityCategories && renderCitiesSection()}
        {showColorCategories && renderColorsSection()}
        {showDirectoryCategories && renderDirectoriesSection()}
        {showSimilarityGroups && renderSimilarityGroupsSection()}
        {showRecentPhotos && renderRecentPhotos()}
      </ScrollView>

      {/* FAB扫描按钮 */}
      {renderFAB()}
    </SafeAreaView>
  );
};

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  // 消息提示区样式
  messageBanner: {
    padding: 12,
    paddingTop: 8,
    paddingBottom: 8,
  },
  messageText: {
    fontSize: 12,
    color: '#666666',
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // 为FAB留出空间
  },
  
  // 区块样式
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 4, // 减小顶部间距，让内容更紧凑
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16, // 增加标题和卡片的间距
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
    // 注意：当 sectionTitle 在 sectionHeader 内部时，不需要额外的 padding
    // 当单独使用时，需要通过内联样式添加 paddingHorizontal: 16
  },
  countBadge: {
    backgroundColor: '#007AFF',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  toggleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 12,
  },
  toggleButtonText: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
  },
  sectionMore: {
    fontSize: 14,
    color: '#007AFF',
  },
  
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  
  // 分类卡片（4列网格布局）
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    gap: 4,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 16 - 12) / 4, // 4列: 总宽度 - 左右padding(8*2) - gap(4*3)
    aspectRatio: 1, // 正方形
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#F0F0F0',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',  // 垂直居中
    alignItems: 'center',      // 水平居中
  },
  emptyThumbnailText: {
    fontSize: 32,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  categoryOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 10,
    fontWeight: 'bold',
    color: 'white',
    flex: 1,
  },
  categoryCount: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 2,
  },
  
  // 相似组卡片
  similarityCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
  },
  similarityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  similaritySimilarity: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#AF52DE',
  },
  similarityThumbnails: {
    flexDirection: 'row',
    gap: 8,
  },
  similarityThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#E5E5EA',
  },
  similarityMore: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  similarityMoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8E8E93',
  },
  
  // 城市列表
  citiesList: {
    paddingHorizontal: 16,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  cityArrow: {
    fontSize: 18,
    color: '#8E8E93',
    marginRight: 8,
  },
  cityName: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  cityCount: {
    fontSize: 14,
    color: '#8E8E93',
  },
  
  // 最近照片网格
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 4,
  },
  recentGridItem: {
    width: (SCREEN_WIDTH - 40) / 3, // 3列布局
    height: (SCREEN_WIDTH - 40) / 3,
    position: 'relative', // 添加相对定位，用于覆盖层
  },
  recentGridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  
  // 扫描进度提示框
  scanProgressContainer: {
    position: 'absolute',
    right: 16,
    bottom: 150, // 在FAB按钮上方
    maxWidth: SCREEN_WIDTH - 80,
  },
  scanProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.2)',
  },
  scanProgressSpinner: {
    marginRight: 10,
  },
  scanProgressText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },

  // 扫描浮窗提示样式（贴近扫描按钮）
  scanTipContainer: {
    position: 'absolute',
    right: 16,
    bottom: 144, // 比按钮高出一些
    maxWidth: SCREEN_WIDTH - 80,
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scanTipText: {
    color: '#fff',
    fontSize: 12,
    lineHeight: 16,
  },
  
  // FAB按钮
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 80, // 避开底部Tab栏
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 24,
  },
  
  // 空数据状态样式
  emptyState: {
    paddingVertical: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
    opacity: 0.4,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#999999',
    textAlign: 'center',
    lineHeight: 18,
  },
});

export default HomeScreen;
