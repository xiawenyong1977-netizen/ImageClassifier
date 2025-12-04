import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Dimensions, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, Alert, logger, getUri, getLocalPath } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageEnhanceService from '../../services/ImageEnhanceService';
import WeChatAuthService from '../../services/WeChatAuthService';
import ImageClassifierService from '../../services/ImageClassifierService';
import configService from '../../services/ConfigService';
import EnhanceResultScreen from './EnhanceResultScreen.desktop';

// Helper function to get category information
const getCategoryInfo = (categoryId) => {
  // 处理特殊分类 'NA'（未分类）
  if (categoryId === 'NA' || categoryId === null || categoryId === undefined) {
    return {
      name: '未分类',
      icon: '📷',
      color: '#607D8B'
    };
  }
  
  // 确保配置服务已加载
  if (!configService || !configService.isConfigLoaded()) {
    throw new Error('ConfigService未初始化或配置未加载');
  }
  
  const category = configService.getCategoryByKey(categoryId);
  if (!category) {
    // 如果找不到分类，返回默认值而不是抛出错误
    logger.warn(`⚠️ 未找到分类配置: ${categoryId}，使用默认值`);
    return {
      name: categoryId || '未知分类',
      icon: '📷',
      color: '#607D8B'
    };
  }
  
  return {
    name: category.chinese || category.english || categoryId,
    icon: '📷', // 默认图标，因为用户说不需要图标
    color: '#607D8B' // 默认颜色
  };
};

