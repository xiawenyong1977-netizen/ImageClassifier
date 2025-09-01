import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import ImageClassifierService from '../services/ImageClassifierService';
import ImageStorageService from '../services/ImageStorageService';
import GalleryScannerService from '../services/GalleryScannerService';

// 创建服务实例
const galleryScannerService = new GalleryScannerService();
import RecentImagesGrid from '../components/RecentImagesGrid';
import CategoryCard from '../components/CategoryCard';

const HomeScreen = ({ navigation }) => {
  const [recentImages, setRecentImages] = useState([]);
  const [categoryCounts, setCategoryCounts] = useState({});
  const [stats, setStats] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [categoryRecentImages, setCategoryRecentImages] = useState({});
  
  // 扫描进度相关状态
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({
    current: 0,
    total: 0,
    message: '',
    filesFound: 0,
    filesProcessed: 0,
    filesFailed: 0
  });
  const [hideEmptyCategories, setHideEmptyCategories] = useState(true); // 默认开启，隐藏无数据分类

  useEffect(() => {
    loadData();
    loadSettings();
    // 延迟执行自动扫描，避免阻塞主线程和触摸事件
    const timer = setTimeout(() => {
      autoScanGallery();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // 当屏幕获得焦点时刷新数据，确保从其他页面返回时数据是最新的
  useFocusEffect(
    React.useCallback(() => {
      console.log('HomeScreen 获得焦点，强制刷新数据...');
      // 强制刷新数据，确保分类统计是最新的
      const timeoutId = setTimeout(async () => {
        await loadData(true); // 强制刷新
        loadSettings(); // 同时刷新设置
        
        // 额外确保分类最近照片状态更新
        console.log('useFocusEffect 完成，当前分类最近照片状态:', categoryRecentImages);
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }, [])
  );

  const loadData = async (forceRefresh = false) => {
    try {
      const [images, counts, statsData] = await Promise.all([
        ImageStorageService.getRecentImages(12),
        ImageStorageService.getCategoryCounts(),
        ImageStorageService.getStats(),
      ]);
      
      // 获取每个分类的最近照片
      const categoryRecentImages = {};
      const categories = ['wechat', 'meeting', 'document', 'people', 'life', 'game', 'food', 'travel', 'pet', 'other'];
      
      console.log('开始获取分类最近照片...');
      for (const category of categories) {
        if (counts[category] > 0) {
          try {
            const recentImages = await ImageStorageService.getImagesByCategory(category, 1);
            if (recentImages.length > 0) {
              categoryRecentImages[category] = recentImages[0];
              console.log(`分类 ${category} 获取到最近照片:`, recentImages[0].fileName);
            }
          } catch (error) {
            console.error(`获取${category}分类最近照片失败:`, error);
          }
        }
      }
      console.log('分类最近照片获取完成:', Object.keys(categoryRecentImages));
      
      // 使用 requestAnimationFrame 确保UI更新不阻塞触摸事件
      requestAnimationFrame(() => {
        // 强制刷新时直接更新，确保数据同步
        if (forceRefresh) {
          setRecentImages(images);
          setCategoryCounts(counts);
          setStats(statsData);
          setCategoryRecentImages(categoryRecentImages);
        } else {
                  // 对于分类最近照片，总是更新以确保背景图是最新的
        console.log('更新分类最近照片状态:', categoryRecentImages);
        setCategoryRecentImages(categoryRecentImages);
          
          // 其他数据使用防抖机制
          setRecentImages(prev => {
            if (JSON.stringify(prev) !== JSON.stringify(images)) {
              return images;
            }
            return prev;
          });
          
          setCategoryCounts(counts);
          setStats(statsData);
        }
      });
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const savedSettings = await ImageStorageService.getSettings();
      if (savedSettings.hideEmptyCategories !== undefined) {
        setHideEmptyCategories(savedSettings.hideEmptyCategories);
      }
    } catch (error) {
      console.error('加载设置失败:', error);
    }
  };

  const autoScanGallery = async () => {
    try {
      setIsScanning(true);
      setScanProgress({
        current: 0,
        total: 0,
        message: '正在初始化扫描服务...',
        filesFound: 0,
        filesProcessed: 0,
        filesFailed: 0
      });

      // 初始化扫描服务
      await galleryScannerService.initialize();

      // 创建进度回调函数
      const onScanProgress = (progress) => {
        // 使用 requestAnimationFrame 确保UI更新不阻塞触摸事件
        requestAnimationFrame(() => {
          setScanProgress(progress);
        });
      };

      // 使用 Promise.resolve().then() 将扫描操作放到下一个事件循环
      Promise.resolve().then(async () => {
        try {
          // 开始扫描
          await galleryScannerService.autoScanGalleryWithProgress(onScanProgress);
          
          // 扫描完成后刷新数据
          await loadData(true); // 强制刷新
        } catch (error) {
          console.error('自动扫描相册失败:', error);
          setScanProgress(prev => ({
            ...prev,
            message: `扫描失败: ${error.message}`
          }));
        } finally {
          // 延迟关闭进度提示，让用户看到最终结果
          setTimeout(() => {
            setIsScanning(false);
            setScanProgress({
              current: 0,
              total: 0,
              message: '',
              filesFound: 0,
              filesProcessed: 0,
              filesFailed: 0
            });
          }, 2000);
        }
      });
      
    } catch (error) {
      console.error('自动扫描相册初始化失败:', error);
      setIsScanning(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // 使用 requestAnimationFrame 确保UI更新不阻塞触摸事件
    requestAnimationFrame(async () => {
      await loadData(true); // 强制刷新数据
      setRefreshing(false);
    });
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('Category', { category });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 标题和统计信息 */}
        <View style={styles.header}>
          <Text style={styles.title}>照片分类助手</Text>
          <View style={styles.statsInline}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.classified || 0}</Text>
              <Text style={styles.statLabel}>已分类</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.totalSize ? `${(stats.totalSize / 1024 / 1024).toFixed(1)}` : '0'}</Text>
              <Text style={styles.statLabel}>总大小(MB)</Text>
            </View>
          </View>
        </View>

        {/* 扫描进度提示区 - 始终显示 */}
        <View style={styles.scanProgressBanner}>
          <Text style={styles.scanProgressMessage} numberOfLines={1} ellipsizeMode="tail">
            {isScanning
              ? `${scanProgress.message} | 发现: ${scanProgress.filesFound} | 已处理: ${scanProgress.filesProcessed}`
              : '扫描服务就绪，等待新文件...'
            }
          </Text>

        </View>

        {/* 分类卡片 */}
        <View style={styles.categoriesSection}>
          <Text style={styles.sectionTitle}>按内容</Text>
          <View style={styles.categoriesContainer}>
            {/* 根据设置决定是否隐藏无数据分类 */}
            {(hideEmptyCategories ? categoryCounts.wechat > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'wechat',
                  name: '微信截图',
                  color: '#07C160',
                  count: categoryCounts.wechat || 0,
                  recentImage: categoryRecentImages.wechat
                }}
                onPress={() => handleCategoryPress('wechat')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.meeting > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'meeting',
                  name: '会议场景',
                  color: '#FF9800',
                  count: categoryCounts.meeting || 0,
                  recentImage: categoryRecentImages.meeting
                }}
                onPress={() => handleCategoryPress('meeting')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.document > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'document',
                  name: '工作写真',
                  color: '#2196F3',
                  count: categoryCounts.document || 0,
                  recentImage: categoryRecentImages.document
                }}
                onPress={() => handleCategoryPress('document')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.people > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'people',
                  name: '社交活动',
                  color: '#E91E63',
                  count: categoryCounts.people || 0,
                  recentImage: categoryRecentImages.people
                }}
                onPress={() => handleCategoryPress('people')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.life > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'life',
                  name: '生活记录',
                  color: '#4CAF50',
                  count: categoryCounts.life || 0,
                  recentImage: categoryRecentImages.life
                }}
                onPress={() => handleCategoryPress('life')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.game > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'game',
                  name: '游戏截屏',
                  color: '#FF5722',
                  count: categoryCounts.game || 0,
                  recentImage: categoryRecentImages.game
                }}
                onPress={() => handleCategoryPress('game')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.food > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'food',
                  name: '美食记录',
                  color: '#FF6B35',
                  count: categoryCounts.food || 0,
                  recentImage: categoryRecentImages.food
                }}
                onPress={() => handleCategoryPress('food')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.travel > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'travel',
                  name: '旅行风景',
                  color: '#9C27B0',
                  count: categoryCounts.travel || 0,
                  recentImage: categoryRecentImages.travel
                }}
                onPress={() => handleCategoryPress('travel')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.pet > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'pet',
                  name: '宠物萌照',
                  color: '#795548',
                  count: categoryCounts.pet || 0,
                  recentImage: categoryRecentImages.pet
                }}
                onPress={() => handleCategoryPress('pet')}
              />
            )}
            {(hideEmptyCategories ? categoryCounts.other > 0 : true) && (
              <CategoryCard
                category={{
                  id: 'other',
                  name: '其他图片',
                  color: '#607D8B',
                  count: categoryCounts.other || 0,
                  recentImage: categoryRecentImages.other
                }}
                onPress={() => handleCategoryPress('other')}
              />
            )}
          </View>
        </View>

        {/* 最近照片 */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>最近</Text>
          <RecentImagesGrid 
            images={recentImages} 
            onImagePress={(image) => {
              navigation.navigate('ImagePreview', { image });
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  statsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  statItem: {
    alignItems: 'center',
    marginLeft: 20,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  // 扫描进度提示区样式
  scanProgressBanner: {
    backgroundColor: '#f8f9fa',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 0,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanProgressMessage: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '400',
  },

  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginTop: 10,
    position: 'relative',
  },

  categoriesSection: {
    marginHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  recentSection: {
    marginHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
});

export default HomeScreen;

