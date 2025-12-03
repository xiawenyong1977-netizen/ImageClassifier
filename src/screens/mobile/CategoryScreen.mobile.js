/**
 * 芯图相册 - 移动端分类详情页（通用）
 * 
 * 支持4种形态：
 * 1. 普通分类页 (category参数)
 * 2. 暂存箱页 (category='stagingBox')
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
  NativeModules,
} from 'react-native';
import { SafeAreaView, useFocusEffect, Alert } from '../../adapters/WebAdapters';
import { DeviceEventEmitter } from 'react-native';
import UnifiedDataService from '../../services/UnifiedDataService';
import WeChatAuthService from '../../services/WeChatAuthService';
import GlobalImageCache from '../../services/GlobalImageCache';
import configService from '../../services/ConfigService';
import { logger, getUri } from '../../adapters/WebAdapters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_COLUMNS = 3;
const GRID_ITEM_SIZE = (SCREEN_WIDTH - 8) / GRID_COLUMNS; // 减去间距

const CategoryScreen = ({ route, navigation }) => {
  // ==================== 路由参数 ====================
  const { category, city, similarityGroupId, color, filterType, filterValue, fromScreen } = route.params || {};
  
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
  
  // 操作进度相关状态
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 0 });
  
  const [showUpdateProgress, setShowUpdateProgress] = useState(false);
  const [updateProgress, setUpdateProgress] = useState({ filesProcessed: 0, filesFailed: 0, total: 0 });
  const [updateOperationType, setUpdateOperationType] = useState(''); // 'changeCategory' 或 'moveToStaging'
  
  // 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // 时间轴分组
  const [groupedImages, setGroupedImages] = useState({});
  
  // 高亮图片（从 ImagePreview 返回时使用）
  const [highlightedImageId, setHighlightedImageId] = useState(null);
  const flatListRef = useRef(null);
  const hasProcessedReturnedImageIdRef = useRef(false); // 用于防止重复处理 returnedImageId
  
  // 暂存箱图片ID集合（用于快速检查图片是否在暂存箱中）
  const [stagingBoxImageIds, setStagingBoxImageIds] = useState(new Set());
  
  // 照片创玩任务相关（任务提交已移到结果页，不再需要状态跟踪）
  
  const ITEMS_PER_PAGE = 50;

  // ==================== 页面类型判断 ====================
  const pageType = category ? 'category' : city ? 'city' : similarityGroupId ? 'similarity' : color ? 'color' : filterType === 'directory' ? 'directory' : null;
  const isStaging = category === 'stagingBox';

  // 照片创玩（增强方案）
  const [showEnhancePresets, setShowEnhancePresets] = useState(false);
  const [enhancePresets, setEnhancePresets] = useState({});

  /**
   * 截断过长的文本，添加省略号
   */
  const truncateText = (text, maxLength = 20) => {
    if (!text || typeof text !== 'string') return text;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  /**
   * 获取页面标题（与 PC 端格式一致）
   */
  const getPageTitle = () => {
    // 🆕 添加空值检查
    const count = Array.isArray(images) ? images.length : 0;
    
    if (similarityGroupId) {
      return `相似照片组 (${count}张)`;
    }
    if (filterType === 'directory' && filterValue) {
      // 提取目录名（最后一个路径段）
      const directoryName = filterValue.split('/').pop() || filterValue;
      // 截断过长的目录名
      const truncatedName = truncateText(directoryName, 20);
      return `${truncatedName} (${count}张)`;
    }
    if (city) {
      return `${city} (${count}张)`;
    }
    if (color) {
      return `${color} (${count}张)`;
    }
    if (category) {
      // 暂存箱特殊处理，显示中文"暂存箱"
      if (category === 'stagingBox') {
        return `暂存箱 (${count}张)`;
      }
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
      // 暂存箱（stagingBox）：移出、删除、创玩、分类、分享
      return [
        { id: 'removeFromStaging', label: '移出', icon: '➡️', color: '#FF9500' },
        { id: 'delete', label: '删除', icon: '🗑️', color: '#FF3B30' },
        { id: 'enhance', label: '创玩', icon: '✨', color: '#9C27B0' },
        { id: 'changeCategory', label: '分类', icon: '🏷️', color: '#007AFF' },
        { id: 'share', label: '分享', icon: '📤', color: '#34C759' },
      ];
    }
    
    // 所有非暂存箱的情况（普通分类、城市、相似组）：暂存、删除、创玩、分类、分享
    return [
      { id: 'staging', label: '暂存', icon: '📦', color: '#FF9500' },
      { id: 'delete', label: '删除', icon: '🗑️', color: '#FF3B30' },
      { id: 'enhance', label: '创玩', icon: '✨', color: '#9C27B0' },
      { id: 'changeCategory', label: '分类', icon: '📁', color: '#007AFF' },
      { id: 'share', label: '分享', icon: '📤', color: '#34C759' },
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
      } else if (filterType === 'directory' && filterValue) {
        // 目录页面：从所有选中图片中过滤出当前目录的图片（与颜色页面一致）
        const allSelected = UnifiedDataService.getSelectedImages();
        const directoryImageIds = new Set(images.map(img => img.id));
        const selectedInDirectory = allSelected.filter(img => directoryImageIds.has(img.id));
        return selectedInDirectory.length;
      } else if (color) {
        // 颜色页面：从所有选中图片中过滤出当前颜色的图片（与PC端一致）
        const allSelected = UnifiedDataService.getSelectedImages();
        const colorImageIds = new Set(images.map(img => img.id));
        const selectedInColor = allSelected.filter(img => colorImageIds.has(img.id));
        return selectedInColor.length;
      } else if (category === 'stagingBox') {
        // 暂存箱页面：直接获取暂存箱图片ID，然后只检查这些图片的选中状态
        const stagingBoxImageIds = images.map(img => img.id);
        const selectedInStagingBox = UnifiedDataService.getSelectedImagesByStagingBox(stagingBoxImageIds);
        return selectedInStagingBox.length;
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
        try {
          UnifiedDataService.setImageSelection(img.id, false);
        } catch (error) {
          // 忽略已删除图片的错误
          logger.debug(`⚠️ 跳过已删除图片的选择操作: ${img.id}`);
        }
      });
    } else {
      // 否则全选当前页面的所有图片
      images.forEach(img => {
        try {
          UnifiedDataService.setImageSelection(img.id, true);
        } catch (error) {
          // 忽略已删除图片的错误
          logger.debug(`⚠️ 跳过已删除图片的选择操作: ${img.id}`);
        }
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
                  await UnifiedDataService.updateImagesCategory([imageId], newCategory);
                  processed++;
                }
                
                // 清除选中状态
                selectedImageIds.forEach(id => {
                  try {
                    UnifiedDataService.setImageSelection(id, false);
                  } catch (error) {
                    logger.debug(`⚠️ 跳过已删除图片的选择操作: ${id}`);
                  }
                });
                setSelectionMode(false);
                setShowActionMenu(false);
                
                // 刷新数据
                await loadImages();
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
  
  const getLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
      
      // 使用本地日期键，避免 UTC 时区偏移导致跨天
      const dateKey = getLocalDateKey(date);
      
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
        await loadImages(); // 等待数据加载和状态更新完成
        
        // 重新计算选中数量 - 现在可以安全地使用最新的数据
        setSelectedCount(calculateSelectedCount());
        
        // 统一处理高亮逻辑
        const returnedImageId = route.params?.returnedImageId;
        
        // 先检查路由参数：如果 returnedImageId 为空，立即清除高亮并跳过后续逻辑
        if (!returnedImageId) {
          // 直接进入（如从底部导航栏或 HomeScreen）：立即清除之前的高亮
          setHighlightedImageId(null);
          // 重置标记
          hasProcessedReturnedImageIdRef.current = false;
          return; // 跳过后续的高亮设置逻辑
        }
        
        // 如果有 returnedImageId，检查是否已经处理过（防止重复触发）
        if (hasProcessedReturnedImageIdRef.current === returnedImageId) {
          return;
        }
        
        // 从 ImagePreview 返回：等待 1 秒后设置高亮（确保 images 状态已更新）
        setTimeout(() => {
          // 标记为已处理
          hasProcessedReturnedImageIdRef.current = returnedImageId;
          
          // 设置高亮（直接更新状态，不调用 navigation.setParams）
          setImages(currentImages => {
            const imageExists = currentImages.some(img => img.id === returnedImageId);
            if (imageExists) {
              setHighlightedImageId(returnedImageId);
            }
            return currentImages; // 不修改 images，只是读取
          });
          // 注意：不在这里清除 navigation 参数和 highligh，让高亮一直保持直到用户点击新照片
        }, 1000); // 等待 1 秒，确保 FlatList 完全渲染和测量
      };
      
      initData();
    }, [route.params?.returnedImageId])
  );

  // 监听数据变化，执行滚动和高亮操作
  useEffect(() => {
    if (Object.keys(groupedImages).length > 0 && highlightedImageId) {
      // 直接等待1秒，确保 FlatList 完全渲染和测量
      setTimeout(() => {
        scrollToHighlightedImage(highlightedImageId);
      }, 1000); // 直接等待1秒
      
      // 不再自动取消高亮，让图片一直保持高亮状态
    }
  }, [groupedImages, highlightedImageId]); // 依赖两个状态，确保数据和高亮都准备好

  // 滚动到高亮图片所在的日期组
  const scrollToHighlightedImage = (imageId) => {
    if (!imageId) {
      return;
    }
    
    if (!flatListRef.current || Object.keys(groupedImages).length === 0) {
      return;
    }
    
    // 查找图片所在的日期组索引
    const dateKeys = Object.keys(groupedImages);
    
    // 根据图片ID获取图片数据，然后根据时间找到日期组索引
    const targetImage = images.find(img => img.id === imageId);
    if (!targetImage) {
      // 清除无效的高亮ID
      setHighlightedImageId(null);
      return;
    }
    
    // 获取图片的时间，优先使用takenAt，没有则使用timestamp
    const imageTime = targetImage.takenAt || targetImage.timestamp;
    if (!imageTime) {
      return;
    }
    
    // 将时间转换为日期键格式
    const date = new Date(imageTime);
    const targetDateKey = getLocalDateKey(date);
    
    // 在日期组中找到对应的索引
    const targetDateIndex = dateKeys.indexOf(targetDateKey);
    
    if (targetDateIndex >= 0 && targetDateIndex < dateKeys.length) {
      // 直接滚动到目标日期组
      try {
        flatListRef.current.scrollToIndex({
          index: targetDateIndex,
          animated: true,
          viewPosition: 0.3, // 将目标组滚动到屏幕上方 30% 的位置
        });
      } catch (error) {
        // 简单回退：滚动到顶部
        flatListRef.current.scrollToOffset({ offset: 0, animated: true });
      }
    }
  };


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
        const groupData = await UnifiedDataService.getSimilarityGroupImages(similarityGroupId);
        filteredImages = groupData.images || [];
        // 移除过滤 tobecleaned 的逻辑
      } else if (filterType === 'directory' && filterValue) {
        // 🆕 按目录加载图片
        filteredImages = await UnifiedDataService.readImagesByDirectory(filterValue);
      } else if (city) {
        filteredImages = await UnifiedDataService.readImagesByLocation(city, null);
        // 移除过滤 tobecleaned 的逻辑
      } else if (color) {
        // 🆕 按颜色加载图片
        filteredImages = await UnifiedDataService.readImagesByColor(color);
      } else if (category === 'stagingBox') {
        // 🆕 使用 UnifiedDataService 的暂存箱接口
        filteredImages = await UnifiedDataService.getStagingBoxImages();
      } else if (category) {
        filteredImages = await UnifiedDataService.readImagesByCategory(category);
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
        const grouped = groupImagesByDate(filteredImages);
        setGroupedImages(grouped);
      } else {
        setGroupedImages({});
      }
      
      // 如果不是暂存箱页面，加载暂存箱图片ID列表（用于显示"已暂存"标签）
      if (!isStaging) {
        try {
          const stagingBoxImages = await UnifiedDataService.getStagingBoxImages();
          const stagingBoxIds = new Set(stagingBoxImages.map(img => img.id));
          setStagingBoxImageIds(stagingBoxIds);
        } catch (error) {
          logger.error('❌ 加载暂存箱图片ID失败:', error);
          setStagingBoxImageIds(new Set());
        }
      } else {
        // 暂存箱页面不需要加载
        setStagingBoxImageIds(new Set());
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
    // 只重新加载数据（从缓存读取），不重建缓存
    // 缓存只在数据真正变化时（扫描、删除）才重建
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
      // 注意：不需要在这里更新高亮，因为返回时会通过 returnedImageId 自动设置高亮
      const index = images.findIndex(img => img.id === image.id);
      
      // ✅ 使用 FlatList 懒加载，支持任意数量图片
      navigation.navigate('ImagePreview', {
        image: image,
        allImages: images,
        currentIndex: index,
        category,
        city,
        color,
        similarityGroupId,
        filterType,
        filterValue,
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
   * 清除选中状态
   */
  const clearSelections = () => {
    const selectedIds = getSelectedImageIds();
    selectedIds.forEach(id => {
      UnifiedDataService.setImageSelection(id, false);
    });
    setSelectedCount(calculateSelectedCount());
  };

  /**
   * 退出选择模式（保持选中状态不变）
   */
  function exitSelectionMode() {
    setSelectionMode(false);
    setShowActionMenu(false);
    // 不改变任何选中状态，保持用户的选中结果
  }

  /**
   * 处理取消按钮点击
   * - 当有选中图片时：清除选中状态
   * - 当没有选中图片时：退出选择模式
   */
  const handleCancelPress = () => {
    const currentSelectedCount = calculateSelectedCount();
    if (currentSelectedCount > 0) {
      // 有选中图片时，清除选中状态
      clearSelections();
    } else {
      // 没有选中图片时，退出选择模式
      exitSelectionMode();
    }
  };

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
      } else if (filterType === 'directory' && filterValue) {
        // 目录页面：从所有选中图片中过滤出当前目录的图片（与颜色页面一致）
        const allSelected = UnifiedDataService.getSelectedImages();
        const directoryImageIds = new Set(images.map(img => img.id));
        const selectedInDirectory = allSelected.filter(img => directoryImageIds.has(img.id));
        return selectedInDirectory.map(img => img.id);
      } else if (color) {
        // 颜色页面：从所有选中图片中过滤出当前颜色的图片（与PC端一致）
        const allSelected = UnifiedDataService.getSelectedImages();
        const colorImageIds = new Set(images.map(img => img.id));
        const selectedInColor = allSelected.filter(img => colorImageIds.has(img.id));
        return selectedInColor.map(img => img.id);
      } else if (category === 'stagingBox') {
        // 暂存箱页面：直接获取暂存箱图片ID，然后只检查这些图片的选中状态
        const stagingBoxImageIds = images.map(img => img.id);
        const selectedInStagingBox = UnifiedDataService.getSelectedImagesByStagingBox(stagingBoxImageIds);
        return selectedInStagingBox.map(img => img.id);
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
      // 点击任意底部按钮时，自动收起“照片创玩”面板
      if (showEnhancePresets) {
        setShowEnhancePresets(false);
      }
      const selectedIds = getSelectedImageIds();
      
      if (selectedIds.length === 0) {
        Alert.alert('提示', '请先选择图片');
        return;
      }

      switch (actionId) {
        case 'staging':
          await batchMoveToStaging(selectedIds);
          break;
        case 'removeFromStaging':
          await batchRemoveFromStagingBox(selectedIds);
          break;
        case 'changeCategory':
          await showCategorySelector(selectedIds);
          break;
        case 'delete':
          await batchDelete(selectedIds);
          break;
        case 'enhance':
          await openEnhancePanel();
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

  // 打开照片创玩面板并加载增强方案
  const openEnhancePanel = async () => {
    try {
      // 切换展开/收起
      if (showEnhancePresets) {
        setShowEnhancePresets(false);
        return;
      }
      const settings = await UnifiedDataService.readSettings();
      const presets = settings?.aiEnhancePresets || {};
      setEnhancePresets(presets);
      setShowEnhancePresets(true);
    } catch (error) {
      logger.error('加载增强方案失败:', error);
      Alert.alert('错误', '加载增强方案失败，请稍后重试');
    }
  };

  const closeEnhancePanel = () => {
    // 直接关闭面板（任务提交已在结果页处理，这里不需要额外逻辑）
    setShowEnhancePresets(false);
  };

  // 点击增强方案：数量与额度检查
  const handleEnhancePresetPress = async (presetId) => {
    try {
      const selectedIds = getSelectedImageIds();
      const count = selectedIds.length;
      if (count === 0 || count > 9) {
        Alert.alert('提示', '请先选择1-9张照片再使用“照片创玩”。');
        return;
      }

      // 会员状态检查
      const { isMember } = await WeChatAuthService.getMembershipStatus();
      if (!isMember) {
        Alert.alert('提示', '该功能仅对会员开放，请在设置页面开通终身会员后再试。');
        return;
      }

      // 额度检查
      const credits = await WeChatAuthService.getCredits();
      if (!credits || typeof credits.remaining !== 'number') {
        Alert.alert('错误', '获取额度失败，请稍后重试');
        return;
      }
      if (credits.remaining < count) {
        Alert.alert('提示', '剩余额度不足，请去“芯图相册”服务号购买额度');
        return;
      }

      // 弹出二次确认：显示剩余额度与本次消耗额度
      Alert.alert(
        '使用额度确认',
        `本次将消耗：${count}\n剩余额度：${credits.remaining}\n\n是否继续？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确认',
            style: 'default',
            onPress: async () => {
              try {
                setShowEnhancePresets(false);
                const presetName = (enhancePresets && enhancePresets[presetId] && enhancePresets[presetId].name) ? enhancePresets[presetId].name : presetId;
                await performEnhance(presetId, presetName, selectedIds);
              } catch (e) {
                logger.error('提交增强失败:', e);
                Alert.alert('错误', e.message || '提交失败，请稍后重试');
              }
            }
          }
        ]
      );
    } catch (error) {
      logger.error('增强检查失败:', error);
      Alert.alert('错误', error.message || '操作失败，请稍后重试');
    }
  };

  // 执行增强（占位函数：后续可接入真正的提交逻辑）
  const performEnhance = async (presetId, presetDisplayName, imageIds) => {
    try {
      // 读取选中图片的最新URI（使用 getUri 获取正确的 URI）
      const selectedItems = [];
      for (const id of imageIds) {
        const img = await UnifiedDataService.readImageById(id);
        if (img) {
          const uri = getUri(img);
          if (uri) {
            selectedItems.push({ id: img.id, uri: uri });
          } else {
            logger.warn(`⚠️ 无法获取图片 URI: ${id}`);
          }
        }
      }
      const uris = selectedItems.map((img) => img.uri);

      // 直接导航到结果页，任务提交和轮询在结果页中处理
      if (typeof navigation !== 'undefined') {
        navigation.navigate('EnhanceResult', {
          presetName: presetDisplayName,
          presetId: presetId, // 传递预设ID，结果页会自动提交任务
          selected: selectedItems,
          results: {}, // 不传结果，让结果页自动提交
          initialIndex: 0,
        });
      }
    } catch (error) {
      logger.error('导航到结果页失败:', error);
      Alert.alert('错误', error.message || '操作失败，请稍后重试');
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
      
      // 1. 先更新UI（立即响应用户操作）
      imageIds.forEach(id => {
        UnifiedDataService.setImageSelection(id, false);
      });
      setImages(prevImages => {
        const newImages = prevImages.filter(img => !imageIds.includes(img.id));
        
        // 同时更新分组图片
        if (newImages.length > 0) {
          const grouped = groupImagesByDate(newImages);
          setGroupedImages(grouped);
        } else {
          setGroupedImages({});
        }
        
        return newImages;
      });
      setSelectionMode(false);
      
      // 2. 显示进度提示
      setShowUpdateProgress(true);
      setUpdateOperationType('changeCategory');
      setUpdateProgress({ filesProcessed: imageIds.length, filesFailed: 0, total: imageIds.length });
      
      // 3. 执行数据库操作（后台进行）
      const result = await UnifiedDataService.updateImagesCategory(imageIds, newCategory, 'manual');
      
      // 4. 更新失败数量（如果有）
      setUpdateProgress({ filesProcessed: result.processed, filesFailed: result.errors?.length || 0, total: imageIds.length });
      
      if (result.success) {
      } else {
        logger.warn('⚠️ 批量更新分类部分失败:', result.errors);
      }
      
      // 5. 关闭进度提示
      setShowUpdateProgress(false);
    } catch (error) {
      logger.error('❌ 批量修改分类失败:', error);
      setShowUpdateProgress(false);
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

      if (imageIds.length > 9) {
        Alert.alert(
          '提示',
          `当前选中了 ${imageIds.length} 张图片。\n一次最多分享 9 张，请重新选择不超过 9 张的图片。`
        );
        return;
      }
      
      const selectedImages = images.filter(img => imageIds.includes(img.id));
      if (selectedImages.length === 0) {
        Alert.alert('错误', '没有找到选中的图片');
        return;
      }

      try {
        // 使用 getUri 获取正确的 URI
        const urls = selectedImages.map(img => {
          const uri = getUri(img);
          if (!uri) {
            logger.warn(`⚠️ 无法获取图片 URI: ${img.id}`);
          }
          return uri;
        }).filter(uri => uri != null); // 过滤掉无效的 URI
        
        if (urls.length === 0) {
          Alert.alert('错误', '无法获取图片 URI，请重试');
          return;
        }
        
        // 优先尝试使用原生模块分享（支持单张和多张）
        const { MultiImageShareModule } = NativeModules;
        if (MultiImageShareModule && MultiImageShareModule.shareMultipleImages) {
          // 使用原生模块分享（支持单张和多张）
          await MultiImageShareModule.shareMultipleImages(urls);
          if (urls.length > 1) {
            Alert.alert('分享成功', `已分享 ${urls.length} 张图片`);
          }
        } else {
          // 原生模块不可用，使用React Native Share
          if (urls.length === 1) {
            // 单张图片：只传url，不传message（避免被当作文本分享）
            // 添加 title 参数，让微信等分享目标显示"来自：芯图相册"
            const result = await Share.share({
              url: urls[0],
              title: '芯图相册',
            });
            
            if (result.action === Share.sharedAction) {
              // 分享成功
            }
          } else {
            // 多张图片：使用urls参数（不传message）
            // 添加 title 参数，让微信等分享目标显示"来自：芯图相册"
            const result = await Share.share({
              urls: urls,
              title: '芯图相册',
            });
            
            if (result.action === Share.sharedAction) {
              Alert.alert('分享成功', `已分享 ${urls.length} 张图片`);
            }
          }
        }
      } catch (error) {
        logger.error('❌ 分享失败:', error);
        Alert.alert('分享失败', '分享失败，请重试');
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
      `确定要将选中的 ${imageIds.length} 张图片暂存到待处置吗？\n\n这些图片将被移动到暂存箱中。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '标记',
          onPress: async () => {
            try {
              // 1. 清除选中状态（图片保留在当前分类中）
              imageIds.forEach(id => {
                UnifiedDataService.setImageSelection(id, false);
              });
              setSelectionMode(false);
              
              // 2. 显示进度提示
              setShowUpdateProgress(true);
              setUpdateOperationType('moveToStaging');
              setUpdateProgress({ filesProcessed: imageIds.length, filesFailed: 0, total: imageIds.length });
              
              // 3. 🆕 使用 UnifiedDataService.addToStagingBox 添加到暂存箱
              // 注意：addToStagingBox 内部已经会刷新缓存，不需要再次刷新
              const result = await UnifiedDataService.addToStagingBox(imageIds);
              
              // 4. 更新失败数量（如果有）
              setUpdateProgress({ 
                filesProcessed: result.added || imageIds.length, 
                filesFailed: result.errors?.length || 0, 
                total: imageIds.length 
              });
              
              // 5. 更新暂存箱图片ID集合（用于显示"已暂存"标签）
              if (!isStaging) {
                setStagingBoxImageIds(prev => {
                  const newSet = new Set(prev);
                  imageIds.forEach(id => newSet.add(id));
                  return newSet;
                });
              }
              
              // 6. 关闭进度提示
              setShowUpdateProgress(false);
            } catch (error) {
              logger.error('❌ 批量暂存失败:', error);
              setShowUpdateProgress(false);
              Alert.alert('操作失败', '暂存时发生错误，请重试');
            }
          },
        },
      ]
    );
  };

  /**
   * 批量从暂存箱移除
   */
  const batchRemoveFromStagingBox = async (imageIds) => {
    Alert.alert(
      '移出暂存箱',
      `确定要从暂存箱移除选中的 ${imageIds.length} 张图片吗？\n\n这些图片将从暂存箱中移除，但不会删除文件。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          onPress: async () => {
            try {
              // 1. 清除选中状态（图片保留在当前分类中）
              imageIds.forEach(id => {
                UnifiedDataService.setImageSelection(id, false);
              });
              setSelectionMode(false);
              
              // 2. 显示进度提示
              setShowUpdateProgress(true);
              setUpdateOperationType('removeFromStaging');
              setUpdateProgress({ filesProcessed: imageIds.length, filesFailed: 0, total: imageIds.length });
              
              // 3. 使用 UnifiedDataService.removeFromStagingBox 从暂存箱移除
              const result = await UnifiedDataService.removeFromStagingBox(imageIds);
              
              // 4. 更新失败数量（如果有）
              setUpdateProgress({ 
                filesProcessed: result.removed || imageIds.length, 
                filesFailed: result.errors?.length || 0, 
                total: imageIds.length 
              });
              
              // 5. 更新暂存箱图片ID集合（用于显示"已暂存"标签）
              if (!isStaging) {
                setStagingBoxImageIds(prev => {
                  const newSet = new Set(prev);
                  imageIds.forEach(id => newSet.delete(id));
                  return newSet;
                });
              }
              
              // 6. 关闭进度提示
              setShowUpdateProgress(false);
              
              // 7. 刷新图片列表（因为图片已从暂存箱移除）
              await loadImages();
            } catch (error) {
              logger.error('❌ 批量从暂存箱移除失败:', error);
              setShowUpdateProgress(false);
              Alert.alert('操作失败', '从暂存箱移除时发生错误，请重试');
            }
          },
        },
      ]
    );
  };

  /**
   * 批量删除（所有分类都支持）
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
              // 1. 显示进度提示
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: imageIds.length });
              
              // 2. 执行删除操作
              const result = await UnifiedDataService.writeDeleteImages(imageIds, (progress) => {
                logger.debug(`删除进度: ${progress.filesDeleted}/${progress.total}`);
                setDeleteProgress(progress);
              });
              
              // 3. 根据删除结果更新UI
              if (result) {
                // 只有真正删除成功的图片才从UI中移除
                const successfulImageIds = result.successfulImageIds || [];
                const failedImageIds = result.failedImageIds || [];
                
                // 清除选中状态
                imageIds.forEach(id => {
                  try {
                    UnifiedDataService.setImageSelection(id, false);
                  } catch (error) {
                    logger.debug(`⚠️ 跳过已删除图片的选择操作: ${id}`);
                  }
                });
                
                // 只从UI中移除成功删除的图片
                if (successfulImageIds.length > 0) {
                  setImages(prevImages => {
                    const newImages = prevImages.filter(img => !successfulImageIds.includes(img.id));
                    
                    // 同时更新分组图片
                    if (newImages.length > 0) {
                      const grouped = groupImagesByDate(newImages);
                      setGroupedImages(grouped);
                    } else {
                      setGroupedImages({});
                    }
                    
                    return newImages;
                  });
                }
                
                setSelectionMode(false);
                
                // 显示删除结果（只有失败时才显示弹窗）
                if (result.filesFailed > 0 || !result.success) {
                  Alert.alert(
                    '删除完成', 
                    `成功删除 ${result.filesDeleted || 0} 张图片，${result.filesFailed || imageIds.length} 张删除失败\n\n删除失败可能是因为缺少文件管理权限。请在系统设置中为应用开启"文件管理"或"所有文件访问"权限，然后重新尝试删除。`,
                    [
                      { text: '知道了', style: 'default' }
                    ]
                  );
                }
                // 全部成功时不显示弹窗，静默完成
              } else {
                // result 为 null，说明删除操作根本没有返回结果
                Alert.alert(
                  '删除失败', 
                  '删除操作失败\n\n删除失败可能是因为缺少文件管理权限。请在系统设置中为应用开启"文件管理"或"所有文件访问"权限，然后重新尝试删除。'
                );
              }
              
              // 4. 关闭进度提示
              setShowDeleteProgress(false);
            } catch (error) {
              // 删除失败通常是权限问题，属于正常情况，使用 debug 级别
              logger.debug('批量删除失败（可能是权限问题）:', error);
              setShowDeleteProgress(false);
              
              // 检查是否是权限相关的错误
              const errorMessage = error?.message || '';
              if (errorMessage.includes('权限') || errorMessage.includes('删除失败')) {
                Alert.alert(
                  '删除失败', 
                  '删除文件失败\n\n删除失败可能是因为缺少文件管理权限。请在系统设置中为应用开启"文件管理"或"所有文件访问"权限，然后重新尝试删除。'
                );
              } else {
                Alert.alert('操作失败', '删除时发生错误，请重试');
              }
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
    if (!item || !item.id) {
      console.warn('⚠️ renderImageItem 发现无效的图片对象:', item);
      return null;
    }
    
    // 使用 getUri 获取正确的 URI
    const imageUri = getUri(item);
    if (!imageUri) {
      console.warn('⚠️ renderImageItem 无法获取图片 URI:', item.id);
      return null;
    }
    
    const isSelected = UnifiedDataService.isImageSelected(item.id);
    
    return (
      <TouchableOpacity
        style={styles.gridItem}
        onPress={() => handlePress(item)}
        onLongPress={() => handleLongPress(item)}
        activeOpacity={0.8}
      >
        <Image
          source={{ uri: imageUri }}
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
        <TouchableOpacity onPress={handleCancelPress}>
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
        {isStaging && showEnhancePresets && (
          <View style={styles.enhancePanel}>
            <ScrollView
              style={styles.enhanceList}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
              contentContainerStyle={styles.enhanceListContent}
            >
              {Object.entries(enhancePresets)
                .sort(([, a], [, b]) => (a?.sortOrder || 0) - (b?.sortOrder || 0))
                .map(([presetId, preset], index) => (
                  <TouchableOpacity
                    key={presetId}
                    style={[
                      styles.enhancePresetItem,
                      ((index + 1) % 4 !== 0) && { marginRight: 6 },
                    ]}
                    onPress={() => handleEnhancePresetPress(presetId)}
                  >
                    <Text style={styles.presetName} numberOfLines={1}>
                      {preset.name || presetId}
                    </Text>
                  </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
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
          // 智能回退方案
          if (info.index >= 0 && info.index < Object.keys(groupedImages).length) {
            // 如果目标索引有效，尝试滚动到接近的位置
            const safeIndex = Math.min(info.index, Object.keys(groupedImages).length - 1);
            
            setTimeout(() => {
              try {
                flatListRef.current?.scrollToIndex({
                  index: safeIndex,
                  animated: true,
                  viewPosition: 0.5,
                });
              } catch (retryError) {
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
                if (!image || !image.id) {
                  console.warn('⚠️ 时间轴渲染中发现无效的图片对象:', image);
                  return null;
                }
                
                // 使用 getUri 获取正确的 URI
                const imageUri = getUri(image);
                if (!imageUri) {
                  console.warn('⚠️ 时间轴渲染中无法获取图片 URI:', image.id);
                  return null;
                }
                
                // 检查是否应该高亮
                const isHighlighted = highlightedImageId === image.id;
                
                // 检查图片是否在暂存箱中（只在非暂存箱页面显示标签）
                const isImageInStagingBox = !isStaging && stagingBoxImageIds.has(image.id);
                
                return (
                  <TouchableOpacity
                    key={image.id}
                    style={[
                      styles.timelineItem,
                      UnifiedDataService.isImageSelected(image.id) && styles.timelineItemSelected,
                      isHighlighted && styles.timelineItemHighlighted
                    ]}
                    onPress={() => {
                      if (selectionMode) {
                        toggleImageSelection(image.id);
                      } else {
                        // 注意：不需要在这里更新高亮，因为返回时会通过 returnedImageId 自动设置高亮
                        const allImages = Object.values(groupedImages).flat();
                        const currentIndex = allImages.findIndex(img => img.id === image.id);
                        navigation.navigate('ImagePreview', {
                          image: image,
                          allImages: allImages,
                          currentIndex: currentIndex,
                          category,
                          city,
                          color,
                          similarityGroupId,
                          filterType,
                          filterValue,
                          fromScreen: pageType,
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
                      source={{ uri: imageUri }}
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
                    {/* 已暂存标签（只在非暂存箱分类中显示） */}
                    {isImageInStagingBox && (
                      <View style={styles.stagingBoxBadge}>
                        <Text style={styles.stagingBoxBadgeText}>已暂存</Text>
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
      // 注意：暂存箱不是分类，不会出现在 getAllCategoriesWithUI() 返回的列表中，所以不需要过滤
      return true;
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
                  <Text style={styles.categoryIcon}>{cat.icon || '🏷️'}</Text>
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
      
      {/* 删除进度弹窗 */}
      <Modal
        visible={showDeleteProgress}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteProgress(false)}>
        <View style={styles.progressModalOverlay}>
          <View style={styles.progressModalContent}>
            <Text style={styles.progressModalTitle}>正在删除图片</Text>
            <Text style={styles.progressModalText}>
              已删除: {deleteProgress.filesDeleted}/{deleteProgress.total}
            </Text>
            {deleteProgress.filesFailed > 0 && (
              <Text style={styles.progressModalError}>
                失败: {deleteProgress.filesFailed}
              </Text>
            )}
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: `${(deleteProgress.filesDeleted / deleteProgress.total) * 100}%` }
                ]} 
              />
            </View>
          </View>
        </View>
      </Modal>
      
      {/* 更新进度弹窗 */}
      <Modal
        visible={showUpdateProgress}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUpdateProgress(false)}>
        <View style={styles.progressModalOverlay}>
          <View style={styles.progressModalContent}>
            <Text style={styles.progressModalTitle}>
              {updateOperationType === 'changeCategory' 
                ? `正在修改${updateProgress.total}张图片的分类`
                : updateOperationType === 'moveToStaging'
                ? `正在将${updateProgress.total}张图片放入暂存箱`
                : updateOperationType === 'removeFromStaging'
                ? `正在从暂存箱移除${updateProgress.total}张图片`
                : '正在处理图片'
              }
            </Text>
            {updateProgress.filesFailed > 0 && (
              <Text style={styles.progressModalError}>
                失败: {updateProgress.filesFailed}
              </Text>
            )}
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressBarFill, 
                  { width: '100%' } // 批量操作显示100%进度条
                ]} 
              />
            </View>
          </View>
        </View>
      </Modal>
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
  // 照片创玩面板
  enhancePanel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 88, // 与底部按钮保持合理间距
    backgroundColor: 'rgba(28,28,30,0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  enhanceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2C2C2E',
  },
  enhanceTitle: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  enhanceClose: {
    fontSize: 13,
    color: '#8E8E93',
  },
  enhanceList: {
    maxHeight: 96, // 两行高度（按钮高度44 * 2 + 行间距8）
    marginTop: 6,
  },
  enhanceListContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
  },
  enhancePresetItem: {
    width: (SCREEN_WIDTH - 36 - 6 * 3) / 4, // 额外预留2px(面板描边)，保证四列不换行
    height: 44,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: 'rgba(44,44,46,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  presetPrompt: {
    fontSize: 12,
    color: '#8E8E93',
    lineHeight: 16,
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
  stagingBoxBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#FF9500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  stagingBoxBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
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
  
  // 删除进度弹窗样式
  progressModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressModalContent: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 24,
    minWidth: 280,
    alignItems: 'center',
  },
  progressModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  progressModalText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 8,
  },
  progressModalError: {
    fontSize: 14,
    color: '#FF3B30',
    marginBottom: 16,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#3A3A3C',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
});

export default CategoryScreen;

