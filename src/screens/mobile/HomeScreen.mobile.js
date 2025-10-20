/**
 * 芯图相册 - 移动端首页
 * 
 * 功能：
 * 1. 统计概览（总图片、暂存箱、今日新增、相似组）
 * 2. 按内容分类浏览（横向滚动）
 * 3. 相似图片分组（最多8组）
 * 4. 按城市分类（全部显示）
 * 5. 最近照片（3x4网格）
 * 6. FAB扫描按钮
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  RefreshControl,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import GlobalImageCache from '../../services/GlobalImageCache';
import configService from '../../services/ConfigService';
import GalleryScannerService from '../../services/GalleryScannerService';
import { logger } from '../../adapters/WebAdapters';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  // ==================== 状态管理 ====================
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // 统计数据
  const [stats, setStats] = useState({
    totalImages: 0,
    stagingBox: 0,
    todayAdded: 0,
    similarityGroups: 0,
  });
  
  // 分类数据
  const [categories, setCategories] = useState([]);
  
  // 城市数据
  const [cities, setCities] = useState([]);
  
  // 相似组数据
  const [similarityGroups, setSimilarityGroups] = useState([]);
  
  // 最近照片
  const [recentImages, setRecentImages] = useState([]);
  
  // 扫描状态
  const [isScanning, setIsScanning] = useState(false);

  // ==================== 初始化加载 ====================
  useEffect(() => {
    initializeData();
  }, []);

  /**
   * 初始化数据加载
   */
  const initializeData = async () => {
    try {
      setLoading(true);
      
      // 确保服务初始化
      await UnifiedDataService.initialize();
      await configService.initialize();
      
      // 加载所有数据
      await loadAllData();
      
    } catch (error) {
      logger.error('❌ 首页初始化失败:', error);
      Alert.alert('初始化失败', error.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * 加载所有数据（第一优先级：立即加载）
   */
  const loadAllData = async () => {
    try {
      // 并行加载核心数据
      await Promise.all([
        loadStatistics(),
        loadCategories(),
        loadRecentImages(),
      ]);
      
      // 延迟加载次要数据（第二优先级）
      setTimeout(() => {
        loadCities();
        loadSimilarityGroups();
      }, 100);
      
    } catch (error) {
      logger.error('❌ 加载数据失败:', error);
      throw error;
    }
  };

  /**
   * 加载统计数据
   */
  const loadStatistics = async () => {
    try {
      const cache = GlobalImageCache.getCache();
      const allImages = cache.allImages || [];
      
      const newStats = {
        totalImages: allImages.length,
        stagingBox: cache.categoryCounts['tobecleaned'] || 0,
        todayAdded: UnifiedDataService.getTodayAddedCount(),
        similarityGroups: UnifiedDataService.getSimilarityGroupsCount(),
      };
      
      setStats(newStats);
      logger.debug('📊 统计数据加载完成:', newStats);
      
    } catch (error) {
      logger.error('❌ 加载统计数据失败:', error);
    }
  };

  /**
   * 加载分类列表
   */
  const loadCategories = async () => {
    try {
      const cache = GlobalImageCache.getCache();
      const categoryCounts = cache.categoryCounts || {};
      
      // 获取所有分类配置
      const allCategories = configService.getAllCategoriesWithUI();
      
      // 构建分类列表（排除暂存箱）
      const categoryList = Object.keys(categoryCounts)
        .filter(catId => catId !== 'tobecleaned' && categoryCounts[catId] > 0)
        .map(catId => {
          const categoryConfig = allCategories.find(c => c.id === catId) || {};
          return {
            id: catId,
            name: categoryConfig.chinese || categoryConfig.english || catId,
            count: categoryCounts[catId],
            thumbnail: null, // 懒加载
          };
        })
        .sort((a, b) => b.count - a.count); // 按数量降序
      
      setCategories(categoryList);
      logger.debug(`📁 分类列表加载完成: ${categoryList.length}个分类`);
      
    } catch (error) {
      logger.error('❌ 加载分类列表失败:', error);
    }
  };

  /**
   * 加载城市列表
   */
  const loadCities = async () => {
    try {
      const cache = GlobalImageCache.getCache();
      const cityCounts = cache.cityCounts || {};
      
      // 构建城市列表并按数量降序排序
      const cityList = Object.keys(cityCounts)
        .map(cityName => ({
          name: cityName,
          count: cityCounts[cityName],
        }))
        .sort((a, b) => b.count - a.count);
      
      setCities(cityList);
      logger.debug(`🏙️ 城市列表加载完成: ${cityList.length}个城市`);
      
    } catch (error) {
      logger.error('❌ 加载城市列表失败:', error);
    }
  };

  /**
   * 加载相似组
   */
  const loadSimilarityGroups = async () => {
    try {
      const groups = UnifiedDataService.getSimilarityGroups(8);
      setSimilarityGroups(groups);
      logger.debug(`🔍 相似组加载完成: ${groups.length}组`);
      
    } catch (error) {
      logger.error('❌ 加载相似组失败:', error);
    }
  };

  /**
   * 加载最近照片
   */
  const loadRecentImages = async () => {
    try {
      const cache = GlobalImageCache.getCache();
      const recent = (cache.recentImages || []).slice(0, 12);
      
      setRecentImages(recent);
      logger.debug(`📸 最近照片加载完成: ${recent.length}张`);
      
    } catch (error) {
      logger.error('❌ 加载最近照片失败:', error);
    }
  };

  /**
   * 下拉刷新
   */
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // 重建缓存
      await GlobalImageCache.buildCache();
      // 重新加载数据
      await loadAllData();
    } catch (error) {
      logger.error('❌ 刷新失败:', error);
      Alert.alert('刷新失败', error.message);
    } finally {
      setRefreshing(false);
    }
  }, []);

  /**
   * 触发扫描
   */
  const handleScan = async () => {
    try {
      setIsScanning(true);
      
      const galleryScannerService = new GalleryScannerService();
      await galleryScannerService.scanGallery();
      
      // 扫描完成后刷新数据
      await onRefresh();
      
      Alert.alert('扫描完成', '相册扫描已完成');
    } catch (error) {
      logger.error('❌ 扫描失败:', error);
      Alert.alert('扫描失败', error.message);
    } finally {
      setIsScanning(false);
    }
  };

  // ==================== 渲染函数 ====================

  /**
   * 渲染统计卡片
   */
  const renderStatCard = (icon, title, value, color, badge, onPress) => (
    <TouchableOpacity
      style={[styles.statCard, { borderLeftColor: color }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.statCardContent}>
        <Text style={styles.statCardIcon}>{icon}</Text>
        <View style={styles.statCardInfo}>
          <Text style={styles.statCardValue}>{value}</Text>
          <Text style={styles.statCardTitle}>{title}</Text>
        </View>
        {badge && <View style={styles.badge} />}
      </View>
    </TouchableOpacity>
  );

  /**
   * 渲染统计概览区
   */
  const renderStatistics = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>📊 统计概览</Text>
      <View style={styles.statsGrid}>
        {renderStatCard('📸', '总图片', stats.totalImages, '#007AFF', false, null)}
        {renderStatCard('📦', '暂存箱', stats.stagingBox, '#FF9500', stats.stagingBox > 0, () => {
          navigation.navigate('StagingBox');
        })}
        {renderStatCard('✨', '今日新增', stats.todayAdded, '#34C759', false, null)}
        {renderStatCard('🔍', '相似组', stats.similarityGroups, '#AF52DE', false, () => {
          // 滚动到相似组区域
          // TODO: 实现滚动定位
        })}
      </View>
    </View>
  );

  /**
   * 渲染分类卡片
   */
  const renderCategoryCard = (category) => (
    <TouchableOpacity
      key={category.id}
      style={styles.categoryCard}
      onPress={() => {
        navigation.navigate('Category', {
          category: category.id,
          fromScreen: 'Home',
        });
      }}
    >
      <View style={styles.categoryThumbnail}>
        <Text style={styles.categoryPlaceholder}>📁</Text>
      </View>
      <Text style={styles.categoryName} numberOfLines={1}>{category.name}</Text>
      <Text style={styles.categoryCount}>{category.count}</Text>
    </TouchableOpacity>
  );

  /**
   * 渲染按内容分类区
   */
  const renderCategoriesSection = () => {
    if (categories.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📁 按内容分类</Text>
          <TouchableOpacity onPress={() => {
            // TODO: 展开所有分类
          }}>
            <Text style={styles.sectionMore}>全部 ›</Text>
          </TouchableOpacity>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          {categories.map(renderCategoryCard)}
        </ScrollView>
      </View>
    );
  };

  /**
   * 渲染相似组卡片
   */
  const renderSimilarityGroupCard = (group) => (
    <TouchableOpacity
      key={group.groupId}
      style={styles.similarityCard}
      onPress={() => {
        navigation.navigate('Category', {
          similarityGroupId: group.groupId,
          fromScreen: 'SimilarityGroup',
        });
      }}
    >
      <View style={styles.similarityHeader}>
        <Text style={styles.similarityTitle}>
          🔍 组{group.groupId} ({group.imageCount}张相似)
        </Text>
        <Text style={styles.similaritySimilarity}>{Math.round(group.similarity * 100)}%</Text>
      </View>
      <View style={styles.similarityThumbnails}>
        {group.images.slice(0, 3).map((img, idx) => (
          <Image
            key={idx}
            source={{ uri: img.uri }}
            style={styles.similarityThumbnail}
          />
        ))}
        {group.imageCount > 3 && (
          <View style={styles.similarityMore}>
            <Text style={styles.similarityMoreText}>+{group.imageCount - 3}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  /**
   * 渲染相似图片分组区
   */
  const renderSimilarityGroupsSection = () => {
    if (similarityGroups.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🔍 相似图片分组</Text>
          <TouchableOpacity onPress={() => {
            // TODO: 展开所有相似组
          }}>
            <Text style={styles.sectionMore}>全部 ›</Text>
          </TouchableOpacity>
        </View>
        {similarityGroups.map(renderSimilarityGroupCard)}
      </View>
    );
  };

  /**
   * 渲染城市列表项
   */
  const renderCityItem = (city) => (
    <TouchableOpacity
      key={city.name}
      style={styles.cityItem}
      onPress={() => {
        navigation.navigate('Category', {
          city: city.name,
          fromScreen: 'Home',
        });
      }}
    >
      <Text style={styles.cityArrow}>›</Text>
      <Text style={styles.cityName}>{city.name}</Text>
      <Text style={styles.cityCount}>({city.count})</Text>
    </TouchableOpacity>
  );

  /**
   * 渲染按城市分类区
   */
  const renderCitiesSection = () => {
    if (cities.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🏙️ 按城市分类</Text>
        </View>
        <View style={styles.citiesList}>
          {cities.map(renderCityItem)}
        </View>
      </View>
    );
  };

  /**
   * 渲染最近照片
   */
  const renderRecentPhotos = () => {
    if (recentImages.length === 0) return null;
    
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>📸 最近照片</Text>
          <TouchableOpacity onPress={() => {
            // TODO: 查看更多
          }}>
            <Text style={styles.sectionMore}>全部 ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.recentGrid}>
          {recentImages.map((image, index) => (
            <TouchableOpacity
              key={image.id || index}
              style={styles.recentGridItem}
              onPress={() => {
                navigation.navigate('ImagePreview', {
                  image: image,
                  allImages: recentImages,
                  currentIndex: index,
                  fromScreen: 'Home',
                });
              }}
            >
              <Image
                source={{ uri: image.uri }}
                style={styles.recentGridImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  /**
   * 渲染FAB扫描按钮
   */
  const renderFAB = () => (
    <TouchableOpacity
      style={styles.fab}
      onPress={handleScan}
      disabled={isScanning}
    >
      {isScanning ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={styles.fabIcon}>🔄</Text>
      )}
    </TouchableOpacity>
  );

  // ==================== 主渲染 ====================

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>加载中...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>芯图相册</Text>
      </View>

      {/* 主内容区 */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {renderStatistics()}
        {renderCategoriesSection()}
        {renderSimilarityGroupsSection()}
        {renderCitiesSection()}
        {renderRecentPhotos()}
      </ScrollView>

      {/* FAB扫描按钮 */}
      {renderFAB()}
    </SafeAreaView>
  );
};

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#8E8E93',
  },
  header: {
    height: 56,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // 为FAB留出空间
  },
  
  // 区块样式
  section: {
    backgroundColor: '#FFFFFF',
    marginTop: 12,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000000',
  },
  sectionMore: {
    fontSize: 14,
    color: '#007AFF',
  },
  
  // 统计卡片
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
  },
  statCard: {
    width: (SCREEN_WIDTH - 48) / 2, // 两列布局，减去padding和gap
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
  },
  statCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCardIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  statCardInfo: {
    flex: 1,
  },
  statCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000000',
  },
  statCardTitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  badge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
  },
  
  // 分类卡片
  categoriesScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  categoryCard: {
    width: 100,
    alignItems: 'center',
  },
  categoryThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryPlaceholder: {
    fontSize: 32,
  },
  categoryName: {
    fontSize: 14,
    color: '#000000',
    marginBottom: 4,
    textAlign: 'center',
  },
  categoryCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  
  // 相似组卡片
  similarityCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
  },
  similarityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  similarityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
  },
  similaritySimilarity: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#AF52DE',
  },
  similarityThumbnails: {
    flexDirection: 'row',
    gap: 8,
  },
  similarityThumbnail: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#E5E5EA',
  },
  similarityMore: {
    width: 60,
    height: 60,
    borderRadius: 4,
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  similarityMoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8E8E93',
  },
  
  // 城市列表
  citiesList: {
    paddingHorizontal: 16,
  },
  cityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F7',
  },
  cityArrow: {
    fontSize: 18,
    color: '#8E8E93',
    marginRight: 8,
  },
  cityName: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
  },
  cityCount: {
    fontSize: 14,
    color: '#8E8E93',
  },
  
  // 最近照片网格
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 4,
  },
  recentGridItem: {
    width: (SCREEN_WIDTH - 40) / 3, // 3列布局
    height: (SCREEN_WIDTH - 40) / 3,
  },
  recentGridImage: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  
  // FAB按钮
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 80, // 避开底部Tab栏
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabIcon: {
    fontSize: 24,
  },
});

export default HomeScreen;
