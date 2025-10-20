/**
 * 芯图相册 - 移动端图片预览页
 * 
 * 功能：
 * 1. 全屏显示图片
 * 2. 左右滑动切换
 * 3. 缩放和平移
 * 4. 显示图片信息
 * 5. 图片操作（删除、暂存、重新分类、分享）
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Dimensions,
  Alert,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import configService from '../../services/ConfigService';
import { logger } from '../../adapters/WebAdapters';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const ImagePreviewScreen = ({ route, navigation }) => {
  // ==================== 路由参数 ====================
  const {
    image: initialImage,
    allImages = [],
    currentIndex = 0,
    category,
    city,
    similarityGroupId,
    fromScreen,
  } = route.params || {};

  // ==================== 状态管理 ====================
  const [currentImageIndex, setCurrentImageIndex] = useState(currentIndex);
  const [showInfo, setShowInfo] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const scrollViewRef = useRef(null);

  const currentImage = allImages[currentImageIndex] || initialImage;

  // ==================== 工具函数 ====================

  /**
   * 格式化文件大小
   */
  const formatFileSize = (bytes) => {
    if (!bytes) return '未知';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${mb.toFixed(1)} MB`;
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString) => {
    if (!dateString) return '未知';
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN');
  };

  /**
   * 格式化位置
   */
  const formatLocation = (latitude, longitude) => {
    if (!latitude || !longitude) return null;
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  };

  /**
   * 获取分类显示名
   */
  const getCategoryDisplayName = (categoryId) => {
    const categoryConfig = configService.getAllCategoriesWithUI().find(c => c.id === categoryId);
    return categoryConfig?.chinese || categoryId;
  };

  // ==================== 导航操作 ====================

  /**
   * 上一张
   */
  const goToPrevious = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  /**
   * 下一张
   */
  const goToNext = () => {
    if (currentImageIndex < allImages.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  /**
   * 返回
   */
  const goBack = () => {
    navigation.goBack();
  };

  // ==================== 图片操作 ====================

  /**
   * 删除图片
   */
  const handleDelete = () => {
    Alert.alert(
      '确认删除',
      '确定要删除这张图片吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await UnifiedDataService.deleteImage(currentImage.id);
              Alert.alert('成功', '图片已删除', [
                { text: '确定', onPress: goBack },
              ]);
            } catch (error) {
              logger.error('❌ 删除图片失败:', error);
              Alert.alert('删除失败', error.message);
            }
          },
        },
      ]
    );
  };

  /**
   * 放入暂存箱
   */
  const handleStaging = () => {
    Alert.alert(
      '放入暂存箱',
      '确定要将这张图片放入暂存箱吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            try {
              await UnifiedDataService.updateImageCategory(currentImage.id, 'tobecleaned');
              Alert.alert('成功', '已放入暂存箱', [
                { text: '确定', onPress: goBack },
              ]);
            } catch (error) {
              logger.error('❌ 放入暂存箱失败:', error);
              Alert.alert('操作失败', error.message);
            }
          },
        },
      ]
    );
  };

  /**
   * 重新分类
   */
  const handleReclassify = () => {
    const categories = configService.getAllCategoriesWithUI();
    
    Alert.alert(
      '重新分类',
      '选择新的分类',
      [
        ...categories.slice(0, 5).map(cat => ({
          text: cat.chinese || cat.english,
          onPress: async () => {
            try {
              await UnifiedDataService.updateImageCategory(currentImage.id, cat.id);
              Alert.alert('成功', `已移动到 ${cat.chinese || cat.english}`);
    } catch (error) {
              logger.error('❌ 重新分类失败:', error);
              Alert.alert('操作失败', error.message);
            }
          },
        })),
        { text: '取消', style: 'cancel' },
      ]
    );
  };

  /**
   * 分享
   */
  const handleShare = () => {
    Alert.alert('提示', '分享功能开发中');
  };

  // ==================== 渲染函数 ====================

  /**
   * 渲染顶部导航栏
   */
  const renderHeader = () => (
      <View style={styles.header}>
      <TouchableOpacity onPress={goBack} style={styles.headerButton}>
        <Text style={styles.headerIcon}>‹</Text>
        </TouchableOpacity>
      <Text style={styles.headerTitle}>
        {currentImageIndex + 1} / {allImages.length || 1}
        </Text>
      <TouchableOpacity onPress={() => setShowInfo(!showInfo)} style={styles.headerButton}>
        <Text style={styles.headerIcon}>ℹ️</Text>
        </TouchableOpacity>
      </View>
  );

  /**
   * 渲染图片信息
   */
  const renderImageInfo = () => {
    if (!showInfo) return null;

    const imageInfo = [
      { label: '文件名', value: currentImage.fileName },
      { label: '大小', value: formatFileSize(currentImage.size) },
      { label: '尺寸', value: currentImage.imageDimensions ? 
        `${currentImage.imageDimensions.width}x${currentImage.imageDimensions.height}` : '未知' },
      { label: '分类', value: getCategoryDisplayName(currentImage.category) },
      { label: '拍摄时间', value: formatDate(currentImage.takenAt) },
      { label: '添加时间', value: formatDate(currentImage.createdAt) },
      { label: '城市', value: currentImage.city || '-' },
      { label: '位置', value: formatLocation(currentImage.latitude, currentImage.longitude) || '-' },
    ];

    return (
      <View style={styles.infoPanel}>
        <View style={styles.infoPanelHeader}>
          <Text style={styles.infoPanelTitle}>图片信息</Text>
          <TouchableOpacity onPress={() => setShowInfo(false)}>
            <Text style={styles.infoPanelClose}>✕</Text>
          </TouchableOpacity>
            </View>
        <ScrollView style={styles.infoContent}>
          {imageInfo.map((item, index) => (
            <View key={index} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{item.value}</Text>
            </View>
          ))}
        </ScrollView>
            </View>
    );
  };

  /**
   * 渲染底部操作栏
   */
  const renderActions = () => (
    <View style={styles.actionsBar}>
      <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
        <Text style={styles.actionIcon}>🗑️</Text>
        <Text style={styles.actionLabel}>删除</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={handleStaging}>
        <Text style={styles.actionIcon}>📦</Text>
        <Text style={styles.actionLabel}>暂存</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={handleReclassify}>
        <Text style={styles.actionIcon}>🏷️</Text>
        <Text style={styles.actionLabel}>分类</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
        <Text style={styles.actionIcon}>📤</Text>
        <Text style={styles.actionLabel}>分享</Text>
      </TouchableOpacity>
            </View>
  );

  /**
   * 渲染导航箭头
   */
  const renderNavigationArrows = () => (
    <>
      {currentImageIndex > 0 && (
        <TouchableOpacity style={styles.navButtonLeft} onPress={goToPrevious}>
          <Text style={styles.navButtonText}>‹</Text>
        </TouchableOpacity>
      )}
      {currentImageIndex < allImages.length - 1 && (
        <TouchableOpacity style={styles.navButtonRight} onPress={goToNext}>
          <Text style={styles.navButtonText}>›</Text>
        </TouchableOpacity>
                )}
              </>
  );

  // ==================== 主渲染 ====================

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      {renderHeader()}

      {/* 主图片区域 */}
      <View style={styles.imageContainer}>
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const index = Math.round(offsetX / SCREEN_WIDTH);
            if (index !== currentImageIndex) {
              setCurrentImageIndex(index);
            }
          }}
          scrollEventThrottle={16}
        >
          {allImages.map((img, index) => (
            <View key={img.id || index} style={styles.imagePage}>
              <Image
                source={{ uri: img.uri }}
                style={styles.image}
                resizeMode="contain"
              />
          </View>
          ))}
      </ScrollView>

        {/* 导航箭头 */}
        {renderNavigationArrows()}
          </View>

      {/* 图片信息面板 */}
      {renderImageInfo()}

      {/* 底部操作栏 */}
      {renderActions()}
    </SafeAreaView>
  );
};

// ==================== 样式 ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  
  // 头部
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
  },
  headerButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 24,
    color: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  
  // 图片区域
  imageContainer: {
    flex: 1,
    position: 'relative',
  },
  imagePage: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  
  // 导航箭头
  navButtonLeft: {
    position: 'absolute',
    left: 16,
    top: '50%',
    marginTop: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonRight: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -32,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  navButtonText: {
    fontSize: 48,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  
  // 信息面板
  infoPanel: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: SCREEN_HEIGHT * 0.6,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
  },
  infoPanelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  infoPanelClose: {
    fontSize: 20,
    color: '#8E8E93',
  },
  infoContent: {
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
  },
  infoLabel: {
    width: 80,
    fontSize: 14,
    color: '#8E8E93',
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
  },
  
  // 操作栏
  actionsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
  },
  actionButton: {
    alignItems: 'center',
    padding: 8,
    minWidth: 60,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 12,
    color: '#FFFFFF',
  },
});

export default ImagePreviewScreen;
