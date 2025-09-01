import React, { useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ImageStorageService from '../services/ImageStorageService';

// 获取分类显示名称的辅助函数
const getCategoryDisplayName = (categoryId) => {
  const categoryMap = {
    wechat: '微信截图',
    meeting: '会议场景',
    document: '工作写真',
    people: '社交活动',
    life: '生活记录',
    game: '游戏截屏',
    food: '美食记录',
    travel: '旅行风景',
    pet: '宠物萌照',
    other: '其他图片',
  };
  
  return categoryMap[categoryId] || categoryId;
};

// 简化的图片项组件
const ImageItem = ({ item, isSelected, onPress, onLongPress }) => {
  return (
    <TouchableOpacity
      style={[styles.imageContainer, isSelected && styles.selectedImage]}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.8}>
      
      {/* 显示图片 */}
      {item.uri ? (
        <Image
          source={{ uri: item.uri }}
          style={styles.image}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.placeholderText}>📷</Text>
          <Text style={styles.placeholderFileName} numberOfLines={1}>
            {item.fileName || '图片'}
          </Text>
        </View>
      )}
      
      {/* 选择指示器 */}
      {isSelected && (
        <View style={styles.selectionIndicator}>
          <Text style={styles.selectionText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const CategoryScreen = ({ route, navigation }) => {
  const { category } = route.params;
  
  // 基础状态
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImages, setSelectedImages] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectAll, setSelectAll] = useState(false);
  
  // 删除进度状态
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 0 });
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMoreImages, setHasMoreImages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // 设置足够大的首次加载数量，确保铺满屏幕
  const ITEMS_PER_PAGE = 24; // 大幅增加首次显示数量，确保铺满屏幕

  // 只在分类变化时加载图片
  useEffect(() => {
    loadCategoryImages();
  }, [category]);

  // 当屏幕获得焦点时刷新数据，确保从其他页面返回时数据是最新的
  useFocusEffect(
    React.useCallback(() => {
      console.log('CategoryScreen 获得焦点，刷新分类数据...');
      // 延迟刷新，避免频繁更新
      const timeoutId = setTimeout(() => {
        loadCategoryImages();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }, [category])
  );

  const loadCategoryImages = async () => {
    try {
      setLoading(true);
      const categoryImages = await ImageStorageService.getImagesByCategory(category);
      setImages(categoryImages);
      setCurrentPage(0);
      setHasMoreImages(categoryImages.length > ITEMS_PER_PAGE);
    } catch (error) {
      console.error('加载分类图片失败:', error);
      Alert.alert('错误', '加载图片失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  // 按日期分组图片
  const getGroupedImages = () => {
    const grouped = {};
    
    images.forEach(image => {
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
  };

  // 获取当前显示的图片（时间轴布局显示所有图片）
  const getDisplayedImages = () => {
    // 由于使用时间轴布局，显示所有图片，不再分页
    return images;
  };

  // 自动加载更多图片
  const loadMoreImages = async () => {
    if (!hasMoreImages || isLoadingMore) return;
    
    setIsLoadingMore(true);
    
    // 模拟网络延迟，让用户感知到加载过程
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const nextPage = currentPage + 1;
    const endIndex = (nextPage + 1) * ITEMS_PER_PAGE;
    
    if (endIndex <= images.length) {
      setCurrentPage(nextPage);
      setHasMoreImages(endIndex < images.length);
    } else {
      setHasMoreImages(false);
    }
    
    setIsLoadingMore(false);
  };

  // 图片点击处理
  const handleImagePress = (image) => {
    if (selectionMode) {
      toggleImageSelection(image.id);
    } else {
      navigation.navigate('ImagePreview', { image });
    }
  };

  // 图片长按处理
  const handleImageLongPress = (image) => {
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedImages([image.id]);
      setSelectAll(false);
    }
  };

  // 切换图片选择状态
  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      const newSelected = prev.includes(imageId) 
        ? prev.filter(id => id !== imageId)
        : [...prev, imageId];
      
      // 更新全选状态
      const displayedImages = getDisplayedImages();
      setSelectAll(newSelected.length === displayedImages.length);
      
      return newSelected;
    });
  };

  // 退出选择模式
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedImages([]);
    setSelectAll(false);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedImages([]);
      setSelectAll(false);
    } else {
      const displayedImages = getDisplayedImages();
      const allImageIds = displayedImages.map(img => img.id);
      setSelectedImages(allImageIds);
      setSelectAll(true);
    }
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedImages.length === 0) return;

    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${selectedImages.length} 张图片吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: selectedImages.length });
              
              await ImageStorageService.deleteImages(
                selectedImages,
                (progress) => {
                  setDeleteProgress(progress);
                }
              );
              
              await loadCategoryImages();
              exitSelectionMode();
              
              setTimeout(() => {
                setShowDeleteProgress(false);
              }, 1000);
              
            } catch (error) {
              setShowDeleteProgress(false);
              Alert.alert('操作失败', '删除过程中出现错误，请重试');
            }
          },
        },
      ]
    );
  };

  // 渲染头部
  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}>
        <Text style={styles.backIcon}>←</Text>
      </TouchableOpacity>
      
      <Text style={styles.title}>
        {getCategoryDisplayName(category)} ({images.length}张)
      </Text>
      
      <TouchableOpacity
        style={[styles.headerButton, selectionMode && styles.headerButtonActive]}
        onPress={() => {
          if (selectionMode) {
            exitSelectionMode();
          } else {
            setSelectionMode(true);
          }
        }}>
        <Text style={[styles.headerButtonText, selectionMode && styles.headerButtonTextActive]}>
          {selectionMode ? '取消' : '选择'}
        </Text>
      </TouchableOpacity>
    </View>
  );

  // 渲染选择工具栏
  const renderSelectionToolbar = () => {
    if (!selectionMode) return null;

    const displayedImages = getDisplayedImages();

    return (
      <View style={styles.selectionToolbar}>
        <View style={styles.toolbarLeft}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.selectAllButton]}
            onPress={toggleSelectAll}>
            <Text style={[styles.toolbarButtonText, styles.selectAllButtonText]}>
              {selectAll ? '取消全选' : '全选'}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.toolbarCenter}>
          <Text style={styles.selectionCount}>
            已选择 {selectedImages.length} / {displayedImages.length} 张
          </Text>
        </View>
        
        <View style={styles.toolbarActions}>
          <TouchableOpacity
            style={[styles.toolbarButton, styles.deleteButton]}
            onPress={handleBatchDelete}>
            <Text style={[styles.toolbarButtonText, styles.deleteButtonText]}>
              删除
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // 渲染时间轴布局
  const renderTimeline = () => {
    const { grouped, sortedDates } = getGroupedImages();
    
    if (sortedDates.length === 0) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📷</Text>
          <Text style={styles.emptyTitle}>暂无图片</Text>
          <Text style={styles.emptySubtitle}>
            该分类下还没有图片
          </Text>
        </View>
      );
    }

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.timelineContainer}
        showsVerticalScrollIndicator={false}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const paddingToBottom = 20; // 距离底部20px时开始加载
          
          // 当滚动到接近底部时，自动加载更多图片
          if (contentOffset.y + layoutMeasurement.height >= contentSize.height - paddingToBottom) {
            loadMoreImages();
          }
        }}
        scrollEventThrottle={16} // 16ms触发一次，约60fps
        >
        
        {sortedDates.map((dateKey) => {
          const imagesForDate = grouped[dateKey];
          const date = new Date(dateKey);
          
          // 自定义中文日期格式化，确保在模拟器中也能正确显示
          const year = date.getFullYear();
          const month = date.getMonth() + 1;
          const day = date.getDate();
          const weekday = date.getDay();
          
          const monthNames = ['一月', '二月', '三月', '四月', '五月', '六月', 
                             '七月', '八月', '九月', '十月', '十一月', '十二月'];
          const weekdayNames = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
          
          const formattedDate = `${year}年${month}月${day}日 ${weekdayNames[weekday]}`;
          
          return (
            <View key={dateKey} style={styles.timelineGroup}>
              {/* 日期标题 */}
              <View style={styles.dateHeader}>
                <View style={styles.dateLine} />
                <Text style={styles.dateText}>{formattedDate}</Text>
                <View style={styles.dateLine} />
              </View>
              
              {/* 该日期的图片网格 */}
              <View style={styles.imageGridContainer}>
                {imagesForDate.map((item) => (
                  <View key={item.id} style={styles.imageWrapper}>
                    <ImageItem
                      item={item}
                      isSelected={selectedImages.includes(item.id)}
                      onPress={handleImagePress}
                      onLongPress={handleImageLongPress}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })}
        
        {/* 底部加载指示器 */}
        {hasMoreImages && (
          <View style={styles.loadingMoreContainer}>
            <ActivityIndicator size="small" color="#2196F3" />
            <Text style={styles.loadingMoreText}>加载中...</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  // 渲染图片网格（保留原有功能，现在使用时间轴布局）
  const renderImageGrid = () => {
    return renderTimeline();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      {renderSelectionToolbar()}
      {renderImageGrid()}

      {/* 批量删除进度对话框 */}
      <Modal
        visible={showDeleteProgress}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteProgress(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>删除中...</Text>
            <Text style={styles.modalMessage}>
              已删除: {deleteProgress.filesDeleted} 张
              失败: {deleteProgress.filesFailed} 张
              总计: {deleteProgress.total} 张
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
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
  },
     imageGrid: {
     padding: 8,
   },
   timelineContainer: {
     padding: 8,
   },
   timelineGroup: {
     marginBottom: 24,
   },
   dateHeader: {
     flexDirection: 'row',
     alignItems: 'center',
     marginBottom: 16,
     paddingHorizontal: 8,
   },
   dateLine: {
     flex: 1,
     height: 1,
     backgroundColor: '#e0e0e0',
   },
   dateText: {
     fontSize: 16,
     fontWeight: '600',
     color: '#333',
     marginHorizontal: 16,
     textAlign: 'center',
   },
   imageGridContainer: {
     flexDirection: 'row',
     flexWrap: 'wrap',
     justifyContent: 'flex-start',
   },
  imageWrapper: {
    width: '33.33%',
    aspectRatio: 1,
    padding: 4,
  },
  imageContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  selectedImage: {
    opacity: 0.7,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 40,
    color: '#888',
  },
  placeholderFileName: {
    marginTop: 8,
    fontSize: 12,
    color: '#666',
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    width: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  modalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalIndicator: {
    marginTop: 10,
  },
     loadingMoreContainer: {
     padding: 20,
     alignItems: 'center',
     flexDirection: 'row',
   },
   loadingMoreText: {
     marginLeft: 10,
     fontSize: 14,
     color: '#666',
   },
});

export default CategoryScreen;

