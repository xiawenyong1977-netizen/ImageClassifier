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
  Alert,
  ActivityIndicator,
  Share,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useFocusEffect } from '../../adapters/WebAdapters';
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
  
  // 强制刷新计数器（用于触发重新渲染）
  const [refreshCounter, setRefreshCounter] = useState(0);
  
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
    const count = images.length;
    
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
  
  // 获取当前选中的图片数量（从 UnifiedDataService）
  const getSelectedCount = useCallback(() => {
    let count = 0;
    for (const image of images) {
      if (UnifiedDataService.isImageSelected(image.id)) {
        count++;
      }
    }
    return count;
  }, [images, refreshCounter]); // 依赖 refreshCounter 触发重新计算
  
  // 全选/取消全选（与 PC 端同步到 UnifiedDataService）
  const toggleSelectAll = useCallback(() => {
    const selectedCount = getSelectedCount();
    
    if (selectedCount === images.length && images.length > 0) {
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
    
    // 触发重新渲染
    setRefreshCounter(prev => prev + 1);
  }, [images, getSelectedCount]);

  // 切换图片选择状态（直接使用 UnifiedDataService，与 PC 端一致）
  const toggleImageSelection = useCallback((imageId) => {
    const isCurrentlySelected = UnifiedDataService.isImageSelected(imageId);
    UnifiedDataService.setImageSelection(imageId, !isCurrentlySelected);
    
    // 触发重新渲染
    setRefreshCounter(prev => prev + 1);
  }, []);

  // 进入选择模式
  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
  }, []);

  // 退出选择模式
  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setShowActionMenu(false);
  }, []);

  // 批量修改分类
  const handleBatchChangeCategory = useCallback(async (newCategory) => {
    const selectedCount = getSelectedCount();
    if (selectedCount === 0) return;
    
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
  }, [getSelectedCount, images, loadImages]);

  // 批量删除/暂存
  const handleBatchDelete = useCallback(() => {
    const selectedCount = getSelectedCount();
    if (selectedCount === 0) return;
    
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
  }, [getSelectedCount, images, category, loadImages]);

  // ==================== 时间轴分组相关函数 ====================
  
  // 时间轴标题点击处理 - 全选/取消全选该时间段的所有图片（与 PC 端一致）
  const handleTimelineHeaderPress = useCallback((imagesForDate) => {
    if (!selectionMode) {
      // 非选择模式下，进入选择模式并全选该组
      setSelectionMode(true);
      imagesForDate.forEach(img => {
        UnifiedDataService.setImageSelection(img.id, true);
      });
      setRefreshCounter(prev => prev + 1);
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
    
    // 触发重新渲染
    setRefreshCounter(prev => prev + 1);
    
    // 检查是否还有选中的图片，如果没有则退出选择模式
    const selectedCount = getSelectedCount();
    if (selectedCount === 0) {
      setSelectionMode(false);
    }
  }, [selectionMode, getSelectedCount]);
  
  // 按日期分组图片（与 PC 端字段对齐）
  const groupImagesByDate = useCallback((imageList) => {
    const groups = {};
    
    imageList.forEach(image => {
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
      
      // 格式化为 YYYY年MM月DD日
      const dateKey = date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(image);
    });
    
    // 按日期排序（倒序）
    const sortedGroups = {};
    Object.keys(groups).sort((a, b) => {
      // 将中文日期转换回 Date 对象进行比较
      const dateA = new Date(a.replace(/年|月/g, '-').replace(/日/g, ''));
      const dateB = new Date(b.replace(/年|月/g, '-').replace(/日/g, ''));
      return dateB - dateA;
    }).forEach(key => {
      sortedGroups[key] = groups[key];
    });
    
    return sortedGroups;
  }, []);


  useEffect(() => {
    loadImages();
  }, [category, city, similarityGroupId]);

  // 页面获得焦点时刷新数据（用于 Tab 切换）
  useFocusEffect(
    useCallback(() => {
      // 检查是否从 ImagePreview 返回，并携带了返回的图片 ID
      const returnedImageId = route.params?.returnedImageId;
      if (returnedImageId) {
        logger.debug('🎯 从 ImagePreview 返回，当前图片ID:', returnedImageId);
        // 设置高亮
        setHighlightedImageId(returnedImageId);
        
        // 3秒后取消高亮
        setTimeout(() => {
          setHighlightedImageId(null);
        }, 3000);
        
        // 滚动到包含该图片的日期组
        setTimeout(() => {
          scrollToHighlightedImage(returnedImageId);
        }, 100);
        
        // 清除 navigation 参数，避免重复触发
        navigation.setParams({ returnedImageId: undefined });
      } else {
        // 正常的焦点刷新
        loadImages(true);
      }
    }, [category, city, similarityGroupId, route.params?.returnedImageId])
  );

  // 滚动到高亮图片所在的日期组
  const scrollToHighlightedImage = useCallback((imageId) => {
    if (!flatListRef.current || Object.keys(groupedImages).length === 0) return;
    
    // 查找图片所在的日期组索引
    const dateKeys = Object.keys(groupedImages);
    let targetDateIndex = -1;
    
    for (let i = 0; i < dateKeys.length; i++) {
      const dateKey = dateKeys[i];
      if (groupedImages[dateKey].some(img => img.id === imageId)) {
        targetDateIndex = i;
        break;
      }
    }
    
    if (targetDateIndex >= 0) {
      logger.debug(`📜 滚动到日期组索引: ${targetDateIndex}`);
      flatListRef.current.scrollToIndex({
        index: targetDateIndex,
        animated: true,
        viewPosition: 0.3, // 将目标组滚动到屏幕上方 30% 的位置
      });
    }
  }, [groupedImages]);

  // 图片加载后自动分组
  useEffect(() => {
    if (images.length > 0) {
      const grouped = groupImagesByDate(images);
      setGroupedImages(grouped);
    } else {
      // 如果没有图片，清空分组
      setGroupedImages({});
    }
  }, [images, groupImagesByDate]);

  /**
   * 加载图片列表
   */
  const loadImages = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setPage(1);
      } else {
        setLoading(true);
      }

      let filteredImages = [];
      
      if (similarityGroupId) {
        // 从相似组获取图片（使用 UnifiedDataService API）
        const groupData = await UnifiedDataService.getSimilarityGroupImages(similarityGroupId);
        filteredImages = groupData.images || [];
        // 过滤掉 tobecleaned 分类的照片
        filteredImages = filteredImages.filter(img => img.category !== 'tobecleaned');
        logger.debug(`从相似组获取图片: 总数=${filteredImages.length}, groupId=${similarityGroupId}, 已过滤tobecleaned`);
      } else if (city) {
        // 按城市加载
        filteredImages = await UnifiedDataService.readImagesByLocation(city, null);
        // 过滤掉 tobecleaned 分类的照片
        filteredImages = filteredImages.filter(img => img.category !== 'tobecleaned');
        logger.debug(`从城市获取图片: 总数=${filteredImages.length}, city=${city}, 已过滤tobecleaned`);
      } else if (category) {
        // 按分类加载
        filteredImages = await UnifiedDataService.readImagesByCategory(category);
        logger.debug(`从分类获取图片: 总数=${filteredImages.length}, category=${category}`);
    } else {
        logger.error('没有有效的上下文参数（category、city、similarityGroupId），无法加载图片');
        filteredImages = [];
      }

      // 按时间倒序排序
      filteredImages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setImages(filteredImages);
      setHasMore(filteredImages.length > ITEMS_PER_PAGE);
      
      // 检查是否有选中的图片（直接从 UnifiedDataService 查询）
      let selectedCount = 0;
      for (const image of filteredImages) {
        if (UnifiedDataService.isImageSelected(image.id)) {
          selectedCount++;
        }
      }
      
      // 如果有选中的图片，自动进入选择模式
      if (selectedCount > 0) {
        setSelectionMode(true);
        logger.debug(`✅ 自动进入选择模式，已选中 ${selectedCount} 张图片`);
    } else {
        setSelectionMode(false);
        logger.debug(`📋 无选中图片，普通浏览模式`);
      }
      
      logger.debug(`📸 加载图片: ${filteredImages.length}张`);

    } catch (error) {
      logger.error('❌ 加载图片失败:', error);
      Alert.alert('加载失败', error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  /**
   * 下拉刷新
   */
  const onRefresh = useCallback(async () => {
    await GlobalImageCache.buildCache();
    await loadImages(true);
  }, [loadImages]);

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
      setRefreshCounter(prev => prev + 1);
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
      const selectedCount = getSelectedCount();
      if (selectedCount === 0) {
        setSelectionMode(false);
      }
    }
  };

  /**
   * 取消选择模式（与 PC 端同步清除 UnifiedDataService）
   */
  const cancelSelection = () => {
    // 清除所有选中状态
    images.forEach(img => {
      if (UnifiedDataService.isImageSelected(img.id)) {
        UnifiedDataService.setImageSelection(img.id, false);
      }
    });
    
    setSelectionMode(false);
    setRefreshCounter(prev => prev + 1);
  };

  // ==================== 批量操作 ====================

  /**
   * 执行批量操作
   */
  const handleBatchAction = async (actionId) => {
    try {
      const selectedIds = images
        .filter(img => UnifiedDataService.isImageSelected(img.id))
        .map(img => img.id);
      
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
      
      for (const imageId of imageIds) {
        await UnifiedDataService.updateImageCategory(imageId, newCategory);
      }
      
      // 清除选中状态
      imageIds.forEach(id => {
        UnifiedDataService.setImageSelection(id, false);
      });
      
      // 重新加载数据（与 PC 端一致，不需要重建缓存）
      await loadImages();
      setSelectionMode(false);
      
      Alert.alert('成功', `已将 ${imageIds.length} 张图片移动到"${categoryName}"`);
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
              let processed = 0;
              for (const id of imageIds) {
                try {
                  // 更新分类为tobecleaned
                  await UnifiedDataService.updateImageCategory(id, 'tobecleaned');
                  
                  // 清理相似组数据（如果图片在相似组中）
                  const image = images.find(img => img.id === id);
                  if (image && image.similarityGroupIndex) {
                    await UnifiedDataService.removeImageFromSimilarityGroup(id, image.similarityGroupIndex);
                  }
                  
                  processed++;
                } catch (error) {
                  logger.error(`❌ 标记图片失败: ${id}`, error);
                }
              }
              
              // 清除选中状态
              imageIds.forEach(id => {
                UnifiedDataService.setImageSelection(id, false);
              });
              
              // 重新加载数据（与 PC 端一致，不需要重建缓存）
              await loadImages();
              setSelectionMode(false);
              
              Alert.alert('操作完成', `已成功将 ${processed} 张图片移到待处置分类`);
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
              
              // 重新加载数据（与 PC 端一致，不需要重建缓存）
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
   * 删除其他（保留选中）
   */
  const batchDeleteOthers = async (keepIds) => {
    const deleteIds = images.filter(img => !keepIds.includes(img.id)).map(img => img.id);
    
    Alert.alert(
      '删除其他图片',
      `确定要删除未选中的 ${deleteIds.length} 张图片吗？\n\n将保留选中的 ${keepIds.length} 张图片`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            await batchDelete(deleteIds);
          },
        },
      ]
    );
  };

  /**
   * 全部删除
   */
  const batchDeleteAll = async () => {
    const allIds = images.map(img => img.id);
    await batchDelete(allIds);
  };

  /**
   * 保留选中
   */
  const batchKeep = async (keepIds) => {
    Alert.alert('成功', `已标记保留 ${keepIds.length} 张图片`);
  };

  // ==================== 渲染函数 ====================

  /**
   * 渲染图片项
   */
  const renderImageItem = ({ item }) => {
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

    const selectedCount = getSelectedCount();

    return (
      <View style={styles.selectionBar}>
        <TouchableOpacity onPress={cancelSelection}>
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
    const selectedCount = getSelectedCount();
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
          logger.warn('滚动失败:', info);
          // 回退方案：滚动到顶部
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 100);
        }}
        renderItem={({ item: dateKey }) => {
          const imagesForDate = groupedImages[dateKey];
          // 使用 UnifiedDataService 直接查询选中状态（与 PC 端一致）
          const selectedCountInGroup = imagesForDate.filter(img => 
            UnifiedDataService.isImageSelected(img.id)
          ).length;
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
              {groupedImages[dateKey].map((image, index) => (
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
                ))}
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
    const categories = configService.getAllCategoriesWithUI();
    const availableCategories = categories.filter(cat => cat.id !== 'tobecleaned');

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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
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
