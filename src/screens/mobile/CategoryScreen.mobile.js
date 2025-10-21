/**
 * 芯图相册 - 移动端分类详情页（通用）
 * 
 * 支持4种形态：
 * 1. 普通分类页 (category参数)
 * 2. 暂存箱页 (category='tobecleaned')
 * 3. 城市分类页 (city参数)
 * 4. 相似组详情页 (similarityGroupId参数)
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from '../../adapters/WebAdapters';
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
  const [selectedImages, setSelectedImages] = useState(new Set());
  
  // 分页
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  const ITEMS_PER_PAGE = 50;

  // ==================== 页面类型判断 ====================
  const pageType = category ? 'category' : city ? 'city' : similarityGroupId ? 'similarity' : null;
  const isStaging = category === 'tobecleaned';

  /**
   * 获取页面标题
   */
  const getPageTitle = () => {
    if (isStaging) return '📦 暂存箱';
    if (category) {
      const categoryConfig = configService.getAllCategoriesWithUI().find(c => c.id === category);
      return categoryConfig?.chinese || category;
    }
    if (city) return `🏙️ ${city}`;
    if (similarityGroupId) return `🔍 相似组 ${similarityGroupId}`;
    return '图片列表';
  };

  /**
   * 获取操作按钮配置
   */
  const getActionButtons = () => {
    if (isStaging) {
      return [
        { id: 'remove', label: '移出暂存箱', icon: '🔙', color: '#007AFF' },
        { id: 'delete', label: '永久删除', icon: '🗑️', color: '#FF3B30' },
        { id: 'export', label: '导出', icon: '📤', color: '#34C759' },
      ];
    }
    
    if (similarityGroupId) {
      return [
        { id: 'keep', label: '保留选中', icon: '✅', color: '#34C759' },
        { id: 'deleteOthers', label: '删除其他', icon: '🗑️', color: '#FF9500' },
        { id: 'deleteAll', label: '全部删除', icon: '🗑️', color: '#FF3B30' },
      ];
    }
    
    return [
      { id: 'staging', label: '放入暂存箱', icon: '📦', color: '#FF9500' },
      { id: 'delete', label: '删除', icon: '🗑️', color: '#FF3B30' },
      { id: 'export', label: '导出', icon: '📤', color: '#34C759' },
    ];
  };

  // ==================== 数据加载 ====================

  useEffect(() => {
    loadImages();
  }, [category, city, similarityGroupId]);

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

      const cache = GlobalImageCache.getCache();
      let allImages = cache.allImages || [];

      // 根据页面类型过滤图片
      let filteredImages = [];
      if (category) {
        filteredImages = allImages.filter(img => img.category === category);
      } else if (city) {
        filteredImages = allImages.filter(img => img.city === city);
      } else if (similarityGroupId) {
        // TODO: 从相似组获取图片
        filteredImages = [];
      }

      // 按时间倒序排序
      filteredImages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      setImages(filteredImages);
      setHasMore(filteredImages.length > ITEMS_PER_PAGE);
      
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
  }, [category, city, similarityGroupId]);

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
      const newSelected = new Set();
      newSelected.add(image.id);
      setSelectedImages(newSelected);
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
      const newSelected = new Set(selectedImages);
      if (newSelected.has(image.id)) {
        newSelected.delete(image.id);
    } else {
        newSelected.add(image.id);
      }
      setSelectedImages(newSelected);
      
      // 如果没有选中任何图片，退出选择模式
      if (newSelected.size === 0) {
        setSelectionMode(false);
      }
    }
  };

  /**
   * 全选/取消全选
   */
  const toggleSelectAll = () => {
    if (selectedImages.size === images.length) {
      setSelectedImages(new Set());
      setSelectionMode(false);
    } else {
      const allIds = new Set(images.map(img => img.id));
      setSelectedImages(allIds);
    }
  };

  /**
   * 取消选择模式
   */
  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedImages(new Set());
  };

  // ==================== 批量操作 ====================

  /**
   * 执行批量操作
   */
  const handleBatchAction = async (actionId) => {
    try {
      const selectedIds = Array.from(selectedImages);
      
      if (selectedIds.length === 0) {
        Alert.alert('提示', '请先选择图片');
        return;
      }

      switch (actionId) {
        case 'staging':
          await batchMoveToStaging(selectedIds);
          break;
        case 'remove':
          await batchRemoveFromStaging(selectedIds);
          break;
        case 'delete':
          await batchDelete(selectedIds);
          break;
        case 'deleteOthers':
          await batchDeleteOthers(selectedIds);
          break;
        case 'deleteAll':
          await batchDeleteAll();
          break;
        case 'keep':
          await batchKeep(selectedIds);
          break;
        case 'export':
          Alert.alert('提示', '导出功能开发中');
          break;
      }

      // 操作完成后退出选择模式并刷新
      cancelSelection();
      await onRefresh();

    } catch (error) {
      logger.error('❌ 批量操作失败:', error);
      Alert.alert('操作失败', error.message);
    }
  };

  /**
   * 批量放入暂存箱
   */
  const batchMoveToStaging = async (imageIds) => {
    Alert.alert(
      '放入暂存箱',
      `确定要将选中的 ${imageIds.length} 张图片放入暂存箱吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            for (const id of imageIds) {
              await UnifiedDataService.updateImageCategory(id, 'tobecleaned');
            }
            Alert.alert('成功', `已将 ${imageIds.length} 张图片放入暂存箱`);
          },
        },
      ]
    );
  };

  /**
   * 批量移出暂存箱
   */
  const batchRemoveFromStaging = async (imageIds) => {
    Alert.alert(
      '移出暂存箱',
      `确定要将选中的 ${imageIds.length} 张图片移出暂存箱吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            // TODO: 需要重新分类，暂时移动到'other'
            for (const id of imageIds) {
              await UnifiedDataService.updateImageCategory(id, 'other');
            }
            Alert.alert('成功', `已将 ${imageIds.length} 张图片移出暂存箱`);
          },
        },
      ]
    );
  };

  /**
   * 批量删除
   */
  const batchDelete = async (imageIds) => {
    Alert.alert(
      '确认删除',
      `确定要删除选中的 ${imageIds.length} 张图片吗？${isStaging ? '\n\n⚠️ 这将永久删除文件！' : ''}`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            let successCount = 0;
            for (const id of imageIds) {
              try {
                await UnifiedDataService.deleteImage(id);
                successCount++;
              } catch (error) {
                logger.error(`❌ 删除图片失败: ${id}`, error);
              }
            }
            Alert.alert('删除完成', `成功删除 ${successCount}/${imageIds.length} 张图片`);
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
    const isSelected = selectedImages.has(item.id);
    
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
    
    return (
      <View style={styles.selectionBar}>
        <TouchableOpacity onPress={cancelSelection}>
          <Text style={styles.selectionCancel}>取消</Text>
        </TouchableOpacity>
        <Text style={styles.selectionCount}>
          已选 {selectedImages.size}/{images.length}
      </Text>
        <TouchableOpacity onPress={toggleSelectAll}>
          <Text style={styles.selectionAll}>
            {selectedImages.size === images.length ? '取消全选' : '全选'}
        </Text>
      </TouchableOpacity>
    </View>
  );
  };

  /**
   * 渲染底部操作栏
   */
  const renderBottomBar = () => {
    if (!selectionMode || selectedImages.size === 0) return null;
    
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

      {/* 图片网格 */}
      <FlatList
        data={images.slice(0, page * ITEMS_PER_PAGE)}
        renderItem={renderImageItem}
        keyExtractor={(item) => item.id}
        numColumns={GRID_COLUMNS}
        contentContainerStyle={styles.gridContainer}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={renderFooter}
        ListEmptyComponent={renderEmpty}
      />

      {/* 底部操作栏 */}
      {renderBottomBar()}
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
});

export default CategoryScreen;