// Helper function to get all categories for selection
const getAllCategories = () => {
  // 确保配置服务已加载
  if (!configService || !configService.isConfigLoaded()) {
    throw new Error('ConfigService未初始化或配置未加载');
  }
  
  return configService.getAllCategoriesWithUI()
    .filter(category => category.id !== 'tobecleaned') // 过滤掉tobecleaned分类
    .map(category => ({
      id: category.id,
      name: category.chinese || category.english || category.id,
      icon: '📷', // 默认图标
      color: '#607D8B' // 默认颜色
    }));
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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
  
  // 导航相关状态
  const [categoryImages, setCategoryImages] = useState([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  
  // 照片创玩相关状态
  const [enhancePresets, setEnhancePresets] = useState({});
  
  // 操作区二级面板展开状态：null | 'category' | 'enhance'
  const [expandedAction, setExpandedAction] = useState(null);
  
  // 增强模态框状态
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [enhancePreset, setEnhancePreset] = useState(null);
  const [enhanceProgress, setEnhanceProgress] = useState({
    current: 0,
    total: 0,
    status: 'idle',
    imageStatuses: []
  });
  const [enhanceResults, setEnhanceResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = React.useRef(null);

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
      } else {
        logger.warn('⚠️ 无法确定来源，无法重新加载');
        return false;
      }
      
      logger.debug(`✅ 重新加载完成，图片数：${categoryImages.length} → ${updatedImages.length}`);
      
      // 如果列表为空，返回上一页
      if (updatedImages.length === 0) {
        logger.debug('列表已空，返回上一页');
        Alert.alert('提示', '当前分类已无图片', [
          { text: '确定', onPress: handleBack }
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
        Alert.alert('错误', '加载前一张图片失败');
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
        Alert.alert('错误', '加载后一张图片失败');
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
      Alert.alert('错误', '图片信息不完整，无法操作');
      return;
    }
    
    logger.debug('执行删除操作...');
    Alert.alert(
      '确认删除',
      '确定要删除这张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复！',
      [
        { 
          text: '取消', 
          style: 'cancel',
          onPress: () => logger.debug('用户取消删除')
        },
        {
          text: '删除',
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
                Alert.alert('删除失败', result.message);
              }
            } catch (error) {
              setShowDeleteProgress(false);
              Alert.alert('错误', '删除失败，请重试');
            }
          },
        },
      ]
    );
  };

  // 添加到暂存箱（只在不在暂存箱时显示）
  const handleAddToStagingBox = () => {
    logger.debug('暂存按钮被点击，currentImage:', currentImage);
    logger.debug('图片ID:', currentImage?.id);
    
    if (!currentImage || !currentImage.id) {
      logger.error('错误：currentImage 或 currentImage.id 不存在');
      Alert.alert('错误', '图片信息不完整，无法操作');
      return;
    }
    
    logger.debug('添加到暂存箱...');
    Alert.alert(
      '添加到暂存箱',
      '确定要将这张图片添加到暂存箱吗？\n\n图片将被添加到暂存箱，但分类信息不会改变。',
      [
        { 
          text: '取消', 
          style: 'cancel',
          onPress: () => logger.debug('用户取消添加到暂存箱')
        },
        {
          text: '添加',
          style: 'default',
          onPress: async () => {
            logger.debug('用户确认添加到暂存箱，开始操作...');
            try {
              // 添加到暂存箱（不修改category字段）
              const addResult = await UnifiedDataService.addToStagingBox([currentImage.id]);
              if (!addResult.success) {
                throw new Error(`添加到暂存箱失败: ${addResult.errors.map(e => e.error).join(', ')}`);
              }
              
              // 更新本地状态
              setIsInStagingBox(true);
              
              logger.debug('添加到暂存箱成功');
              
              // 重新加载图片列表
              await reloadImageList();
              
              // 通知父组件数据已变化
              if (onDataChange) {
                onDataChange();
              }
            } catch (error) {
              logger.error('添加到暂存箱失败:', error);
              Alert.alert('错误', `添加到暂存箱失败: ${error.message}`);
            }
          },
        },
      ]
    );
  };

  // 从暂存箱移除（只在暂存箱中时显示）
  const handleRemoveFromStagingBox = () => {
    logger.debug('从暂存箱移除按钮被点击，currentImage:', currentImage);
    logger.debug('图片ID:', currentImage?.id);
    
    if (!currentImage || !currentImage.id) {
      logger.error('错误：currentImage 或 currentImage.id 不存在');
      Alert.alert('错误', '图片信息不完整，无法操作');
      return;
    }
    
    logger.debug('从暂存箱移除...');
    Alert.alert(
      '从暂存箱移除',
      '确定要从暂存箱移除这张图片吗？\n\n图片将从暂存箱中移除，但不会删除文件。',
      [
        { 
          text: '取消', 
          style: 'cancel',
          onPress: () => logger.debug('用户取消从暂存箱移除')
        },
        {
          text: '移出',
          style: 'default',
          onPress: async () => {
            logger.debug('用户确认从暂存箱移除，开始操作...');
            try {
              // 从暂存箱移除
              const removeResult = await UnifiedDataService.removeFromStagingBox([currentImage.id]);
              if (!removeResult.success) {
                const errorMessages = removeResult.errors?.map(e => e.error || e.message || '未知错误').join(', ') || '未知错误';
                throw new Error(`从暂存箱移除失败: ${errorMessages}`);
              }
              
              // 更新本地状态
              setIsInStagingBox(false);
              
              logger.debug('从暂存箱移除成功');
              
              // 如果当前是从暂存箱进入的，重新加载图片列表（会自动处理导航）
              // 如果列表为空，reloadImageList 会自动返回上一页
              const reloadSuccess = await reloadImageList();
              
              // 如果重新加载失败或列表为空，不显示成功提示（reloadImageList 已处理）
              if (reloadSuccess) {
                // 通知父组件数据已变化
                if (onDataChange) {
                  onDataChange();
                }
                
                Alert.alert('操作完成', '已成功从暂存箱移除图片');
              }
            } catch (error) {
              logger.error('从暂存箱移除失败:', error);
              Alert.alert('错误', `从暂存箱移除失败: ${error.message}`);
            }
          },
        },
      ]
    );
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
      Alert.alert('错误', '分类修改失败，请重试');
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
      Alert.alert('错误', '当前环境不支持文件复制功能');
      return { success: false };
    }

    const { ipcRenderer } = window.require('electron');

    return new Promise((resolve) => {
      ipcRenderer.once('copy-files-result', (event, result) => {
        if (result.success) {
          Alert.alert(successTitle, successMessage(result));
        } else {
          Alert.alert('失败', `复制失败: ${result.error}`);
        }
        resolve(result);
      });
      ipcRenderer.send('copy-files-to-clipboard', filePaths);
    });
  }, []);

  // 复制当前图片到剪贴板
  const handleCopyToClipboard = useCallback(async () => {
    if (!currentImage) {
      Alert.alert('错误', '图片信息不完整，无法复制');
      return;
    }

    try {
      const filePaths = buildFilePathList([currentImage]);

      if (filePaths.length === 0) {
        Alert.alert('错误', '未找到有效的图片路径');
        return;
      }

      await copyFilePathsToClipboard(filePaths, {
        successTitle: '复制成功',
        successMessage: () => `已将图片复制到剪贴板。\n可在聊天窗口使用 Ctrl+V 粘贴。`
      });
    } catch (error) {
      logger.error('复制文件到剪贴板失败:', error);
      Alert.alert('错误', `复制失败: ${error.message}`);
    }
  }, [currentImage, buildFilePathList, copyFilePathsToClipboard]);

  // 复制当前图片到文件管理器
  const handleCopyToFileManager = useCallback(async () => {
    if (!currentImage) {
      Alert.alert('错误', '图片信息不完整，无法复制');
      return;
    }

    try {
      const filePaths = buildFilePathList([currentImage]);

      if (filePaths.length === 0) {
        Alert.alert('错误', '未找到有效的图片路径');
        return;
      }

      await copyFilePathsToClipboard(filePaths, {
        successTitle: '复制成功',
        successMessage: () => `已复制文件。\n请在资源管理器目标文件夹按 Ctrl+V 粘贴。`
      });
    } catch (error) {
      logger.error('复制文件路径失败:', error);
      Alert.alert('错误', `复制失败: ${error.message}`);
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
      Alert.alert('错误', '加载增强方案失败，请稍后重试');
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
   * 点击增强方案：数量与额度检查
   */
  const handleEnhancePresetPress = async (presetId) => {
    try {
      if (!currentImage || !currentImage.id) {
        Alert.alert('错误', '图片信息不完整');
        return;
      }
      
      const imageUri = getUri(currentImage);
      if (!imageUri) {
        Alert.alert('错误', '无法获取图片URI');
        return;
      }
      
      const count = 1; // 单张图片
      
      // 会员状态检查
      const { isMember } = await WeChatAuthService.getMembershipStatus();
      if (!isMember) {
        Alert.alert('提示', '该功能仅对会员开放，请在设置页面开通终身会员后再试。');
        return;
      }

      // 开始增强的内部函数
      const startEnhancement = () => {
        // 准备图片数据
        const imagesToEnhance = [currentImage];
        
        // 重置状态
        setEnhancePreset(presetId);
        setEnhanceResults([]);
        setIsProcessing(false);
        setEnhanceProgress({
          current: 0,
          total: 1,
          status: 'idle',
          imageStatuses: []
        });
        
        // 关闭二级面板，显示增强模态框
        setExpandedAction(null);
        setShowEnhanceModal(true);
        
        // 延迟一小段时间后自动开始处理（等待Modal渲染完成）
        setTimeout(() => {
          handleStartEnhance(presetId, imagesToEnhance);
        }, 100);
      };

      // 查询额度并提示将消耗额度
      try {
        const credits = await WeChatAuthService.getCredits();
        const remaining = typeof credits?.remaining === 'number' ? credits.remaining : 0;
        // 不足则阻断并提示前往充值
        if (remaining < count) {
          Alert.alert(
            '额度不足',
            `当前剩余额度：${remaining} 次\n需要处理：${count} 张\n\n请前往芯图相册服务号购买额度`,
            [{ text: '确定', style: 'default' }]
          );
          return;
        }
        // 足够则二次确认
        Alert.alert(
          '提示',
          `你选择了 ${count} 张图片，将会消耗 ${count} 个额度\n当前剩余额度：${remaining}`,
          [
            { text: '取消', style: 'cancel' },
            { text: '确定', onPress: () => startEnhancement() }
          ]
        );
      } catch (e) {
        // 查询失败不阻断，直接开始
        startEnhancement();
      }
    } catch (error) {
      logger.error('增强检查失败:', error);
      Alert.alert('错误', error.message || '操作失败，请稍后重试');
    }
  };

  /**
   * 开始增强处理（参考 CategoryScreen 的实现）
   */
  const handleStartEnhance = async (preset, imagesToProcess) => {
    try {
      logger.debug('🚀 开始处理增强任务, 方案:', preset);
      
      const images = imagesToProcess || [currentImage];
      
      if (images.length === 0) {
        logger.error('❌ 没有图片数据');
        Alert.alert('错误', '没有可处理的图片');
        return;
      }

      // 检查微信授权和额度
      try {
        const credits = await WeChatAuthService.getCredits();
        
        if (credits.remaining < images.length) {
          Alert.alert(
            '额度不足',
            `当前剩余额度：${credits.remaining}次\n需要处理：${images.length}张图片\n\n请前往设置页面关注公众号获取更多额度`,
            [
              { text: '取消', style: 'cancel' },
              { 
                text: '去设置', 
                onPress: () => {
                  // 触发导航到设置页面
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('navigate-to-settings'));
                  }
                }
              }
            ]
          );
          return;
        }
        
        logger.debug(`✅ 额度充足: 剩余${credits.remaining}次，需要${images.length}次`);
      } catch (error) {
        logger.error('检查额度失败:', error);
        Alert.alert('错误', '无法检查使用额度，请重试');
        return;
      }
      
      // 标记处理中
      setIsProcessing(true);
      setEnhanceProgress({
        current: 0,
        total: images.length,
        status: 'processing',
        imageStatuses: []
      });
      
      logger.debug(`准备处理 ${images.length} 张图片`);
      
      // 1. 预处理所有图片
      logger.debug(`📦 开始预处理 ${images.length} 张图片...`);
      const preparedImages = [];
      
      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        logger.debug(`  预处理 ${i + 1}/${images.length}: ${image.fileName}`);
        
        try {
          const imageUri = getUri(image);
          if (!imageUri) {
            throw new Error(`无法获取图片URI: ${image.fileName}`);
          }
          const preparedImage = await ImageEnhanceService.prepareImageForEnhance(imageUri);
          preparedImages.push({
            ...preparedImage,
            originalImage: image  // 保存原始图片信息
          });
        } catch (error) {
          logger.error(`预处理失败: ${image.fileName}`, error);
          // 预处理失败的图片跳过
        }
      }
      
      if (preparedImages.length === 0) {
        throw new Error('所有图片预处理失败');
      }
      
      logger.debug(`✅ 预处理完成: ${preparedImages.length}/${images.length} 张`);
      
      // 2. 批量提交增强任务
      const taskResult = await ImageEnhanceService.submitEnhanceTask(
        preparedImages,
        preset
      );
      
      logger.debug(`✅ 批量任务已提交: taskId=${taskResult.task_id}, total=${taskResult.total_images}`);
      
      // 立即更新UI，显示任务已开始
      setEnhanceProgress({
        current: 0,
        total: taskResult.total_images,
        status: 'processing',
        progress: 0,
        imageStatuses: []
      });
      
      // 3. 创建 AbortController 用于取消轮询
      abortControllerRef.current = new AbortController();
      
      // 轮询任务状态（带进度回调）
      let pollCount = 0;
      const enhanceResult = await ImageEnhanceService.pollTaskStatus(
        taskResult.task_id,
        (status) => {
          pollCount++;
          
          // 基于 completed_images 和 status 更新进度
          const completedImages = status.completed_images || 0;
          
          // 计算进度百分比
          let progressPercent = 0;
          if (completedImages > 0) {
            progressPercent = (completedImages / taskResult.total_images) * 100;
          } else if (status.status === 'processing') {
            const estimatedCurrent = Math.min(pollCount * 0.2, taskResult.total_images);
            progressPercent = (estimatedCurrent / taskResult.total_images) * 100;
          }
          
          // 解析每张图片的实时状态
          const imageStatuses = (status.results || []).filter(img => img != null);
          
          setEnhanceProgress({
            current: completedImages > 0 ? completedImages : Math.floor(pollCount * 0.2),
            total: taskResult.total_images,
            status: status.status === 'completed' ? 'completed' : 'processing',
            progress: progressPercent,
            imageStatuses: imageStatuses
          });
          
          // 实时更新已完成图片的URI到enhanceResults
          setEnhanceResults(prevResults => {
            const newResults = [...prevResults];
            let hasUpdate = false;
            
            imageStatuses.forEach((imgStatus) => {
              if (!imgStatus) return;
              if (imgStatus.status === 'completed' && imgStatus.result_url) {
                const index = imgStatus.index;
                if (index == null || typeof index !== 'number' || index < 0 || index >= preparedImages.length) {
                  return;
                }
                const originalImage = preparedImages[index]?.originalImage;
                
                if (originalImage) {
                  const enhancedUrl = imgStatus.result_url || imgStatus.url || imgStatus.enhanced_url;
                  const originalImageUri = getUri(originalImage);
                  
                  const existingIndex = newResults.findIndex(r => {
                    // 确保 r 存在后再访问其属性
                    if (!r) return false;
                    return (r.originalUri && originalImageUri && r.originalUri === originalImageUri) || 
                           (r.originalImageId === originalImage.id);
                  });
                  
                  if (existingIndex >= 0) {
                    if (!newResults[existingIndex].enhancedUri || newResults[existingIndex].status !== 'success') {
                      newResults[existingIndex] = {
                        ...newResults[existingIndex],
                        enhancedUri: enhancedUrl,
                        status: 'success'
                      };
                      hasUpdate = true;
                    }
                  } else {
                    newResults[index] = {
                      originalImageId: originalImage.id,
                      originalUri: originalImageUri,
                      originalFileName: originalImage.fileName,
                      enhancedUri: enhancedUrl,
                      taskId: taskResult.task_id,
                      preset: preset,
                      status: 'success'
                    };
                    hasUpdate = true;
                  }
                }
              }
            });
            
            return hasUpdate ? newResults : prevResults;
          });
          
          logger.debug(`📊 进度更新 [轮询${pollCount}次]: ${completedImages}/${taskResult.total_images} (${progressPercent.toFixed(1)}%)`);
        },
        abortControllerRef.current?.signal
      );
      
      logger.debug(`✅ 任务完成，收到 ${enhanceResult.results?.length || 0} 个结果`);
      
      // 清理 AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current = null;
      }
      
      // 4. 处理结果
      let successCount = 0;
      let failedCount = 0;
      const results = [];
      
      if (enhanceResult.results && enhanceResult.results.length > 0) {
        enhanceResult.results.forEach((result, index) => {
          const originalImage = preparedImages[index]?.originalImage;
          const enhancedUrl = result.result_url || result.url || result.enhanced_url || result.image_url || result.output_url;
          
          if (result.status === 'completed' && enhancedUrl) {
            if (originalImage) {
              const originalImageUri = getUri(originalImage);
              results.push({
                originalImageId: originalImage.id,
                originalUri: originalImageUri,
                originalFileName: originalImage.fileName,
                enhancedUri: enhancedUrl,
                taskId: taskResult.task_id,
                preset: preset,
                status: 'success'
              });
              successCount++;
            }
          } else {
            const originalImageUri = originalImage ? getUri(originalImage) : null;
            results.push({
              originalImageId: originalImage?.id,
              originalUri: originalImageUri,
              originalFileName: originalImage?.fileName,
              status: 'failed',
              errorMessage: result.error || '处理失败'
            });
            failedCount++;
          }
        });
      }
      
      // 更新最终结果
      setEnhanceResults(results);
      setIsProcessing(false);
      setEnhanceProgress(prev => ({
        ...prev,
        status: 'completed',
        current: successCount,
        total: results.length
      }));
      
      if (results.length === 0 || results.every(r => r.status === 'failed')) {
        Alert.alert('处理完成', '所有图片处理失败，请重试');
      }
      
    } catch (error) {
      // 检查是否是用户取消操作（正常操作，不记录为错误）
      if (error.message && error.message.includes('轮询已被用户取消')) {
        logger.debug('🛑 用户取消增强处理');
        setIsProcessing(false);
        setEnhanceProgress(prev => ({
          ...prev,
          status: 'cancelled'
        }));
        // 用户取消不需要显示错误提示
        return;
      }
      
      // 其他错误才记录为错误
      logger.error('❌ 增强处理失败:', error);
      setIsProcessing(false);
      setEnhanceProgress(prev => ({
        ...prev,
        status: 'failed'
      }));
      if (showEnhanceModal) {
        Alert.alert('错误', `处理失败: ${error.message}`);
      }
    }
  };

  /**
   * 关闭增强模态框
   */
  const handleCloseEnhanceModal = () => {
    // 如果任务还在进行中，显示确认提示
    if (isProcessing && enhanceProgress.status === 'processing') {
      Alert.alert(
        '确认关闭',
        '照片增强任务已经提交，关闭后照片的处理结果将会临时保存在服务器。\n\n再次提交同一照片的相同处理将会直接从服务器中返回，不扣减额度。',
        [
          {
            text: '取消',
            style: 'cancel'
          },
          {
            text: '确认关闭',
            onPress: () => {
              // 取消轮询任务
              if (abortControllerRef.current) {
                logger.debug('🛑 用户确认关闭模态框，取消轮询任务');
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
              }
              
              setShowEnhanceModal(false);
              setIsProcessing(false);
              setEnhanceProgress({
                current: 0,
                total: 0,
                status: 'idle',
                imageStatuses: []
              });
            }
          }
        ]
      );
      return;
    }
    
    // 任务已完成或未开始，直接关闭
    setShowEnhanceModal(false);
    setIsProcessing(false);
    setEnhanceProgress({
      current: 0,
      total: 0,
      status: 'idle',
      imageStatuses: []
    });
  };

  /**
   * 保存并添加到暂存箱
   */
  const handleSaveAndAdd = async () => {
    if (enhanceResults.length === 0) return;
    
    // 获取第一个结果（单张图片）
    const result = enhanceResults[0];
    
    if (!result || result.status !== 'success' || !result.enhancedUri) {
      Alert.alert('提示', '没有可保存的增强结果');
      return;
    }
    
    if (result.saved) {
      Alert.alert('提示', '该图片已保存');
      return;
    }
    
    try {
      logger.debug('💾 开始保存增强结果:', result);
      
      // 显示保存进度
      Alert.alert('保存中', '正在保存增强后的图片...');
      
      // 1. 下载增强后的图片
      const imageBlob = await ImageEnhanceService.downloadEnhancedImage(result.enhancedUri);
      
      // 2. 保存到 xualbum 目录
      const saveResult = await ImageEnhanceService.saveToXualbum(
        imageBlob,
        result.originalFileName || 'enhanced.jpg'
      );
      
      // 3. 转换为 file:// URI 格式
      const newImageUri = `file:///${saveResult.filePath.replace(/\\/g, '/')}`;
      
      logger.debug('✅ 图片已保存到:', newImageUri);
      
      // 4. 尝试读取原图完整信息（用于获取检测结果和描述信息）
      let originalImage = null;
      try {
        if (result.originalImageId) {
          originalImage = await UnifiedDataService.readImageDetailsById(result.originalImageId);
          logger.debug('✅ 从数据库获取完整原图信息');
        } else if (result.originalUri) {
          // 如果没有 ID，尝试从当前图片列表查找
          const tempImage = categoryImages.find(img => {
            const imgUri = getUri(img);
            const targetOriginalUri = getUri(result.originalUri);
            return imgUri && targetOriginalUri && imgUri === targetOriginalUri;
          });
          if (tempImage?.id) {
            originalImage = await UnifiedDataService.readImageDetailsById(tempImage.id);
            logger.debug('✅ 通过URI找到ID，从数据库获取完整原图信息');
          }
        }
      } catch (error) {
        logger.warn('⚠️ 从数据库查询原图详细信息失败:', error);
        originalImage = null;
      }
      
      // 5. 添加到数据库（保持原图的分类）
      const timestamp = Date.now();
      
      // 准备完整的图片数据（复制原图的检测结果和描述信息）
      const completeImageData = {
        uri: newImageUri,
        fileName: saveResult.fileName,
        category: originalImage?.category || 'other', // 保持原图的分类
        confidence: 1.0,
        timestamp: timestamp,
        takenAt: timestamp,
        size: imageBlob.size || 0,
        // 复制原图的检测结果和描述信息
        idCardDetections: originalImage?.idCardDetections || [],
        generalDetections: originalImage?.generalDetections || [],
        mobileNetV3Detections: originalImage?.mobileNetV3Detections || null,
        message: originalImage?.message || null,
        // 如果有imageDimensions也复制
        ...(originalImage?.imageDimensions && { imageDimensions: originalImage.imageDimensions })
      };
      
      // 使用 writeImageDetailedInfo 保存图片数据（服务层会自动刷新缓存）
      await UnifiedDataService.writeImageDetailedInfo([completeImageData], true);
      
      // 如果当前图片在暂存箱，将新图片也添加到暂存箱
      if (isInStagingBox && currentImage?.id) {
        // 生成预期ID以便后续验证（使用与存储服务相同的算法）
        let expectedImageId;
        try {
          const storageService = UnifiedDataService.imageStorageService;
          if (storageService?.storage?.generateStableId) {
            expectedImageId = storageService.storage.generateStableId(newImageUri);
          } else {
            // 备用算法（与generateStableId相同的逻辑）
            let hash = 0;
            for (let i = 0; i < newImageUri.length; i++) {
              const char = newImageUri.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash;
            }
            expectedImageId = `img_${Math.abs(hash).toString(36)}`;
          }
        } catch (e) {
          logger.warn('⚠️ 生成预期ID失败:', e);
          expectedImageId = null;
        }
        
        if (expectedImageId) {
          await UnifiedDataService.addToStagingBox([expectedImageId]);
          logger.debug('✅ 新图片已添加到暂存箱:', expectedImageId);
        }
      }
      
      // 缓存刷新已由 writeImageDetailedInfo 处理，不需要手动刷新
      
      // 标记为已保存
      setEnhanceResults(prevResults => 
        prevResults.map((r, index) => 
          index === 0
            ? { ...r, saved: true, savedAt: timestamp }
            : r
        )
      );
      
      Alert.alert('保存成功', '增强后的图片已添加到暂存箱');
      
      // 通知父组件数据已变化
      if (onDataChange) {
        onDataChange();
      }
      
    } catch (error) {
      logger.error('❌ 保存失败:', error);
      Alert.alert('保存失败', error.message || '保存失败，请重试');
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
    return '未知文件名';
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
            正在加载...
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>正在加载图片详情...</Text>
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
            图片未找到
          </Text>
          <View style={styles.headerActions} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>图片未找到</Text>
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
            if (finalFilterType === 'similarityGroup') {
              categoryText = '相似组';
            } else if (finalFilterType === 'city') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'color') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'directory') {
              categoryText = finalFilterValue ? finalFilterValue.split('/').pop() : '';
            } else if (finalFilterType === 'category') {
              categoryText = UnifiedDataService.getCategoryDisplayName(finalFilterValue) || '';
            } else if (finalFilterType === 'format') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'resolution') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'orientation') {
              categoryText = finalFilterValue || '';
            } else if (finalFilterType === 'stagingBox') {
              categoryText = '暂存箱';
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
              <View style={styles.imageContent}>
                {(() => {
                  const imageUri = getUri(currentImage);
                  return imageUri ? (
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
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.placeholderText}>📷</Text>
                      <Text style={styles.placeholderFileName}>
                        {currentImage.fileName || 'Image Preview'}
                      </Text>
                      <Text style={styles.placeholderSubtext}>
                        {getUri(currentImage) ? 'Local file' : 'No preview available'}
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
            </View>

          {/* 操作区 */}
          <View style={styles.actionBar}>
            {/* 删除按钮（所有图片都可以删除） */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDelete}>
              <Text style={[styles.actionButtonText, styles.actionButtonTextDanger]}>🗑️ 删除</Text>
            </TouchableOpacity>
            
            {/* 暂存按钮（只在不在暂存箱时显示） */}
            {!isInStagingBox && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleAddToStagingBox}>
                <Text style={styles.actionButtonText}>📦 暂存</Text>
              </TouchableOpacity>
            )}
            
            {/* 从暂存箱移除按钮（只在暂存箱中时显示） */}
            {isInStagingBox && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleRemoveFromStagingBox}>
                <Text style={styles.actionButtonText}>➡️ 移出</Text>
              </TouchableOpacity>
            )}
            
            {/* 设置分类按钮（所有图片都可以设置分类） */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                expandedAction === 'category' && styles.actionButtonActive
              ]}
              onPress={openCategorySelector}>
              <Text style={styles.actionButtonText}>🏷️ 分类</Text>
            </TouchableOpacity>
            
            {/* 照片创玩按钮（所有图片都可以创玩） */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                expandedAction === 'enhance' && styles.actionButtonActive
              ]}
              onPress={openEnhancePanel}>
              <Text style={styles.actionButtonText}>✨ 创玩</Text>
            </TouchableOpacity>
            
            {/* 复制到剪贴板 */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCopyToClipboard}>
              <Text style={styles.actionButtonText}>📋 内容复制</Text>
            </TouchableOpacity>
            
            {/* 复制到文件管理器 */}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCopyToFileManager}>
              <Text style={styles.actionButtonText}>📂 文件复制</Text>
            </TouchableOpacity>
          </View>

          {/* 二级选项面板 */}
          {expandedAction === 'category' && (
            <View style={styles.secondaryPanel}>
              <View style={styles.secondaryPanelTitle}>
                <Text style={styles.secondaryPanelTitleText}>选择分类</Text>
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
                <Text style={styles.secondaryPanelTitleText}>选择增强方案</Text>
              </View>
              <View style={styles.secondaryPanelContent}>
                <View style={styles.enhanceGrid}>
                  {Object.entries(enhancePresets)
                    .sort(([, a], [, b]) => (a?.sortOrder || 0) - (b?.sortOrder || 0))
                    .map(([presetId, preset]) => (
                      <TouchableOpacity
                        key={presetId}
                        style={styles.enhancePresetItem}
                        onPress={() => handleEnhancePresetPress(presetId)}
                      >
                        <Text style={styles.enhancePresetName} numberOfLines={1}>
                          {preset.name || presetId}
                        </Text>
                      </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
          </View>
          
          {/* 图片信息区域 - 右侧固定宽度 */}
          <View style={styles.infoPanel}>
            <Text style={styles.infoPanelTitle}>图片信息</Text>
            
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>拍摄时间:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.takenAt ? formatDate(currentImage.takenAt) : '未知'}
                </Text>
                {logger.debug('当前图片EXIF数据:', {
                  takenAt: currentImage.takenAt,
                  timestamp: currentImage.timestamp,
                  uri: currentImage.uri,
                  latitude: currentImage.latitude,
                  longitude: currentImage.longitude,
                  altitude: currentImage.altitude,
                  accuracy: currentImage.accuracy,
                  address: currentImage.address,
                  city: currentImage.city,
                  province: currentImage.province,
                  country: currentImage.country,
                  cityDistance: currentImage.cityDistance,
                  locationSource: currentImage.locationSource
                })}
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>文件时间:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.timestamp ? formatDate(currentImage.timestamp) : '未知'}
                </Text>
              </View>

              {/* 位置信息 */}
              {currentImage.latitude && currentImage.longitude && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>GPS坐标:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.latitude.toFixed(6)}, {currentImage.longitude.toFixed(6)}
                    </Text>
                  </View>
                  
                  {currentImage.city && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>拍摄城市:</Text>
                      <Text style={styles.infoValue}>
                        {currentImage.city}
                        {currentImage.province && `, ${currentImage.province}`}
                        {currentImage.cityDistance && ` (距离${currentImage.cityDistance}km)`}
                      </Text>
                    </View>
                  )}
                  
                  {currentImage.altitude && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>海拔高度:</Text>
                      <Text style={styles.infoValue}>
                        {currentImage.altitude}m
                      </Text>
                    </View>
                  )}
                  
                  {currentImage.accuracy && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>GPS精度:</Text>
                      <Text style={styles.infoValue}>
                        ±{currentImage.accuracy}m
                      </Text>
                    </View>
                  )}
                </>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>尺寸:</Text>
                <Text style={styles.infoValue}>
                  {imageDimensions ? 
                    `${imageDimensions.width} × ${imageDimensions.height}` : 
                    '加载中...'
                  }
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>大小:</Text>
                <Text style={styles.infoValue}>
                  {formatFileSize(currentImage.size || 0)}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>分类:</Text>
                <Text style={styles.infoValue}>
                  {getCategoryInfo(currentImage.category).name}
                  {currentImage.confidence === 'manual' ? ' (人工)' : 
                   currentImage.confidence ? ` (${(currentImage.confidence * 100).toFixed(1)}%)` : ''}
                </Text>
              </View>

              {/* 检测结果显示 */}
              {(currentImage.idCardDetections && currentImage.idCardDetections.length > 0) ||
               (currentImage.generalDetections && currentImage.generalDetections.length > 0) ||
               (currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0) ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🔍 检测结果:</Text>
                    <Text style={styles.infoValue}>
                      {/* 如果有 message 且不是默认消息，显示 AI 描述 */}
                      {currentImage.message && currentImage.message !== '图像分类完成' ? 
                        currentImage.message : 
                        `${((currentImage.idCardDetections?.length || 0) + (currentImage.generalDetections?.length || 0) + (currentImage.mobileNetV3Detections?.predictions?.length || 0))} 个物体`
                      }
                    </Text>
                  </View>

                  {/* 身份证检测结果 */}
                  {currentImage.idCardDetections && currentImage.idCardDetections.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🆔 身份证检测:</Text>
                      {currentImage.idCardDetections.map((detection, index) => (
                        <View key={index} style={styles.detectionItem}>
                          <Text style={styles.detectionText}>
                            {detection.class === 'id_card_front' ? '身份证正面' : '身份证背面'}
                            ({(detection.confidence * 100).toFixed(1)}%)
                          </Text>
                          {detection.bbox && (
                            <Text style={styles.bboxText}>
                              位置: [{detection.bbox.map(v => v.toFixed(2)).join(', ')}]
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 通用物体检测结果 */}
                  {currentImage.generalDetections && currentImage.generalDetections.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🌐 通用物体检测:</Text>
                      {currentImage.generalDetections.slice(0, 5).map((detection, index) => {
                        // 获取类别名称
                        const objectInfo = configService.getYoloObjectById(detection.classId);
                        const className = objectInfo ? objectInfo.chinese || objectInfo.english : `Class ${detection.classId}`;
                        
                        return (
                          <View key={index} style={styles.detectionItem}>
                            <Text style={styles.detectionText}>
                              {className} ({(detection.confidence * 100).toFixed(1)}%)
                            </Text>
                            {detection.bbox && (
                              <Text style={styles.bboxText}>
                                位置: [{detection.bbox.map(v => v.toFixed(2)).join(', ')}]
                              </Text>
                            )}
                          </View>
                        );
                      })}
                      {currentImage.generalDetections.length > 5 && (
                        <Text style={styles.detectionMore}>
                          ... 还有 {currentImage.generalDetections.length - 5} 个物体
                        </Text>
                      )}
                    </View>
                  )}

                  {/* MobileNetV3 分类结果 */}
                  {currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🧠 MobileNetV3 分类:</Text>
                      {currentImage.mobileNetV3Detections.predictions.slice(0, 5).map((prediction, index) => {
                        // 获取MobileNetV3分类的中文名称
                        const mobileNetV3ClassInfo = configService?.getMobileNetV3ClassByEnglishName(prediction.class);
                        const displayName = mobileNetV3ClassInfo?.chinese || prediction.class;
                        
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
                          ... 还有 {currentImage.mobileNetV3Detections.predictions.length - 5} 个分类
                        </Text>
                      )}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>🔍 检测结果:</Text>
                  <Text style={styles.infoValue}>
                    {/* 如果有 message 且不是默认消息，显示 AI 描述 */}
                    {currentImage.message && currentImage.message !== '图像分类完成' ? 
                      currentImage.message : 
                      '未检测到物体'
                    }
                  </Text>
                </View>
              )}
            </View>

            {/* GPS位置信息 */}
            {currentImage.location && (
              <View style={styles.infoSection}>
                <Text style={styles.sectionTitle}>位置信息</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📍 位置:</Text>
                  <Text style={styles.infoValue}>
                    {currentImage.location.latitude && currentImage.location.longitude ? 
                      `${currentImage.location.latitude.toFixed(6)}, ${currentImage.location.longitude.toFixed(6)}` : 
                      '无GPS信息'
                    }
                  </Text>
                </View>
                
                {currentImage.location.altitude && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🏔️ 海拔:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.altitude.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.accuracy && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🎯 精度:</Text>
                    <Text style={styles.infoValue}>
                      ±{currentImage.location.accuracy.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.source && currentImage.location.source !== 'none' && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📡 来源:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.source === 'exif' ? 'EXIF数据' : 
                       currentImage.location.source === 'mediastore' ? 'MediaStore' : 
                       currentImage.location.source}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>文件路径</Text>
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
                  return imageUri || '未知';
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
            <Text style={styles.modalTitle}>删除中...</Text>
            <Text style={styles.modalMessage}>
              已删除: {deleteProgress.filesDeleted} 个文件
              失败: {deleteProgress.filesFailed} 个文件
              总计: {deleteProgress.total} 个文件
            </Text>
            <ActivityIndicator size="small" color="#2196F3" style={styles.modalIndicator} />
          </View>
        </View>
      </Modal>

      {/* AI 图像增强模态框 */}
      {showEnhanceModal && (
        <EnhanceResultScreen
          visible={showEnhanceModal}
          onClose={handleCloseEnhanceModal}
          preset={enhancePreset}
          availablePresets={enhancePresets}
          progress={enhanceProgress}
          selectedImages={[currentImage]}
          results={enhanceResults}
          currentIndex={0}
          isProcessing={isProcessing}
          onIndexChange={() => {}} // 单张图片，不需要切换
          onSave={handleSaveAndAdd}
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
  // 增强模态框样式
  enhanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '95%',
    maxWidth: 1200,
    maxHeight: '90%',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  enhanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  enhanceModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  enhanceModalCloseButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  enhanceModalCloseIcon: {
    fontSize: 24,
    color: '#666',
    lineHeight: 24,
    fontWeight: 'bold',
  },
  enhanceComparisonView: {
    flexDirection: 'row',
    marginBottom: 16,
    minHeight: 480,
  },
  enhanceComparisonImageContainer: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  enhanceComparisonImageLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  enhanceComparisonImageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  enhanceComparisonSavedBadge: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 8,
  },
  enhanceComparisonImage: {
    width: '100%',
    height: 480,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  enhanceComparisonPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  enhanceComparisonPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceComparisonPlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  enhanceComparisonFailedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  enhanceComparisonFailedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceComparisonFailedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
    marginBottom: 8,
  },
  enhanceComparisonFailedMessage: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  enhanceProgressContainer: {
    marginBottom: 16,
  },
  enhanceProgressBar: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  enhanceProgressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  enhanceProgressText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  enhanceModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  enhanceSaveButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2196F3',
  },
  enhanceSaveButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  enhanceSavedText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '500',
    paddingVertical: 10,
  },
  enhanceCloseButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  enhanceCloseButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
});

export default ImagePreviewScreen;
