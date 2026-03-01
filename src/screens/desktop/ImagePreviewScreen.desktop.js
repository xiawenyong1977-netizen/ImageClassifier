import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { getDefaultPresets, getCameraSettingsCategoryTranslation, getOrientationNameTranslation } from '../../i18n';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Dimensions, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, Alert, logger, getUri, getLocalPath } from '../../adapters/WebAdapters';
import Toast from '../../components/shared/Toast';
import UnifiedDataService from '../../services/UnifiedDataService';
import WeChatAuthService from '../../services/WeChatAuthService';
import ImageClassifierService from '../../services/ImageClassifierService';
import configService from '../../services/ConfigService';
import cityLocationService from '../../services/CityLocationService';
import EnhanceResultScreen from './EnhanceResultScreen.desktop';

// Helper function to get category information
const getCategoryInfo = (categoryId) => {
  // 处理特殊分类 'NA'（未分类）
  if (categoryId === 'NA' || categoryId === null || categoryId === undefined) {
    return {
      name: i18n.t('imagePreview.uncategorizedCategory'),
      icon: '📷',
      color: '#607D8B'
    };
  }
  
  // 确保配置服务已加载
  if (!configService || !configService.isConfigLoaded()) {
    throw new Error('ConfigService not initialized or config not loaded');
  }
  
  const category = configService.getCategoryByKey(categoryId);
  if (!category) {
    // 如果找不到分类，返回默认值而不是抛出错误
    logger.warn(`⚠️ Category config not found: ${categoryId}, using default`);
    return {
      name: categoryId || i18n.t('imagePreview.unknownCategoryName'),
      icon: '📷',
      color: '#607D8B'
    };
  }
  
  // 根据当前语言设置获取分类名称
  const currentLang = i18n.language || 'zh';
  const language = currentLang === 'en' ? 'english' : 'chinese';
  
  return {
    name: category[language] || category.chinese || category.english || categoryId,
    icon: '📷', // 默认图标，因为用户说不需要图标
    color: '#607D8B' // 默认颜色
  };
};

