import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect, getWebAccessibleUri } from '../../adapters/WebAdapters';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Modal, Platform, TextInput, ScrollView } from 'react-native';
// 分页方案实现
import { SafeAreaView, Alert, createFixedStyle } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';

// 使用统一数据服务


// Simplified image item component
const ImageItem = ({ item, isSelected, onPress, onLongPress, onRightPress, isVisible = true }) => {
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
    console.log(`🖼️ 图片加载状态: ${item.id}, shouldLoad: ${shouldLoad}, webUri: ${webUri}, imageError: ${imageError}`);
    console.log(`🖼️ 原始数据: item.uri=${item.uri}, displayItem.uri=${displayItem?.uri}`);
    console.log(`🖼️ 分类信息: item.category=${item.category}, displayItem.category=${displayItem?.category}`);
    if (!webUri) {
      console.log(`⚠️ 图片缺少URI: ${item.id}, 将显示占位符`);
    }
  }
  
  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };
  
  const handleImageError = (error) => {
    console.log('Image load error for:', item.fileName, error.nativeEvent?.error);
    setImageError(true);
    setImageLoading(false);
  };

  // 右键点击处理 - 阻止默认右键菜单
  const handleContextMenu = (event) => {
    event.preventDefault(); // 阻止默认的右键菜单
  };
  
  return (
    <TouchableOpacity
      style={[
        styles.imageItem, 
        isSelected && styles.selectedImage,
        isHovered && styles.imageHovered
      ]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      onContextMenu={handleContextMenu}
      onMouseDown={(event) => {
        if (event.button === 2) { // 右键点击
          console.log(`🖱️ 鼠标右键按下: ${item.id}`);
          event.preventDefault(); // 阻止默认右键菜单
          if (onRightPress) {
            console.log(`🖱️ 调用onRightPress: ${item.id}`);
            onRightPress(item);
          } else {
            console.log(`⚠️ onRightPress未定义: ${item.id}`);
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
};

const CategoryScreen = ({ 
  category: propCategory, 
  city: propCity, 
  onBack, 
  forceRefresh = true, 
  scrollToImageId = null,
  route = null, // 添加 route 参数，默认为 null
  navigation = null, // 添加 navigation 参数，默认为 null
  initialPage = 1, // 初始页面，默认为第1页
  itemsPerPage: propItemsPerPage = 50, // 每页数量，默认为50
  onPageChange = null // 页面变化回调函数
}) => {
  console.log(`🔄 CategoryScreen 组件渲染开始`);
  // 优先使用 prop 中的 category，然后是 route.params.category
  const category = propCategory || route?.params?.category;
  // 优先使用 prop 中的 city，然后是 route.params.city
  const city = propCity || route?.params?.city;
  
  // 调试日志（暂时禁用以减少渲染）
  // console.log('🔍 CategoryScreen 接收到的参数:', { propCategory, city: propCity, category, city, forceRefresh });
  
  // 从统一数据服务获取数据
  const [allImages, setAllImages] = useState([]);
  
  // 加载图片数据的函数
  const loadImages = useCallback(async () => {
    try {
      let images;
    if (city) {
        images = await UnifiedDataService.readImagesByLocation(city, null);
    } else {
        images = await UnifiedDataService.readImagesByCategory(category);
      }
      
      // 同时加载选中状态
      const selectedImages = await UnifiedDataService.getSelectedImages();
      const selectedImageIds = selectedImages.map(img => img.id);
      
      console.log(`📊 从统一数据服务获取图片: 总数=${images.length}, category=${category}, city=${city}`);
      console.log(`📊 选中状态: ${selectedImageIds.length} 张图片被选中`);
      
      setAllImages(images);
      setSelectedImages(selectedImageIds);
    } catch (error) {
      console.error('❌ 获取图片数据失败:', error);
      setAllImages([]);
      setSelectedImages([]);
    }
  }, [category, city]);

  // 初始加载图片数据
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // 页面重新挂载时重新加载数据（通过页面切换实现）
  // 不再监听缓存变化，每次挂载都重新建立快照

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
      // 清除当前分类的所有选中状态
      UnifiedDataService.clearCategorySelection(category);
    } else {
      // 否则全选当前页面的所有图片
      const allImageIds = allImages.map(img => img.id);
      setSelectedImages(allImageIds);
      // 批量设置选中状态
      allImages.forEach(img => {
        UnifiedDataService.setImageSelection(img.id, true);
      });
    }
  }, [selectedImages.length, allImages, category]);
  
  console.log(`🔄 CategoryScreen 状态: selectedImages=${selectedImages.length}, getIsSelected函数引用=${getIsSelected}`);
  console.log(`🔄 CategoryScreen 渲染完成，准备渲染子组件`);
  
  // 删除进度状态
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 0 });
  
  // 分页相关状态
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(propItemsPerPage);
  const [totalPages, setTotalPages] = useState(0);
  const [pageInput, setPageInput] = useState('');
  
  // 下拉选择框状态
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownOptions = [20, 50, 100, 1000];
  
  // 视图模式状态
  const [viewMode, setViewMode] = useState('timeline'); // 'grid' or 'timeline'
  
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
    
    // 直接计算当前页面的图片，避免使用paginationData
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allImages.length);
    const currentPageImages = allImages.slice(startIndex, endIndex);
    
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
  
  // Refs
  const scrollViewRef = useRef(null);
  
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
    
    console.log(`🎯 滚动到图片 ${imageId}，索引: ${imageIndex}，目标页码: ${targetPage}，当前页码: ${currentPageValue}`);
    
    // 如果目标页码不是当前页码，直接跳转到目标页码
    if (targetPage !== currentPageValue) {
      console.log(`📄 直接跳转到第${targetPage}页以显示图片`);
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
      console.log(`📄 已在正确页码，图片应该可见`);
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
    console.log(`🔄 paginationData useMemo 执行，allImages.length=${allImages?.length}, currentPage=${currentPage}, itemsPerPage=${itemsPerPage}`);
    const safeImages = allImages || [];
    const total = safeImages.length;
    const totalPagesCount = Math.ceil(total / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, total);
    const currentPageImages = safeImages.slice(startIndex, endIndex);
    
    console.log(`📄 分页数据: 第${currentPage}页/${totalPagesCount}页, 显示${currentPageImages.length}张图片 (${startIndex}-${endIndex-1})`);
    
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
  useEffect(() => {
    if (initialPage !== currentPage) {
      console.log(`📄 初始页面参数变化: ${initialPage}`);
      setCurrentPage(initialPage);
    }
  }, [initialPage]); // 只依赖initialPage，不依赖currentPage

  useEffect(() => {
    if (propItemsPerPage !== itemsPerPage) {
      console.log(`📄 每页数量参数变化: ${propItemsPerPage}`);
      setItemsPerPage(propItemsPerPage);
    }
  }, [propItemsPerPage]); // 只依赖propItemsPerPage，不依赖itemsPerPage

 

  // Image click handler - 简化：只传递图片ID字符串
  const handleImagePress = useCallback((image) => {
    console.log(`🔄 点击图片，ID: ${image.id}`);
    // 直接跳转到图片预览页面，只传递图片ID字符串
    if (navigation?.onImagePress) {
      navigation.onImagePress(image.id);
    }
  }, [navigation]);

  // Image long press handler
  const handleImageLongPress = useCallback((image) => {
    console.log(`🔄 handleImageLongPress 函数被调用`);
    // 长按直接选中图片，不清除其他选中状态
    UnifiedDataService.setImageSelection(image.id, true);
  }, []);


  // Clear current category selections (只清除当前分类的选中状态)
  const clearCategorySelections = useCallback(() => {
    // 清除全局状态 - 清除当前分类的所有选中状态
    UnifiedDataService.clearCategorySelection(category);
    // 清除本地状态
    setSelectedImages([]);
    setSelectAll(false);
    
    console.log(`🧹 清除选中状态: category=${category}, 本地状态已清空`);
  }, [category]);


  // Image right click handler
  const handleImageRightPress = useCallback((image) => {
    console.log(`🖱️ 处理右键点击: ${image.id}`);
    // 右键点击直接切换图片的选中状态
    toggleImageSelection(image.id);
  }, [toggleImageSelection]);

  // Batch delete
  const handleBatchDelete = useCallback(() => {
    // 使用UnifiedDataService获取标准化的分类ID
    const normalizedCategory = category ? UnifiedDataService.getCategoryId(category) : null;
    
    // 使用UnifiedDataService获取当前分类中选中的图片数量
    const selectedCountsByCategory = UnifiedDataService.getSelectedCountsByCategory();
    const selectedCount = normalizedCategory 
      ? (selectedCountsByCategory[normalizedCategory] || 0)
      : (city ? UnifiedDataService.getSelectedCountsByCity()[city] || 0 : 0);
    
    if (selectedCount === 0) return;

    // 获取当前分类中选中的图片用于删除
    const currentCategorySelectedImages = normalizedCategory 
      ? UnifiedDataService.getSelectedImagesByCategory(normalizedCategory)
      : (city ? UnifiedDataService.getSelectedImagesByCity(city) : []);

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedCount} 张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复！`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: selectedCount });
              
              const selectedImageIds = currentCategorySelectedImages.map(img => img.id);
              await UnifiedDataService.writeDeleteImages(
                selectedImageIds,
                (progress) => {
                  setDeleteProgress(progress);
                }
              );
              
              // 清除选中状态
              clearCategorySelections();
              
              // 重新加载图片数据
              await loadImages();
              
              // 立即关闭删除进度对话框
              setShowDeleteProgress(false);
              
            } catch (error) {
              setShowDeleteProgress(false);
              Alert.alert('Operation Failed', 'Error occurred during deletion, please try again');
            }
          },
        },
      ]
    );
  }, [category, city]);

  // Header 组件 - 可以重新渲染
  const HeaderComponent = useCallback(() => {
    console.log('🔍 调试信息 - 原始category参数:', category);
    console.log('🔍 调试信息 - category类型:', typeof category);
    console.log('🔍 调试信息 - category是否为null:', category === null);
    console.log('🔍 调试信息 - category是否为undefined:', category === undefined);
    
    // 使用UnifiedDataService获取标准化的分类ID
    const normalizedCategory = category ? UnifiedDataService.getCategoryId(category) : null;
    
    console.log('🔍 调试信息 - normalizedCategory:', normalizedCategory);
    console.log('🔍 调试信息 - normalizedCategory类型:', typeof normalizedCategory);
    
    // 检查配置服务状态
    const configService = UnifiedDataService.configService;
    console.log('🔍 调试信息 - configService是否存在:', !!configService);
    console.log('🔍 调试信息 - configService是否已加载:', configService?.isConfigLoaded());
    
    if (configService?.isConfigLoaded()) {
      const categoryMap = configService.getCategoryNameMap();
      console.log('🔍 调试信息 - categoryMap:', categoryMap);
      console.log('🔍 调试信息 - categoryMap中的键:', Object.keys(categoryMap));
      console.log('🔍 调试信息 - 查找category在categoryMap中:', categoryMap[category]);
    }
    
    // 使用UnifiedDataService获取当前分类中选中的图片数量
    const selectedCountsByCategory = UnifiedDataService.getSelectedCountsByCategory();
    const currentSelectedCount = normalizedCategory 
      ? (selectedCountsByCategory[normalizedCategory] ?? 0)
      : (city ? (UnifiedDataService.getSelectedCountsByCity()[city] ?? 0) : 0);
    
    console.log(`🔄 HeaderComponent 渲染: category=${category}, normalizedCategory=${normalizedCategory}, city=${city}, currentSelectedCount=${currentSelectedCount}`);
    console.log(`🔍 选中统计详情:`, selectedCountsByCategory);
    console.log(`🔍 查找分类 "${normalizedCategory}" 的选中数量:`, selectedCountsByCategory[normalizedCategory]);
    console.log(`🔍 所有分类的选中数量:`, Object.entries(selectedCountsByCategory).map(([cat, count]) => `${cat}: ${count}`).join(', '));
    
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
        {city ? `${city} (${allImages.length}张)` : `${UnifiedDataService.getCategoryDisplayName(category)} (${allImages.length}张)`}
      </Text>
      
      {/* 视图模式切换 */}
      <View style={styles.viewModeContainer}>
      <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'grid' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('grid')}>
          <Text style={[styles.viewModeButtonText, viewMode === 'grid' && styles.viewModeButtonTextActive]}>
            网格
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.viewModeButton, viewMode === 'timeline' && styles.viewModeButtonActive]}
          onPress={() => setViewMode('timeline')}>
          <Text style={[styles.viewModeButtonText, viewMode === 'timeline' && styles.viewModeButtonTextActive]}>
            时间轴
        </Text>
      </TouchableOpacity>
    </View>
      
        {/* 分页控制 */}
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
        
        {/* 间距 */}
        <View style={styles.headerSpacer} />
        
        <TouchableOpacity
          style={[styles.headerButton, selectAll && styles.headerButtonActive]}
          onPress={toggleSelectAll}>
          <Text style={[styles.headerButtonText, selectAll && styles.headerButtonTextActive]}>
            全选
          </Text>
        </TouchableOpacity>
        
        {/* 删除按钮和取消选择按钮 - 只在有选中图片时显示 */}
        {currentSelectedCount > 0 && (
          <>
          <TouchableOpacity
              style={[styles.headerButton, styles.headerDeleteButton]}
            onPress={handleBatchDelete}>
              <Text style={[styles.headerButtonText, styles.headerDeleteButtonText]}>
                删除 ({currentSelectedCount})
            </Text>
          </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.headerButton, styles.headerCancelButton]}
              onPress={clearCategorySelections}>
              <Text style={[styles.headerButtonText, styles.headerCancelButtonText]}>
                取消选择
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }, [city, category, onBack, currentPage, pageInput, totalPages, itemsPerPage, showDropdown, dropdownOptions, selectAll, selectedImages.length, viewMode]);

  // 懒加载图片容器组件
  const LazyImageContainer = React.memo(({ item, index, total, getIsSelected, onPress, onLongPress, onRightPress }) => {
    const [selected, setSelected] = useState(false);
    const [isVisible, setIsVisible] = useState(false);
    
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
          console.log(`🔄 选中状态变化: ${item.id}, ${selected} -> ${event.detail.isSelected}`);
        }
      };
      
      // 监听自定义事件
      window.addEventListener('imageSelectionChanged', handleSelectionChange);
      
      return () => {
        window.removeEventListener('imageSelectionChanged', handleSelectionChange);
      };
    }, [item.id, selected]);
    
    console.log(`🔄 LazyImageContainer渲染: ${item.id}, selected: ${selected}, index: ${index}, total: ${total}`);
    
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
          item={item}
          isSelected={selected}
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
          marginTop: 60,
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

  // 时间轴渲染函数
  const renderTimeline = useCallback(() => {
    const { grouped, sortedDates } = groupedImages;
    
    if (sortedDates.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>暂无图片</Text>
          <Text style={styles.emptySubtitle}>
            {city ? `${city} 暂无图片` : '该分类暂无图片'}
          </Text>
        </View>
      );
    }
    
    return (
      <ScrollView
        style={{
          marginTop: 60,
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
              <View style={styles.timelineHeader}>
                <Text style={styles.timelineDate}>{formattedDate}</Text>
                <Text style={styles.timelineCount}>({imagesForDate.length} 张)</Text>
              </View>
              
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
                      />
                ))}
              </View>
                    </View>
                  );
                })}
      </ScrollView>
    );
  }, [groupedImages, getIsSelected, handleImagePress, handleImageLongPress, handleImageRightPress, city]);

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
    console.log(`📄 跳转到第${safePage}页`);
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
    console.log(`📄 每页数量改为: ${newItemsPerPage}`);
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
        {city ? `${city} 暂无图片` : '该分类暂无图片'}
      </Text>
      </View>
    );


  console.log('🏷️ CategoryScreen 开始渲染，category:', category, 'city:', city, 'allImages.length:', allImages.length);
  
  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header - 可以重新渲染 */}
      <View style={createFixedStyle(styles.fixedHeader)}>
        <HeaderComponent />
      </View>
      
      {/* 根据视图模式渲染不同内容 */}
      {allImages.length > 0 ? (
        viewMode === 'grid' ? (
          <ScrollViewComponent />
        ) : (
          renderTimeline()
        )
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
    top: 32, // 为自定义标题栏留出空间
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
  headerDeleteButton: {
    backgroundColor: '#FF3B30',
  },
  headerDeleteButtonText: {
    color: '#fff',
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
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
  timelineImages: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
 },
});

export default CategoryScreen;