import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, logger, getUri, getLocalPath } from '../../adapters/WebAdapters';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Modal, Platform, TextInput, ScrollView } from 'react-native';
// 分页方案实现
import { SafeAreaView, Alert, createFixedStyle } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageEnhanceService from '../../services/ImageEnhanceService';
import WeChatAuthService from '../../services/WeChatAuthService';
import EnhanceResultScreen from './EnhanceResultScreen.desktop';

// 使用统一数据服务


// 时间轴标题组件 - 独立监听选中状态变化
const TimelineHeader = React.memo(({ dateKey, formattedDate, imagesForDate, onPress }) => {
  const [selectedCount, setSelectedCount] = useState(0);
  const [allSelected, setAllSelected] = useState(false);
  
  // 计算选中状态
  const updateSelectionState = useCallback(() => {
    const imageIds = imagesForDate.map(img => img.id);
    let count = 0;
    for (const id of imageIds) {
      if (UnifiedDataService.isImageSelected(id)) {
        count++;
      }
    }
    setSelectedCount(count);
    setAllSelected(count === imageIds.length && count > 0);
  }, [imagesForDate]);
  
  // 初始化选中状态
  useEffect(() => {
    updateSelectionState();
  }, [updateSelectionState]);
  
  // 监听选中状态变化
  useEffect(() => {
    const handleSelectionChange = (event) => {
      const imageIds = imagesForDate.map(img => img.id);
      if (imageIds.includes(event.detail.imageId)) {
        updateSelectionState();
      }
    };
    
    window.addEventListener('imageSelectionChanged', handleSelectionChange);
    return () => {
      window.removeEventListener('imageSelectionChanged', handleSelectionChange);
    };
  }, [imagesForDate, updateSelectionState]);
  
  const someSelected = selectedCount > 0;
  
  return (
    <TouchableOpacity 
      style={styles.timelineHeader}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.timelineHeaderContent}>
        <Text style={styles.timelineDate}>{formattedDate}</Text>
        <Text style={styles.timelineCount}>
          ({imagesForDate.length} 张
          {someSelected && ` · 已选 ${selectedCount}`}
          )
        </Text>
      </View>
      {someSelected && (
        <View style={styles.timelineSelectionIndicator}>
          <Text style={styles.timelineSelectionText}>
            {allSelected ? '✓ 全选' : '○ 部分选中'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
});

// Simplified image item component
const ImageItem = React.forwardRef(({ item, isSelected, isHighlighted, isInStagingBox, onPress, onLongPress, onRightPress, isVisible = true }, ref) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  
  // 懒加载逻辑：当图片可见时开始加载图片
  useEffect(() => {
    if (isVisible && !shouldLoad) {
      setShouldLoad(true);
    }
  }, [isVisible]);
  
  // 直接使用传入的item数据，不需要额外加载
  const displayItem = item;
  
  // 直接使用 getUri 获取的 URI（PC端：file://，移动端：content://）
  const imageUri = getUri(displayItem);
  
  // 调试日志（已注释以减少控制台输出）
  // if (shouldLoad) {
  //   logger.debug(`图片加载状态: ${item.id}, shouldLoad: ${shouldLoad}, imageUri: ${imageUri}, imageError: ${imageError}`);
  //   logger.debug(`原始数据: item.uri=${item.uri}, displayItem.uri=${displayItem?.uri}`);
  //   logger.debug(`分类信息: item.category=${item.category}, displayItem.category=${displayItem?.category}`);
  //   if (!imageUri) {
  //     logger.warn(`图片缺少URI: ${item.id}, 将显示占位符`);
  //   }
  // }
  
  // 只在出现问题时输出警告
  if (shouldLoad && !imageUri) {
    logger.warn(`⚠️ 图片缺少URI: ${item.id}, 将显示占位符`);
  }
  
  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };
  
  const handleImageError = (error) => {
    logger.error('Image load error for:', item.fileName, error.nativeEvent?.error);
    setImageError(true);
    setImageLoading(false);
  };

  // 右键点击处理 - 阻止默认右键菜单
  const handleContextMenu = (event) => {
    event.preventDefault(); // 阻止默认的右键菜单
  };
  
  return (
    <TouchableOpacity
      ref={ref}
      dataSet={{ imageId: item.id }}
      style={[
        styles.imageItem, 
        isSelected && styles.selectedImage,
        isHovered && styles.imageHovered,
        isHighlighted && styles.highlightedImage
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      onContextMenu={handleContextMenu}
      onMouseDown={(event) => {
        if (event.button === 2) { // 右键点击
          logger.debug(`鼠标右键按下: ${item.id}`);
          event.preventDefault(); // 阻止默认右键菜单
          if (onRightPress) {
            logger.debug(`调用onRightPress: ${item.id}`);
            onRightPress(item);
          } else {
            logger.warn(`onRightPress未定义: ${item.id}`);
          }
        }
      }}
      activeOpacity={0.8}
      onPressIn={() => setIsHovered(true)}
      onPressOut={() => setIsHovered(false)}>
      
      {/* Display image */}
      {shouldLoad ? (
        imageUri && !imageError ? (
        <>
          {imageLoading && (
            <View style={styles.imageLoadingOverlay}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
        <Image
            source={{ uri: imageUri }}
          style={styles.image}
          resizeMode="cover"
            onLoad={handleImageLoad}
            onError={handleImageError}
        />
        </>
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>📷</Text>
          <Text style={styles.placeholderFileName} numberOfLines={1}>
            {displayItem.fileName || 'Image'}
          </Text>
          <Text style={styles.placeholderSubtext} numberOfLines={1}>
            {imageError ? 'Load failed' : (imageUri ? 'Local file' : 'Loading...')}
            </Text>
          </View>
        )
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>⏳</Text>
          <Text style={styles.placeholderFileName} numberOfLines={1}>
            {displayItem.fileName || 'Image'}
          </Text>
          <Text style={styles.placeholderSubtext} numberOfLines={1}>
            {!isVisible ? 'Lazy loading...' : 'Loading...'}
          </Text>
        </View>
      )}
      
      {/* Selection indicator */}
      {isSelected && (
        <View style={styles.selectionIndicator}>
          <Text style={styles.selectionText}>✓</Text>
        </View>
      )}
      
      {/* 已暂存标签（只在非暂存箱分类中显示） */}
      {isInStagingBox && (
        <View style={styles.stagingBoxBadge}>
          <Text style={styles.stagingBoxBadgeText}>已暂存</Text>
        </View>
      )}
    </TouchableOpacity>
  );
});
ImageItem.displayName = 'ImageItem';

const CategoryScreen = ({ 
  filterType: propFilterType,
  filterValue: propFilterValue,
  currentImageId: propCurrentImageId,
  currentPage: propCurrentPage,
  onBack, 
  forceRefresh = true, 
  scrollToImageId = null,
  route = null,
  navigation = null,
  initialPage = 1,
  itemsPerPage: propItemsPerPage = 50,
  onPageChange = null
}) => {
  // 统一使用 filterType 和 filterValue
  const filterType = propFilterType || route?.params?.filterType;
  const filterValue = propFilterValue || route?.params?.filterValue;
  
  
  // 从统一数据服务获取数据
  const [allImages, setAllImages] = useState([]);
  
  // 高亮图片状态（从ImagePreview返回时使用）
  const [highlightedImageId, setHighlightedImageId] = useState(null);
  // 暂存箱图片ID集合（用于快速检查图片是否在暂存箱中）
  const [stagingBoxImageIds, setStagingBoxImageIds] = useState(new Set());
  const scrollViewRef = useRef(null);
  const imageRefs = useRef({});
  
  // 加载图片数据的函数
  /**
   * 截断过长的文本，添加省略号
   */
  const truncateText = useCallback((text, maxLength = 20) => {
    if (!text || typeof text !== 'string') return text;
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }, []);

  const loadImages = useCallback(async () => {
    try {
      // 🆕 使用统一的接口获取图片数据
      const images = await UnifiedDataService.readImagesByFilter(filterType, filterValue);
      logger.debug(`从 ${filterType}(${filterValue}) 获取图片: 总数=${images.length}`);
      
      // 🆕 使用统一的接口获取选中状态（数据服务自己从缓存获取图片数据）
      const selectedImages = await UnifiedDataService.getSelectedImagesByFilter(filterType, filterValue);
      const selectedImageIds = selectedImages.map(img => img.id);
      logger.debug(`选中状态: ${selectedImageIds.length} 张图片被选中`);
      
      // 如果当前分类不是暂存箱，检查哪些图片在暂存箱中
      let stagingBoxIds = new Set();
      if (filterType !== 'stagingBox') {
        try {
          const stagingBoxImages = await UnifiedDataService.getStagingBoxImages();
          stagingBoxIds = new Set(stagingBoxImages.map(img => img.id));
          logger.debug(`暂存箱图片数量: ${stagingBoxIds.size}`);
        } catch (error) {
          logger.error('获取暂存箱图片失败:', error);
        }
      }
      
      setAllImages(images);
      setSelectedImages(selectedImageIds);
      setStagingBoxImageIds(stagingBoxIds);
    } catch (error) {
      logger.error('获取图片数据失败:', error);
      setAllImages([]);
      setSelectedImages([]);
      setStagingBoxImageIds(new Set());
    }
  }, [filterType, filterValue]);

  // 初始加载图片数据
  useEffect(() => {
    loadImages();
  }, [loadImages, filterType, filterValue]);

  // 必要的UI状态
  const [selectAll, setSelectAll] = useState(false);
  const [selectedImages, setSelectedImages] = useState([]);
  
  // 选中状态将在 loadImages 中统一加载
  
  
  // 创建稳定的 getIsSelected 函数，使用 ref 避免依赖变化
  const selectedImagesRef = useRef(selectedImages);
  selectedImagesRef.current = selectedImages;
  
  const getIsSelected = useCallback((id) => {
    return selectedImagesRef.current.includes(id);
  }, []); // 空依赖数组，函数引用永远不变

  // 切换图片选中状态
  const toggleImageSelection = useCallback((imageId) => {
    setSelectedImages(prev => {
      const wasSelected = prev.includes(imageId);
      const newSelectedImages = wasSelected
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId];
      
      // 同时更新 UnifiedDataService 的全局状态
      UnifiedDataService.setImageSelection(imageId, !wasSelected);
      
      // 发送自定义事件通知所有组件选中状态变化
      const event = new CustomEvent('imageSelectionChanged', {
        detail: {
          imageId: imageId,
          isSelected: !wasSelected
        }
      });
      window.dispatchEvent(event);
      
      return newSelectedImages;
    });
  }, []);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedImages.length === allImages.length && allImages.length > 0) {
      // 如果全部选中，则取消全选
      // 直接清除所有选中状态，避免循环依赖
      const allImageIds = allImages.map(img => img.id);
      setSelectedImages([]);
      allImageIds.forEach(id => {
        UnifiedDataService.setImageSelection(id, false);
        window.dispatchEvent(new CustomEvent('imageSelectionChanged', {
          detail: { imageId: id, isSelected: false }
        }));
      });
      setSelectAll(false);
    } else {
      // 否则全选当前页面的所有图片
      const allImageIds = allImages.map(img => img.id);
      setSelectedImages(allImageIds);
      // 统一使用添加到选中状态
      UnifiedDataService.addToSelection(allImageIds);
      // 发送全选事件通知图片组件
      allImages.forEach(img => {
        const event = new CustomEvent('imageSelectionChanged', {
          detail: {
            imageId: img.id,
            isSelected: true
          }
        });
        window.dispatchEvent(event);
      });
    }
  }, [selectedImages.length, allImages]);
  
  
  // 删除进度状态
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 0 });
  
  // 操作菜单状态
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showCategorySubmenu, setShowCategorySubmenu] = useState(false);
  const [showEnhanceSubmenu, setShowEnhanceSubmenu] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0); // 用于强制刷新选中计数
  
  // ==================== AI图像增强相关状态 ====================
  const [showEnhanceModal, setShowEnhanceModal] = useState(false);
  const [enhancePreset, setEnhancePreset] = useState('portrait');
  const [enhanceProgress, setEnhanceProgress] = useState({
    current: 0,
    total: 0,
    status: 'idle', // 'idle' | 'processing' | 'completed' | 'failed'
    imageStatuses: [] // 每张图片的实时状态: [{index, status, result_url}]
  });
  const [enhanceResults, setEnhanceResults] = useState([]); // 所有图片的处理结果
  const [currentImageIndex, setCurrentImageIndex] = useState(0); // 当前查看的图片索引
  const [isProcessing, setIsProcessing] = useState(false); // 是否正在处理
  const [availableEnhancePresets, setAvailableEnhancePresets] = useState([]); // AI增强预设方案列表
  const snapshotImagesRef = useRef([]); // 模态框打开时的图片快照，使用 ref 而非 state（不需要触发渲染）
  const backgroundTaskRef = useRef(null); // 后台任务处理的Promise
  const abortControllerRef = useRef(null); // 用于取消轮询的 AbortController
  
  // 分页相关状态 - 优先使用从prop传递的值（返回时恢复）
  const [currentPage, setCurrentPage] = useState(propCurrentPage || initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(propItemsPerPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState('');
  
  // 下拉选择框状态
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownOptions = [20, 50, 100, 1000];
  
  // 虚拟滚动相关状态
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
  // 监听选中状态变化，强制刷新Header
  useEffect(() => {
    const handleSelectionChange = () => {
      setSelectionVersion(v => v + 1);
    };
    
    window.addEventListener('imageSelectionChanged', handleSelectionChange);
    return () => {
      window.removeEventListener('imageSelectionChanged', handleSelectionChange);
    };
  }, []);
  
  // 点击外部关闭操作菜单
  useEffect(() => {
    if (showActionMenu) {
      const handleClickOutside = () => {
        setShowActionMenu(false);
        setShowCategorySubmenu(false);
      };
      
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [showActionMenu]);
  
  // 加载AI增强预设方案
  useEffect(() => {
    const loadEnhancePresets = async () => {
      try {
        const imageStorageService = UnifiedDataService.imageStorageService;
        if (imageStorageService) {
          const settings = await imageStorageService.getSettings();
          if (settings?.aiEnhancePresets) {
            const presets = Object.entries(settings.aiEnhancePresets)
              .filter(([_, preset]) => preset.enabled !== false) // 只显示启用的方案
              .sort(([_, a], [__, b]) => (a.sortOrder || 0) - (b.sortOrder || 0)) // 按sortOrder排序
              .map(([id, preset]) => ({
                id,
                name: preset.name,
                icon: preset.icon,
                description: preset.description,
                prompt: preset.prompt
              }));
            
            setAvailableEnhancePresets(presets);
            logger.debug('📋 可用增强方案数量:', presets.length);
          }
        }
      } catch (error) {
        logger.error('加载AI增强预设方案失败:', error);
      }
    };
    
    loadEnhancePresets();
    
    // 监听设置更新事件，当用户在设置页面修改增强方案时自动刷新
    const handleSettingsUpdated = (event) => {
      if (event.detail?.key === 'aiEnhancePresets') {
        logger.debug('📋 检测到AI增强预设已更新，重新加载');
        loadEnhancePresets();
      }
    };
    
    if (typeof window !== 'undefined') {
      window.addEventListener('settingsUpdated', handleSettingsUpdated);
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('settingsUpdated', handleSettingsUpdated);
      }
    };
  }, []);
  
  // 监听从ImagePreview返回时的页码，恢复状态
  useEffect(() => {
    if (propCurrentPage !== undefined && propCurrentPage !== null) {
      // 计算当前数据的总页数
      const totalPagesForCurrentData = Math.max(1, Math.ceil(allImages.length / itemsPerPage));
      
      // 验证页码是否在有效范围内
      if (propCurrentPage > 0 && propCurrentPage <= totalPagesForCurrentData) {
        logger.debug('📄 恢复页码:', propCurrentPage, `(总页数: ${totalPagesForCurrentData})`);
        setCurrentPage(propCurrentPage);
      } else {
        logger.warn(`⚠️ 页码超出范围: ${propCurrentPage} > ${totalPagesForCurrentData}，重置为第1页`);
        setCurrentPage(1);
      }
    }
  }, [propCurrentPage, allImages.length, itemsPerPage]);
  
  // 监听从ImagePreview返回时的currentImageId，进行高亮和滚动
  useEffect(() => {
    const currentImageId = propCurrentImageId || route?.params?.currentImageId;
    if (!currentImageId) {
      return; // 没有图片ID，直接返回
    }
    
    // 如果图片列表为空，等待数据加载完成
    if (allImages.length === 0) {
      return;
    }
    
    // 验证图片是否在当前分类/城市/相似组中
    const imageExists = allImages.some(img => img.id === currentImageId);
    
    if (!imageExists) {
      return; // 提前返回，不执行高亮和滚动
    }
    
    // 设置高亮状态（一直保持，直到用户查看另一张照片）
    setHighlightedImageId(currentImageId);
    
    // 滚动到该图片位置 - 在Web环境使用DOM API
    const scrollTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        // Web环境：使用DOM查询和scrollIntoView
        // 方法1：通过data-image-id属性查找
        const domElement = document.querySelector(`[data-image-id="${currentImageId}"]`);
        
        if (domElement) {
          try {
            domElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center',
              inline: 'nearest'
            });
          } catch (error) {
            logger.error('❌ scrollIntoView失败:', error);
          }
        }
      } else {
        // 非Web环境的降级方案
        const imageElement = imageRefs.current[currentImageId];
        if (imageElement && scrollViewRef.current) {
          imageElement.measureLayout(
            scrollViewRef.current,
            (x, y) => {
              scrollViewRef.current.scrollTo({ y: y - 100, animated: true });
            },
            (error) => {
              logger.warn('❌ measureLayout失败:', error);
            }
          );
        }
      }
    }, 500); // 增加延迟到500ms，确保DOM已完全渲染
    
    return () => {
      clearTimeout(scrollTimer);
    };
  }, [propCurrentImageId, route?.params?.currentImageId, allImages]);
  
  // 关闭下拉框
  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
  }, []);

  // 按日期分组当前页面的图片（时间轴功能）- 使用useMemo缓存结果
  const getLocalDateKey = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const groupedImages = useMemo(() => {
    // 早期返回：如果没有图片，直接返回空结果
    if (!allImages || allImages.length === 0) {
      return { grouped: {}, sortedDates: [] };
    }
    
    const grouped = {};
    
    // 如果照片数量不超过100，显示所有照片；否则分页显示
    let currentPageImages;
    if (allImages.length <= 100) {
      currentPageImages = allImages;
    } else {
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, allImages.length);
      currentPageImages = allImages.slice(startIndex, endIndex);
    }
    
    // 早期返回：如果当前页面没有图片，直接返回空结果
    if (currentPageImages.length === 0) {
      return { grouped: {}, sortedDates: [] };
    }
    
    // 只对当前页面的图片进行分组，提高性能
    currentPageImages.forEach(image => {
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
        date = new Date();
      }
      
      const dateKey = getLocalDateKey(date); // YYYY-MM-DD格式
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(image);
    });
    
    // 对每个日期组内的图片按拍摄时间排序
    // 如果没有拍摄时间，则按文件时间排序
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => {
        const timeA = a.takenAt || a.timestamp || a.createdAt || a.modifiedAt || 0;
        const timeB = b.takenAt || b.timestamp || b.createdAt || b.modifiedAt || 0;
        return new Date(timeB) - new Date(timeA); // 最新的在前
      });
    });
    
    // 按日期倒序排列（最新的日期在前）
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    return { grouped, sortedDates };
  }, [allImages, currentPage, itemsPerPage]);
  
  // 移除无用的刷新状态（分页方案不需要下拉刷新）
  
  // 图片详细信息缓存
  
  
  // 固定布局参数
  const layoutParams = {
    itemWidth: 120,
    itemHeight: 120,
    gap: 12
  };
  
  // 滚动到指定图片的函数（分页版本）
  // 使用ref来存储最新的currentPage值，避免循环依赖
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;

  const scrollToImage = useCallback((imageId) => {
    // 直接使用最新的allImages，避免闭包问题
    const currentImages = allImages;
    if (!imageId || currentImages.length === 0) return;
    
    const imageIndex = currentImages.findIndex(img => img.id === imageId);
    if (imageIndex === -1) return;
    
    // 计算图片所在的页码
    const targetPage = Math.floor(imageIndex / itemsPerPage) + 1;
    const currentPageValue = currentPageRef.current; // 使用ref获取最新值
    
    logger.debug(`滚动到图片 ${imageId}，索引: ${imageIndex}，目标页码: ${targetPage}，当前页码: ${currentPageValue}`);
    
    // 如果目标页码不是当前页码，直接跳转到目标页码
    if (targetPage !== currentPageValue) {
      logger.debug(`直接跳转到第${targetPage}页以显示图片`);
      setCurrentPage(targetPage);
      // 页码跳转后，图片会自动显示在正确位置，不需要额外滚动
    } else {
      // 如果已经在正确页码，滚动到顶部确保图片可见
      if (scrollViewRef.current) {
    scrollViewRef.current.scrollTo({
          y: 0,
      animated: true
    });
      }
      logger.debug(`已在正确页码，图片应该可见`);
    }
  }, [itemsPerPage, allImages]); // 只依赖itemsPerPage和allImages
  
  // 当有scrollToImageId且数据加载完成时，滚动到指定图片
  useEffect(() => {
    if (scrollToImageId && allImages.length > 0) {
      // 延迟一点时间确保DOM已经渲染
      setTimeout(() => {
        scrollToImage(scrollToImageId);
      }, 100);
    }
  }, [scrollToImageId, allImages.length]); // 移除scrollToImage依赖，函数已经用useCallback稳定

  
  // FlatList自动处理虚拟滚动，不再需要手动计算可见范围

  // 分页数据计算
  const paginationData = useMemo(() => {
    const safeImages = allImages || [];
    const total = safeImages.length;
    
    // 如果照片数量不超过100，显示所有照片，不分页
    if (total <= 100) {
      logger.debug(`照片数量${total}张，不超过100张，显示全部照片`);
      return {
        currentPageImages: safeImages,
        totalPages: 1,
        startIndex: 0,
        endIndex: total,
        total
      };
    }
    
    // 照片数量超过100张，使用分页
    const totalPagesCount = Math.ceil(total / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, total);
    const currentPageImages = safeImages.slice(startIndex, endIndex);
    
    logger.debug(`分页数据: 第${currentPage}页/${totalPagesCount}页, 显示${currentPageImages.length}张图片 (${startIndex}-${endIndex-1})`);
    
    return {
      currentPageImages,
      totalPages: totalPagesCount,
      startIndex,
      endIndex,
      total
    };
  }, [allImages, currentPage, itemsPerPage]);
  
  // 移除无用的getVisibleImageDetails函数（虚拟滚动时代遗留）


  // 移除无用的 containerRef useEffect，使用 ScrollView 的 onLayout 代替

  // 移除动态布局监听，使用固定尺寸

  // 移除无用的初始化useEffect（只打印日志，无实际作用）

  // 当初始页面或每页数量参数变化时更新状态
  // 注意：不再需要监听initialPage变化，因为：
  // 1. useState已经在初始化时使用了propCurrentPage || initialPage
  // 2. 从ImagePreview返回时通过propCurrentPage的useEffect恢复
  // 3. 这个useEffect会错误地将已恢复的currentPage重置回initialPage

  useEffect(() => {
    if (propItemsPerPage !== itemsPerPage) {
      logger.debug(`每页数量参数变化: ${propItemsPerPage}`);
      setItemsPerPage(propItemsPerPage);
    }
  }, [propItemsPerPage]); // 只依赖propItemsPerPage，不依赖itemsPerPage

 

  // Image click handler - 传递图片对象和上下文信息
  const handleImagePress = useCallback((image) => {
    // 跳转到图片预览页面，传递图片对象和上下文信息
    if (navigation?.onImagePress) {
      // 🆕 统一传递 filterType 和 filterValue，不推导 fromScreen
      const contextProps = {
        filterType,
        filterValue,
        currentPage // 保存当前页码，返回时恢复
      };
         
      navigation.onImagePress(image, null, contextProps); // fromScreen 传 null，由接收方根据 filterType 推导
    }
  }, [navigation, filterType, filterValue, currentPage]);

  // Image long press handler
  const handleImageLongPress = useCallback((image) => {
    // 长按直接选中图片，不清除其他选中状态
    UnifiedDataService.setImageSelection(image.id, true);
  }, []);

  // Image right click handler
  const handleImageRightPress = useCallback((image) => {
    logger.debug(`处理右键点击: ${image.id}`);
    // 右键点击直接切换图片的选中状态
    toggleImageSelection(image.id);
  }, [toggleImageSelection]);

  // 🆕 获取当前选中的图片（使用统一接口，数据服务自己从缓存获取）
  const getCurrentSelectedImages = useCallback(async () => {
    return await UnifiedDataService.getSelectedImagesByFilter(filterType, filterValue);
  }, [filterType, filterValue]);

  // Clear current selections (清除当前分类或城市的选中状态)
  const clearCategorySelections = useCallback(async () => {
    // 统一使用 getCurrentSelectedImages 获取当前选中的图片，然后清除它们的选中状态
    const currentSelected = await getCurrentSelectedImages();
    const imageIds = currentSelected.map(img => img.id);
    
    // 清除选中状态
    imageIds.forEach(id => {
      UnifiedDataService.setImageSelection(id, false);
      window.dispatchEvent(new CustomEvent('imageSelectionChanged', {
        detail: { imageId: id, isSelected: false }
      }));
    });
    
    logger.debug(`清除选中状态: 操作了 ${imageIds.length} 张图片`);
    
    // 清除本地状态
    setSelectedImages([]);
    setSelectAll(false);
  }, [getCurrentSelectedImages]);

  const buildFilePathList = (images) => {
    const filePaths = [];
    for (const image of images) {
      // 直接使用 getLocalPath，它内部已经处理了路径标准化
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
      
      logger.debug(`📋 处理图片:`, {
        id: image?.id,
        path: imagePath,
        fileName: image?.fileName
      });
      
      // getLocalPath 已经返回标准化路径，直接使用
      // 对于 Windows，路径分隔符已经是反斜杠（在 normalizeFilePath 中处理）
      filePaths.push(imagePath);
    }
    logger.debug(`📋 最终文件路径列表:`, filePaths);
    return filePaths;
  };

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

  // 复制选中的图片到剪贴板（用于分享）
  const handleCopyToClipboard = useCallback(async () => {
    try {
      const selectedImages = await getCurrentSelectedImages();
      logger.debug(`📋 复制操作 - 选中图片数量: ${selectedImages.length}`);
      logger.debug(`📋 第一个图片对象:`, selectedImages[0]);
      
      if (selectedImages.length === 0) {
        Alert.alert('提示', '请先选择要复制的图片');
        return;
      }

      if (selectedImages.length > 9) {
        Alert.alert(
          '提示',
          `当前选中了 ${selectedImages.length} 张图片。\n一次最多复制到剪贴板 9 张，请重新选择不超过 9 张的图片。`
        );
        return;
      }

      const filePaths = buildFilePathList(selectedImages);

      if (filePaths.length === 0) {
        Alert.alert('错误', '未找到有效的图片路径');
        return;
      }

      await copyFilePathsToClipboard(filePaths, {
        successTitle: '复制成功',
        successMessage: () => `已将 ${filePaths.length} 张图片复制到剪贴板。\n可在聊天窗口使用 Ctrl+V 粘贴。`
      });
    } catch (error) {
      logger.error('复制文件到剪贴板失败:', error);
      Alert.alert('错误', `复制失败: ${error.message}`);
    }
  }, [getCurrentSelectedImages, copyFilePathsToClipboard]);

  // 复制选中的图片到文件管理器（无限制）
  const handleCopyToFileManager = useCallback(async () => {
    try {
      const selectedImages = await getCurrentSelectedImages();
      logger.debug(`📂 文件管理器复制 - 选中图片数量: ${selectedImages.length}`);
      
      if (selectedImages.length === 0) {
        Alert.alert('提示', '请先选择要复制的图片');
        return;
      }

      const filePaths = buildFilePathList(selectedImages);

      if (filePaths.length === 0) {
        Alert.alert('错误', '未找到有效的图片路径');
        return;
      }

      await copyFilePathsToClipboard(filePaths, {
        successTitle: '复制成功',
        successMessage: () => `已复制 ${filePaths.length} 个文件。\n请在资源管理器目标文件夹按 Ctrl+V 粘贴。`
      });
    } catch (error) {
      logger.error('复制文件路径失败:', error);
      Alert.alert('错误', `复制失败: ${error.message}`);
    }
  }, [getCurrentSelectedImages, copyFilePathsToClipboard]);

  // 批量修改分类
  const handleBatchChangeCategory = useCallback(async (newCategory) => {
    try {
      // 获取选中图片 - 统一使用 getCurrentSelectedImages
      const selectedImagesList = await getCurrentSelectedImages();
      
      const selectedCount = selectedImagesList.length;
      
      if (selectedCount === 0) {
        Alert.alert('提示', '请先选择要修改的图片');
        return;
      }
      
      // 获取目标分类的显示名称
      const configService = UnifiedDataService.configService;
      const categoryMap = configService.getCategoryNameMap();
      const targetCategoryName = categoryMap[newCategory]?.chinese || newCategory;
      
      Alert.alert(
        '修改分类',
        `确定要将选中的 ${selectedCount} 张图片修改为"${targetCategoryName}"分类吗？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确定',
            style: 'default',
            onPress: async () => {
              try {
                const imageIds = selectedImagesList.map(image => image.id);
                const result = await UnifiedDataService.updateImagesCategory(imageIds, newCategory, 'manual');
                const processed = result?.processed ?? imageIds.length;
                
                // 批量清除选中状态
                for (const image of selectedImagesList) {
                  UnifiedDataService.setImageSelection(image.id, false);
                }
                
                logger.debug('✅ 已清除选中状态，准备重新加载数据');
                
                // 检查清除后的统计
                const afterClearCounts = UnifiedDataService.getSelectedCountsByCategory();
                logger.debug('🔍 清除后的分类选中统计:', afterClearCounts);
                
                // 重新加载图片数据
                await loadImages();
                
                logger.debug('✅ 数据重新加载完成');
                
                // 强制刷新Header以更新选中计数
                setSelectionVersion(v => v + 1);
                
                logger.debug('✅ 已触发Header刷新');
                
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
  }, [filterType, filterValue, loadImages]);

  // ==================== AI图像增强处理函数 ====================
  // 事件处理函数：接收preset参数，直接开始处理
  const handleAIEnhance = async (preset) => {
    logger.debug('🎨 开始照片创玩, 方案:', preset);
    
    // 捕获当前选中的图片（快照）
    const selectedCount = selectedImages.length;
    
    // 检查是否有选中图片
    if (selectedCount === 0) {
      Alert.alert('提示', '请先选择要增强的图片');
      return;
    }
    
    // 开始增强的内部函数
    const startEnhancement = () => {
      // 捕获当前选中的图片快照（完整对象）
      const imagesToEnhance = allImages.filter(img => selectedImages.includes(img.id));
      logger.debug('📸 捕获图片快照:', imagesToEnhance.length, '张图片');
      
      // 存储快照到 ref（同步，立即可用）
      snapshotImagesRef.current = imagesToEnhance;
      
      // 重置状态（使用快照的数量）
      setEnhancePreset(preset);
      setEnhanceResults([]);
      setCurrentImageIndex(0);
      setIsProcessing(false);
      setEnhanceProgress({
        current: 0,
        total: imagesToEnhance.length,
        status: 'idle',
        imageStatuses: []
      });
      
      // 显示增强模态框并立即开始处理
      setShowEnhanceModal(true);
      
      // 延迟一小段时间后自动开始处理（等待Modal渲染完成）
      // 直接传递快照数据，避免依赖 state 的异步更新
      setTimeout(() => {
        handleStartEnhance(preset, imagesToEnhance);
      }, 100);
    };
    
    // 检查数量限制（最多9张）
    const MAX_ENHANCE_COUNT = 9;
    if (selectedCount > MAX_ENHANCE_COUNT) {
      Alert.alert(
        '提示',
        `数量不能超过 ${MAX_ENHANCE_COUNT} 张，请选择不超过 ${MAX_ENHANCE_COUNT} 张的图片数量`,
        [
          { text: '确定', style: 'default' }
        ]
      );
      return;
    }

    // 查询额度并提示将消耗额度
    try {
      const credits = await WeChatAuthService.getCredits();
      const remaining = typeof credits?.remaining === 'number' ? credits.remaining : 0;
      // 不足则阻断并提示前往充值
      if (remaining < selectedCount) {
        Alert.alert(
          '额度不足',
          `当前剩余额度：${remaining} 次\n需要处理：${selectedCount} 张\n\n请前往芯图相册服务号购买额度`,
          [{ text: '确定', style: 'default' }]
        );
        return;
      }
      // 足够则二次确认
      Alert.alert(
        '提示',
        `你选择了 ${selectedCount} 张图片，将会消耗 ${selectedCount} 个额度\n当前剩余额度：${remaining}`,
        [
          { text: '确定', onPress: () => startEnhancement() }
        ]
      );
    } catch (e) {
      // 查询失败不阻断，直接开始
      startEnhancement();
    }
  };

  // 关闭增强模态框
  const handleCloseEnhanceModal = () => {
    // 如果任务还在进行中（processing状态），显示确认提示
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
              // 用户确认关闭，取消轮询任务
              if (abortControllerRef.current) {
                logger.debug('🛑 用户确认关闭模态框，取消轮询任务');
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
              }
              
              // 关闭模态框
              setShowEnhanceModal(false);
              
              // 清空快照数据
              snapshotImagesRef.current = [];
              
              // 重置处理状态
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
    // 如果有正在进行的轮询任务，取消它（防止遗漏）
    if (abortControllerRef.current) {
      logger.debug('🛑 用户关闭模态框，取消轮询任务');
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // 关闭模态框
    setShowEnhanceModal(false);
    
    // 清空快照数据
    snapshotImagesRef.current = [];
    
    // 重置处理状态
    setIsProcessing(false);
    setEnhanceProgress({
      current: 0,
      total: 0,
      status: 'idle',
      imageStatuses: []
    });
  };

  // 保存并添加到暂存箱（合并原有的"保存到本地"和"添加为新图"）
  // 事件处理函数：捕获点击时刻用户看到的图片
  const handleSaveAndAdd = async () => {
    if (enhanceResults.length === 0) return;
    
    // 捕获点击时刻的结果（快照）
    const resultToAdd = enhanceResults[currentImageIndex];
    if (!resultToAdd) return;
    
    // 如果已经保存过，不再重复保存
    if (resultToAdd.saved) {
      Alert.alert('提示', '该图片已保存过');
      return;
    }
    
    try {
      logger.debug('➕ 开始添加为新图:', resultToAdd.originalFileName);
      
      // 1. 下载增强后的图片
      const imageBlob = await ImageEnhanceService.downloadEnhancedImage(resultToAdd.enhancedUri);
      
      // 2. 保存到 xualbum 目录
      const saveResult = await ImageEnhanceService.saveToXualbum(
        imageBlob,
        resultToAdd.originalFileName
      );
      
      logger.debug('✅ 图片已保存到:', saveResult.filePath);
      
      // 3. 从原图获取分类信息（message和detection_results）
      // allImages 只包含精简信息，需要调用详细信息接口获取完整信息
      let originalImage = null;
      try {
        if (resultToAdd.originalImageId) {
          originalImage = await UnifiedDataService.readImageDetailsById(resultToAdd.originalImageId);
          logger.debug('✅ 从数据库获取完整原图信息');
        } else if (resultToAdd.originalUri != null) {
          // 如果没有 ID，尝试从 URI 查找（检查 null 和 undefined）
          const targetOriginalUri = getUri(resultToAdd.originalUri);
          if (targetOriginalUri) {
            const tempImage = allImages.find(img => {
              const imgUri = getUri(img);
              return imgUri && targetOriginalUri && imgUri === targetOriginalUri;
            });
            if (tempImage?.id) {
              originalImage = await UnifiedDataService.readImageDetailsById(tempImage.id);
              logger.debug('✅ 通过URI找到ID，从数据库获取完整原图信息');
            }
          }
        }
      } catch (error) {
        logger.warn('⚠️ 从数据库查询原图详细信息失败:', error);
        // 降级到使用精简信息
        originalImage = allImages.find(img => {
          if (resultToAdd.originalImageId && img.id === resultToAdd.originalImageId) {
            return true;
          }
          if (resultToAdd.originalUri != null) {
            const imgUri = getUri(img);
            const targetOriginalUri = getUri(resultToAdd.originalUri);
            return imgUri && targetOriginalUri && imgUri === targetOriginalUri;
          }
          return false;
        });
      }
      
      logger.debug('🔍 查找原图:', { 
        originalImageId: resultToAdd.originalImageId, 
        originalUri: resultToAdd.originalUri,
        found: !!originalImage,
        hasMessage: !!originalImage?.message,
        message: originalImage?.message,
        hasIdCardDetections: !!originalImage?.idCardDetections?.length,
        idCardDetectionsCount: originalImage?.idCardDetections?.length || 0,
        hasGeneralDetections: !!originalImage?.generalDetections?.length,
        generalDetectionsCount: originalImage?.generalDetections?.length || 0,
        hasMobileNetV3Detections: !!originalImage?.mobileNetV3Detections,
        mobileNetV3Detections: originalImage?.mobileNetV3Detections ? 'present' : 'null'
      });
      
      // 4. 使用writeImageDetailedInfo一次性保存完整数据（包括基础信息和详细信息）
      // 注意：不传入id，让系统根据uri自动生成，与扫描服务保持一致
      const timestamp = Date.now();
      const newImageUri = `file:///${saveResult.filePath.replace(/\\/g, '/')}`;
      
      // 准备完整的图片数据，包含所有必要字段（参考扫描服务的格式）
      const completeImageData = {
        uri: newImageUri, // 必须有uri，系统会根据uri生成id
        fileName: saveResult.fileName,
        category: originalImage?.category || 'other', // 保持原图的分类，如果没有则默认为 other
        confidence: 1.0, // 默认置信度
        timestamp: timestamp, // 时间戳（必须）
        takenAt: timestamp || null, // 拍摄时间
        size: imageBlob.size || 0, // 文件大小
        // 复制原图的检测结果和描述信息
        idCardDetections: originalImage?.idCardDetections || [],
        generalDetections: originalImage?.generalDetections || [],
        mobileNetV3Detections: originalImage?.mobileNetV3Detections || null,
        message: originalImage?.message || null,
        // 如果有imageDimensions也复制
        ...(originalImage?.imageDimensions && { imageDimensions: originalImage.imageDimensions })
      };
      
      // 验证必要字段
      if (!completeImageData.category) {
        logger.warn('⚠️ 图片数据缺少category，自动设置为other');
        completeImageData.category = 'other';
      }
      if (!completeImageData.timestamp) {
        logger.warn('⚠️ 图片数据缺少timestamp，使用当前时间');
        completeImageData.timestamp = Date.now();
      }
      
      // 保存数据并更新缓存（updateCache=true 会重建缓存）
      logger.debug('💾 准备保存图片数据:', {
        uri: newImageUri,
        fileName: completeImageData.fileName,
        category: completeImageData.category,
        timestamp: completeImageData.timestamp,
        size: completeImageData.size,
        hasMessage: !!completeImageData.message,
        message: completeImageData.message,
        hasIdCardDetections: !!completeImageData.idCardDetections?.length,
        idCardDetectionsCount: completeImageData.idCardDetections?.length || 0,
        hasGeneralDetections: !!completeImageData.generalDetections?.length,
        generalDetectionsCount: completeImageData.generalDetections?.length || 0,
        hasMobileNetV3Detections: !!completeImageData.mobileNetV3Detections,
        mobileNetV3Detections: completeImageData.mobileNetV3Detections ? 'present' : 'null'
      });
      
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
      
      // 使用 writeImageDetailedInfo 保存图片数据（服务层会自动刷新缓存）
      await UnifiedDataService.writeImageDetailedInfo([completeImageData], true);
      
      // 🆕 如果原图在暂存箱中，新文件也添加到暂存箱
      if (originalImage?.id && expectedImageId) {
        const isOriginalInStagingBox = await UnifiedDataService.isInStagingBox(originalImage.id);
        if (isOriginalInStagingBox) {
          await UnifiedDataService.addToStagingBox([expectedImageId]);
          logger.debug('✅ 原图在暂存箱中，新文件已添加到暂存箱:', expectedImageId);
        } else {
          logger.debug('✅ 原图不在暂存箱中，新文件不添加到暂存箱');
        }
      }
      
      // 缓存刷新已由 writeImageDetailedInfo 处理，不需要手动刷新
      
      logger.debug('✅ 图片完整信息已保存并重建缓存:', { 
        uri: newImageUri,
        fileName: completeImageData.fileName,
        category: completeImageData.category,
        expectedId: expectedImageId,
        hasMessage: !!completeImageData.message,
        hasDetections: !!(completeImageData.idCardDetections?.length || completeImageData.generalDetections?.length || completeImageData.mobileNetV3Detections)
      });
      
      // 验证：直接从数据库查询
      try {
        const directImage = await UnifiedDataService.imageStorageService?.getImageById?.(expectedImageId);
        logger.debug('🔍 直接从数据库查询验证:', {
          expectedId: expectedImageId,
          foundInDB: !!directImage,
          dbImageCategory: directImage?.category,
          dbImageUri: directImage?.uri
        });
      } catch (dbError) {
        logger.warn('⚠️ 数据库直接查询失败:', dbError);
      }
      
      // 5. 标记该图片为已保存
      setEnhanceResults(prevResults => 
        prevResults.map((result, index) => 
          index === currentImageIndex 
            ? { ...result, saved: true, savedAt: timestamp }
            : result
        )
      );
      
      // 6. 验证保存结果（调试用）
      try {
        // 从暂存箱中查找刚保存的图片
        const allStagingBoxImages = await UnifiedDataService.getStagingBoxImages();
        // 统一使用 getUri 进行比较
        const newImageUriForCompare = getUri(newImageUri) || newImageUri;
        const savedImage = allStagingBoxImages.find(img => {
          const imgUri = getUri(img);
          return imgUri && newImageUriForCompare && imgUri === newImageUriForCompare;
        });
        
        // 列出所有缓存中的URI，便于对比
        const cachedUris = allStagingBoxImages.map(img => getUri(img)).filter(Boolean);
        logger.debug('🔍 保存后验证:', {
          savedUri: newImageUri,
          savedUriForCompare: newImageUriForCompare,
          foundInCache: !!savedImage,
          totalStagingBox: allStagingBoxImages.length,
          savedImageCategory: savedImage?.category,
          savedImageId: savedImage?.id,
          cachedUris: cachedUris.slice(0, 5) // 只显示前5个URI
        });
        
        // 尝试模糊匹配（比较文件名）
        const savedFileName = newImageUri.split('/').pop();
        const matchByFileName = allStagingBoxImages.find(img => {
          const imgUri = getUri(img);
          if (!imgUri) return false;
          const imgFileName = imgUri.split('/').pop();
          return imgFileName === savedFileName;
        });
        
        if (!savedImage && matchByFileName) {
          const matchUri = getUri(matchByFileName);
          logger.warn('⚠️ URI不匹配，但文件名匹配:', {
            savedUri: newImageUri,
            savedUriForCompare: newImageUriForCompare,
            cachedUri: matchUri,
            savedFileName,
            cachedFileName: matchUri?.split('/').pop()
          });
        }
        
        if (!savedImage && !matchByFileName) {
          logger.error('❌ 新保存的图片不在暂存箱中！', {
            savedUri: newImageUri,
            cachedCount: allStagingBoxImages.length,
            allCachedUris: cachedUris
          });
        }
      } catch (verifyError) {
        logger.warn('⚠️ 验证保存结果失败:', verifyError);
      }
      
      Alert.alert('成功', '已保存到暂存箱，可继续查看其他图片');
      
      // 不关闭结果模态框，让用户可以继续查看和保存其他图片
      
    } catch (error) {
      logger.error('❌ 添加为新图失败:', error);
      Alert.alert('错误', `添加失败: ${error.message}`);
    }
  };

  // 开始增强处理（从方案按钮触发）
  // preset: 选中的增强方案
  // imagesToProcess: 要处理的图片数组（可选，如果不传则使用 ref 中的快照）
  const handleStartEnhance = async (preset, imagesToProcess = null) => {
    try {
      logger.debug('🚀 开始处理增强任务, 方案:', preset);
      
      // 优先使用传入的图片数组，否则使用 ref 中的快照
      const images = imagesToProcess || snapshotImagesRef.current;
      
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
      
      // 创建处理任务（存储在ref中，支持后台运行）
      const processTask = async () => {
        const results = [];
        
        try {
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
          
          // 2. 批量提交增强任务（使用快照的配置）
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
          
          // 轮询任务状态（带进度回调和取消信号）
          let pollCount = 0;
          const enhanceResult = await ImageEnhanceService.pollTaskStatus(
            taskResult.task_id,
            (status) => {
              pollCount++;
              
              // 基于 completed_images 和 status 更新进度
              const completedImages = status.completed_images || 0;
              
              // 计算进度百分比：主要基于 completed_images
              let progressPercent = 0;
              if (completedImages > 0) {
                // 使用已完成的图片数量计算进度
                progressPercent = (completedImages / taskResult.total_images) * 100;
              } else if (status.status === 'processing') {
                // 如果 completed_images 为 0 但状态是处理中，基于轮询次数估算（假设10秒一张图）
                const estimatedCurrent = Math.min(pollCount * 0.2, taskResult.total_images);
                progressPercent = (estimatedCurrent / taskResult.total_images) * 100;
              }
              
              // 解析每张图片的实时状态（从 status.results 数组）
              // 后端现在会实时返回每张图片的处理状态
              const imageStatuses = (status.results || []).filter(img => img != null); // 过滤掉 null 值
              
              // 打印状态更新（仅在有变化时）
              if (imageStatuses.length > 0) {
                logger.debug(`📷 后端返回状态（${imageStatuses.length}张）:`, imageStatuses.map(img => 
                  `[index=${img?.index ?? 'N/A'}, status=${img?.status ?? 'N/A'}, filename=${img?.filename || 'N/A'}, hasUrl=${!!img?.result_url}]`
                ).join(', '));
              }
              
              setEnhanceProgress({
                current: completedImages > 0 ? completedImages : Math.floor(pollCount * 0.2),
                total: taskResult.total_images,
                status: status.status === 'completed' ? 'completed' : 'processing',
                progress: progressPercent,
                imageStatuses: imageStatuses
              });
              
              // 实时更新已完成图片的URI到enhanceResults（支持过程中显示）
              setEnhanceResults(prevResults => {
                const newResults = [...prevResults];
                let hasUpdate = false;
                
                imageStatuses.forEach((imgStatus) => {
                  if (!imgStatus) return; // 跳过 null 值
                  if (imgStatus.status === 'completed' && imgStatus.result_url) {
                    const index = imgStatus.index;
                    // 确保 index 是有效数字
                    if (index == null || typeof index !== 'number' || index < 0 || index >= preparedImages.length) {
                      logger.warn(`⚠️ 无效的图片索引: ${index}, 跳过该状态更新`);
                      return;
                    }
                    const originalImage = preparedImages[index]?.originalImage;
                    
                    if (originalImage) {
                      const enhancedUrl = imgStatus.result_url || imgStatus.url || imgStatus.enhanced_url;
                      
                      // 检查是否已经存在这个索引的结果
                      const originalImageUri = getUri(originalImage);
                      const existingIndex = newResults.findIndex(r => {
                        // 确保 r 存在后再访问其属性
                        if (!r) return false;
                        // 通过originalUri或index匹配
                        return (r.originalUri && originalImageUri && r.originalUri === originalImageUri) || 
                               (r.originalImageId === originalImage.id);
                      });
                      
                      if (existingIndex >= 0) {
                        // 更新现有结果（如果URI还没设置或者状态是pending）
                        if (!newResults[existingIndex].enhancedUri || newResults[existingIndex].status !== 'success') {
                          newResults[existingIndex] = {
                            ...newResults[existingIndex],
                            // 确保 originalUri 和 originalImageId 字段存在
                            originalImageId: newResults[existingIndex].originalImageId || originalImage.id,
                            originalUri: newResults[existingIndex].originalUri || originalImageUri,
                            originalFileName: newResults[existingIndex].originalFileName || originalImage.fileName,
                            enhancedUri: enhancedUrl,
                            status: 'success'
                          };
                          hasUpdate = true;
                          logger.debug(`🔄 更新已完成的图片URI [索引${index}]: ${originalImage.fileName}`);
                        }
                      } else {
                        // 创建新结果（如果还没创建）
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
                        logger.debug(`➕ 添加已完成的图片URI [索引${index}]: ${originalImage.fileName}`);
                      }
                    }
                  }
                });
                
                return hasUpdate ? newResults : prevResults;
              });
              
              logger.debug(`📊 进度更新 [轮询${pollCount}次]: ${completedImages}/${taskResult.total_images} (${progressPercent.toFixed(1)}%) - 状态: ${status.status}`);
            },
            abortControllerRef.current?.signal // 传递取消信号
          );
          
          logger.debug(`✅ 任务完成，收到 ${enhanceResult.results?.length || 0} 个结果`);
          
          // 清理 AbortController（任务完成）
          if (abortControllerRef.current) {
            abortControllerRef.current = null;
          }
          
          // 4. 处理结果（API 返回格式: { status: 'completed', results: [{result_url, ...}, ...] }）
          let successCount = 0;
          let failedCount = 0;
          
          if (enhanceResult.results && enhanceResult.results.length > 0) {
            logger.debug(`📊 详细解析结果数组 (${enhanceResult.results.length}项):`, JSON.stringify(enhanceResult.results, null, 2));
            enhanceResult.results.forEach((result, index) => {
              const originalImage = preparedImages[index]?.originalImage;
              logger.debug(`🔍 处理第${index + 1}个结果: status=${result.status}, result_url=${result.result_url || 'N/A'}, hasUrl=${!!result.result_url}`);
              logger.debug(`🔍 结果完整字段:`, Object.keys(result));
              logger.debug(`🔍 结果所有值:`, result);
              
              // 尝试多种可能的字段名
              const enhancedUrl = result.result_url || result.url || result.enhanced_url || result.image_url || result.output_url;
              logger.debug(`🔍 尝试解析URL字段: enhancedUrl=${enhancedUrl || 'N/A'}`);
              
              if (result.status === 'completed' && enhancedUrl) {
                // ✅ 成功的图片
                if (originalImage) {
                  const originalImageUri = getUri(originalImage);
                  results.push({
                    originalImageId: originalImage.id,
                    originalUri: originalImageUri,
                    originalFileName: originalImage.fileName,
                    enhancedUri: enhancedUrl,
                    taskId: taskResult.task_id,
                    preset: preset,
                    status: 'success'  // 标记为成功
                  });
                  successCount++;
                  logger.debug(`✅ 图片${index + 1}处理成功: ${originalImage.fileName}`);
                }
              } else {
                // ❌ 失败的图片
                const errorMsg = result.error || '未知错误';
                logger.warn(`❌ 图片${index + 1}处理失败:`, {
                  fileName: originalImage?.fileName || result.filename,
                  status: result.status,
                  error: errorMsg
                });
                
                // 将失败的图片也加入结果，但标记为失败状态
                if (originalImage) {
                  const originalImageUri = getUri(originalImage);
                  results.push({
                    originalImageId: originalImage.id,
                    originalUri: originalImageUri,
                    originalFileName: originalImage.fileName,
                    enhancedUri: null,  // 没有增强后的图片
                    taskId: taskResult.task_id,
                    preset: preset,
                    status: 'failed',  // 标记为失败
                    errorMessage: errorMsg.includes('Throttling') ? 'API配额限制，请稍后重试' : errorMsg
                  });
                  failedCount++;
                }
              }
            });
            
            logger.debug(`📊 处理结果: 成功 ${successCount} 张，失败 ${failedCount} 张`);
            
            // 如果所有图片都失败，抛出错误
            if (successCount === 0) {
              throw new Error(`所有图片处理失败，请检查API配额或稍后重试`);
            }
          } else {
            throw new Error('未获取到增强结果');
          }
          
        } catch (error) {
          // 清理 AbortController（无论成功还是失败）
          if (abortControllerRef.current) {
            abortControllerRef.current = null;
          }
          
          // 如果是用户取消操作，不显示错误提示
          if (error.message && error.message.includes('轮询已被用户取消')) {
            logger.debug('🛑 用户取消了增强任务');
            return; // 静默退出，不显示错误
          }
          
          logger.error('❌ 批量增强失败:', error);
          // 只有在模态框仍然显示时才提示错误
          if (showEnhanceModal) {
            Alert.alert('错误', `处理失败: ${error.message}`);
          }
        }
        
        // 处理完成
        logger.debug(`✅ 全部处理完成，成功 ${results.length}/${imagesToProcess.length} 张`);
        
        setEnhanceProgress({
          current: imagesToProcess.length,
          total: imagesToProcess.length,
          status: 'completed'
        });
        
        setEnhanceResults(results);
        setIsProcessing(false);
        setCurrentImageIndex(0); // 重置到第一张图片
        
        // 如果所有图片都处理失败，显示提示
        if (results.length === 0 || results.every(r => r.status === 'failed')) {
          Alert.alert('处理完成', '所有图片处理失败，请重试');
        }
      };
      
      // 存储任务引用并执行
      backgroundTaskRef.current = processTask();
      await backgroundTaskRef.current;
      
    } catch (error) {
      // 检查是否是用户取消操作（正常操作，不记录为错误）
      if (error.message && error.message.includes('轮询已被用户取消')) {
        logger.debug('🛑 用户取消增强处理');
        setEnhanceProgress(prev => ({
          ...prev,
          status: 'cancelled'
        }));
        setIsProcessing(false);
        // 用户取消不需要显示错误提示
        return;
      }
      
      // 其他错误才记录为错误
      logger.error('❌ 增强处理失败:', error);
      setEnhanceProgress(prev => ({
        ...prev,
        status: 'failed'
      }));
      setIsProcessing(false);
      Alert.alert('错误', `处理失败: ${error.message}`);
    }
  };

  // 批量添加到暂存箱
  const handleBatchAddToStagingBox = useCallback(async () => {
    // 统一使用 getCurrentSelectedImages 获取选中图片
    const currentCategorySelectedImages = await getCurrentSelectedImages();
    const actualSelectedCount = currentCategorySelectedImages.length;
    
    if (actualSelectedCount === 0) return;

    Alert.alert(
      '添加到暂存箱',
      `确定要将选中的 ${actualSelectedCount} 张图片添加到暂存箱吗？\n\n图片将被添加到暂存箱，但分类信息不会改变。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '添加',
          style: 'default',
          onPress: async () => {
            try {
              const selectedImageIds = currentCategorySelectedImages.map(img => img.id);
              
              // 清除选中状态
              await clearCategorySelections();
              // 将图片添加到暂存箱（不修改category字段）
              const addResult = await UnifiedDataService.addToStagingBox(selectedImageIds);
              if (!addResult.success) {
                throw new Error(`添加到暂存箱失败: ${addResult.errors.map(e => e.error).join(', ')}`);
              }
              const processed = addResult.added || selectedImageIds.length;
              
              // 重新加载图片数据
              await loadImages();
              
              Alert.alert('操作完成', `已成功将 ${processed} 张图片添加到暂存箱`);
              
            } catch (error) {
              Alert.alert('操作失败', '添加到暂存箱时发生错误，请重试');
            }
          },
        },
      ]
    );
  }, [getCurrentSelectedImages, clearCategorySelections, loadImages]);

  // 批量从暂存箱移除
  const handleBatchRemoveFromStagingBox = useCallback(async () => {
    // 统一使用 getCurrentSelectedImages 获取选中图片
    const currentCategorySelectedImages = await getCurrentSelectedImages();
    const actualSelectedCount = currentCategorySelectedImages.length;
    
    if (actualSelectedCount === 0) return;

    Alert.alert(
      '从暂存箱移除',
      `确定要从暂存箱移除选中的 ${actualSelectedCount} 张图片吗？\n\n这些图片将从暂存箱中移除，但不会删除文件。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '移除',
          style: 'default',
          onPress: async () => {
            try {
              const selectedImageIds = currentCategorySelectedImages.map(img => img.id);
              
              // 清除选中状态
              await clearCategorySelections();
              
              // 从暂存箱移除图片
              const removeResult = await UnifiedDataService.removeFromStagingBox(selectedImageIds);
              if (!removeResult.success) {
                const errorMessages = removeResult.errors?.map(e => e.error || e.message || '未知错误').join(', ') || '未知错误';
                throw new Error(`从暂存箱移除失败: ${errorMessages}`);
              }
              
              const processed = removeResult.removed || selectedImageIds.length;
              
              // 重新加载图片数据
              await loadImages();
              
              Alert.alert('操作完成', `已成功从暂存箱移除 ${processed} 张图片`);
              
            } catch (error) {
              logger.error('从暂存箱移除失败:', error);
              Alert.alert('操作失败', `从暂存箱移除时发生错误: ${error.message}`);
            }
          },
        },
      ]
    );
  }, [getCurrentSelectedImages, clearCategorySelections, loadImages]);

  // 批量删除
  const handleBatchDelete = useCallback(async () => {
    // 统一使用 getCurrentSelectedImages 获取选中图片
    const currentCategorySelectedImages = await getCurrentSelectedImages();
    const actualSelectedCount = currentCategorySelectedImages.length;
    
    if (actualSelectedCount === 0) return;

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${actualSelectedCount} 张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复！`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: actualSelectedCount });
              
              const selectedImageIds = currentCategorySelectedImages.map(img => img.id);
              const result = await UnifiedDataService.writeDeleteImages(
                selectedImageIds,
                (progress) => {
                  setDeleteProgress(progress);
                }
              );
              
              // 立即关闭删除进度对话框
              setShowDeleteProgress(false);
              
              // 检查删除结果
              if (result.filesFailed > 0) {
                // 有文件删除失败，显示权限提示
                Alert.alert(
                  '删除完成', 
                  `成功删除 ${result.filesDeleted} 张图片，${result.filesFailed} 张删除失败\n\n删除失败可能是因为缺少文件管理权限。请在系统设置中为应用开启"文件管理"或"所有文件访问"权限，然后重新尝试删除。`,
                  [
                    { text: '知道了', style: 'default' }
                  ]
                );
                
                // 只移除成功删除的图片
                setAllImages(prevImages => prevImages.filter(img => !result.successfulImageIds.includes(img.id)));
              } else {
                // 全部删除成功，移除所有选中的图片
                setAllImages(prevImages => prevImages.filter(img => !selectedImageIds.includes(img.id)));
              }
              
              // 清除选中状态
              await clearCategorySelections();
              
              // 重新加载图片以确保UI正确更新
              await loadImages();
              
            } catch (error) {
              setShowDeleteProgress(false);
              Alert.alert('Operation Failed', 'Error occurred during deletion, please try again');
            }
          },
        },
      ]
    );
  }, [getCurrentSelectedImages, clearCategorySelections, loadImages]);

  // Header 组件 - 可以重新渲染
  const HeaderComponent = useCallback(() => {
    // 🆕 检查是否为暂存箱（基于filterType）
    const isStagingBox = filterType === 'stagingBox';
    
    // 获取所有分类列表（排除tobecleaned，因为暂存箱已独立）
    const configService = UnifiedDataService.configService;
    let availableCategories = [];
    if (configService?.isConfigLoaded()) {
      const categoryMap = configService.getCategoryNameMap();
      availableCategories = Object.entries(categoryMap)
        .filter(([id]) => id !== 'tobecleaned') // 排除旧的tobecleaned分类
        .map(([id, names]) => ({
          id,
          chinese: names.chinese,
          english: names.english
        }));
    }
    
    // 使用本地selectedImages state计算选中数量
    // 这个state在loadImages时已经根据当前分类/城市/相似组过滤过了
    const currentSelectedCount = selectedImages.length;
    
    // logger.debug(`HeaderComponent 渲染: category=${category}, normalizedCategory=${normalizedCategory}, city=${city}, currentSelectedCount=${currentSelectedCount}`);
    
    return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => {
          // 使用传入的 onBack 回调
          if (onBack) {
            onBack();
          }
        }}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>
      
      <Text style={styles.title}>
        {!filterType || !filterValue
          ? '图片列表'
          : filterType === 'similarityGroup'
          ? `相似照片组 (${allImages.length}张)`
          : filterType === 'directory'
          ? `📁 ${truncateText(filterValue.split('/').pop() || filterValue, 20)} (${allImages.length}张)`
          : filterType === 'city'
          ? `${filterValue} (${allImages.length}张)`
          : filterType === 'color'
          ? `🎨 ${filterValue} (${allImages.length}张)`
          : filterType === 'stagingBox'
          ? `🗑️ 暂存箱 (${allImages.length}张)`
          : filterType === 'category'
          ? `${UnifiedDataService.getCategoryDisplayName(filterValue)} (${allImages.length}张)`
          : '图片列表'
        }
      </Text>
      
      
        {/* 分页控制 - 只在照片数量超过100时显示 */}
        {allImages.length > 100 && (
          <View style={styles.headerPagination}>
            <TouchableOpacity
              style={[styles.headerPageButton, currentPage === 1 && styles.headerPageButtonDisabled]}
              onPress={goToPreviousPage}
              disabled={currentPage === 1}
            >
              <Text style={styles.headerPageButtonText}>上一页</Text>
            </TouchableOpacity>
            
            <View style={styles.headerPageInfo}>
              <Text style={styles.headerPageInfoText}>
                第 {currentPage} 页 / 共 {paginationData.totalPages} 页
              </Text>
            </View>
            
            <TouchableOpacity 
              style={[styles.headerPageButton, currentPage === paginationData.totalPages && styles.headerPageButtonDisabled]}
              onPress={goToNextPage}
              disabled={currentPage === paginationData.totalPages}
            >
              <Text style={styles.headerPageButtonText}>下一页</Text>
            </TouchableOpacity>
            
            <View style={styles.headerItemsPerPageContainer}>
              <Text style={styles.headerItemsPerPageLabel}>每页:</Text>
              {renderDropdown()}
            </View>
          </View>
        )}
        
        {/* 间距 */}
        <View style={styles.headerSpacer} />
        
        {/* 没有选中图片时：只显示全选按钮 */}
        {currentSelectedCount === 0 ? (
          <TouchableOpacity
            style={[styles.headerButton, selectAll && styles.headerButtonActive]}
            onPress={toggleSelectAll}>
            <Text style={[styles.headerButtonText, selectAll && styles.headerButtonTextActive]}>
              全选
            </Text>
          </TouchableOpacity>
        ) : (
          /* 有选中图片时：显示操作菜单 */
          <View style={styles.actionMenuContainer}>
            <TouchableOpacity
              style={[styles.headerButton, styles.actionMenuButton]}
              onPress={(e) => {
                e.stopPropagation();
                setShowActionMenu(!showActionMenu);
              }}>
              <Text style={[styles.headerButtonText, styles.actionMenuButtonText]}>
                操作 ({currentSelectedCount}) ▼
              </Text>
            </TouchableOpacity>
            
            {/* 下拉菜单 */}
            {showActionMenu && (
              <View style={styles.actionMenuDropdown}>
                {/* 全选 */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() => {
                    setShowActionMenu(false);
                    toggleSelectAll();
                  }}>
                  <Text style={styles.actionMenuItemText}>
                    {selectAll ? '✓ 全选' : '☐ 全选'}
                  </Text>
                </TouchableOpacity>
                
                {/* 取消选择 */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={async () => {
                    setShowActionMenu(false);
                    setShowCategorySubmenu(false);
                    await clearCategorySelections();
                  }}>
                  <Text style={styles.actionMenuItemText}>✕ 取消选择</Text>
                </TouchableOpacity>
                
                {/* 设置分类 - 带二级菜单 */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  activeOpacity={1}
                  onMouseEnter={() => {
                    logger.debug('🖱️ 鼠标进入设置分类菜单项');
                    logger.debug('📋 可用分类数量:', availableCategories.length);
                    setShowCategorySubmenu(true);
                  }}
                  onMouseLeave={() => {
                    logger.debug('🖱️ 鼠标离开设置分类菜单项');
                    setShowCategorySubmenu(false);
                  }}
                >
                  <View style={styles.actionMenuItemWithSubmenu}>
                    <Text style={styles.actionMenuItemText}>🏷️ 分类 ›</Text>
                    
                    {/* 二级菜单：分类列表 */}
                    {showCategorySubmenu && availableCategories.length > 0 && (
                      <View 
                        style={styles.categorySubmenu}
                        onMouseEnter={() => setShowCategorySubmenu(true)}
                        onMouseLeave={() => setShowCategorySubmenu(false)}
                      >
                        {availableCategories.map((cat) => (
                          <TouchableOpacity
                            key={cat.id}
                            style={styles.categorySubmenuItem}
                            onPress={() => {
                              logger.debug('选择分类:', cat.id, cat.chinese);
                              setShowActionMenu(false);
                              setShowCategorySubmenu(false);
                              handleBatchChangeCategory(cat.id);
                            }}>
                            <Text style={styles.categorySubmenuItemText}>
                              {cat.chinese}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                
                {/* 照片创玩（带二级菜单） - 所有分类都显示 */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  activeOpacity={1}
                  onMouseEnter={() => {
                    logger.debug('🖱️ 鼠标进入照片创玩菜单项');
                    setShowEnhanceSubmenu(true);
                  }}
                  onMouseLeave={() => {
                    logger.debug('🖱️ 鼠标离开照片创玩菜单项');
                    setShowEnhanceSubmenu(false);
                  }}
                >
                  <View style={styles.actionMenuItemWithSubmenu}>
                    <Text style={styles.actionMenuItemText}>✨ 创玩 ›</Text>
                    
                    {/* 二级菜单：增强方案列表 */}
                    {showEnhanceSubmenu && availableEnhancePresets.length > 0 && (
                      <View 
                        style={styles.categorySubmenu}
                        onMouseEnter={() => setShowEnhanceSubmenu(true)}
                        onMouseLeave={() => setShowEnhanceSubmenu(false)}
                      >
                        {availableEnhancePresets.map((preset) => (
                          <TouchableOpacity
                            key={preset.id}
                            style={styles.categorySubmenuItem}
                            onPress={() => {
                              logger.debug('选择方案:', preset.id, preset.name);
                              setShowActionMenu(false);
                              setShowCategorySubmenu(false);
                              setShowEnhanceSubmenu(false);
                              handleAIEnhance(preset.id);
                            }}>
                            <Text style={styles.categorySubmenuItemText}>
                              {preset.icon ? `${preset.icon} ` : ''}{preset.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                
                {/* 删除 - 所有分类都显示 */}
                <TouchableOpacity
                  style={[styles.actionMenuItem, styles.actionMenuItemDanger]}
                  onPress={() => {
                    setShowActionMenu(false);
                    setShowCategorySubmenu(false);
                    handleBatchDelete();
                  }}>
                  <Text style={[styles.actionMenuItemText, styles.actionMenuItemTextDanger]}>
                    🗑️ 删除
                  </Text>
                </TouchableOpacity>
                
                {/* 复制到剪贴板 - 所有分类都显示 */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() => {
                    setShowActionMenu(false);
                    setShowCategorySubmenu(false);
                    handleCopyToClipboard();
                  }}>
                  <Text style={styles.actionMenuItemText}>📋 内容复制</Text>
                </TouchableOpacity>
                
                {/* 复制到文件管理器 - 所有分类都显示 */}
                <TouchableOpacity
                  style={styles.actionMenuItem}
                  onPress={() => {
                    setShowActionMenu(false);
                    setShowCategorySubmenu(false);
                    handleCopyToFileManager();
                  }}>
                  <Text style={styles.actionMenuItemText}>📂 文件复制</Text>
                </TouchableOpacity>
                
                {/* 暂存 - 只有非暂存箱显示 */}
                {!isStagingBox && (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={() => {
                      setShowActionMenu(false);
                      setShowCategorySubmenu(false);
                      handleBatchAddToStagingBox();
                    }}>
                    <Text style={styles.actionMenuItemText}>📦 暂存</Text>
                  </TouchableOpacity>
                )}
                
                {/* 从暂存箱移除 - 只有暂存箱显示 */}
                {isStagingBox && (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={() => {
                      setShowActionMenu(false);
                      setShowCategorySubmenu(false);
                      handleBatchRemoveFromStagingBox();
                    }}>
                    <Text style={styles.actionMenuItemText}>➡️ 移出</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  }, [filterType, filterValue, onBack, currentPage, pageInput, totalPages, itemsPerPage, showDropdown, dropdownOptions, selectAll, selectedImages.length, handleCopyToClipboard, handleCopyToFileManager, showActionMenu, showCategorySubmenu, showEnhanceSubmenu, availableEnhancePresets, handleBatchChangeCategory, handleBatchAddToStagingBox, handleBatchRemoveFromStagingBox, handleBatchDelete, handleAIEnhance, clearCategorySelections, toggleSelectAll, selectionVersion, allImages.length, truncateText]);

  // 懒加载图片容器组件
  const LazyImageContainer = React.memo(({ item, index, total, getIsSelected, onPress, onLongPress, onRightPress, highlightedId, isInStagingBox, setRef }) => {
    const [selected, setSelected] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    const isHighlighted = highlightedId === item.id;
    
    // 初始化选中状态 - 只在组件挂载时执行一次
    useEffect(() => {
      const isSelected = getIsSelected(item.id);
      setSelected(isSelected);
    }, [item.id]); // 只依赖 item.id，不依赖 getIsSelected
    
    // 监听选中状态变化 - 使用事件监听避免依赖 getIsSelected
    useEffect(() => {
      const handleSelectionChange = (event) => {
        if (event.detail.imageId === item.id) {
          setSelected(event.detail.isSelected);
          logger.debug(`选中状态变化: ${item.id} -> ${event.detail.isSelected}`);
        }
      };
      
      // 监听自定义事件
      window.addEventListener('imageSelectionChanged', handleSelectionChange);
      
      return () => {
        window.removeEventListener('imageSelectionChanged', handleSelectionChange);
      };
    }, [item.id]); // 只依赖 item.id，不依赖 selected
    
    // logger.debug(`LazyImageContainer渲染: ${item.id}, selected: ${selected}, index: ${index}, total: ${total}`);
    
    // 处理右键点击
    const handleRightPress = () => {
      onRightPress(item);
      // 立即更新本地状态
      setSelected(!selected);
    };
    
    useEffect(() => {
      // 优先加载前15张图片，其余的延迟加载
      if (index < 15) {
        setIsVisible(true);
      } else {
        // 延迟加载，避免同时加载太多图片
        const delay = (index - 15) * 80; // 每张图片延迟80ms
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, delay);
        
        return () => clearTimeout(timer);
      }
    }, [index]);
    
    return (
      <View style={styles.imageItemContainer}>
        <ImageItem
          ref={(el) => setRef && setRef(item.id, el)}
          item={item}
          isSelected={selected}
          isHighlighted={isHighlighted}
          isInStagingBox={isInStagingBox}
          onPress={onPress}
          onLongPress={onLongPress}
          onRightPress={handleRightPress}
          isVisible={isVisible}
        />
      </View>
    );
  }, (prevProps, nextProps) => {
    // 自定义比较函数：如果 highlightedId 与当前 item.id 相关，必须重新渲染
    const prevIsHighlighted = prevProps.highlightedId === prevProps.item.id;
    const nextIsHighlighted = nextProps.highlightedId === nextProps.item.id;
    
    // 如果高亮状态发生变化（从高亮变为不高亮，或从不高亮变为高亮），需要重新渲染
    if (prevIsHighlighted !== nextIsHighlighted) {
      return false; // 返回 false 表示需要重新渲染
    }
    
    // 如果 highlightedId 本身变化了，也需要重新渲染（可能影响其他图片的高亮状态）
    if (prevProps.highlightedId !== nextProps.highlightedId) {
      return false;
    }
    
    // 如果 isInStagingBox 状态变化，需要重新渲染
    if (prevProps.isInStagingBox !== nextProps.isInStagingBox) {
      return false;
    }
    
    // 其他 props 使用默认浅比较
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.index === nextProps.index &&
      prevProps.total === nextProps.total
    );
  });

  // ScrollView 组件 - 稳定渲染，不依赖选中状态
  const ScrollViewComponent = useCallback(() => {
    return (
      <ScrollView
        style={{
          marginTop: 60, // 只有内部标题栏的高度
          flex: 1
        }}
        contentContainerStyle={{
          padding: 8,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}
        showsVerticalScrollIndicator={false}
      >
        {paginationData.currentPageImages.map((item, index) => (
          <LazyImageContainer
            key={item.id}
            item={item}
            index={index}
            total={paginationData.currentPageImages.length}
            getIsSelected={getIsSelected}
            onPress={handleImagePress}
            onLongPress={handleImageLongPress}
            onRightPress={handleImageRightPress}
            highlightedId={highlightedImageId}
            isInStagingBox={stagingBoxImageIds.has(item.id)}
            setRef={(id, el) => {
              if (el) {
                imageRefs.current[id] = el;
              }
            }}
          />
        ))}
      </ScrollView>
    );
  }, [paginationData.currentPageImages, getIsSelected, handleImagePress, handleImageLongPress, handleImageRightPress, highlightedImageId, stagingBoxImageIds]);

  // 时间轴标题点击处理 - 全选/取消全选该时间段的所有图片
  const handleTimelineHeaderPress = useCallback((imagesForDate) => {
    const imageIds = imagesForDate.map(img => img.id);
    
    // 使用setSelectedImages的prev参数来获取当前选中状态，避免依赖selectedImages
    setSelectedImages(prev => {
      const allSelectedInGroup = imageIds.every(id => prev.includes(id));
      
      if (allSelectedInGroup) {
        // 全部选中，则取消全选
        const newSelection = prev.filter(id => !imageIds.includes(id));
        
        // 同时更新 UnifiedDataService 的全局状态和发送事件
        imageIds.forEach(id => {
          UnifiedDataService.setImageSelection(id, false);
          window.dispatchEvent(new CustomEvent('imageSelectionChanged', {
            detail: { imageId: id, isSelected: false }
          }));
        });
        
        return newSelection;
      } else {
        // 未全部选中，则全选
        const newSelection = [...prev];
        const idsToAdd = imageIds.filter(id => !newSelection.includes(id));
        idsToAdd.forEach(id => newSelection.push(id));
        
        // 同时更新 UnifiedDataService 的全局状态和发送事件
        imageIds.forEach(id => {
          UnifiedDataService.setImageSelection(id, true);
          window.dispatchEvent(new CustomEvent('imageSelectionChanged', {
            detail: { imageId: id, isSelected: true }
          }));
        });
        
        return newSelection;
      }
    });
  }, []); // 不依赖任何状态，使用prev参数获取当前值

  // 时间轴渲染函数
  const renderTimeline = useCallback(() => {
    const { grouped, sortedDates } = groupedImages;
    
    if (sortedDates.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>暂无图片</Text>
          <Text style={styles.emptySubtitle}>
            {!filterType || !filterValue
              ? '暂无图片'
              : filterType === 'similarityGroup'
              ? '该相似组暂无图片'
              : filterType === 'directory'
              ? '该目录暂无图片'
              : filterType === 'city'
              ? `${filterValue} 暂无图片`
              : filterType === 'color'
              ? `该颜色暂无图片`
              : filterType === 'stagingBox'
              ? '暂存箱暂无图片'
              : '该分类暂无图片'
            }
          </Text>
        </View>
      );
    }
    
    return (
      <ScrollView
        ref={scrollViewRef}
        style={{
          marginTop: 60, // 只有内部标题栏的高度
          flex: 1
        }}
        contentContainerStyle={styles.timelineContainer}
        showsVerticalScrollIndicator={false}
      >
        {sortedDates.map((dateKey) => {
          const imagesForDate = grouped[dateKey];
          const date = new Date(dateKey);
          
          // 自定义中文日期格式化
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          const weekday = date.getDay();
          
          const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                             '七月', '八月', '九月', '十月', '十一月', '十二月'];
          const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
          
          const formattedDate = `${year}年${month}月${day}日 ${weekdayNames[weekday]}`;
          
          return (
            <View key={dateKey} style={styles.timelineSection}>
              <TimelineHeader
                dateKey={dateKey}
                formattedDate={formattedDate}
                imagesForDate={imagesForDate}
                onPress={() => handleTimelineHeaderPress(imagesForDate)}
              />
              
              <View style={styles.timelineImages}>
                {imagesForDate.map((image, index) => (
                  <LazyImageContainer
                    key={image.id}
                    item={image}
                    index={index}
                    total={imagesForDate.length}
                    getIsSelected={getIsSelected}
                    onPress={handleImagePress}
                    onLongPress={handleImageLongPress}
                    onRightPress={handleImageRightPress}
                    highlightedId={highlightedImageId}
                    isInStagingBox={stagingBoxImageIds.has(image.id)}
                    setRef={(id, el) => {
                      if (el) {
                        imageRefs.current[id] = el;
                      }
                    }}
                  />
                ))}
              </View>
                    </View>
                  );
                })}
      </ScrollView>
    );
  }, [groupedImages, getIsSelected, handleImagePress, handleImageLongPress, handleImageRightPress, handleTimelineHeaderPress, highlightedImageId, stagingBoxImageIds]);

  // 分页控制已集成到头部区域

  // Render selection toolbar
  const renderSelectionToolbar = useCallback(() => {
    // 只在有选中图片时显示工具栏
    if (selectedImages.length === 0) return null;

    return (
      <View style={styles.selectionToolbar}>
        <View style={styles.toolbarLeft}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.selectAllButton]}
            onPress={toggleSelectAll}>
            <Text style={[styles.toolbarButtonText, styles.selectAllButtonText]}>
              {selectAll ? 'Deselect All' : 'Select All'}
            </Text>
          </TouchableOpacity>
              </View>
        
        <View style={styles.toolbarCenter}>
          <Text style={styles.selectionCount}>
            已选择 {selectedImages.length} / {allImages.length} 张
          </Text>
            </View>
        
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.deleteButton]}
            onPress={handleBatchDelete}>
            <Text style={[styles.toolbarButtonText, styles.deleteButtonText]}>
              Delete
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }, [selectedImages.length, allImages.length, selectAll]);

  // 移除ListRow函数，使用内联渲染

  // 分页导航函数
  const goToPage = useCallback((page) => {
    const safePage = Math.max(1, Math.min(page, paginationData.totalPages));
    logger.debug(`跳转到第${safePage}页`);
    setCurrentPage(safePage);
    
    // 通知父组件页面变化
    if (onPageChange) {
      onPageChange({
        currentPage: safePage,
        itemsPerPage,
        totalPages: paginationData.totalPages,
        filterType,
        filterValue
      });
    }
  }, [paginationData.totalPages, itemsPerPage, onPageChange, filterType, filterValue]);

  const goToPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage]);

  const goToNextPage = useCallback(() => {
    if (currentPage < paginationData.totalPages) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, paginationData.totalPages]);

  const handleItemsPerPageChange = useCallback((newItemsPerPage) => {
    logger.debug(`每页数量改为: ${newItemsPerPage}`);
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1); // 重置到第一页
    
    // 通知父组件每页数量变化
    if (onPageChange) {
      onPageChange({
        currentPage: 1,
        itemsPerPage: newItemsPerPage,
        totalPages: Math.ceil((allImages?.length || 0) / newItemsPerPage),
        filterType,
        filterValue
      });
    }
  }, [onPageChange, allImages?.length, filterType, filterValue]);

  // 处理页码输入
  const handlePageInputSubmit = useCallback(() => {
    const pageNumber = parseInt(pageInput);
    if (pageNumber && pageNumber >= 1 && pageNumber <= paginationData.totalPages) {
      goToPage(pageNumber);
      setPageInput('');
    } else {
      // 输入无效，重置输入框
      setPageInput('');
    }
  }, [pageInput, paginationData.totalPages]);

  // 下拉选择框组件
  const renderDropdown = () => (
    <View style={styles.dropdownContainer}>
      <TouchableOpacity 
        style={styles.dropdownButton}
        onPress={() => setShowDropdown(!showDropdown)}
      >
        <Text style={styles.dropdownButtonText}>{itemsPerPage}</Text>
        <Text style={styles.dropdownArrow}>{showDropdown ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      
      {showDropdown && (
        <View style={styles.dropdownList}>
          {dropdownOptions.map(option => (
            <TouchableOpacity
              key={option}
              style={[
                styles.dropdownItem,
                itemsPerPage === option && styles.dropdownItemActive
              ]}
              onPress={() => {
                handleItemsPerPageChange(option);
                closeDropdown();
              }}
            >
              <Text style={[
                styles.dropdownItemText,
                itemsPerPage === option && styles.dropdownItemTextActive
              ]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  // 分页控制组件（简化版，用于工具栏）
  const renderPaginationControls = () => (
    <View style={styles.paginationControls}>
      <View style={styles.paginationInfo}>
        <Text style={styles.paginationText}>
          第 {currentPage} 页 / 共 {paginationData.totalPages} 页
        </Text>
        <Text style={styles.paginationText}>
          ({paginationData.startIndex + 1}-{paginationData.endIndex} / {paginationData.total} 张图片)
        </Text>
              </View>
              
      <View style={styles.paginationButtons}>
        <TouchableOpacity 
          style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
          onPress={goToPreviousPage}
          disabled={currentPage === 1}
        >
          <Text style={styles.pageButtonText}>上一页</Text>
        </TouchableOpacity>
        
        <View style={styles.pageInputContainer}>
          <TextInput
            style={styles.pageInput}
            value={pageInput}
            onChangeText={setPageInput}
            placeholder="页码"
            keyboardType="numeric"
            onSubmitEditing={handlePageInputSubmit}
            returnKeyType="done"
          />
          <TouchableOpacity 
            style={styles.goButton}
            onPress={handlePageInputSubmit}
          >
            <Text style={styles.goButtonText}>跳转</Text>
          </TouchableOpacity>
                    </View>
        
        <TouchableOpacity 
          style={[styles.pageButton, currentPage === paginationData.totalPages && styles.pageButtonDisabled]}
          onPress={goToNextPage}
          disabled={currentPage === paginationData.totalPages}
        >
          <Text style={styles.pageButtonText}>下一页</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.paginationSettings}>
        <Text style={styles.settingLabel}>每页显示：</Text>
        <TouchableOpacity 
          style={[styles.settingButton, itemsPerPage === 20 && styles.settingButtonActive]}
          onPress={() => handleItemsPerPageChange(20)}
        >
          <Text style={styles.settingButtonText}>20</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.settingButton, itemsPerPage === 50 && styles.settingButtonActive]}
          onPress={() => handleItemsPerPageChange(50)}
        >
          <Text style={styles.settingButtonText}>50</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.settingButton, itemsPerPage === 100 && styles.settingButtonActive]}
          onPress={() => handleItemsPerPageChange(100)}
        >
          <Text style={styles.settingButtonText}>100</Text>
        </TouchableOpacity>
              </View>
            </View>
          );

  // 空状态渲染
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>📷</Text>
      <Text style={styles.emptyTitle}>暂无图片</Text>
      <Text style={styles.emptySubtitle}>
        {!filterType || !filterValue
          ? '暂无图片'
          : filterType === 'similarityGroup'
          ? '该相似组暂无图片'
          : filterType === 'directory'
          ? '该目录暂无图片'
          : filterType === 'city'
          ? `${filterValue} 暂无图片`
          : filterType === 'color'
          ? `该颜色暂无图片`
          : filterType === 'stagingBox'
          ? '暂存箱暂无图片'
          : '该分类暂无图片'
        }
      </Text>
      </View>
    );


  // logger.debug('CategoryScreen 开始渲染，category:', category, 'city:', city, 'allImages.length:', allImages.length);
  
  return (
    <View style={styles.container}>
      {/* Fixed Header - 可以重新渲染 */}
      <View style={createFixedStyle(styles.fixedHeader)}>
        <HeaderComponent />
      </View>
      
      {/* 渲染时间轴视图 */}
      {allImages.length > 0 ? (
        renderTimeline()
      ) : (
        renderEmpty()
      )}

      {/* Batch delete progress dialog */}
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
          availablePresets={availableEnhancePresets}
          progress={enhanceProgress}
          selectedImages={snapshotImagesRef.current}
          results={enhanceResults}
          currentIndex={currentImageIndex}
          isProcessing={isProcessing}
          onIndexChange={setCurrentImageIndex}
          onSave={handleSaveAndAdd}
        />
      )}

    </View>
  );
};

// EnhanceModal 已移至 EnhanceResultScreen.desktop.js

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    position: 'relative',
    overflow: 'hidden',
  },
  
  
  // 分页控制样式
  paginationControls: {
    backgroundColor: '#fff',
    padding: 12,
    marginHorizontal: 8,
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  paginationInfo: {
    alignItems: 'center',
    marginBottom: 12,
  },
  paginationText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  paginationButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
  },
  pageButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    marginHorizontal: 8,
  },
  pageButtonDisabled: {
    backgroundColor: '#ccc',
  },
  pageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  
  // 工具栏分页控制样式
  toolbarPagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 8,
  },
  pageInfo: {
    marginHorizontal: 8,
  },
  pageInfoText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  itemsPerPageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  itemsPerPageLabel: {
    fontSize: 12,
    color: '#666',
  },
  
  // 下拉选择框样式
  dropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 50,
  },
  dropdownButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'center',
  },
  dropdownArrow: {
    fontSize: 10,
    color: '#666',
    marginLeft: 4,
  },
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1001,
  },
  dropdownItem: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  dropdownItemActive: {
    backgroundColor: '#007AFF',
  },
  dropdownItemText: {
    fontSize: 12,
    color: '#333',
    textAlign: 'center',
  },
  dropdownItemTextActive: {
    color: '#fff',
    fontWeight: '500',
  },
  pageInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  pageInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 14,
    textAlign: 'center',
    width: 60,
    marginRight: 4,
  },
  goButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  goButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  paginationSettings: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  settingButton: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  settingButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  settingButtonText: {
    fontSize: 12,
    color: '#666',
  },
  fixedHeader: {
    position: 'absolute',
    top: 60, // 为自定义标题栏留出空间
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5, // Android阴影
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    height: 60, // 固定高度
  },
  backButton: {
    padding: 12,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
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
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  headerButtonActive: {
    backgroundColor: '#2196F3',
  },
  headerButtonText: {
    fontSize: 14,
    color: '#333',
  },
  headerButtonTextActive: {
    color: '#fff',
  },
  
  // 头部分页控制样式
  headerPagination: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerPageButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  headerPageButtonDisabled: {
    backgroundColor: '#ccc',
  },
  headerPageButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  headerPageInfo: {
    marginHorizontal: 4,
  },
  headerPageInfoText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  headerItemsPerPageContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerItemsPerPageLabel: {
    fontSize: 12,
    color: '#666',
  },
  headerSpacer: {
    width: 20,
  },
  headerCopyButton: {
    backgroundColor: '#34C759',
  },
  headerCopyButtonText: {
    color: '#fff',
  },
  headerDeleteButton: {
    backgroundColor: '#f0f0f0', // 暂存按钮：和全选按钮保持一致（浅灰色）
  },
  headerDeleteButtonText: {
    color: '#333', // 暂存按钮：深色文字配合浅色背景
  },
  headerRealDeleteButton: {
    backgroundColor: '#FF3B30', // 真正的删除按钮：红色警告
  },
  headerRealDeleteButtonText: {
    color: '#fff', // 真正的删除按钮：白色文字
  },
  headerCancelButton: {
    backgroundColor: '#8E8E93',
  },
  headerCancelButtonText: {
    color: '#fff',
  },
  imageItemContainer: {
    width: 120,
    height: 120,
    margin: 6,
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toolbarButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  toolbarButtonText: {
    fontSize: 14,
    color: '#333',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
  },
  deleteButtonText: {
    color: '#fff',
  },
  selectionCount: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  toolbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolbarCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectAllButton: {
    backgroundColor: '#2196F3',
  },
  selectAllButtonText: {
    color: '#fff',
  },
  toolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    // marginTop 现在通过动态样式设置
  },
     imageGrid: {
     padding: 8,
   },
   timelineContainer: {
     padding: 8,
    paddingTop: 0, // 移除顶部padding，因为已经有marginTop
   },
   timelineGroup: {
    marginBottom: 32,
   },
   dateHeader: {
     flexDirection: 'row',
     alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 12,
   },
   dateLine: {
     flex: 1,
     height: 1,
    backgroundColor: '#d0d7de',
   },
   dateText: {
    fontSize: 15,
     fontWeight: '600',
    color: '#24292f',
    marginHorizontal: 20,
     textAlign: 'center',
    backgroundColor: '#f6f8fa',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
   },
 imageGridContainer: {
   flexDirection: 'row',
   flexWrap: 'wrap',
   justifyContent: 'center', // 改为居中对齐
   paddingHorizontal: 4,
   gap: 12, // 使用gap统一间距
 },
 imageWrapper: {
   // 动态尺寸将在渲染时设置
   padding: 6,
 },
  imageContainer: {
    width: '100%',
    height: '100%',
   borderRadius: 12,
    position: 'relative',
   backgroundColor: '#f8f9fa',
  },
  imageItem: {
    width: 120,
    height: 120,
   borderRadius: 12,
    position: 'relative',
   backgroundColor: '#f8f9fa',
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.1,
   shadowRadius: 4,
   elevation: 3,
   overflow: 'hidden',
  },
  image: {
   position: 'absolute',
   top: 0,
   left: 0,
   right: 0,
   bottom: 0,
    width: '100%',
    height: '100%',
 },
 imageLoadingOverlay: {
   position: 'absolute',
   top: 0,
   left: 0,
   right: 0,
   bottom: 0,
   backgroundColor: 'rgba(255,255,255,0.9)',
   justifyContent: 'center',
   alignItems: 'center',
   borderRadius: 12,
   zIndex: 1,
 },
 loadingText: {
   color: '#666',
   fontSize: 11,
   fontWeight: '500',
   marginTop: 4,
  },
  selectedImage: {
   opacity: 0.8,
   transform: [{ scale: 0.95 }],
 },
 imageHovered: {
   transform: [{ scale: 1.02 }],
   shadowOpacity: 0.2,
   shadowRadius: 8,
   elevation: 6,
  },
  highlightedImage: {
    borderWidth: 3,
    borderColor: '#FF9500',
    shadowColor: '#FF9500',
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 8,
    transform: [{ scale: 1.05 }],
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
   width: 28,
   height: 28,
   borderRadius: 14,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
   shadowColor: '#000',
   shadowOffset: {
     width: 0,
     height: 2,
   },
   shadowOpacity: 0.25,
   shadowRadius: 4,
   elevation: 5,
   borderWidth: 2,
   borderColor: '#fff',
  },
  selectionText: {
    color: '#fff',
   fontSize: 14,
    fontWeight: 'bold',
  },
  stagingBoxBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#FF9500',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    borderColor: '#fff',
  },
  stagingBoxBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
   borderRadius: 12,
   backgroundColor: '#f0f2f5',
    alignItems: 'center',
    justifyContent: 'center',
   borderWidth: 1,
   borderColor: '#e8e8e8',
   borderStyle: 'dashed',
  },
  placeholderText: {
   fontSize: 32,
   color: '#b8bcc8',
   marginBottom: 8,
  },
  placeholderFileName: {
   fontSize: 11,
    color: '#666',
   fontWeight: '500',
   textAlign: 'center',
   paddingHorizontal: 8,
 },
 placeholderSubtext: {
   marginTop: 4,
   fontSize: 9,
   color: '#999',
   fontStyle: 'italic',
   textAlign: 'center',
   paddingHorizontal: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  emptyIcon: {
    fontSize: 60,
    color: '#ccc',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
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

  // 时间轴相关样式
  viewModeContainer: {
    flexDirection: 'row',
    marginLeft: 20,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    padding: 2,
  },
  viewModeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  viewModeButtonActive: {
    backgroundColor: '#007AFF',
  },
  viewModeButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  viewModeButtonTextActive: {
    color: '#fff',
  },
  timelineContainer: {
    padding: 16,
  },
  timelineSection: {
    marginBottom: 24,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    borderRadius: 4,
    cursor: 'pointer',
  },
  timelineHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  timelineDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  timelineCount: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  timelineSelectionIndicator: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  timelineSelectionText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  timelineImages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  
  // 操作菜单样式
  actionMenuContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  actionMenuButton: {
    backgroundColor: '#2196F3',
  },
  actionMenuButtonText: {
    color: '#fff',
  },
  actionMenuDropdown: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 180,
    zIndex: 1001,
  },
  actionMenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    cursor: 'pointer',
  },
  actionMenuItemDanger: {
    backgroundColor: '#fff5f5',
  },
  actionMenuItemText: {
    fontSize: 14,
    color: '#333',
  },
  actionMenuItemTextDanger: {
    color: '#FF3B30',
    fontWeight: '500',
  },
  actionMenuItemWithSubmenu: {
    position: 'relative',
  },
  categorySubmenu: {
    position: 'absolute',
    right: '100%', // 向左展开，避免超出窗口右侧
    top: 0,
    marginRight: 4,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: -2, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    minWidth: 150,
    zIndex: 1002,
  },
  categorySubmenuItem: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    cursor: 'pointer',
  },
  categorySubmenuItemText: {
    fontSize: 13,
    color: '#333',
  },
  
  // ==================== AI图像增强样式 ====================
  enhanceModalOverlay: {
    position: 'fixed',
    top: 60,  // 从标题栏下方开始（electron.js中titleBarOverlay.height = 60）
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999999,
    display: 'flex',
  },
  enhanceModalContent: {
    position: 'relative',
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '95%',
    maxWidth: 1200,
    maxHeight: 'calc(100vh - 100px)',  // 扣除标题栏高度和边距
    height: 'calc(100vh - 100px)',  // 设置固定高度，确保模态框足够高
    marginTop: 20,  // 距离标题栏底部的间距
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    padding: 16,
    zIndex: 1000000,
    display: 'flex',
    flexDirection: 'column',  // 垂直布局，让内容可以滚动
    overflow: 'hidden',  // 防止内容溢出
  },
  enhanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    position: 'relative',
    zIndex: 1000001,
    flexShrink: 0,  // 标题栏不收缩
  },
  enhanceModalScrollContent: {
    flex: 1,  // 占据剩余空间
    overflow: 'auto',  // 允许滚动
  },
  enhanceModalScrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 20,  // 底部留白
  },
  enhanceModalCloseButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
    position: 'relative',
    zIndex: 1000002,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#ff4444',
    },
  },
  enhanceModalCloseButtonText: {
    fontSize: 18,
    color: '#666',
    lineHeight: 16,
    fontWeight: 'bold',
  },
  enhanceConfigView: {
    padding: 24,
  },
  enhanceProgressView: {
    padding: 24,
    alignItems: 'center',
  },
  enhanceModalTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  enhanceModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  enhanceModalCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  enhanceModalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  // 预设方案按钮组
  enhancePresetButtonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 0,
    justifyContent: 'flex-start',
  },
  enhancePresetButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    borderWidth: 2,
    borderColor: '#ddd',
    cursor: 'pointer',
  },
  enhancePresetButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  enhancePresetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  enhancePresetButtonTextActive: {
    color: '#fff',
  },
  enhanceModalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  enhanceModalButtonSecondary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
  },
  enhanceModalButtonSecondaryText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  enhanceModalButtonPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    cursor: 'pointer',
  },
  enhanceModalButtonPrimaryText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  enhanceProgressIndicator: {
    marginBottom: 20,
  },

  // ==================== 大图对比区域样式 ====================
  enhanceComparisonSection: {
    flex: 1,  // 占据剩余所有空间
  },
  enhanceComparisonContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',  // 拉伸子元素高度
    justifyContent: 'space-between',
    gap: 16,
    height: '100%',
  },
  enhanceComparisonImages: {
    flexDirection: 'row',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceComparisonRightButtons: {
    width: 80,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  enhanceComparisonImageContainer: {
    flex: 1,
    maxWidth: 500,
    alignItems: 'center',
  },
  enhanceComparisonImageLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  enhanceComparisonImageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  enhanceComparisonImageCounter: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
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
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  enhanceComparisonFailedHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  enhanceComparisonNavButtonVertical: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    cursor: 'pointer',
  },
  enhanceComparisonNavButtonDisabled: {
    opacity: 0.3,
    cursor: 'not-allowed',
  },
  enhanceComparisonNavButtonText: {
    fontSize: 24,
    color: '#333',
    lineHeight: 24,
  },
  enhanceComparisonSaveButtonVertical: {
    width: 60,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    cursor: 'pointer',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceComparisonSaveButtonDisabled: {
    backgroundColor: '#e0e0e0',
    cursor: 'not-allowed',
    shadowOpacity: 0,
    elevation: 0,
  },
  enhanceComparisonSaveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  enhanceComparisonSaveButtonTextDisabled: {
    color: '#999',
  },
  
  // EnhanceResultModal 样式（已废弃，保留以防需要回退）
  enhanceResultModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceResultModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '95%',
    maxWidth: 1200,
    maxHeight: '90%',
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  enhanceResultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  enhanceResultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  enhanceResultCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    cursor: 'pointer',
  },
  enhanceResultCloseButtonText: {
    fontSize: 18,
    color: '#666',
  },
  enhanceResultCounter: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  enhanceResultComparison: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  enhanceResultImageContainer: {
    flex: 1,
    alignItems: 'center',
  },
  enhanceResultImageLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  enhanceResultImage: {
    width: '100%',
    height: 400,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  enhanceResultNavigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  enhanceResultNavButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    cursor: 'pointer',
  },
  enhanceResultNavButtonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  enhanceResultNavButtonText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  enhanceResultActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceResultActionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
    minWidth: 200,
    alignItems: 'center',
  },
  enhanceResultActionButtonPrimary: {
    backgroundColor: '#2196F3',
  },
  enhanceResultActionButtonDisabled: {
    backgroundColor: '#cccccc',
    opacity: 0.6,
  },
  enhanceResultActionButtonText: {
    fontSize: 15,
    color: '#666',
    fontWeight: '600',
  },
  enhanceResultActionButtonTextDisabled: {
    color: '#999',
  },
  enhanceResultActionButtonTextPrimary: {
    color: '#fff',
  },
  
  // 失败状态样式
  enhanceResultFailedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderWidth: 2,
    borderColor: '#ff3b30',
    borderStyle: 'dashed',
  },
  enhanceResultFailedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceResultFailedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff3b30',
    marginBottom: 8,
  },
  enhanceResultFailedMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  enhanceResultFailedHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  
  // ==================== 浮动进度提示样式 ====================
  floatingProgressContainer: {
    position: 'fixed',
    right: 20,
    bottom: 20,
    zIndex: 9999,
  },
  floatingProgressBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    minWidth: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#2196F3',
    cursor: 'pointer',
  },
  floatingProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  floatingProgressIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  floatingProgressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  floatingProgressText: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  floatingProgressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  floatingProgressBarFill: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 3,
  },
  floatingProgressHint: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
});

export default CategoryScreen;