// Helper function to get all categories for selection
const getAllCategories = () => {
  // 确保配置服务已加载
  if (!configService || !configService.isConfigLoaded()) {
    throw new Error('ConfigService not initialized or config not loaded');
  }
  
  // 获取当前语言设置
  const currentLang = i18n.language || 'zh';
  const language = currentLang === 'en' ? 'english' : 'chinese';
  
  return configService.getAllCategoriesWithUI()
    .filter(category => category.id !== 'tobecleaned') // 过滤掉tobecleaned分类
    .map(category => ({
      id: category.id,
      name: category[language] || category.chinese || category.english || category.id,
      icon: '📷', // 默认图标
      color: '#607D8B' // 默认颜色
    }));
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
/** 最小缩放 = 刚开始显示的比例（contain 适配），缩小到此为止 */
const IMAGE_ZOOM_MIN = 1;
const IMAGE_ZOOM_MAX = 4;

// 注意：已移除 getWebAccessibleUri，直接使用 getUri
// 由于 Electron 设置了 webSecurity: false，可以直接使用 file:// URI

const ImagePreviewScreen = ({ 
  route = {}, 
  navigation = {}, 
  imageId, 
  onBack, 
  onDataChange,
  // 🆕 统一使用 filterType 和 filterValue
  filterType = null,
  filterValue = null,
  // 向后兼容的旧参数（逐步废弃）
  category = null,
  city = null,
  similarityGroupId = null
}) => {
  const { t } = useTranslation('common');
  
  // 从URL参数获取参数
  const getParamsFromURL = () => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return {
        imageId: urlParams.get('imageId'),
        filterType: urlParams.get('filterType'),
        filterValue: urlParams.get('filterValue'),
        // 向后兼容
        category: urlParams.get('category'),
        city: urlParams.get('city'),
        similarityGroupId: urlParams.get('similarityGroupId')
      };
    }
    return {};
  };
  
  const urlParams = getParamsFromURL();
  
  // 🆕 统一使用 filterType 和 filterValue（优先从 props，然后从 URL，最后从旧参数推导）
  const finalFilterType = filterType || urlParams.filterType || (() => {
    if (similarityGroupId || urlParams.similarityGroupId) return 'similarityGroup';
    if (city || urlParams.city) return 'city';
    if (category || urlParams.category) return 'category';
    return null;
  })();
  
  const finalFilterValue = filterValue || urlParams.filterValue || (() => {
    if (finalFilterType === 'similarityGroup') return similarityGroupId || urlParams.similarityGroupId;
    if (finalFilterType === 'city') return city || urlParams.city;
    if (finalFilterType === 'category') return category || urlParams.category;
    return null;
  })();
  
  const finalImageId = imageId || route.params?.imageId || urlParams.imageId;
  const [currentImage, setCurrentImage] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 1 });
  const [loading, setLoading] = useState(true);
  const [isInStagingBox, setIsInStagingBox] = useState(false); // 跟踪图片是否在暂存箱
  const [toastMessage, setToastMessage] = useState(null);
  const [locationDetailString, setLocationDetailString] = useState(null); // 位置详细信息字符串
  
  // 导航相关状态
  const [categoryImages, setCategoryImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  
  // 照片创玩相关状态
  const [enhancePresets, setEnhancePresets] = useState({});
  
  // 操作区二级面板展开状态：null | 'category' | 'enhance'
  const [expandedAction, setExpandedAction] = useState(null);

  // 图片缩放与平移（滚轮缩放 + 鼠标拖拽）
  const [imageZoomScale, setImageZoomScale] = useState(1);
  const [imageTranslateX, setImageTranslateX] = useState(0);
  const [imageTranslateY, setImageTranslateY] = useState(0);
  const imageContentRef = useRef(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, translateX: 0, translateY: 0 });
  const imageZoomScaleRef = useRef(1);
  const imageTranslateXRef = useRef(0);
  const imageTranslateYRef = useRef(0);
  
  // 增强模态框状态
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [enhancePreset, setEnhancePreset] = useState(null);

  const [imageClassifierService] = useState(new ImageClassifierService());

  // 根据 finalImageId 从数据库中加载完整的图片信息
  useEffect(() => {
    const loadImageDetails = async () => {
      if (!finalImageId) {
        logger.error('没有图片ID，无法加载详情');
        setLoading(false);
        return;
      }

      try {
        logger.debug(`开始从数据库加载图片详情: ${finalImageId}`);
        setLoading(true);
        
        const fullImageDetails = await UnifiedDataService.readImageDetailsById(finalImageId);
        if (fullImageDetails) {
          logger.debug(`图片详情加载成功: ${finalImageId}`);
          logger.debug('图片数据结构调试:', {
            hasMobileNetV3: !!fullImageDetails.mobileNetV3Detections,
            mobileNetV3Type: typeof fullImageDetails.mobileNetV3Detections,
            mobileNetV3Value: fullImageDetails.mobileNetV3Detections,
            hasPredictions: !!fullImageDetails.mobileNetV3Detections?.predictions,
            predictionsLength: fullImageDetails.mobileNetV3Detections?.predictions?.length
          });
          setCurrentImage(fullImageDetails);
          
          // 检查图片是否在暂存箱
          const inStagingBox = await UnifiedDataService.isInStagingBox(finalImageId);
          setIsInStagingBox(inStagingBox);
          
          // 加载当前上下文的所有图片用于导航
          await loadContextImages(fullImageDetails);
        } else {
          logger.error(`图片详情加载失败: ${finalImageId}`);
          // 图片加载失败时，重置暂存箱状态
          setIsInStagingBox(false);
        }
      } catch (error) {
        logger.error(`加载图片详情异常: ${finalImageId}`, error);
        // 发生异常时，重置暂存箱状态
        setIsInStagingBox(false);
      } finally {
        setLoading(false);
      }
    };

    loadImageDetails();
  }, [finalImageId]);

  // 换图时重置缩放与平移
  useEffect(() => {
    setImageZoomScale(1);
    setImageTranslateX(0);
    setImageTranslateY(0);
    imageZoomScaleRef.current = 1;
    imageTranslateXRef.current = 0;
    imageTranslateYRef.current = 0;
  }, [currentImageIndex, currentImage?.id]);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0 || imageZoomScaleRef.current <= 1) return;
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      translateX: imageTranslateXRef.current,
      translateY: imageTranslateYRef.current,
    };
  }, []);

  const onMouseUp = useCallback(() => { isDraggingRef.current = false; }, []);
  const onMouseLeave = useCallback(() => { isDraggingRef.current = false; }, []);

  // 滚轮缩放：react-native-web 的 View 不暴露 onWheel，用 nativeID 取 DOM 并绑定
  // 切换图片后 DOM 可能稍晚更新，用 rAF + 重试确保绑到当前节点
  useEffect(() => {
    if (typeof window === 'undefined' || document == null) return;
    const id = 'image-zoom-content';
    let remove = null;
    let cancelled = false;
    let retryTimer = null;
    const bind = () => {
      const el = document.getElementById(id);
      if (cancelled || !el || typeof el.addEventListener !== 'function') return el;
      const onWheel = (e) => {
        e.preventDefault();
        const delta = -e.deltaY * 0.002;
        setImageZoomScale((s) => {
          const next = Math.max(IMAGE_ZOOM_MIN, Math.min(IMAGE_ZOOM_MAX, s + delta));
          imageZoomScaleRef.current = next;
          if (next <= 1) {
            imageTranslateXRef.current = 0;
            imageTranslateYRef.current = 0;
            setImageTranslateX(0);
            setImageTranslateY(0);
          }
          return next;
        });
      };
      el.addEventListener('wheel', onWheel, { passive: false });
      remove = () => el.removeEventListener('wheel', onWheel);
      return el;
    };
    requestAnimationFrame(() => {
      if (cancelled) return;
      if (bind()) return;
      retryTimer = setTimeout(() => { if (!cancelled) bind(); }, 50);
    });
    return () => {
      cancelled = true;
      if (retryTimer != null) clearTimeout(retryTimer);
      if (remove) remove();
    };
  }, [currentImageIndex]);

  // 拖拽时在 window 上监听 move/up/leave（鼠标会移出图片区域）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onMove = (e) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newX = dragStartRef.current.translateX + dx;
      const newY = dragStartRef.current.translateY + dy;
      imageTranslateXRef.current = newX;
      imageTranslateYRef.current = newY;
      setImageTranslateX(newX);
      setImageTranslateY(newY);
    };
    const onUp = () => { isDraggingRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mouseleave', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mouseleave', onUp);
    };
  }, []);

  // 根据 location_id 获取位置详细信息字符串
  useEffect(() => {
    const loadLocationDetailString = async () => {
      // currentImage.city 字段存储的是 location_id
      if (!currentImage || !currentImage.city || typeof currentImage.city !== 'string') {
        setLocationDetailString(null);
        return;
      }

      try {
        const currentLanguage = i18n.language || 'zh';
        const locationString = await cityLocationService.getLocationDetailString(currentImage.city, currentLanguage);
        setLocationDetailString(locationString);
      } catch (error) {
        logger.error('加载位置详情失败:', error);
        setLocationDetailString(null);
      }
    };

    loadLocationDetailString();
  }, [currentImage?.city, i18n.language]);

  // 🆕 加载当前上下文的所有图片（基于 filterType 和 filterValue）
  const loadContextImages = async (currentImageData) => {
    try {
      let images = [];
      let contextType = '';
      let contextValue = '';
      
      // 🆕 统一基于 filterType 和 filterValue 加载图片
      // 注意：暂存箱不需要 filterValue，需要优先判断
      if (finalFilterType === 'stagingBox') {
        images = await UnifiedDataService.getStagingBoxImages();
        contextType = '暂存箱';
        contextValue = 'StagingBox';
      } else if (!finalFilterType || !finalFilterValue) {
        // 如果没有 filterType，尝试从图片对象本身获取上下文信息
        if (currentImageData) {
          if (currentImageData.similarityGroupId) {
            const groupData = await UnifiedDataService.getSimilarityGroupImages(currentImageData.similarityGroupId);
            images = groupData.images || [];
            contextType = '相似组';
            contextValue = currentImageData.similarityGroupId;
          } else if (currentImageData.city) {
            images = await UnifiedDataService.readImagesByLocation(currentImageData.city, null);
            contextType = '城市';
            contextValue = currentImageData.city;
          } else if (currentImageData.category) {
            if (currentImageData.category === 'stagingBox') {
              images = await UnifiedDataService.getStagingBoxImages();
              contextType = '暂存箱';
              contextValue = 'StagingBox';
            } else {
              images = await UnifiedDataService.readImagesByCategory(currentImageData.category);
              contextType = '分类';
              contextValue = currentImageData.category;
            }
          } else {
            // 默认加载最近照片
            images = await UnifiedDataService.readRecentImages(50);
            contextType = '最近照片';
            contextValue = 'Home';
          }
        } else {
          // 没有图片数据，默认加载最近照片
          images = await UnifiedDataService.readRecentImages(50);
          contextType = '最近照片';
          contextValue = 'Home';
        }
      } else if (finalFilterType === 'similarityGroup') {
        const groupData = await UnifiedDataService.getSimilarityGroupImages(finalFilterValue);
        images = groupData.images || [];
        contextType = '相似组';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'city') {
        images = await UnifiedDataService.readImagesByLocation(finalFilterValue, null);
        contextType = '城市';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'category') {
        images = await UnifiedDataService.readImagesByCategory(finalFilterValue);
        contextType = '分类';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'directory') {
        images = await UnifiedDataService.readImagesByDirectory(finalFilterValue);
        contextType = '目录';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'color') {
        images = await UnifiedDataService.readImagesByColor(finalFilterValue);
        contextType = '颜色';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'format') {
        images = await UnifiedDataService.readImagesByFormat(finalFilterValue);
        contextType = '格式';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'resolution') {
        images = await UnifiedDataService.readImagesByResolution(finalFilterValue);
        contextType = '分辨率';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'orientation') {
        images = await UnifiedDataService.readImagesByOrientation(finalFilterValue);
        contextType = '方向';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'iso') {
        images = await UnifiedDataService.readImagesByFilter('iso', finalFilterValue);
        contextType = 'ISO';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'aperture') {
        images = await UnifiedDataService.readImagesByFilter('aperture', finalFilterValue);
        contextType = '光圈';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'shutter') {
        images = await UnifiedDataService.readImagesByFilter('shutter', finalFilterValue);
        contextType = '快门';
        contextValue = finalFilterValue;
      } else if (finalFilterType === 'focalLength') {
        images = await UnifiedDataService.readImagesByFilter('focalLength', finalFilterValue);
        contextType = '焦距';
        contextValue = finalFilterValue;
      } else {
        // 默认加载最近照片
        images = await UnifiedDataService.readRecentImages(50);
        contextType = '最近照片';
        contextValue = 'Home';
      }
      
      setCategoryImages(images);
      
      // 找到当前图片在上下文中的索引
      const currentIndex = images.findIndex(img => img.id === finalImageId);
      setCurrentImageIndex(currentIndex);
      logger.debug(`当前图片在${contextType} ${contextValue}中的索引: ${currentIndex}/${images.length - 1}`);
    } catch (error) {
      logger.error(`加载上下文图片失败:`, error);
      setCategoryImages([]);
      setCurrentImageIndex(-1);
    }
  };

  // 🆕 重新加载图片列表（基于 filterType 和 filterValue）
  const reloadImageList = async () => {
    try {
      logger.debug('🔄 重新加载图片列表...', { filterType: finalFilterType, filterValue: finalFilterValue });
      
      let updatedImages = [];
      
      // 🆕 统一基于 filterType 和 filterValue 重新加载
      // 注意：暂存箱不需要 filterValue，需要优先判断
      if (finalFilterType === 'stagingBox') {
        logger.debug('从暂存箱重新加载...');
        updatedImages = await UnifiedDataService.getStagingBoxImages();
      } else if (!finalFilterType || !finalFilterValue) {
        // 没有 filterType，默认加载最近照片
        logger.debug('从最近照片重新加载...');
        updatedImages = await UnifiedDataService.readRecentImages(50);
      } else if (finalFilterType === 'similarityGroup') {
        logger.debug('从相似组重新加载...');
        const groupData = await UnifiedDataService.getSimilarityGroupImages(finalFilterValue);
        updatedImages = groupData.images || [];
      } else if (finalFilterType === 'city') {
        logger.debug('从城市分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByLocation(finalFilterValue, null);
      } else if (finalFilterType === 'category') {
        logger.debug('从分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByCategory(finalFilterValue);
      } else if (finalFilterType === 'directory') {
        logger.debug('从目录重新加载...');
        updatedImages = await UnifiedDataService.readImagesByDirectory(finalFilterValue);
      } else if (finalFilterType === 'color') {
        logger.debug('从颜色重新加载...');
        updatedImages = await UnifiedDataService.readImagesByColor(finalFilterValue);
      } else if (finalFilterType === 'format') {
        logger.debug('从格式重新加载...');
        updatedImages = await UnifiedDataService.readImagesByFormat(finalFilterValue);
      } else if (finalFilterType === 'resolution') {
        logger.debug('从分辨率重新加载...');
        updatedImages = await UnifiedDataService.readImagesByResolution(finalFilterValue);
      } else if (finalFilterType === 'orientation') {
        logger.debug('从方向重新加载...');
        updatedImages = await UnifiedDataService.readImagesByOrientation(finalFilterValue);
      } else if (finalFilterType === 'iso') {
        logger.debug('从ISO分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByFilter('iso', finalFilterValue);
      } else if (finalFilterType === 'aperture') {
        logger.debug('从光圈分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByFilter('aperture', finalFilterValue);
      } else if (finalFilterType === 'shutter') {
        logger.debug('从快门分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByFilter('shutter', finalFilterValue);
      } else if (finalFilterType === 'focalLength') {
        logger.debug('从焦距分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByFilter('focalLength', finalFilterValue);
      } else {
        logger.warn('⚠️ 无法确定来源，无法重新加载');
        return false;
      }
      
      logger.debug(`✅ 重新加载完成，图片数：${categoryImages.length} → ${updatedImages.length}`);
      
      // 如果列表为空，返回上一页
      if (updatedImages.length === 0) {
        logger.debug('列表已空，返回上一页');
        Alert.alert(t('common.confirm'), t('imagePreview.noImagesInCategory'), [
          { text: t('common.confirm'), onPress: handleBack }
        ]);
        return false;
      }
      
      // 更新图片列表
      setCategoryImages(updatedImages);
      
      // 调整当前索引，显示下一张（如果可能）
      let newIndex = currentImageIndex;
      if (currentImageIndex >= updatedImages.length) {
        // 如果当前索引超出范围，跳到最后一张
        newIndex = updatedImages.length - 1;
        logger.debug(`索引超出范围，调整到最后一张：${newIndex}`);
      }
      
      // 加载新的图片详情
      setCurrentImageIndex(newIndex);
      const nextImage = updatedImages[newIndex];
      if (nextImage) {
        logger.debug(`自动切换到图片：索引${newIndex}，ID=${nextImage.id}`);
        const fullDetails = await UnifiedDataService.readImageDetailsById(nextImage.id);
        if (fullDetails) {
          setCurrentImage(fullDetails);
        }
      }
      
      return true;
    } catch (error) {
      logger.error('❌ 重新加载图片列表失败:', error);
      return false;
    }
  };

  // 获取图片尺寸
  useEffect(() => {
    if (currentImage) {
      // 从缓存/数据库中的 imageDimensions 字段读取
      if (currentImage.imageDimensions && 
          typeof currentImage.imageDimensions === 'object' &&
          currentImage.imageDimensions.width && 
          currentImage.imageDimensions.height) {
        logger.debug('从缓存读取图片尺寸:', currentImage.imageDimensions);
        setImageDimensions({
          width: currentImage.imageDimensions.width,
          height: currentImage.imageDimensions.height
        });
      } else {
        // 数据库中没有尺寸数据，记录错误以便发现问题
        logger.error('⚠️ 数据库缺少图片尺寸数据:', {
          imageId: currentImage.id,
          fileName: currentImage.fileName,
          uri: currentImage.uri,
          hasImageDimensions: !!currentImage.imageDimensions,
          imageDimensionsType: typeof currentImage.imageDimensions,
          imageDimensionsValue: currentImage.imageDimensions
        });
        setImageDimensions(null);
      }
    } else {
      setImageDimensions(null);
    }
  }, [currentImage]);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (loading) return; // 如果正在加载，忽略键盘事件
      
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          handlePreviousImage();
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleNextImage();
          break;
        case 'Escape':
          event.preventDefault();
          handleBack();
          break;
      }
    };

    // 添加键盘事件监听
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyPress);
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('keydown', handleKeyPress);
      }
    };
  }, [loading, currentImageIndex, categoryImages.length]);

  const handleBack = () => {
    // 使用传入的 onBack 回调，传递当前图片ID以便返回时定位
    if (onBack) {
      const currentImageId = currentImage?.id || finalImageId;
      onBack(currentImageId);
    }
  };

  // 导航到前一张图片
  const handlePreviousImage = async () => {
    if (currentImageIndex > 0 && categoryImages.length > 0) {
      const previousImage = categoryImages[currentImageIndex - 1];
      logger.debug(`导航到前一张图片: ${previousImage.id}`);
      
      try {
        setLoading(true);
        const fullImageDetails = await UnifiedDataService.readImageDetailsById(previousImage.id);
        if (fullImageDetails) {
          setCurrentImage(fullImageDetails);
          setCurrentImageIndex(currentImageIndex - 1);
          
          // 更新URL参数（如果支持）
          if (typeof window !== 'undefined' && window.history) {
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('imageId', previousImage.id);
            window.history.replaceState({}, '', newUrl.toString());
          }
        }
      } catch (error) {
        logger.error('加载前一张图片失败:', error);
        Alert.alert(t('common.error'), t('imagePreview.loadPreviousFailed'));
      } finally {
        setLoading(false);
      }
    }
  };

  // 导航到后一张图片
  const handleNextImage = async () => {
    if (currentImageIndex < categoryImages.length - 1 && categoryImages.length > 0) {
      const nextImage = categoryImages[currentImageIndex + 1];
      logger.debug(`导航到后一张图片: ${nextImage.id}`);
      
      try {
        setLoading(true);
        const fullImageDetails = await UnifiedDataService.readImageDetailsById(nextImage.id);
        if (fullImageDetails) {
          setCurrentImage(fullImageDetails);
          setCurrentImageIndex(currentImageIndex + 1);
          
          // 更新URL参数（如果支持）
          if (typeof window !== 'undefined' && window.history) {
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('imageId', nextImage.id);
            window.history.replaceState({}, '', newUrl.toString());
          }
        }
      } catch (error) {
        logger.error('加载后一张图片失败:', error);
        Alert.alert(t('common.error'), t('imagePreview.loadNextFailed'));
      } finally {
        setLoading(false);
      }
    }
  };

  // 删除图片（所有图片都可以删除）
  const handleDelete = () => {
    logger.debug('删除按钮被点击，currentImage:', currentImage);
    logger.debug('图片ID:', currentImage?.id);
    
    if (!currentImage || !currentImage.id) {
      logger.error('错误：currentImage 或 currentImage.id 不存在');
      Alert.alert(t('common.error'), t('imagePreview.imageInfoIncomplete'));
      return;
    }
    
    logger.debug('执行删除操作...');
    Alert.alert(
      t('category.batchDelete'),
      t('imagePreview.confirmDelete'),
      [
        { 
          text: t('common.cancel'), 
          style: 'cancel',
          onPress: () => logger.debug('用户取消删除')
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            logger.debug('用户确认删除，开始删除流程...');
            try {
              // 显示自定义进度对话框
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: 1 });
              
              logger.debug('调用deleteImage方法...');
              const result = await UnifiedDataService.writeDeleteImages([currentImage.id]);
              
              logger.debug('删除结果:', result);
              if (result.success) {
                logger.debug('删除成功，准备切换到下一张...');
                // 延迟关闭进度对话框，让用户看到最终结果
                setTimeout(async () => {
                  setShowDeleteProgress(false);
                  
                  // 重新加载图片列表并自动切换到下一张
                  // reloadImageList 会自动处理切换逻辑，如果列表为空会提示并返回
                  await reloadImageList();
                }, 1000);
              } else {
                logger.error('删除失败:', result.message);
                setShowDeleteProgress(false);
                Alert.alert(t('common.errorTitle'), result.message);
              }
            } catch (error) {
              setShowDeleteProgress(false);
              Alert.alert(t('common.errorTitle'), t('category.deleteFailed'));
            }
          },
        },
      ]
    );
  };

  // 添加到暂存箱（只在不在暂存箱时显示）
  const handleAddToStagingBox = async () => {
    if (!currentImage || !currentImage.id) {
      Alert.alert(t('common.error'), t('imagePreview.imageInfoIncomplete'));
      return;
    }
    logger.debug('添加到暂存箱...');
    try {
      const addResult = await UnifiedDataService.addToStagingBox([currentImage.id]);
      if (!addResult.success) {
        throw new Error(`添加到暂存箱失败: ${addResult.errors.map(e => e.error).join(', ')}`);
      }
      setIsInStagingBox(true);
      logger.debug('添加到暂存箱成功');
      await reloadImageList();
      if (onDataChange) onDataChange();
      setToastMessage(t('imagePreview.stagedMessage'));
    } catch (error) {
      logger.error('添加到暂存箱失败:', error);
      Alert.alert(t('common.error'), t('imagePreview.addToStagingBoxFailed', { error: error.message }));
    }
  };

  // 从暂存箱移除（只在暂存箱中时显示）
  const handleRemoveFromStagingBox = async () => {
    if (!currentImage || !currentImage.id) {
      Alert.alert(t('common.error'), t('imagePreview.imageInfoIncomplete'));
      return;
    }
    logger.debug('从暂存箱移除...');
    try {
      const removeResult = await UnifiedDataService.removeFromStagingBox([currentImage.id]);
      if (!removeResult.success) {
        const errorMessages = removeResult.errors?.map(e => e.error || e.message || t('common.error')).join(', ') || t('common.error');
        throw new Error(errorMessages);
      }
      setIsInStagingBox(false);
      logger.debug('从暂存箱移除成功');
      const reloadSuccess = await reloadImageList();
      if (reloadSuccess) {
        if (onDataChange) onDataChange();
        setToastMessage(t('imagePreview.removedFromStagingMessage'));
      }
    } catch (error) {
      logger.error('从暂存箱移除失败:', error);
      Alert.alert(t('common.error'), t('imagePreview.removeFromStagingBoxFailed', { error: error.message }));
    }
  };

  // 处理分类修改
  const handleCategoryChange = async (newCategory) => {
    if (newCategory === currentImage.category) {
      return; // 如果选择的是当前分类，不做任何操作
    }

    try {
      // 调试：检查currentImage是否包含检测结果
      logger.debug('修改分类前检查currentImage:');
      logger.debug('  - currentImage.idCardDetections:', currentImage.idCardDetections ? '存在' : '不存在');
      logger.debug('  - currentImage.generalDetections:', currentImage.generalDetections ? '存在' : '不存在');
      logger.debug('  - 检测结果详情:', {
        idCardDetections: currentImage.idCardDetections,
        generalDetections: currentImage.generalDetections
      });
      
      // 调试：修改分类前检查数据库中其他图片的检测结果
      logger.debug('修改分类前检查数据库中其他图片的检测结果...');
      const allImages = await UnifiedDataService.readAllImages();
      const otherImagesWithDetections = allImages.filter(img => 
        img.id !== currentImage.id && (img.idCardDetections || img.generalDetections)
      );
      logger.debug(`  - 数据库中其他图片有检测结果的数量: ${otherImagesWithDetections.length}`);
      
      // 使用专门的分类更新接口，只更新分类相关字段
      await UnifiedDataService.updateImagesCategory([currentImage.id], newCategory, 'manual');
      
      // 调试：修改分类后检查数据库中其他图片的检测结果
      logger.debug('修改分类后检查数据库中其他图片的检测结果...');
      const allImagesAfter = await UnifiedDataService.readAllImages();
      const otherImagesWithDetectionsAfter = allImagesAfter.filter(img => 
        img.id !== currentImage.id && (img.idCardDetections || img.generalDetections)
      );
      logger.debug(`  - 数据库中其他图片有检测结果的数量: ${otherImagesWithDetectionsAfter.length}`);
      // 更新本地状态，将置信度设置为"人工"
      setCurrentImage(prev => ({ 
        ...prev, 
        category: newCategory,
        confidence: 'manual' // 标记为人工分类
      }));
      logger.debug(`图片分类已修改为: ${getCategoryInfo(newCategory).name} (人工分类)`);
      
      // 重新加载图片列表（如果是从分类页进入的）
      if (category && category !== newCategory) {
        logger.debug('分类已改变，重新加载图片列表');
        await reloadImageList();
      }
      
      // 通知父组件数据已变化
      if (onDataChange) {
        onDataChange();
      }
      
      // 关闭分类选择面板
      setExpandedAction(null);
    } catch (error) {
      logger.error('修改分类失败:', error);
      Alert.alert(t('common.error'), t('imagePreview.changeCategoryFailed'));
    }
  };

  // 构建文件路径列表
  const buildFilePathList = useCallback((images) => {
    const filePaths = [];
    for (const image of images) {
      const imagePath = getLocalPath(image);
      if (!imagePath) {
        logger.error('⚠️ 数据库缺少图片本地路径:', {
          imageId: image?.id,
          fileName: image?.fileName,
          uri: image?.uri,
          hasPath: !!image?.path
        });
        continue;
      }
      filePaths.push(imagePath);
    }
    return filePaths;
  }, []);

  // 复制文件路径到剪贴板
  const copyFilePathsToClipboard = useCallback(async (filePaths, { successTitle, successMessage }) => {
    if (typeof window === 'undefined' || !window.require) {
      Alert.alert(t('common.error'), t('imagePreview.currentEnvNotSupportCopy'));
      return { success: false };
    }

    const { ipcRenderer } = window.require('electron');

    return new Promise((resolve) => {
      ipcRenderer.once('copy-files-result', (event, result) => {
        if (result.success) {
          Alert.alert(successTitle, successMessage(result));
        } else {
          Alert.alert(t('common.failed'), t('imagePreview.copyFailedError', { error: result.error }));
        }
        resolve(result);
      });
      ipcRenderer.send('copy-files-to-clipboard', filePaths);
    });
  }, []);

  // 复制当前图片到剪贴板
  const handleCopyToClipboard = useCallback(async () => {
    if (!currentImage) {
      Alert.alert(t('common.error'), t('imagePreview.imageInfoIncomplete'));
      return;
    }

    try {
      const filePaths = buildFilePathList([currentImage]);

      if (filePaths.length === 0) {
        Alert.alert(t('common.error'), t('imagePreview.noValidImagePath'));
        return;
      }

      await copyFilePathsToClipboard(filePaths, {
        successTitle: t('category.copySuccess'),
        successMessage: () => t('imagePreview.copyToClipboardSuccess')
      });
    } catch (error) {
      logger.error('复制文件到剪贴板失败:', error);
      Alert.alert(t('common.errorTitle'), t('imagePreview.copyFailedError', { error: error.message }));
    }
  }, [currentImage, buildFilePathList, copyFilePathsToClipboard]);

  // 复制当前图片到文件管理器
  const handleCopyToFileManager = useCallback(async () => {
    if (!currentImage) {
      Alert.alert(t('common.error'), t('imagePreview.imageInfoIncomplete'));
      return;
    }

    try {
      const filePaths = buildFilePathList([currentImage]);

      if (filePaths.length === 0) {
        Alert.alert(t('common.error'), t('imagePreview.noValidImagePath'));
        return;
      }

      await copyFilePathsToClipboard(filePaths, {
        successTitle: t('category.copySuccess'),
        successMessage: () => t('imagePreview.copyToFileManagerSuccess')
      });
    } catch (error) {
      logger.error('复制文件路径失败:', error);
      Alert.alert(t('common.errorTitle'), t('imagePreview.copyFailedError', { error: error.message }));
    }
  }, [currentImage, buildFilePathList, copyFilePathsToClipboard]);

  /**
   * 打开照片创玩面板
   */
  const openEnhancePanel = async () => {
    try {
      // 如果已经展开，则关闭
      if (expandedAction === 'enhance') {
        setExpandedAction(null);
        return;
      }
      
      // 加载增强方案
      const settings = await UnifiedDataService.readSettings();
      const presets = settings?.aiEnhancePresets || {};
      setEnhancePresets(presets);
      
      // 展开增强面板
      setExpandedAction('enhance');
    } catch (error) {
      logger.error('加载增强方案失败:', error);
      Alert.alert(t('common.error'), t('imagePreview.loadEnhancePresetsFailed'));
    }
  };

  /**
   * 打开分类选择器
   */
  const openCategorySelector = () => {
    // 如果已经展开，则关闭
    if (expandedAction === 'category') {
      setExpandedAction(null);
      return;
    }
    
    // 展开分类面板
    setExpandedAction('category');
  };

  /**
   * 点击增强方案：打开增强模态框
   */
  const handleEnhancePresetPress = async (presetId) => {
    try {
      if (!currentImage || !currentImage.id) {
        Alert.alert(t('common.errorTitle'), t('imagePreview.imageInfoIncomplete'));
        return;
      }
      
      const imageUri = getUri(currentImage);
      if (!imageUri) {
        Alert.alert(t('common.errorTitle'), t('imagePreview.cannotGetImageUriError'));
        return;
      }
      
      // 🔥 在打开模态框前检查额度
      const count = 1; // 单张图片
      
      try {
        const credits = await WeChatAuthService.getCredits();
        if (!credits || typeof credits.remaining !== 'number') {
          Alert.alert(
            t('common.error'),
            t('imagePreview.cannotCheckCredits') || t('category.getCreditsFailed')
          );
          return; // 不打开模态框
        }

        // 如果用户未关注公众号，跳过额度检查，直接打开模态框
        if (credits.isFollowed === false) {
          setEnhancePreset(presetId);
          setExpandedAction(null);
          setShowEnhanceModal(true);
          return;
        }
        
        // 已关注公众号，进行额度检查
        if (credits.remaining < count) {
          Alert.alert(
            t('imagePreview.insufficientCreditsTitle') || t('common.tip'),
            t('category.insufficientCreditsMessageFollowWeChat', { remaining: credits.remaining, count })
          );
          return; // 不打开模态框
        }

        // 额度充足，弹出二次确认
        Alert.alert(
          t('imagePreview.confirmTitle') || t('common.confirm'),
          t('imagePreview.enhanceConfirmMessage', { count, remaining: credits.remaining }) ||
          t('category.enhanceConfirmMessage', { count, remaining: credits.remaining }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('common.confirm'),
              style: 'default',
              onPress: () => {
                // 确认后才打开模态框
                setEnhancePreset(presetId);
                setExpandedAction(null);
                setShowEnhanceModal(true);
              }
            }
          ]
        );
      } catch (error) {
        logger.error('检查额度失败:', error);
        Alert.alert(
          t('common.error'),
          t('imagePreview.cannotCheckCredits') || t('category.getCreditsFailed')
        );
        return; // 不打开模态框
      }
    } catch (error) {
      logger.error('增强检查失败:', error);
      Alert.alert(t('common.errorTitle'), error.message || t('common.failed'));
    }
  };

  /**
   * 关闭增强模态框
   */
  const handleCloseEnhanceModal = (hasSaved = false) => {
    setShowEnhanceModal(false);
    setEnhancePreset(null);
    
    // 如果有保存操作，通知父组件数据已变化
    if (hasSaved && onDataChange) {
      onDataChange();
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN');
  };

  // 获取文件名
  const getDisplayFileName = () => {
    // 使用数据库中的 fileName 字段
    if (currentImage.fileName) {
      return currentImage.fileName;
    }
    
    // 数据库中没有 fileName 数据，记录错误以便发现问题
    logger.error('⚠️ 数据库缺少图片文件名数据:', {
      imageId: currentImage.id,
      uri: currentImage.uri,
      hasFileName: !!currentImage.fileName,
      fileNameValue: currentImage.fileName
    });
    
    // 返回默认值，而不是从路径提取（暴露数据问题）
    return i18n.t('imagePreview.unknownFileName');
  };

  // 显示加载状态
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {/* 顶部导航栏 */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {t('imagePreview.loading')}
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t('imagePreview.loadingImageDetails')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentImage) {
    return (
      <SafeAreaView style={styles.container}>
        {/* 顶部导航栏 */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}>
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {t('imagePreview.imageNotFound')}
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('imagePreview.imageNotFound')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {(() => {
            const fileName = getDisplayFileName();
            let categoryText = '';
            
            // 确定分类文本
            const currentLang = i18n.language || 'zh';
            const language = currentLang === 'en' ? 'english' : 'chinese';
            
            if (finalFilterType === 'similarityGroup') {
              categoryText = t('imagePreview.similarGroup');
            } else if (finalFilterType === 'city') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'color') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'directory') {
              categoryText = finalFilterValue ? finalFilterValue.split('/').pop() : '';
            } else if (finalFilterType === 'category') {
              // 使用configService直接获取对应语言的分类名称
              if (configService && configService.isConfigLoaded()) {
                categoryText = configService.getCategoryDisplayName(finalFilterValue, language) || '';
              } else {
                categoryText = finalFilterValue || '';
              }
            } else if (finalFilterType === 'format') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'resolution') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'orientation') {
              categoryText = getOrientationNameTranslation(finalFilterValue, currentLang) || '';
            } else if (finalFilterType === 'iso') {
              categoryText = getCameraSettingsCategoryTranslation('iso', finalFilterValue, currentLang);
            } else if (finalFilterType === 'aperture') {
              categoryText = getCameraSettingsCategoryTranslation('aperture', finalFilterValue, currentLang);
            } else if (finalFilterType === 'shutter') {
              categoryText = getCameraSettingsCategoryTranslation('shutter', finalFilterValue, currentLang);
            } else if (finalFilterType === 'focalLength') {
              categoryText = getCameraSettingsCategoryTranslation('focalLength', finalFilterValue, currentLang);
            } else if (finalFilterType === 'stagingBox') {
              categoryText = t('imagePreview.stagingBox');
            }
            
            // 构建标题：文件名（序号/总数）-当前分类
            if (categoryImages.length > 0 && currentImageIndex >= 0) {
              const indexText = `(${currentImageIndex + 1}/${categoryImages.length})`;
              if (categoryText) {
                return `${fileName} ${indexText} - ${categoryText}`;
              } else {
                return `${fileName} ${indexText}`;
              }
            } else {
              return fileName;
            }
          })()}
        </Text>
        {/* 顶部操作栏已移除，所有操作都在底部操作栏 */}
      </View>

      {/* 主内容区域 - 使用Flex布局，避免滚动条 */}
      <View style={styles.mainContent}>
        {/* 图片和信息区域 */}
        <View style={styles.contentRow}>
          {/* 左侧区域：图片和分类选择器 */}
          <View style={styles.leftPanel}>
            {/* 图片显示区域 */}
            <View style={styles.imageContainer}>
              {/* 左侧导航按钮 */}
              {currentImageIndex > 0 && categoryImages.length > 0 && (
                <TouchableOpacity
                  style={styles.navButtonLeft}
                  onPress={handlePreviousImage}
                  disabled={loading}
                >
                  <Text style={styles.navButtonText}>‹</Text>
                </TouchableOpacity>
              )}
              
              {/* 图片内容 */}
              <View
                ref={imageContentRef}
                nativeID="image-zoom-content"
                style={styles.imageContent}
                onMouseDown={onMouseDown}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseLeave}
              >
                {(() => {
                  const imageUri = getUri(currentImage);
                  return imageUri ? (
                    <View style={styles.imageContentClip}>
                      <View style={[styles.imageTransformWrap, {
                        transform: [
                          { scale: imageZoomScale },
                          { translateX: imageTranslateX },
                          { translateY: imageTranslateY },
                        ],
                      }]}>
                        <Image
                        source={{ uri: imageUri }}
                        style={styles.image}
                        resizeMode="contain"
                        onError={(error) => {
                          logger.error('Image load error:', error.nativeEvent?.error);
                        }}
                        onLoad={() => {
                          logger.debug('Image loaded successfully');
                        }}
                      />
                    </View>
                    </View>
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderText}>📷</Text>
                      <Text style={styles.placeholderFileName}>
                        {currentImage.fileName || t('imagePreview.imagePreviewPlaceholder')}
                      </Text>
                      <Text style={styles.placeholderSubtext}>
                        {getUri(currentImage) ? t('imagePreview.localFile') : t('imagePreview.noPreviewAvailable')}
                      </Text>
                    </View>
                  );
                })()}
              </View>
              
              {/* 右侧导航按钮 */}
              {currentImageIndex < categoryImages.length - 1 && categoryImages.length > 0 && (
                <TouchableOpacity
                  style={styles.navButtonRight}
                  onPress={handleNextImage}
                  disabled={loading}
                >
                  <Text style={styles.navButtonText}>›</Text>
                </TouchableOpacity>
              )}

              {/* Toast：在图片显示区内底部居中 */}
              {toastMessage ? (
                <Toast message={toastMessage} onDone={() => setToastMessage(null)} placement="bottom" />
              ) : null}
            </View>

          {/* 操作区 */}
          <View style={styles.actionBar}>
            {/* 删除按钮（所有图片都可以删除） */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDelete}>
              <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>🗑️ {t('common.delete')}</Text>
            </TouchableOpacity>
            
            {/* 暂存按钮（只在不在暂存箱时显示） */}
            {!isInStagingBox && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleAddToStagingBox}>
                <Text style={styles.actionButtonText}>📦 {t('imagePreview.stage')}</Text>
              </TouchableOpacity>
            )}
            
            {/* 从暂存箱移除按钮（只在暂存箱中时显示） */}
            {isInStagingBox && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleRemoveFromStagingBox}>
                <Text style={styles.actionButtonText}>➡️ {t('imagePreview.remove')}</Text>
              </TouchableOpacity>
            )}
            
            {/* 设置分类按钮（所有图片都可以设置分类） */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                expandedAction === 'category' && styles.actionButtonActive
              ]}
              onPress={openCategorySelector}>
              <Text style={styles.actionButtonText}>🏷️ {t('imagePreview.category')}</Text>
            </TouchableOpacity>
            
            {/* 照片创玩按钮（所有图片都可以创玩） */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                expandedAction === 'enhance' && styles.actionButtonActive
              ]}
              onPress={openEnhancePanel}>
              <Text style={styles.actionButtonText}>✨ {t('imagePreview.enhance')}</Text>
            </TouchableOpacity>
            
            {/* 复制到剪贴板 */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCopyToClipboard}>
              <Text style={styles.actionButtonText}>📋 {t('imagePreview.copyContent')}</Text>
            </TouchableOpacity>
            
            {/* 复制到文件管理器 */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCopyToFileManager}>
              <Text style={styles.actionButtonText}>📂 {t('imagePreview.copyFile')}</Text>
            </TouchableOpacity>
          </View>

          {/* 二级选项面板 */}
          {expandedAction === 'category' && (
            <View style={styles.secondaryPanel}>
              <View style={styles.secondaryPanelTitle}>
                <Text style={styles.secondaryPanelTitleText}>{t('imagePreview.selectCategory')}</Text>
              </View>
              <View style={styles.secondaryPanelContent}>
                <View style={styles.categoryGrid}>
                  {getAllCategories().map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      style={[
                        styles.categoryItem,
                        currentImage.category === category.id && styles.selectedCategory
                      ]}
                      onPress={() => handleCategoryChange(category.id)}
                    >
                      <Text style={styles.categoryIcon}>{category.icon}</Text>
                      <Text style={styles.categoryName}>{category.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}

          {expandedAction === 'enhance' && (
            <View style={styles.secondaryPanel}>
              <View style={styles.secondaryPanelTitle}>
                <Text style={styles.secondaryPanelTitleText}>{t('imagePreview.selectEnhancePreset')}</Text>
              </View>
              <View style={styles.secondaryPanelContent}>
                <View style={styles.enhanceGrid}>
                  {Object.entries(enhancePresets)
                    .sort(([, a], [, b]) => (a?.sortOrder || 0) - (b?.sortOrder || 0))
                    .map(([presetId, preset]) => {
                      // 获取当前语言的默认预设翻译
                      const currentLang = i18n.language || 'zh';
                      const defaultPresets = getDefaultPresets(currentLang);
                      const zhDefaults = getDefaultPresets('zh');
                      const enDefaults = getDefaultPresets('en');
                      
                      // 判断是否是默认预设（通过比较名称是否等于中文或英文的默认值）
                      const defaultPreset = defaultPresets[presetId];
                      const isDefaultName = defaultPreset && (
                        preset.name === zhDefaults[presetId]?.name ||
                        preset.name === enDefaults[presetId]?.name
                      );
                      
                      // 如果是默认预设，使用当前语言的翻译；否则使用用户自定义的名称
                      const displayName = (defaultPreset && isDefaultName) 
                        ? defaultPreset.name 
                        : (preset.name || presetId);
                      
                      return (
                        <TouchableOpacity
                          key={presetId}
                          style={styles.enhancePresetItem}
                          onPress={() => handleEnhancePresetPress(presetId)}
                        >
                          <Text style={styles.enhancePresetName} numberOfLines={1}>
                            {displayName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                </View>
              </View>
            </View>
          )}
          </View>
          
          {/* 图片信息区域 - 右侧固定宽度 */}
          <View style={styles.infoPanel}>
            <Text style={styles.infoPanelTitle}>{t('imagePreview.fileInfo')}</Text>
            
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('imagePreview.takenTime')}:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.takenAt ? formatDate(currentImage.takenAt) : t('imagePreview.unknown')}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('imagePreview.fileTime')}:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.timestamp ? formatDate(currentImage.timestamp) : t('imagePreview.unknown')}
                </Text>
              </View>

              {/* 位置信息 */}
              {currentImage.latitude && currentImage.longitude && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t('imagePreview.gpsCoordinates')}:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.latitude.toFixed(6)}, {currentImage.longitude.toFixed(6)}
                    </Text>
                  </View>
                  
                  {/* 使用 getLocationDetailString 接口获取并显示位置信息 */}
                  {locationDetailString ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('imagePreview.shootingCity')}:</Text>
                      <Text style={styles.infoValue}>
                        {locationDetailString}
                      </Text>
                    </View>
                  ) : currentImage.city ? (
                    // 如果位置详情加载失败，显示 location_id 作为后备
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('imagePreview.shootingCity')}:</Text>
                      <Text style={styles.infoValue}>
                        {currentImage.city}
                        {currentImage.province && `, ${currentImage.province}`}
                      </Text>
                    </View>
                  ) : null}
                  
                  {currentImage.altitude && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('imagePreview.altitude')}:</Text>
                      <Text style={styles.infoValue}>
                        {currentImage.altitude}m
                      </Text>
                    </View>
                  )}
                  
                  {currentImage.accuracy && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>{t('imagePreview.gpsAccuracy')}:</Text>
                      <Text style={styles.infoValue}>
                        ±{currentImage.accuracy}m
                      </Text>
                    </View>
                  )}
                </>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('imagePreview.dimensions')}:</Text>
                <Text style={styles.infoValue}>
                  {imageDimensions ? 
                    `${imageDimensions.width} × ${imageDimensions.height}` : 
                    t('common.loading')
                  }
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t('imagePreview.fileSize')}:</Text>
                <Text style={styles.infoValue}>
                  {formatFileSize(currentImage.size || 0)}
                </Text>
              </View>

              {/* 拍摄参数信息 */}
              {(() => {
                // 🔍 调试信息：检查拍摄参数数据
                const hasCameraSettings = !!currentImage.cameraSettings;
                
                // 解析 cameraSettings：可能是字符串（JSON）或对象
                let cameraSettingsData = {};
                if (currentImage.cameraSettings) {
                  if (typeof currentImage.cameraSettings === 'string') {
                    try {
                      cameraSettingsData = JSON.parse(currentImage.cameraSettings);
                    } catch (e) {
                      logger.error('📷 [拍摄参数] 解析 cameraSettings JSON 失败:', e);
                      cameraSettingsData = {};
                    }
                  } else if (typeof currentImage.cameraSettings === 'object') {
                    cameraSettingsData = currentImage.cameraSettings;
                  }
                }
                
                const hasISOCategory = !!currentImage.isoCategory;
                const hasApertureCategory = !!currentImage.apertureCategory;
                const hasShutterCategory = !!currentImage.shutterCategory;
                const hasFocalLengthCategory = !!currentImage.focalLengthCategory;
                
                const shouldShowCameraSettings = hasCameraSettings && (
                  cameraSettingsData.iso || 
                  cameraSettingsData.aperture || 
                  cameraSettingsData.shutterSpeed || 
                  cameraSettingsData.focalLength
                ) || hasISOCategory || hasApertureCategory || hasShutterCategory || hasFocalLengthCategory;
                
                logger.debug('📷 [拍摄参数调试]', {
                  hasCameraSettings,
                  cameraSettingsRaw: currentImage.cameraSettings,
                  cameraSettingsType: typeof currentImage.cameraSettings,
                  cameraSettingsParsed: cameraSettingsData,
                  hasISOCategory,
                  isoCategory: currentImage.isoCategory,
                  hasApertureCategory,
                  apertureCategory: currentImage.apertureCategory,
                  hasShutterCategory,
                  shutterCategory: currentImage.shutterCategory,
                  hasFocalLengthCategory,
                  focalLengthCategory: currentImage.focalLengthCategory,
                  shouldShowCameraSettings,
                  imageId: currentImage.id,
                  fileName: currentImage.fileName
                });
                
                if (!shouldShowCameraSettings) {
                  return null;
                }
                
                return (
                  <>
                    {cameraSettingsData.iso && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>📷 ISO:</Text>
                        <Text style={styles.infoValue}>
                          {cameraSettingsData.iso}
                          {currentImage.isoCategory && ` (${getCameraSettingsCategoryTranslation('iso', currentImage.isoCategory)})`}
                        </Text>
                      </View>
                    )}
                    
                    {cameraSettingsData.aperture && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>📷 {t('imagePreview.aperture')}:</Text>
                        <Text style={styles.infoValue}>
                          f/{cameraSettingsData.aperture}
                          {currentImage.apertureCategory && ` (${getCameraSettingsCategoryTranslation('aperture', currentImage.apertureCategory)})`}
                        </Text>
                      </View>
                    )}
                    
                    {cameraSettingsData.shutterSpeed && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>📷 {t('imagePreview.shutterSpeed')}:</Text>
                        <Text style={styles.infoValue}>
                          {cameraSettingsData.shutterSpeed >= 1
                            ? `${cameraSettingsData.shutterSpeed}s`
                            : `1/${Math.round(1 / cameraSettingsData.shutterSpeed)}s`}
                          {currentImage.shutterCategory && ` (${getCameraSettingsCategoryTranslation('shutter', currentImage.shutterCategory)})`}
                        </Text>
                      </View>
                    )}
                    
                    {cameraSettingsData.focalLength && (
                      <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>📷 {t('imagePreview.focalLength')}:</Text>
                        <Text style={styles.infoValue}>
                          {cameraSettingsData.focalLength}mm
                          {currentImage.focalLengthCategory && ` (${getCameraSettingsCategoryTranslation('focalLength', currentImage.focalLengthCategory)})`}
                        </Text>
                      </View>
                    )}
                  </>
                );
              })()}

              {/* AI 描述信息 - 独立显示，即使没有检测结果也显示 */}
              {currentImage.message && currentImage.message !== i18n.t('imagePreview.classificationComplete') && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>🤖 {t('imagePreview.aiDescription')}:</Text>
                  <Text style={styles.infoValue}>
                    {currentImage.message}
                  </Text>
                </View>
              )}

              {/* 检测结果显示 */}
              {(currentImage.idCardDetections && currentImage.idCardDetections.length > 0) ||
               (currentImage.generalDetections && currentImage.generalDetections.length > 0) ||
               (currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0) ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🔍 {t('imagePreview.detectionResult')}:</Text>
                    <Text style={styles.infoValue}>
                      {`${((currentImage.idCardDetections?.length || 0) + (currentImage.generalDetections?.length || 0) + (currentImage.mobileNetV3Detections?.predictions?.length || 0))}${t('imagePreview.objects')}`}
                    </Text>
                  </View>

                  {/* 身份证检测结果 */}
                  {currentImage.idCardDetections && currentImage.idCardDetections.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🆔 {t('imagePreview.idCardDetection')}:</Text>
                      {currentImage.idCardDetections.map((detection, index) => (
                        <View key={index} style={styles.detectionItem}>
                          <Text style={styles.detectionText}>
                            {detection.class === 'id_card_front' ? t('imagePreview.idCardFront') : t('imagePreview.idCardBack')}
                            ({(detection.confidence * 100).toFixed(1)}%)
                          </Text>
                          {detection.bbox && (
                            <Text style={styles.bboxText}>
                              {t('imagePreview.position')}: [{detection.bbox.map(v => v.toFixed(2)).join(', ')}]
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 通用物体检测结果 */}
                  {currentImage.generalDetections && currentImage.generalDetections.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🌐 {t('imagePreview.generalDetection')}:</Text>
                      {currentImage.generalDetections.slice(0, 5).map((detection, index) => {
                        // 获取类别名称，根据当前语言动态选择
                        const objectInfo = configService.getYoloObjectById(detection.classId);
                        const currentLang = i18n.language || 'zh';
                        const language = currentLang === 'en' ? 'english' : 'chinese';
                        const className = objectInfo 
                          ? (objectInfo[language] || objectInfo.chinese || objectInfo.english || `Class ${detection.classId}`)
                          : `Class ${detection.classId}`;
                        
                        return (
                          <View key={index} style={styles.detectionItem}>
                            <Text style={styles.detectionText}>
                              {className} ({(detection.confidence * 100).toFixed(1)}%)
                            </Text>
                            {detection.bbox && (
                              <Text style={styles.bboxText}>
                                {t('imagePreview.position')}: [{detection.bbox.map(v => v.toFixed(2)).join(', ')}]
                              </Text>
                            )}
                          </View>
                        );
                      })}
                      {currentImage.generalDetections.length > 5 && (
                        <Text style={styles.detectionMore}>
                          ... {t('imagePreview.moreObjects', { count: currentImage.generalDetections.length - 5 })}
                        </Text>
                      )}
                    </View>
                  )}

                  {/* MobileNetV3 分类结果 */}
                  {currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🧠 {t('imagePreview.mobileNetDetection')}:</Text>
                      {currentImage.mobileNetV3Detections.predictions.slice(0, 5).map((prediction, index) => {
                        // 根据当前语言获取MobileNetV3分类名称
                        const mobileNetV3ClassInfo = configService?.getMobileNetV3ClassByEnglishName(prediction.class);
                        const currentLang = i18n.language || 'zh';
                        const language = currentLang === 'en' ? 'english' : 'chinese';
                        const displayName = mobileNetV3ClassInfo ? (mobileNetV3ClassInfo[language] || mobileNetV3ClassInfo.chinese || mobileNetV3ClassInfo.english || prediction.class) : prediction.class;
                        
                        return (
                          <View key={index} style={styles.detectionItem}>
                            <Text style={styles.detectionText}>
                              {displayName} ({(prediction.probability * 100).toFixed(1)}%)
                            </Text>
                          </View>
                        );
                      })}
                      {currentImage.mobileNetV3Detections.predictions.length > 5 && (
                        <Text style={styles.detectionMore}>
                          ... {t('imagePreview.moreClassifications', { count: currentImage.mobileNetV3Detections.predictions.length - 5 })}
                        </Text>
                      )}
                    </View>
                  )}
                </>
              ) : null}
            </View>

            {/* GPS位置信息 */}
            {currentImage.location && (
              <View style={styles.infoSection}>
                <Text style={styles.sectionTitle}>{t('imagePreview.locationInfo')}</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📍 {t('imagePreview.location')}:</Text>
                  <Text style={styles.infoValue}>
                    {currentImage.location.latitude && currentImage.location.longitude ? 
                      `${currentImage.location.latitude.toFixed(6)}, ${currentImage.location.longitude.toFixed(6)}` : 
                      t('imagePreview.noGpsInfo')
                    }
                  </Text>
                </View>
                
                {currentImage.location.altitude && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🏔️ {t('imagePreview.altitudeLabel')}:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.altitude.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.accuracy && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🎯 {t('imagePreview.accuracyLabel')}:</Text>
                    <Text style={styles.infoValue}>
                      ±{currentImage.location.accuracy.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.source && currentImage.location.source !== 'none' && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📡 {t('imagePreview.sourceLabel')}:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.source === 'exif' ? t('imagePreview.exifData') : 
                       currentImage.location.source === 'mediastore' ? t('imagePreview.mediastore') : 
                       currentImage.location.source || t('imagePreview.unknownSource')}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>{t('imagePreview.filePath')}</Text>
              <Text style={styles.filePath}>
                {(() => {
                  const localPath = getLocalPath(currentImage);
                  if (localPath) {
                    return localPath;
                  }
                  // 降级：从 URI 中提取路径
                  const imageUri = getUri(currentImage);
                  if (imageUri && imageUri.startsWith('file://')) {
                    return imageUri.replace('file:///', '').replace('file://', '');
                  }
                  return imageUri || t('imagePreview.unknown');
                })()}
              </Text>
            </View>
          </View>
          
        </View>
      </View>

      {/* 删除进度对话框 */}
      <Modal
        visible={showDeleteProgress}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteProgress(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{t('imagePreview.deleting')}</Text>
            <Text style={styles.modalMessage}>
              {t('imagePreview.deletedFiles', { deleted: deleteProgress.filesDeleted })}{'\n'}
              {t('imagePreview.failedFiles', { failed: deleteProgress.filesFailed })}{'\n'}
              {t('imagePreview.totalFiles', { total: deleteProgress.total })}
            </Text>
            <ActivityIndicator size="small" color="#2196F3" style={styles.modalIndicator} />
          </View>
        </View>
      </Modal>

      {/* AI 图像增强模态框 */}
      {showEnhanceModal && enhancePreset && (
        <EnhanceResultScreen
          visible={showEnhanceModal}
          onClose={handleCloseEnhanceModal}
          preset={enhancePreset}
          availablePresets={enhancePresets}
          selectedImages={[currentImage]}
          initialIndex={0}
          categoryImages={categoryImages}
          allImages={categoryImages}
          onDataChange={onDataChange}
          isInStagingBox={isInStagingBox}
        />
      )}

    </SafeAreaView>
  );
};

// EnhanceModal 已移至 EnhanceResultScreen.desktop.js

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    height: 60, // 固定高度
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backIcon: {
    fontSize: 24,
    color: '#333',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  imageCounter: {
    fontSize: 14,
    fontWeight: '400',
    color: '#666',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  deleteButtonDanger: {
    color: '#ff4444',  // 红色 - 删除（tobecleaned）
  },
  deleteButtonPrimary: {
    color: '#007AFF',  // 蓝色 - 暂存（其他分类）
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerActionButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActionButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
  // 主内容区域 - 使用Flex布局，避免滚动条
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  // 图片和信息行布局
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0, // 确保可以收缩
  },
  // 左侧区域：图片和分类选择器
  leftPanel: {
    flex: 1,
    flexDirection: 'column',
  },
  imageContainer: {
    flex: 1, // 占据剩余空间
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400, // 增加最小高度
    position: 'relative', // 为导航按钮定位
  },
  imageContent: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContentClip: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imageTransformWrap: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // 导航按钮样式
  navButtonLeft: {
    position: 'absolute',
    left: 20,
    top: '50%',
    transform: [{ translateY: -25 }],
    width: 50,
    height: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  navButtonRight: {
    position: 'absolute',
    right: 20,
    top: '50%',
    transform: [{ translateY: -25 }],
    width: 50,
    height: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  navButtonText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  // 右侧信息面板
  infoPanel: {
    width: 300, // 固定宽度
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
    padding: 16,
    overflow: 'hidden',
  },
  infoPanelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  infoSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    flex: 0,
    marginRight: 8,
    minWidth: 80,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    flex: 1,
    textAlign: 'right',
    fontWeight: '400',
  },
  filePath: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  // 图片占位符样式
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderFileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  // 操作区样式
  actionBar: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  actionButtonText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  actionButtonTextDanger: {
    color: '#FF3B30', // 红色 - 删除按钮
  },
  // 二级选项面板样式
  secondaryPanel: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  secondaryPanelTitle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  secondaryPanelTitleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  secondaryPanelContent: {
    padding: 12,
  },
  // 分类网格样式（用于二级面板）
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  categoryItem: {
    width: 70,
    height: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedCategory: {
    borderColor: '#2196F3',
    borderWidth: 2,
    backgroundColor: '#e0f7fa',
  },
  categoryIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 11,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
  },
  // 增强方案网格样式（用于二级面板）
  enhanceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 8,
  },
  enhancePresetItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  enhancePresetName: {
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    backgroundColor: '#333',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  modalMessage: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 15,
    textAlign: 'center',
  },
  modalIndicator: {
    marginTop: 10,
  },
  // 检测结果样式
  detectionSection: {
    marginTop: 8,
    marginBottom: 4,
  },
  detectionTitle: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  detectionItem: {
    marginLeft: 8,
    marginBottom: 2,
  },
  detectionText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
  },
  detectionMore: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    marginLeft: 8,
  },
  bboxText: {
    fontSize: 10,
    color: '#666',
    marginLeft: 8,
    marginTop: 2,
    fontFamily: 'monospace',
  },
  // 注意：增强模态框相关样式已移至 EnhanceResultScreen.desktop.js
});

export default ImagePreviewScreen;
