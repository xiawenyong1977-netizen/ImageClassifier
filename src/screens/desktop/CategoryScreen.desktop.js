import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, getWebAccessibleUri, logger } from '../../adapters/WebAdapters';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Modal, Platform, TextInput, ScrollView } from 'react-native';
// 分页方案实现
import { SafeAreaView, Alert, createFixedStyle } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';

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
const ImageItem = React.forwardRef(({ item, isSelected, isHighlighted, onPress, onLongPress, onRightPress, isVisible = true }, ref) => {
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
  
  // 在Electron环境中直接使用file://URI
  const webUri = displayItem.uri;
  
  // 调试日志
  if (shouldLoad) {
    logger.debug(`图片加载状态: ${item.id}, shouldLoad: ${shouldLoad}, webUri: ${webUri}, imageError: ${imageError}`);
    logger.debug(`原始数据: item.uri=${item.uri}, displayItem.uri=${displayItem?.uri}`);
    logger.debug(`分类信息: item.category=${item.category}, displayItem.category=${displayItem?.category}`);
    if (!webUri) {
      logger.warn(`图片缺少URI: ${item.id}, 将显示占位符`);
    }
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
        webUri && !imageError ? (
        <>
          {imageLoading && (
            <View style={styles.imageLoadingOverlay}>
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}
        <Image
            source={{ uri: webUri }}
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
            {imageError ? 'Load failed' : (displayItem.uri ? 'Local file' : 'Loading...')}
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
    </TouchableOpacity>
  );
});
ImageItem.displayName = 'ImageItem';

const CategoryScreen = ({ 
  category: propCategory, 
  city: propCity, 
  similarityGroupId: propSimilarityGroupId, // 添加相似组ID参数
  currentImageId: propCurrentImageId, // 从ImagePreview返回时的当前图片ID
  currentPage: propCurrentPage, // 从ImagePreview返回时恢复的页码
  onBack, 
  forceRefresh = true, 
  scrollToImageId = null,
  route = null, // 添加 route 参数，默认为 null
  navigation = null, // 添加 navigation 参数，默认为 null
  initialPage = 1, // 初始页面，默认为第1页
  itemsPerPage: propItemsPerPage = 50, // 每页数量，默认为50
  onPageChange = null // 页面变化回调函数
}) => {
  // 优先使用 prop 中的 category，然后是 route.params.category
  const category = propCategory || route?.params?.category;
  // 优先使用 prop 中的 city，然后是 route.params.city
  const city = propCity || route?.params?.city;
  // 优先使用 prop 中的 similarityGroupId，然后是 route.params.similarityGroupId
  const similarityGroupId = propSimilarityGroupId || route?.params?.similarityGroupId;
  
  
  // 从统一数据服务获取数据
  const [allImages, setAllImages] = useState([]);
  
  // 高亮图片状态（从ImagePreview返回时使用）
  const [highlightedImageId, setHighlightedImageId] = useState(null);
  const scrollViewRef = useRef(null);
  const imageRefs = useRef({});
  
  // 加载图片数据的函数
  const loadImages = useCallback(async () => {
    try {
      let images;
      
      if (similarityGroupId) {
        // 加载相似组图片
        const groupData = await UnifiedDataService.getSimilarityGroupImages(similarityGroupId);
        images = groupData.images || [];
        // 过滤掉tobecleaned分类的照片
        images = images.filter(img => img.category !== 'tobecleaned');
        logger.debug(`从相似组获取图片: 总数=${images.length}, groupId=${similarityGroupId}, 已过滤tobecleaned`);
      } else if (city) {
        // 按城市加载
        images = await UnifiedDataService.readImagesByLocation(city, null);
        // 过滤掉tobecleaned分类的照片
        images = images.filter(img => img.category !== 'tobecleaned');
        logger.debug(`从城市获取图片: 总数=${images.length}, city=${city}, 已过滤tobecleaned`);
      } else if (category) {
        // 按分类加载
        images = await UnifiedDataService.readImagesByCategory(category);
        logger.debug(`从分类获取图片: 总数=${images.length}, category=${category}`);
      } else {
        // 没有有效的上下文参数，返回空数组
        logger.error('没有有效的上下文参数（category、city、similarityGroupId），无法加载图片');
        images = [];
      }
      
      // 同时加载选中状态 - 统一使用getSelectedImages方法
      let selectedImageIds = [];
      if (similarityGroupId) {
        // 从相似组进入，获取相似组的选中图片
        const selectedImages = await UnifiedDataService.getSelectedImages(null, null, similarityGroupId);
        selectedImageIds = selectedImages.map(img => img.id);
        logger.debug(`相似组选中状态: ${selectedImageIds.length} 张图片被选中`);
      } else if (city) {
        // 从城市进入，获取城市的选中图片
        const selectedImages = await UnifiedDataService.getSelectedImages(null, city);
        selectedImageIds = selectedImages.map(img => img.id);
      } else if (category) {
        // 从分类进入，获取分类的选中图片
        const selectedImages = await UnifiedDataService.getSelectedImages(category, null);
        selectedImageIds = selectedImages.map(img => img.id);
      } else {
        // 其他情况，获取所有选中图片
        const selectedImages = await UnifiedDataService.getSelectedImages();
        selectedImageIds = selectedImages.map(img => img.id);
      }
      
      logger.debug(`选中状态: ${selectedImageIds.length} 张图片被选中`);
      
      setAllImages(images);
      setSelectedImages(selectedImageIds);
    } catch (error) {
      logger.error('获取图片数据失败:', error);
      setAllImages([]);
      setSelectedImages([]);
    }
  }, [category, city, similarityGroupId]);

  // 初始加载图片数据
  useEffect(() => {
    loadImages();
  }, [loadImages]);

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
    if (selectedImages.length === allImages.length) {
      // 如果全部选中，则取消全选
      setSelectedImages([]);
      // 根据当前模式清除选中状态
      let filterType, filterValue, logPrefix;
      if (similarityGroupId) {
        filterType = 'similarityGroup';
        filterValue = similarityGroupId;
        logPrefix = '相似组';
      } else if (city) {
        filterType = 'city';
        filterValue = city;
        logPrefix = '城市';
      } else {
        filterType = 'category';
        filterValue = category;
        logPrefix = '分类';
      }
      const deselectedCount = UnifiedDataService._deselectImagesByFilter(filterType, filterValue);
      logger.debug(`${logPrefix}取消全选: 操作了 ${deselectedCount} 张图片`);
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
  }, [selectedImages.length, allImages, category, city, similarityGroupId]);
  
  
  // 删除进度状态
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 0 });
  
  // 操作菜单状态
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showCategorySubmenu, setShowCategorySubmenu] = useState(false);
  const [selectionVersion, setSelectionVersion] = useState(0); // 用于强制刷新选中计数
  
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
  
  // 分页相关状态 - 优先使用从prop传递的值（返回时恢复）
  const [currentPage, setCurrentPage] = useState(propCurrentPage || initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(propItemsPerPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState('');
  
  // 下拉选择框状态
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownOptions = [20, 50, 100, 1000];
  
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
    if (currentImageId) {
      // 验证图片是否在当前分类/城市/相似组中
      const imageExists = allImages.some(img => img.id === currentImageId);
      
      if (imageExists) {
        logger.debug('🎯 检测到返回的图片ID，准备高亮和滚动:', currentImageId);
        
        // 设置高亮状态
        setHighlightedImageId(currentImageId);
      } else {
        logger.warn('⚠️ 图片不在当前列表中，跳过高亮:', currentImageId);
        return; // 提前返回，不执行高亮和滚动
      }
      
      // 3秒后自动取消高亮
      const highlightTimer = setTimeout(() => {
        setHighlightedImageId(null);
      }, 3000);
      
      // 滚动到该图片位置 - 在Web环境使用DOM API
      const scrollTimer = setTimeout(() => {
        logger.debug('🔍 开始查找图片元素，currentImageId:', currentImageId);
        
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          // Web环境：使用DOM查询和scrollIntoView
          // 方法1：通过data-image-id属性查找
          const domElement = document.querySelector(`[data-image-id="${currentImageId}"]`);
          
          logger.debug('📊 DOM查询结果:', { 
            hasDomElement: !!domElement,
            elementTag: domElement?.tagName,
            elementClass: domElement?.className
          });
          
          if (domElement) {
            try {
              logger.debug('🌐 使用DOM scrollIntoView滚动到图片');
              domElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'nearest'
              });
              logger.debug('✅ scrollIntoView 调用成功');
            } catch (error) {
              logger.error('❌ scrollIntoView失败:', error);
            }
          } else {
            logger.warn('❌ 未找到DOM元素，尝试查找所有可能的图片元素');
            // 输出调试信息
            const allImageElements = document.querySelectorAll('[data-image-id]');
            logger.debug('📋 页面上所有图片元素数量:', allImageElements.length);
            if (allImageElements.length > 0) {
              logger.debug('📋 前3个图片ID:', 
                Array.from(allImageElements).slice(0, 3).map(el => el.getAttribute('data-image-id'))
              );
            }
          }
        } else {
          // 非Web环境的降级方案
          logger.debug('📱 非Web环境，使用React Native API');
          const imageElement = imageRefs.current[currentImageId];
          if (imageElement && scrollViewRef.current) {
            imageElement.measureLayout(
              scrollViewRef.current,
              (x, y) => {
                logger.debug('✅ 测量到图片位置:', { x, y });
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
        clearTimeout(highlightTimer);
        clearTimeout(scrollTimer);
      };
    }
  }, [propCurrentImageId, route?.params?.currentImageId, allImages]);
  
  // 关闭下拉框
  const closeDropdown = useCallback(() => {
    setShowDropdown(false);
  }, []);

  // 按日期分组当前页面的图片（时间轴功能）- 使用useMemo缓存结果
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
      
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD格式
      
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
  
  // 滚动状态（保留用于其他功能）
  const [scrollOffset, setScrollOffset] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  
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
      // 根据当前上下文确定fromScreen
      let fromScreen = 'Category';
      if (similarityGroupId) {
        fromScreen = 'SimilarityGroup';
      } else if (city) {
        fromScreen = 'City';
      }
      
      // 完全不变地传递接收到的screenProps，不要修改任何内容
      const contextProps = {
        category,
        city,
        similarityGroupId,
        currentPage // 保存当前页码，返回时恢复
      };
         
      navigation.onImagePress(image, fromScreen, contextProps);
    }
  }, [navigation, category, city, similarityGroupId, currentPage]);

  // Image long press handler
  const handleImageLongPress = useCallback((image) => {
    // 长按直接选中图片，不清除其他选中状态
    UnifiedDataService.setImageSelection(image.id, true);
  }, []);


  // Clear current selections (清除当前分类或城市的选中状态)
  const clearCategorySelections = useCallback(() => {
    // 统一使用_deselectImagesByFilter方法清除选中状态
    let filterType, filterValue, logPrefix;
    if (similarityGroupId) {
      filterType = 'similarityGroup';
      filterValue = similarityGroupId;
      logPrefix = '相似组';
    } else if (city) {
      filterType = 'city';
      filterValue = city;
      logPrefix = '城市';
    } else if (category) {
      filterType = 'category';
      filterValue = category;
      logPrefix = '分类';
    } else {
      return; // 没有有效的过滤条件
    }
    
    const deselectedCount = UnifiedDataService._deselectImagesByFilter(filterType, filterValue);
    logger.debug(`清除${logPrefix}选中状态: ${filterValue}, 操作了 ${deselectedCount} 张图片`);
    
    // 清除本地状态
    setSelectedImages([]);
    setSelectAll(false);
  }, [category, city, similarityGroupId]);


  // Image right click handler
  const handleImageRightPress = useCallback((image) => {
    logger.debug(`处理右键点击: ${image.id}`);
    // 右键点击直接切换图片的选中状态
    toggleImageSelection(image.id);
  }, [toggleImageSelection]);

  // 复制选中的图片到剪贴板
  const handleCopyToClipboard = useCallback(async () => {
    try {
      // 获取当前分类的选中图片对象数组
      const normalizedCategory = category ? UnifiedDataService.getCategoryId(category) : null;
      const currentCategorySelectedImages = normalizedCategory 
        ? UnifiedDataService.getSelectedImagesByCategory(normalizedCategory)
        : [];
      
      logger.debug(`📋 复制操作 - 选中图片数量: ${currentCategorySelectedImages.length}`);
      logger.debug(`📋 第一个图片对象:`, currentCategorySelectedImages[0]);
      
      if (currentCategorySelectedImages.length === 0) {
        Alert.alert('提示', '请先选择要复制的图片');
        return;
      }

      // 获取选中图片的文件路径
      const filePaths = [];
      for (const image of currentCategorySelectedImages) {
        logger.debug(`📋 处理图片:`, {
          id: image?.id,
          uri: image?.uri,
          path: image?.path,
          fileName: image?.fileName
        });
        
        // 优先使用path，其次使用uri
        const imagePath = image?.path || image?.uri;
        if (imagePath) {
          // 使用normalizeFilePath确保路径格式正确
          const normalizedPath = imagePath.replace(/^file:\/\/\//, '').replace(/\//g, '\\');
          logger.debug(`📋 标准化路径: ${normalizedPath}`);
          filePaths.push(normalizedPath);
        } else {
          logger.warn(`📋 图片缺少路径信息:`, image);
        }
      }

      logger.debug(`📋 最终文件路径列表:`, filePaths);

      if (filePaths.length === 0) {
        Alert.alert('错误', '未找到有效的图片路径');
        return;
      }

      // 在Electron环境中调用IPC复制文件到剪贴板
      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        
        // 发送复制请求到主进程
        ipcRenderer.send('copy-files-to-clipboard', filePaths);
        
        // 监听复制结果
        ipcRenderer.once('copy-files-result', (event, result) => {
          if (result.success) {
            Alert.alert('成功', `已将 ${filePaths.length} 个文件复制到剪贴板\n\n可以在资源管理器中粘贴（Ctrl+V）`);
          } else {
            Alert.alert('失败', `复制失败: ${result.error}`);
          }
        });
      } else {
        Alert.alert('错误', '当前环境不支持文件复制功能');
      }
    } catch (error) {
      logger.error('复制文件到剪贴板失败:', error);
      Alert.alert('错误', `复制失败: ${error.message}`);
    }
  }, [category]);

  // 批量修改分类
  const handleBatchChangeCategory = useCallback(async (newCategory) => {
    try {
      const normalizedCategory = category ? UnifiedDataService.getCategoryId(category) : null;
      
      // 获取选中图片
      let selectedImagesList = [];
      if (similarityGroupId) {
        selectedImagesList = UnifiedDataService.getSelectedImagesBySimilarityGroup(similarityGroupId);
      } else if (normalizedCategory) {
        selectedImagesList = UnifiedDataService.getSelectedImagesByCategory(normalizedCategory);
      } else if (city) {
        selectedImagesList = UnifiedDataService.getSelectedImagesByCity(city);
      }
      
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
                let processed = 0;
                
                for (const image of selectedImagesList) {
                  await UnifiedDataService.updateImagesCategory([image.id], newCategory, 'manual');
                  processed++;
                }
                
                // 批量清除选中状态
                for (const image of selectedImagesList) {
                  UnifiedDataService.setImageSelection(image.id, false);
                }
                
                logger.debug('✅ 已清除选中状态，准备重新加载数据');
                
                // 检查清除后的统计
                const afterClearCounts = UnifiedDataService.getSelectedCountsByCategory();
                logger.debug('🔍 清除后的分类选中统计:', afterClearCounts);
                logger.debug('🔍 当前分类的选中数:', afterClearCounts[normalizedCategory]);
                
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
  }, [category, city, similarityGroupId, loadImages]);

  // Batch delete
  const handleBatchDelete = useCallback(() => {
    // 使用UnifiedDataService获取标准化的分类ID
    const normalizedCategory = category ? UnifiedDataService.getCategoryId(category) : null;
    
    // 获取选中图片数量 - 支持相似组
    const selectedCountsByCategory = UnifiedDataService.getSelectedCountsByCategory();
    const selectedCountsByCity = UnifiedDataService.getSelectedCountsByCity();
    const selectedCountsBySimilarityGroup = UnifiedDataService.getSelectedCountsBySimilarityGroup();
    
    let selectedCount;
    if (similarityGroupId) {
      selectedCount = selectedCountsBySimilarityGroup[similarityGroupId] || 0;
    } else if (normalizedCategory) {
      selectedCount = selectedCountsByCategory[normalizedCategory] || 0;
    } else if (city) {
      selectedCount = selectedCountsByCity[city] || 0;
    } else {
      selectedCount = 0;
    }
    
    if (selectedCount === 0) return;

    // 获取当前选中的图片 - 支持相似组
    let currentCategorySelectedImages;
    if (similarityGroupId) {
      currentCategorySelectedImages = UnifiedDataService.getSelectedImagesBySimilarityGroup(similarityGroupId);
    } else if (normalizedCategory) {
      currentCategorySelectedImages = UnifiedDataService.getSelectedImagesByCategory(normalizedCategory);
    } else if (city) {
      currentCategorySelectedImages = UnifiedDataService.getSelectedImagesByCity(city);
    } else {
      currentCategorySelectedImages = [];
    }

    // 检查当前模式是否为tobecleaned分类
    const isToBeCleanedCategory = normalizedCategory === 'tobecleaned';
    
    // 使用实际要删除的图片数量
    const actualSelectedCount = currentCategorySelectedImages.length;

    if (isToBeCleanedCategory) {
      // 如果是tobecleaned分类，执行真正的删除操作
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
                  // 有文件删除失败，但不显示提示框，只在控制台记录
                  console.warn(`部分删除失败: 成功删除 ${result.filesDeleted} 张图片，${result.filesFailed} 张图片删除失败`);
                  
                  // 只移除成功删除的图片
                  setAllImages(prevImages => prevImages.filter(img => !result.successfulImageIds.includes(img.id)));
                } else {
                  // 全部删除成功，移除所有选中的图片
                  setAllImages(prevImages => prevImages.filter(img => !selectedImageIds.includes(img.id)));
                }
                
                // 清除选中状态
                clearCategorySelections();
                
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
    } else {
      // 如果不是tobecleaned分类，将选中的图片设置为tobecleaned分类
      Alert.alert(
        '暂存',
        `确定要将选中的 ${actualSelectedCount} 张图片暂存到待处置吗？\n\n这些图片将被移动到"待处置"分类中。`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '标记',
            style: 'default',
            onPress: async () => {
              try {
                const selectedImageIds = currentCategorySelectedImages.map(img => img.id);
                
                // 清除选中状态
                clearCategorySelections();
                // 批量更新图片分类为tobecleaned，并从相似组中移除
                let processed = 0;
                // 使用批量更新接口，提升性能（服务层会自动清理相似组信息）
                const result = await UnifiedDataService.updateImagesCategory(selectedImageIds, 'tobecleaned', 'manual');
                processed = result.processed;
                
          
                
                // 检查相似组是否还存在，如果不存在则导航回HomeScreen
                if (similarityGroupId) {
                  const remainingImages = UnifiedDataService.imageCache.getImagesBySimilarityGroup(similarityGroupId);
                  if (remainingImages.length <= 1) {
                    logger.debug(`相似组 ${similarityGroupId} 已被删除，导航回HomeScreen`);
                    Alert.alert('操作完成', `已成功暂存 ${processed} 张图片到待处置\n\n相似组已被删除，返回主页面`, [
                      { text: '确定', onPress: () => onBack() }
                    ]);
                    return;
                  }
                }
                
                // 重新加载图片数据
                await loadImages();
                
                Alert.alert('操作完成', `已成功暂存 ${processed} 张图片到待处置`);
                
              } catch (error) {
                Alert.alert('操作失败', '标记图片时发生错误，请重试');
              }
            },
          },
        ]
      );
    }
  }, [category, city, similarityGroupId]);

  // Header 组件 - 可以重新渲染
  const HeaderComponent = useCallback(() => {
    
    // 使用UnifiedDataService获取标准化的分类ID
    const normalizedCategory = category ? UnifiedDataService.getCategoryId(category) : null;
    
    // 获取所有分类列表（排除tobecleaned）
    const configService = UnifiedDataService.configService;
    let availableCategories = [];
    if (configService?.isConfigLoaded()) {
      const categoryMap = configService.getCategoryNameMap();
      availableCategories = Object.entries(categoryMap)
        .filter(([id]) => id !== 'tobecleaned')
        .map(([id, names]) => ({
          id,
          chinese: names.chinese,
          english: names.english
        }));
      
      logger.debug('调试信息 - 可用分类:', availableCategories);
    }
    
    // 使用本地selectedImages state计算选中数量
    // 这个state在loadImages时已经根据当前分类/城市/相似组过滤过了
    const currentSelectedCount = selectedImages.length;
    
    logger.debug(`HeaderComponent 渲染: category=${category}, normalizedCategory=${normalizedCategory}, city=${city}, currentSelectedCount=${currentSelectedCount}`);
    
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
        {similarityGroupId 
          ? `相似照片组 (${allImages.length}张)` 
          : city 
            ? `${city} (${allImages.length}张)` 
            : `${UnifiedDataService.getCategoryDisplayName(category)} (${allImages.length}张)`
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
                  onPress={() => {
                    setShowActionMenu(false);
                    setShowCategorySubmenu(false);
                    clearCategorySelections();
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
                    <Text style={styles.actionMenuItemText}>🏷️ 设置分类 ›</Text>
                    
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
                
                {/* 非tobecleaned分类：暂存 */}
                {normalizedCategory !== 'tobecleaned' && (
                  <TouchableOpacity
                    style={styles.actionMenuItem}
                    onPress={() => {
                      setShowActionMenu(false);
                      setShowCategorySubmenu(false);
                      handleBatchDelete();
                    }}>
                    <Text style={styles.actionMenuItemText}>📌 暂存</Text>
                  </TouchableOpacity>
                )}
                
                {/* tobecleaned分类：删除 + 复制 */}
                {normalizedCategory === 'tobecleaned' && (
                  <>
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
                    
                    <TouchableOpacity
                      style={styles.actionMenuItem}
                      onPress={() => {
                        setShowActionMenu(false);
                        setShowCategorySubmenu(false);
                        handleCopyToClipboard();
                      }}>
                      <Text style={styles.actionMenuItemText}>📋 复制到剪贴板</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
          </View>
        )}
      </View>
    );
  }, [city, category, similarityGroupId, onBack, currentPage, pageInput, totalPages, itemsPerPage, showDropdown, dropdownOptions, selectAll, selectedImages.length, handleCopyToClipboard, showActionMenu, showCategorySubmenu, handleBatchChangeCategory, handleBatchDelete, clearCategorySelections, toggleSelectAll, selectionVersion]);

  // 懒加载图片容器组件
  const LazyImageContainer = React.memo(({ item, index, total, getIsSelected, onPress, onLongPress, onRightPress, highlightedId, setRef }) => {
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
    
    logger.debug(`LazyImageContainer渲染: ${item.id}, selected: ${selected}, index: ${index}, total: ${total}`);
    
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
          onPress={onPress}
          onLongPress={onLongPress}
          onRightPress={handleRightPress}
          isVisible={isVisible}
        />
      </View>
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
          />
        ))}
      </ScrollView>
    );
  }, [paginationData.currentPageImages, getIsSelected, handleImagePress, handleImageLongPress, handleImageRightPress]);

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
            {similarityGroupId 
              ? '该相似组暂无图片' 
              : city 
                ? `${city} 暂无图片` 
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
  }, [groupedImages, getIsSelected, handleImagePress, handleImageLongPress, handleImageRightPress, city, handleTimelineHeaderPress]);

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
        category,
        city
      });
    }
  }, [paginationData.totalPages, itemsPerPage, onPageChange, category, city]);

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
        category,
        city
      });
    }
  }, [onPageChange, allImages?.length, category, city]);

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
        {similarityGroupId 
          ? '该相似组暂无图片' 
          : city 
            ? `${city} 暂无图片` 
            : '该分类暂无图片'
        }
      </Text>
      </View>
    );


  logger.debug('CategoryScreen 开始渲染，category:', category, 'city:', city, 'allImages.length:', allImages.length);
  
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
    </View>
  );
};

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
});

export default CategoryScreen;