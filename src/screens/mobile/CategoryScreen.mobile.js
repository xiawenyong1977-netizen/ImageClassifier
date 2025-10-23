/**
 * 芯图相册 - 移动端分类详情页（通用）
 * 
 * 支持4种形态：
 * 1. 普通分类页 (category参数)
 * 2. 暂存箱页 (category='tobecleaned')
 * 3. 城市分类页 (city参数)
 * 4. 相似组详情页 (similarityGroupId参数)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Share,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useFocusEffect, Alert } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import GlobalImageCache from '../../services/GlobalImageCache';
import configService from '../../services/ConfigService';
import { logger } from '../../adapters/WebAdapters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 8) / GRID_COLUMNS; // 减去间距

const CategoryScreen = ({ route, navigation }) => {
  // ==================== 路由参数 ====================
  const { category, city, similarityGroupId, fromScreen } = route.params || {};
  
  // ==================== 状态管理 ====================
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // 多选模式
  const [selectionMode, setSelectionMode] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  
  // 选中数量状态
  const [selectedCount, setSelectedCount] = useState(0);
  
  // 分类选择器模态框
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [pendingImageIds, setPendingImageIds] = useState([]);
  
  // 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 时间轴分组
  const [groupedImages, setGroupedImages] = useState({});
  
  // 高亮图片（从 ImagePreview 返回时使用）
  const [highlightedImageId, setHighlightedImageId] = useState(null);
  const flatListRef = useRef(null);
  
  const ITEMS_PER_PAGE = 50;

  // ==================== 页面类型判断 ====================
  const pageType = category ? 'category' : city ? 'city' : similarityGroupId ? 'similarity' : null;
  const isStaging = category === 'tobecleaned';

  /**
   * 获取页面标题（与 PC 端格式一致）
   */
  const getPageTitle = () => {
    // 🆕 添加空值检查
    const count = Array.isArray(images) ? images.length : 0;
    
    if (similarityGroupId) {
      return `相似照片组 (${count}张)`;
    }
    if (city) {
      return `${city} (${count}张)`;
    }
    if (category) {
      const categoryName = UnifiedDataService.getCategoryDisplayName(category);
      return `${categoryName} (${count}张)`;
    }
    return '图片列表';
  };

  /**
   * 获取操作按钮配置
   */
  const getActionButtons = () => {
    if (isStaging) {
      // 暂存箱（tobecleaned）：删除 + 修改分类 + 分享
      return [
        { id: 'delete', label: '永久删除', icon: '🗑️', color: '#FF3B30' },
        { id: 'changeCategory', label: '修改分类', icon: '📁', color: '#007AFF' },
        { id: 'share', label: '分享', icon: '📤', color: '#34C759' },
      ];
    }
    
    // 所有非 tobecleaned 的情况（普通分类、城市、相似组）：放入暂存箱 + 修改分类
    return [
      { id: 'staging', label: '放入暂存箱', icon: '📦', color: '#FF9500' },
      { id: 'changeCategory', label: '修改分类', icon: '📁', color: '#007AFF' },
    ];
  };

  // ==================== 选择模式相关函数 ====================
  
  // 计算选中数量的函数
  const calculateSelectedCount = () => {
    try {
      if (similarityGroupId) {
        // 相似组页面：获取相似组的选中图片数量
        const selectedImages = UnifiedDataService.getSelectedImagesBySimilarityGroup(similarityGroupId);
        return selectedImages.length;
      } else if (city) {
        // 城市页面：获取城市的选中图片数量
        const selectedImages = UnifiedDataService.getSelectedImagesByCity(city);
        return selectedImages.length;
      } else if (category) {
        // 分类页面：获取分类的选中图片数量
        const selectedImages = UnifiedDataService.getSelectedImagesByCategory(category);
        return selectedImages.length;
      }
      return 0;
    } catch (error) {
      logger.error('获取选中数量失败:', error);
      return 0;
    }
  };
  
  // 全选/取消全选（与 PC 端同步到 UnifiedDataService）
  const toggleSelectAll = () => {
    // 实时获取当前状态，不依赖状态变量
    const currentSelectedCount = calculateSelectedCount();
    
    if (currentSelectedCount === images.length && images.length > 0) {
      // 全部选中，则取消全选
      images.forEach(img => {
        UnifiedDataService.setImageSelection(img.id, false);
      });
    } else {
      // 否则全选当前页面的所有图片
      images.forEach(img => {
        UnifiedDataService.setImageSelection(img.id, true);
      });
    }
    
    // 更新选中数量
    setSelectedCount(calculateSelectedCount());
  };

  // 切换图片选择状态（直接使用 UnifiedDataService，与 PC 端一致）
  const toggleImageSelection = (imageId) => {
    const isCurrentlySelected = UnifiedDataService.isImageSelected(imageId);
    UnifiedDataService.setImageSelection(imageId, !isCurrentlySelected);
    
    // 更新选中数量
    setSelectedCount(calculateSelectedCount());
  };

  // 进入选择模式
  const enterSelectionMode = () => {
    setSelectionMode(true);
  };


  // 批量修改分类
  const handleBatchChangeCategory = async (newCategory) => {
    // 实时获取选中数量，不依赖状态变量
    const currentSelectedCount = calculateSelectedCount();
    if (currentSelectedCount === 0) return;
    
    try {
      // 从 UnifiedDataService 获取选中的图片ID
      const selectedImageIds = images
        .filter(img => UnifiedDataService.isImageSelected(img.id))
        .map(img => img.id);
      
      const targetCategoryName = UnifiedDataService.getCategoryDisplayName(newCategory);
      
      Alert.alert(
        '确认修改分类',
        `确定要将 ${selectedImageIds.length} 张图片移动到"${targetCategoryName}"分类吗？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定',
            onPress: async () => {
              try {
                let processed = 0;
                for (const imageId of selectedImageIds) {
                  await UnifiedDataService.updateImageCategory(imageId, newCategory);
                  processed++;
                }
                
                // 清除选中状态
                selectedImageIds.forEach(id => {
                  UnifiedDataService.setImageSelection(id, false);
                });
                setSelectionMode(false);
                setShowActionMenu(false);
                
                // 刷新数据
                await loadImages();
                
                Alert.alert('操作完成', `已成功修改 ${processed} 张图片到"${targetCategoryName}"分类`);
              } catch (error) {
                logger.error('批量修改分类失败:', error);
                Alert.alert('操作失败', '修改分类时发生错误，请重试');
              }
            },
          },
        ]
      );
    } catch (error) {
      logger.error('批量修改分类失败:', error);
      Alert.alert('错误', '操作失败，请重试');
    }
  };

  // 批量删除/暂存
  const handleBatchDelete = () => {
    // 实时获取选中数量，不依赖状态变量
    const currentSelectedCount = calculateSelectedCount();
    if (currentSelectedCount === 0) return;
    
    const selectedImageIds = images
      .filter(img => UnifiedDataService.isImageSelected(img.id))
      .map(img => img.id);
    const isTobecleaned = category === 'tobecleaned';
    const actionText = isTobecleaned ? '删除' : '暂存';
    const actionDescription = isTobecleaned ? '永久删除' : '移动到暂存箱';
    
    Alert.alert(
      `确认${actionText}`,
      `确定要${actionDescription} ${selectedImageIds.length} 张图片吗？${isTobecleaned ? '此操作不可撤销！' : ''}`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: actionText,
          style: isTobecleaned ? 'destructive' : 'default',
          onPress: async () => {
            try {
              let processed = 0;
              for (const imageId of selectedImageIds) {
                if (isTobecleaned) {
                  // 删除文件
                  await UnifiedDataService.writeDeleteImage(imageId);
                } else {
                  // 移动到暂存箱
                  await UnifiedDataService.updateImageCategory(imageId, 'tobecleaned');
                  // 从相似组中移除
                  await UnifiedDataService.removeImageFromSimilarityGroup(imageId);
                }
                processed++;
              }
              
              // 清除选中状态
              selectedImageIds.forEach(id => {
                UnifiedDataService.setImageSelection(id, false);
              });
              setSelectionMode(false);
              setShowActionMenu(false);
              
              // 刷新数据
              await loadImages();
              
              Alert.alert('操作完成', `已成功${actionDescription} ${processed} 张图片`);
            } catch (error) {
              logger.error(`批量${actionText}失败:`, error);
              Alert.alert('操作失败', `${actionText}时发生错误，请重试`);
            }
          },
        },
      ]
    );
  };

  // ==================== 时间轴分组相关函数 ====================
  
  // 时间轴标题点击处理 - 全选/取消全选该时间段的所有图片（与 PC 端一致）
  const handleTimelineHeaderPress = (imagesForDate) => {
    if (!selectionMode) {
      // 非选择模式下，进入选择模式并全选该组
      setSelectionMode(true);
      imagesForDate.forEach(img => {
        UnifiedDataService.setImageSelection(img.id, true);
      });
      setSelectedCount(calculateSelectedCount());
      return;
    }
    
    const imageIds = imagesForDate.map(img => img.id);
    
    // 检查该组是否全部选中
    const allSelectedInGroup = imageIds.every(id => 
      UnifiedDataService.isImageSelected(id)
    );
    
    if (allSelectedInGroup) {
      // 全部选中，则取消全选该组
      imageIds.forEach(id => {
        UnifiedDataService.setImageSelection(id, false);
      });
    } else {
      // 未全部选中，则全选该组
      imageIds.forEach(id => {
        UnifiedDataService.setImageSelection(id, true);
      });
    }
    
    // 更新选中数量
    setSelectedCount(calculateSelectedCount());
    
    // 检查是否还有选中的图片，如果没有则退出选择模式
    if (calculateSelectedCount() === 0) {
      setSelectionMode(false);
    }
  };
  
  // 按日期分组图片（与 PC 端字段对齐）
  const groupImagesByDate = (imageList) => {
    const groups = {};
    
    // 添加空值检查
    if (!Array.isArray(imageList) || imageList.length === 0) {
      return groups;
    }
    
    imageList.forEach((image) => {
      // 添加空值检查
      if (!image || typeof image !== 'object') {
        return;
      }
      
      // 优先使用拍摄时间（takenAt），如果没有则使用文件时间（timestamp）
      let date;
      if (image.takenAt) {
        date = new Date(image.takenAt);
      } else if (image.timestamp) {
        date = new Date(image.timestamp);
      } else if (image.createdAt) {
        date = new Date(image.createdAt);
      } else if (image.modifiedAt) {
        date = new Date(image.modifiedAt);
      } else {
        // 如果都没有，使用当前日期
        date = new Date();
      }
      
      // 使用安全的ISO格式，避免本地化问题
      const dateKey = date.toISOString().split('T')[0];
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(image);
    });
    
    return groups;
  };




  // 页面获得焦点时刷新数据（用于 Tab 切换和从其他页面返回）
  useFocusEffect(
    useCallback(() => {
      const initData = async () => {
        // 每次获得焦点时都刷新数据，确保数据同步
        logger.debug('🔄 页面获得焦点，刷新数据...');
        await loadImages(); // 等待数据加载和状态更新完成
        
        // 重新计算选中数量 - 现在可以安全地使用最新的数据
        setSelectedCount(calculateSelectedCount());
        
        // 检查是否从 ImagePreview 返回，并初始化高亮图片ID
        const returnedImageId = route.params?.returnedImageId;
        logger.debug('🎯 检查返回图片ID:', returnedImageId);
        if (returnedImageId) {
          logger.debug('🎯 从 ImagePreview 返回，初始化高亮图片ID:', returnedImageId);
          setHighlightedImageId(returnedImageId);
          
          // 清除 navigation 参数，避免重复触发
          navigation.setParams({ returnedImageId: undefined });
        }
      };
      
      initData();
    }, [route.params?.returnedImageId])
  );

  // 监听数据变化，执行滚动和高亮操作
  useEffect(() => {
    logger.debug('📜 useEffect 触发:', {
      groupedImagesLength: Object.keys(groupedImages).length,
      highlightedImageId: highlightedImageId,
      hasData: Object.keys(groupedImages).length > 0,
      hasHighlight: !!highlightedImageId
    });
    
    if (Object.keys(groupedImages).length > 0 && highlightedImageId) {
      logger.debug('📜 数据已加载，准备滚动到图片:', highlightedImageId);
      
      // 直接等待1秒，确保 FlatList 完全渲染和测量
      setTimeout(() => {
        scrollToHighlightedImage(highlightedImageId);
      }, 1000); // 直接等待1秒
      
      // 不再自动取消高亮，让图片一直保持高亮状态
    } else {
      logger.debug('📜 滚动条件不满足:', {
        hasData: Object.keys(groupedImages).length > 0,
        hasHighlight: !!highlightedImageId
      });
    }
  }, [groupedImages, highlightedImageId]); // 依赖两个状态，确保数据和高亮都准备好

  // 滚动到高亮图片所在的日期组
  const scrollToHighlightedImage = (imageId) => {
    logger.debug('📜 开始滚动到图片:', imageId);
    
    if (!flatListRef.current || Object.keys(groupedImages).length === 0) {
      logger.warn('📜 滚动条件不满足:', { 
        hasRef: !!flatListRef.current, 
        groupedImagesLength: Object.keys(groupedImages).length,
        imageId
      });
      return;
    }
    
    // 查找图片所在的日期组索引
    const dateKeys = Object.keys(groupedImages);
    
    // 根据图片ID获取图片数据，然后根据时间找到日期组索引
    const targetImage = images.find(img => img.id === imageId);
    if (!targetImage) {
      logger.warn('📜 未找到目标图片:', imageId);
      return;
    }
    
    // 获取图片的时间，优先使用takenAt，没有则使用timestamp
    const imageTime = targetImage.takenAt || targetImage.timestamp;
    if (!imageTime) {
      logger.warn('📜 图片没有时间信息:', imageId);
      return;
    }
    
    // 将时间转换为日期键格式
    const date = new Date(imageTime);
    const targetDateKey = date.toISOString().split('T')[0];
    
    // 在日期组中找到对应的索引
    const targetDateIndex = dateKeys.indexOf(targetDateKey);
    
    logger.debug('📜 查找图片在日期组中的位置:', { 
      imageId, 
      targetDateKey,
      targetDateIndex,
      totalGroups: dateKeys.length
    });
    
    if (targetDateIndex >= 0 && targetDateIndex < dateKeys.length) {
      logger.debug(`📜 准备滚动到日期组索引: ${targetDateIndex}, 总组数: ${dateKeys.length}`);
      
      // 直接滚动到目标日期组
      try {
        flatListRef.current.scrollToIndex({
          index: targetDateIndex,
          animated: true,
          viewPosition: 0.3, // 将目标组滚动到屏幕上方 30% 的位置
        });
        logger.debug('📜 滚动命令执行成功');
      } catch (error) {
        logger.debug('📜 滚动失败，使用回退方案:', error);
        // 简单回退：滚动到顶部
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      }
    } else {
      logger.debug('📜 未找到目标图片或索引无效:', { 
        imageId, 
        targetDateIndex, 
        totalGroups: dateKeys.length,
        dateKeys: dateKeys.slice(0, 5) // 只显示前5个日期键
      });
    }
  };


  /**
   * 加载图片列表
   */
  const loadImages = async (isRefresh = false) => {
    try {
      logger.debug('🔍 loadImages 开始执行:', { isRefresh, category, city, similarityGroupId });
      
      if (isRefresh) {
        setRefreshing(true);
        setPage(1);
      } else {
        setLoading(true);
      }

      let filteredImages = [];
      
      if (similarityGroupId) {
        const groupData = await UnifiedDataService.getSimilarityGroupImages(similarityGroupId);
        filteredImages = groupData.images || [];
        filteredImages = filteredImages.filter(img => img.category !== 'tobecleaned');
      } else if (city) {
        filteredImages = await UnifiedDataService.readImagesByLocation(city, null);
        filteredImages = filteredImages.filter(img => img.category !== 'tobecleaned');
      } else if (category) {
        logger.debug('🔍 开始加载分类图片:', category);
        filteredImages = await UnifiedDataService.readImagesByCategory(category);
        logger.debug('🔍 分类图片加载完成:', category, filteredImages.length);
      } else {
        logger.error('没有有效的上下文参数');
        filteredImages = [];
      }

      // 按时间排序
      filteredImages.sort((a, b) => {
        if (!a || !b) return 0;
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
      });

      // 设置状态
      setLoading(false);
      setRefreshing(false);
      
      // 直接设置状态，同步执行
      setImages(filteredImages);
      setHasMore(filteredImages.length > ITEMS_PER_PAGE);
      
      // 同时设置分组图片
      if (filteredImages.length > 0) {
        logger.debug('🔍 groupImagesByDate 开始分组...');
        const grouped = groupImagesByDate(filteredImages);
        logger.debug('🔍 groupImagesByDate 分组完成:', Object.keys(grouped).length, '个日期组');
        setGroupedImages(grouped);
      } else {
        logger.debug('🔍 groupImagesByDate 清空分组');
        setGroupedImages({});
      }
      
      // 检查选中状态
      let selectedCount = 0;
      for (const image of filteredImages) {
        if (image && image.id && UnifiedDataService.isImageSelected(image.id)) {
          selectedCount++;
        }
      }
      
      setSelectionMode(selectedCount > 0);
      
      logger.debug(`📸 加载图片: ${filteredImages.length}张`);
      
    } catch (error) {
      logger.error('❌ 加载图片失败:', error);
      Alert.alert('加载失败', error.message);
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * 下拉刷新
   */
  const onRefresh = async () => {
    await GlobalImageCache.buildCache();
    await loadImages(true);
  };

  /**
   * 加载更多
   */
  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    
    setLoadingMore(true);
    setTimeout(() => {
      setPage(page + 1);
      setLoadingMore(false);
    }, 300);
  };

  // ==================== 选择操作 ====================

  /**
   * 长按进入多选模式
   */
  const handleLongPress = (image) => {
    if (!selectionMode) {
      setSelectionMode(true);
      UnifiedDataService.setImageSelection(image.id, true);
      setSelectedCount(calculateSelectedCount());
    }
  };

  /**
   * 点击选择/取消选择
   */
  const handlePress = (image) => {
    if (!selectionMode) {
      // 普通模式：跳转到预览页
      const index = images.findIndex(img => img.id === image.id);
      
      // ✅ 使用 FlatList 懒加载，支持任意数量图片
      navigation.navigate('ImagePreview', {
        image: image,
        allImages: images,
        currentIndex: index,
        category,
        city,
        similarityGroupId,
        fromScreen: pageType,
      });
    } else {
      // 选择模式：切换选中状态
      toggleImageSelection(image.id);
      
      // 如果没有选中任何图片，退出选择模式
      if (calculateSelectedCount() === 0) {
        setSelectionMode(false);
      }
    }
  };

  /**
   * 退出选择模式（保持选中状态不变）
   */
  function exitSelectionMode() {
    setSelectionMode(false);
    setShowActionMenu(false);
    // 不改变任何选中状态，保持用户的选中结果
  }

  // ==================== 批量操作 ====================

  /**
   * 获取当前选中的图片ID列表
   */
  const getSelectedImageIds = () => {
    try {
      if (similarityGroupId) {
        const selectedImages = UnifiedDataService.getSelectedImagesBySimilarityGroup(similarityGroupId);
        return selectedImages.map(img => img.id);
      } else if (city) {
        const selectedImages = UnifiedDataService.getSelectedImagesByCity(city);
        return selectedImages.map(img => img.id);
      } else if (category) {
        const selectedImages = UnifiedDataService.getSelectedImagesByCategory(category);
        return selectedImages.map(img => img.id);
      }
      return [];
    } catch (error) {
      logger.error('获取选中图片ID失败:', error);
      return [];
    }
  };

  /**
   * 执行批量操作
   */
  const handleBatchAction = async (actionId) => {
    try {
      const selectedIds = getSelectedImageIds();
      
      if (selectedIds.length === 0) {
        Alert.alert('提示', '请先选择图片');
        return;
      }

      switch (actionId) {
        case 'staging':
          await batchMoveToStaging(selectedIds);
          break;
        case 'changeCategory':
          await showCategorySelector(selectedIds);
          break;
        case 'delete':
          await batchDelete(selectedIds);
          break;
        case 'share':
          await batchShare(selectedIds);
          break;
        default:
          Alert.alert('提示', '未知操作');
          break;
      }
      
      // 注意：具体的操作函数内部会处理刷新和退出选择模式

    } catch (error) {
      logger.error('❌ 批量操作失败:', error);
      Alert.alert('操作失败', error.message);
    }
  };

  /**
   * 显示分类选择器模态框（批量修改分类）
   */
  const showCategorySelector = async (imageIds) => {
    setPendingImageIds(imageIds);
    setShowCategoryModal(true);
  };

  /**
   * 关闭分类选择器
   */
  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setPendingImageIds([]);
  };

  /**
   * 选择分类
   */
  const selectCategory = (categoryId) => {
    closeCategoryModal();
    batchChangeCategory(pendingImageIds, categoryId);
  };

  /**
   * 批量修改分类
   */
  const batchChangeCategory = async (imageIds, newCategory) => {
    try {
      const categoryName = UnifiedDataService.getCategoryDisplayName(newCategory);
      
      // 使用批量更新接口，提升性能
      const result = await UnifiedDataService.updateImagesCategory(imageIds, newCategory, 'manual');
      
      if (result.success) {
        logger.debug('✅ 批量更新分类成功:', result.processed, '张');
      } else {
        logger.warn('⚠️ 批量更新分类部分失败:', result.errors);
      }
      
      // 清除选中状态
      imageIds.forEach(id => {
        UnifiedDataService.setImageSelection(id, false);
      });
      
      // 重新加载数据（上面的操作已经重建了缓存）
      await loadImages();
      setSelectionMode(false);
      
      const successMessage = result.success 
        ? `已将 ${result.processed} 张图片移动到"${categoryName}"`
        : `已将 ${result.processed} 张图片移动到"${categoryName}"，${result.errors?.length || 0} 张失败`;
      
      Alert.alert('操作完成', successMessage);
    } catch (error) {
      logger.error('❌ 批量修改分类失败:', error);
      Alert.alert('操作失败', error.message);
    }
  };

  /**
   * 批量分享文件
   */
  const batchShare = async (imageIds) => {
    try {
      if (imageIds.length === 0) {
        Alert.alert('提示', '请先选择图片');
        return;
      }
      
      if (imageIds.length === 1) {
        // 单张图片：直接分享
        const image = images.find(img => img.id === imageIds[0]);
        if (!image) {
          Alert.alert('错误', '图片不存在');
          return;
        }
        
        try {
          const result = await Share.share({
            url: image.uri,
            message: '分享图片',
          });
          
          if (result.action === Share.sharedAction) {
            logger.debug('✅ 分享成功');
          } else if (result.action === Share.dismissedAction) {
            logger.debug('用户取消分享');
          }
        } catch (error) {
          logger.error('❌ 分享失败:', error);
          Alert.alert('分享失败', '请重试');
        }
    } else {
        // 多张图片：提示用户
        Alert.alert(
          '分享多张图片',
          `已选择 ${imageIds.length} 张图片。\n\n由于系统限制，一次只能分享一张图片。\n\n建议：\n1. 取消选择，只选一张图片\n2. 或使用相册的批量分享功能`,
          [{ text: '知道了' }]
        );
      }
    } catch (error) {
      logger.error('❌ 分享操作失败:', error);
      Alert.alert('操作失败', '分享时发生错误');
    }
  };

  /**
   * 批量放入暂存箱
   */
  const batchMoveToStaging = async (imageIds) => {
    Alert.alert(
      '暂存',
      `确定要将选中的 ${imageIds.length} 张图片暂存到待处置吗？\n\n这些图片将被移动到"待处置"分类中。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '标记',
          onPress: async () => {
            try {
              // 使用批量更新接口，提升性能
              const result = await UnifiedDataService.updateImagesCategory(imageIds, 'tobecleaned', 'manual');
              
              // 清理相似组数据（如果图片在相似组中）
              for (const id of imageIds) {
                try {
                  const image = images.find(img => img.id === id);
                  if (image && image.similarityGroupIndex) {
                    await UnifiedDataService.removeImageFromSimilarityGroup(id, image.similarityGroupIndex);
                  }
                } catch (error) {
                  logger.error(`❌ 清理相似组数据失败: ${id}`, error);
                }
              }
              
              // 清除选中状态
              imageIds.forEach(id => {
                UnifiedDataService.setImageSelection(id, false);
              });
              
              // 重新加载数据（上面的操作已经重建了缓存）
              await loadImages();
              setSelectionMode(false);
              
              const successMessage = result.success 
                ? `已成功将 ${result.processed} 张图片移到待处置分类`
                : `已成功将 ${result.processed} 张图片移到待处置分类，${result.errors?.length || 0} 张失败`;
              
              Alert.alert('操作完成', successMessage);
            } catch (error) {
              logger.error('❌ 批量暂存失败:', error);
              Alert.alert('操作失败', '暂存时发生错误，请重试');
            }
          },
        },
      ]
    );
  };

  /**
   * 批量删除（仅用于 tobecleaned 分类，与 PC 端一致）
   */
  const batchDelete = async (imageIds) => {
    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${imageIds.length} 张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复！`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              // 使用批量删除 API（与 PC 端一致）
              await UnifiedDataService.writeDeleteImages(imageIds, (progress) => {
                logger.debug(`删除进度: ${progress.filesDeleted}/${progress.total}`);
              });
              
              // 清除选中状态
              imageIds.forEach(id => {
                UnifiedDataService.setImageSelection(id, false);
              });
              
              // 重新加载数据（上面的操作已经重建了缓存）
              await loadImages();
              setSelectionMode(false);
              
              Alert.alert('删除完成', `已删除 ${imageIds.length} 张图片`);
            } catch (error) {
              logger.error('❌ 批量删除失败:', error);
              Alert.alert('操作失败', '删除时发生错误，请重试');
            }
          },
        },
      ]
    );
  };



  /**
   * 保留选中（相似组分类中使用：将其他相似图片移到暂存箱）
   */
  const batchKeep = async (keepIds) => {
    if (!similarityGroupId) {
      Alert.alert('提示', '此功能仅在相似组分类中可用');
      return;
    }
    
    const moveIds = images.filter(img => !keepIds.includes(img.id)).map(img => img.id);
    
    if (moveIds.length === 0) {
      Alert.alert('提示', '没有需要移动的图片');
      return;
    }
    
    Alert.alert(
      '保留选中图片',
      `确定要保留选中的 ${keepIds.length} 张图片吗？\n\n其他 ${moveIds.length} 张相似图片将被移到暂存箱中。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            // 复用批量移到暂存箱的函数
            await batchMoveToStaging(moveIds);
            
            // 清除保留图片的选中状态
            keepIds.forEach(id => {
              UnifiedDataService.setImageSelection(id, false);
            });
            
            Alert.alert('操作完成', `已保留 ${keepIds.length} 张图片，${moveIds.length} 张相似图片已移到暂存箱`);
          },
        },
      ]
    );
  };

  // ==================== 渲染函数 ====================

  /**
   * 渲染图片项
   */
  const renderImageItem = ({ item }) => {
    // 🆕 添加空值检查
    if (!item || !item.id || !item.uri) {
      console.warn('⚠️ renderImageItem 发现无效的图片对象:', item);
      return null;
    }
    
    logger.debug('🔍 renderImageItem 渲染图片:', item.id);
    const isSelected = UnifiedDataService.isImageSelected(item.id);
    
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: item.uri }}
          style={styles.gridImage}
          resizeMode="cover"
        />
        {selectionMode && (
          <View style={[styles.selectionOverlay, isSelected && styles.selectedOverlay]}>
            {isSelected && (
              <View style={styles.checkmark}>
                <Text style={styles.checkmarkText}>✓</Text>
    </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /**
   * 渲染顶部操作栏
   */
  const renderTopBar = () => {
    if (!selectionMode) return null;

    // 使用状态中的选中数量

    return (
      <View style={styles.selectionBar}>
        <TouchableOpacity onPress={exitSelectionMode}>
          <Text style={styles.selectionCancel}>取消</Text>
          </TouchableOpacity>
          <Text style={styles.selectionCount}>
          已选 {selectedCount}/{images.length}
          </Text>
        <TouchableOpacity onPress={toggleSelectAll}>
          <Text style={styles.selectionAll}>
            {selectedCount === images.length && images.length > 0 ? '取消全选' : '全选'}
          </Text>
        </TouchableOpacity>
        </View>
    );
  };

  /**
   * 渲染底部操作栏
   */
  const renderBottomBar = () => {
    if (!selectionMode || selectedCount === 0) return null;
    
    const actions = getActionButtons();

    return (
      <View style={styles.actionBar}>
        {actions.map(action => (
          <TouchableOpacity
            key={action.id}
            style={[styles.actionButton, { borderColor: action.color }]}
            onPress={() => handleBatchAction(action.id)}
          >
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={[styles.actionLabel, { color: action.color }]}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  /**
   * 渲染列表底部
   */
  const renderFooter = () => {
    if (!loadingMore) return null;
      return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color="#007AFF" />
        </View>
      );
  };

  /**
   * 渲染空状态
   */
  const renderEmpty = () => (
        <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📭</Text>
      <Text style={styles.emptyText}>暂无图片</Text>
        </View>
      );

  /**
   * 渲染时间轴视图
   */
  const renderTimeline = () => {
    if (Object.keys(groupedImages).length === 0) {
      return renderEmpty();
    }

    return (
      <FlatList
        ref={flatListRef}
        data={Object.keys(groupedImages)}
        keyExtractor={(dateKey) => dateKey}
        onScrollToIndexFailed={(info) => {
          // 使用debug级别日志，避免在release版本中显示告警
          logger.debug('📜 滚动失败，使用回退方案:', info);
          
          // 智能回退方案
          if (info.index >= 0 && info.index < Object.keys(groupedImages).length) {
            // 如果目标索引有效，尝试滚动到接近的位置
            const safeIndex = Math.min(info.index, Object.keys(groupedImages).length - 1);
            logger.debug(`📜 回退到安全索引: ${safeIndex}`);
            
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({
                  index: safeIndex,
                  animated: true,
                  viewPosition: 0.5,
                });
              } catch (retryError) {
                logger.debug('📜 回退滚动也失败，滚动到顶部');
                flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
              }
            }, 200);
          } else {
            // 如果索引无效，滚动到顶部
            setTimeout(() => {
              flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
            }, 100);
          }
        }}
        renderItem={({ item: dateKey }) => {
          const imagesForDate = groupedImages[dateKey];
          // 使用 UnifiedDataService 直接查询选中状态（与 PC 端一致）
          const selectedCountInGroup = imagesForDate.filter(img => {
            // 🆕 添加空值检查
            if (!img || !img.id) {
              console.warn('⚠️ 时间轴中发现无效的图片对象:', img);
              return false;
            }
            return UnifiedDataService.isImageSelected(img.id);
          }).length;
          const someSelected = selectedCountInGroup > 0;
          
          return (
            <View style={styles.timelineSection}>
              <TouchableOpacity 
                style={styles.timelineHeader}
                onPress={() => handleTimelineHeaderPress(imagesForDate)}
                activeOpacity={0.7}
              >
                <View style={styles.timelineHeaderContent}>
                  <Text style={styles.timelineDate}>{dateKey}</Text>
                  <Text style={styles.timelineCount}>
                    ({imagesForDate.length} 张{someSelected && ` · 已选 ${selectedCountInGroup}`})
                  </Text>
                </View>
                {someSelected && selectionMode && (
                  <View style={styles.timelineSelectionIndicator}>
                    <Text style={styles.timelineSelectionIndicatorText}>
                      {selectedCountInGroup === imagesForDate.length ? '✓ 全选' : '○ 部分选中'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            <View style={styles.timelineGrid}>
              {groupedImages[dateKey].map((image, index) => {
                // 🆕 添加空值检查
                if (!image || !image.id || !image.uri) {
                  console.warn('⚠️ 时间轴渲染中发现无效的图片对象:', image);
                  return null;
                }
                
                return (
                  <TouchableOpacity
                    key={image.id}
                    style={[
                      styles.timelineItem,
                      UnifiedDataService.isImageSelected(image.id) && styles.timelineItemSelected,
                      highlightedImageId === image.id && styles.timelineItemHighlighted
                    ]}
                    onPress={() => {
                      if (selectionMode) {
                        toggleImageSelection(image.id);
                      } else {
                        const allImages = Object.values(groupedImages).flat();
                        const currentIndex = allImages.findIndex(img => img.id === image.id);
                        navigation.navigate('ImagePreview', {
                          image: image,
                          allImages: allImages,
                          currentIndex: currentIndex,
                          category,
                          city,
                          similarityGroupId,
                          fromScreen: 'CategoryScreen'
                        });
                      }
                    }}
                    onLongPress={() => {
                      if (!selectionMode) {
                        enterSelectionMode();
                        toggleImageSelection(image.id);
                      }
                    }}
                  >
                    <Image
                      source={{ uri: image.uri }}
                      style={styles.timelineImage}
                      resizeMode="cover"
                    />
                    {selectionMode && (
                      <View style={[
                        styles.timelineSelectionOverlay,
                        UnifiedDataService.isImageSelected(image.id) && styles.timelineSelectionOverlaySelected
                      ]}>
                        <Text style={styles.timelineSelectionText}>
                          {UnifiedDataService.isImageSelected(image.id) ? '✓' : ''}
                        </Text>
                    </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              </View>
            </View>
          );
        }}
        contentContainerStyle={styles.timelineContainer}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ListEmptyComponent={renderEmpty}
      />
    );
  };

  /**
   * 渲染分类选择器模态框
   */
  const renderCategoryModal = () => {
    // 🆕 添加空值检查
    if (!configService || !configService.isConfigLoaded()) {
      console.warn('⚠️ configService 未加载，跳过分类模态框渲染');
      return null;
    }
    
    const categories = configService.getAllCategoriesWithUI();
    // 🆕 添加空值检查
    if (!Array.isArray(categories)) {
      console.warn('⚠️ getAllCategoriesWithUI 返回非数组数据:', categories);
      return null;
    }
    
    const availableCategories = categories.filter(cat => {
      // 🆕 添加空值检查
      if (!cat || typeof cat !== 'object') {
        console.warn('⚠️ 发现无效的分类对象:', cat);
        return false;
      }
      return cat.id !== 'tobecleaned';
    });

    return (
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={closeCategoryModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* 标题栏 */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>选择分类</Text>
              <Text style={styles.modalSubtitle}>
                将 {pendingImageIds.length} 张图片移动到：
              </Text>
          </View>

            {/* 分类列表 */}
            <ScrollView style={styles.categoryList}>
              {availableCategories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={styles.categoryItem}
                  onPress={() => selectCategory(cat.id)}
                >
                  <Text style={styles.categoryIcon}>{cat.icon || '📁'}</Text>
                  <Text style={styles.categoryName}>{cat.chinese}</Text>
                </TouchableOpacity>
              ))}
      </ScrollView>

            {/* 取消按钮 */}
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={closeCategoryModal}
            >
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // ==================== 主渲染 ====================

  logger.debug('🔍 CategoryScreen 开始渲染:', { loading, imagesLength: images?.length });

  if (loading) {
    logger.debug('🔍 CategoryScreen 渲染加载状态');
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  logger.debug('🔍 CategoryScreen 渲染主要内容');
  
  // 🆕 添加调试日志
  logger.debug('🔍 CategoryScreen 开始渲染各个组件...');
  
  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            // 如果没有历史记录，导航到主页面
            navigation.navigate('Home');
          }
        }} style={styles.backButton}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getPageTitle()}</Text>
        <View style={styles.headerRight} />
          </View>

      {/* 选择模式操作栏 */}
      {renderTopBar()}

      {/* 时间轴视图 */}
      {renderTimeline()}

      {/* 底部操作栏 */}
      {renderBottomBar()}

      {/* 分类选择器模态框 */}
      {renderCategoryModal()}
    </SafeAreaView>
  );
};

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    height: 56,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    fontSize: 32,
    color: '#007AFF',
    fontWeight: 'bold',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
  },
  
  // 选择栏
  selectionBar: {
    height: 44,
    backgroundColor: '#1C1C1E',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
  },
  selectionCancel: {
    fontSize: 16,
    color: '#007AFF',
  },
  selectionCount: {
     fontSize: 16,
    color: '#FFFFFF',
     fontWeight: '600',
  },
  selectionAll: {
     fontSize: 16,
    color: '#007AFF',
  },
  
  // 网格
  gridContainer: {
    padding: 2,
  },
  gridItem: {
    width: GRID_ITEM_SIZE,
    height: GRID_ITEM_SIZE,
    padding: 2,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedOverlay: {
    backgroundColor: 'rgba(0,122,255,0.3)',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  
  // 操作栏
  actionBar: {
    flexDirection: 'row',
    backgroundColor: '#1C1C1E',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#3A3A3C',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  
  // 底部加载
  footer: {
    padding: 16,
    alignItems: 'center',
  },
  
  // 空状态
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: '#8E8E93',
  },
  
  // 时间轴样式
   timelineContainer: {
     padding: 8,
   },
  timelineSection: {
    marginBottom: 20,
   },
  timelineHeader: {
     flexDirection: 'row',
     alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  timelineHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
     flex: 1,
   },
  timelineDate: {
    fontSize: 15,
     fontWeight: '600',
    color: '#FFFFFF',
  },
  timelineCount: {
    fontSize: 13,
    color: '#8E8E93',
    marginLeft: 6,
  },
  timelineSelectionIndicator: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timelineSelectionIndicatorText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  timelineGrid: {
     flexDirection: 'row',
     flexWrap: 'wrap',
     justifyContent: 'flex-start',
   },
  timelineItem: {
    width: (SCREEN_WIDTH - 32) / 4, // 4列布局
    height: (SCREEN_WIDTH - 32) / 4,
    margin: 2,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  timelineItemSelected: {
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  timelineItemHighlighted: {
    borderWidth: 3,
    borderColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  timelineImage: {
    width: '100%',
    height: '100%',
  },
  timelineSelectionOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  timelineSelectionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // 分类选择器模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
  },
  categoryList: {
    maxHeight: 400,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 16,
    color: '#FFFFFF',
    flex: 1,
  },
  modalCancelButton: {
    padding: 16,
     alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#3A3A3C',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
   },
});

export default CategoryScreen;
