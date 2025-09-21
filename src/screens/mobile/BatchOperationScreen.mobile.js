import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '../adapters/WebAdapters';
import ImageStorageService from '../services/ImageStorageService';
import ImageClassifierService from '../services/ImageClassifierService';
import configService from '../services/ConfigService';

const BatchOperationScreen = ({ route, navigation }) => {
  const { selectedImages, category } = route.params;
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [operationLoading, setOperationLoading] = useState(false);

  useEffect(() => {
    loadSelectedImages();
  }, []);

  const loadSelectedImages = async () => {
    try {
      setLoading(true);
      const allImages = await ImageStorageService.getImages();
      const selectedImageData = allImages.filter(img => 
        selectedImages.includes(img.id)
      );
      setImages(selectedImageData);
    } catch (error) {
      console.error('加载选中图片失败:', error);
      Alert.alert('错误', '加载图片失败');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchDelete = () => {
    Alert.alert(
      '确认删除',
      `确定要删除选中�?${images.length} 张图片吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            await performBatchOperation('delete');
          },
        },
      ]
    );
  };

  const handleBatchReclassify = () => {
    Alert.alert(
      '重新分类',
      `确定要重新分类选中�?${images.length} 张图片吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: async () => {
            await performBatchOperation('reclassify');
          },
        },
      ]
    );
  };

  const handleBatchMove = () => {
    // 确保配置服务已加载
    if (!configService || !configService.isConfigLoaded()) {
      Alert.alert('错误', '配置服务未初始化');
      return;
    }
    
    // 从配置服务获取分类列表
    const categories = configService.getAllCategoriesWithUI().map(category => ({
      id: category.id,
      name: category.chinese || category.english || category.id
    }));

    Alert.alert(
      '选择目标分类',
      '请选择要将图片移动到的分类',
      categories.map(cat => ({
        text: cat.name,
        onPress: () => performBatchOperation('move', cat.id),
      }))
    );
  };

  const performBatchOperation = async (operation, targetCategory = null) => {
    try {
      setOperationLoading(true);
      
      switch (operation) {
        case 'delete':
          try {
            const result = await ImageStorageService.deleteImages(selectedImages);
            Alert.alert('操作完成', '删除操作已完成');
          } catch (error) {
            console.error('批量删除失败:', error);
            Alert.alert('操作失败', `删除过程中出现错误：${error.message}`);
            return; // Do not go back if deletion failed
          }
          break;
          
        case 'reclassify':
          await performBatchReclassification();
          break;
          
        case 'move':
          await performBatchMove(targetCategory);
          break;
          
        default:
          Alert.alert('错误', '不支持的操作');
          return;
      }
      
      // 操作成功后返回上一�?
      navigation.goBack();
      
    } catch (error) {
      console.error('批量操作失败:', error);
      Alert.alert('错误', '操作失败，请重试');
    } finally {
      setOperationLoading(false);
    }
  };

  const performBatchReclassification = async () => {
    let successCount = 0;
    let failCount = 0;
    
    for (const image of images) {
      try {
        const result = await ImageClassifierService.classifyImage(image.uri, {
          timestamp: image.timestamp || Date.now(),
          fileSize: image.size || 0,
          fileName: image.fileName || image.uri.split('/').pop() || 'unknown.jpg'
        });
        await ImageStorageService.updateImageCategory(image.id, result.category);
        successCount++;
      } catch (error) {
        console.error(`重新分类图片失败 ${image.id}:`, error);
        failCount++;
      }
    }
    
    const message = `重新分类完成\n成功: ${successCount} 张\n失败: ${failCount} 张`;
    Alert.alert('完成', message);
  };

  const performBatchMove = async (targetCategory) => {
    let successCount = 0;
    
    for (const imageId of selectedImages) {
      try {
        await ImageStorageService.updateImageCategory(imageId, targetCategory);
        successCount++;
      } catch (error) {
        console.error(`移动图片失败 ${imageId}:`, error);
      }
    }
    
    Alert.alert('成功', `成功移动 ${successCount} 张图片`);
  };

  // 获取分类信息的辅助函�?
  const getCategoryInfo = (categoryId) => {
    // 确保配置服务已加载
    if (!configService || !configService.isConfigLoaded()) {
      throw new Error('ConfigService未初始化或配置未加载');
    }
    
    const category = configService.getCategoryByKey(categoryId);
    if (!category) {
      throw new Error(`未找到分类: ${categoryId}`);
    }
    
    return {
      name: category.chinese || category.english || categoryId,
      icon: '📷', // 默认图标，因为用户说不需要图标
      color: '#607D8B' // 默认颜色
    };
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>加载�?..</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航�?*/}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}> /</Text>
        </TouchableOpacity>
        <Text style={styles.title}>批量操作</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 选择统计 */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>📊 选择统计</Text>
          <View style={styles.statsContent}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>选中图片:</Text>
              <Text style={styles.statValue}>{images.length} �?/Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>总大�?</Text>
              <Text style={styles.statValue}>
                {formatFileSize(images.reduce((sum, img) => sum + (img.size || 0), 0))}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>来源分类:</Text>
              <Text style={styles.statValue}>
                {category ? category.name : '多个分类'}
              </Text>
            </View>
          </View>
        </View>

        {/* 批量操作按钮 */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>🎯 批量操作</Text>
          
          <TouchableOpacity
            style={[styles.actionButton, styles.deleteButton]}
            onPress={handleBatchDelete}
            disabled={operationLoading}>
            <Text style={styles.actionButtonText}>🗑批量删除</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.reclassifyButton]}
            onPress={handleBatchReclassify}
            disabled={operationLoading}>
            <Text style={styles.actionButtonText}>🏷重新分类</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.moveButton]}
            onPress={handleBatchMove}
            disabled={operationLoading}>
            <Text style={styles.actionButtonText}>📁 批量移动</Text>
          </TouchableOpacity>
        </View>

        {/* 选中图片列表 */}
        <View style={styles.imagesSection}>
          <Text style={styles.sectionTitle}>📱 选中图片</Text>
          
          {images.map((image, index) => (
            <View key={image.id} style={styles.imageItem}>
              <View style={styles.imageInfo}>
                <Text style={styles.imageIndex}>{index + 1}</Text>
                <View style={styles.imageDetails}>
                  <Text style={styles.imageName}>
                    {image.uri.split('/').pop() || '图片'}
                  </Text>
                  <Text style={styles.imageCategory}>
                    {getCategoryInfo(image.category).name}
                  </Text>
                </View>
              </View>
              <Text style={styles.imageSize}>
                {formatFileSize(image.size || 0)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 操作加载指示�?*/}
      {operationLoading && (
        <View style={styles.overlay}>
          <View style={styles.loadingModal}>
            <ActivityIndicator size="large" color="#2196F3" />
            <Text style={styles.loadingModalText}>正在处理...</Text>
          </View>
        </View>
      )}
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
    padding: 8,
    marginRight: 8,
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
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  statsCard: {
    margin: 20,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  statsContent: {
    gap: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  actionsSection: {
    marginHorizontal: 20,
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#ff4444',
  },
  reclassifyButton: {
    backgroundColor: '#2196F3',
  },
  moveButton: {
    backgroundColor: '#4CAF50',
  },
  imagesSection: {
    marginHorizontal: 20,
    marginBottom: 40,
  },
  imageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  imageInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  imageIndex: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2196F3',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 12,
  },
  imageDetails: {
    flex: 1,
  },
  imageName: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  imageCategory: {
    fontSize: 12,
    color: '#666',
  },
  imageSize: {
    fontSize: 12,
    color: '#999',
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingModal: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  loadingModalText: {
    marginTop: 16,
    fontSize: 16,
    color: '#333',
  },
});

export default BatchOperationScreen;

