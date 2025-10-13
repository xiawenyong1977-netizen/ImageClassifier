import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView, FlatList } from 'react-native';
import { SafeAreaView } from '../adapters/WebAdapters';
import { launchImageLibrary } from '../adapters/WebAdapters';
import ImageStorageService from '../services/ImageStorageService';
import ImageClassifierService from '../services/ImageClassifierService';
import GalleryScannerService from '../services/GalleryScannerService';

// 创建服务实例
const galleryScannerService = new GalleryScannerService();

const ImageUploadScreen = ({ navigation }) => {
  const [allImages, setAllImages] = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);

  // 组件挂载时自动扫描相�?
  useEffect(() => {
    scanGallery();
  }, []);

  // 扫描相册
  const scanGallery = async () => {
    setScanning(true);
    try {
      // 使用相册扫描服务
      await galleryScannerService.initialize();
      // 使用新的扫描方法
      const result = await galleryScannerService.scanGalleryWithProgress((progress) => {
        logger.debug('扫描进度:', progress);
      });
      
      // 获取所有图片数据
      const galleryImages = await ImageStorageService.getImages();
      setAllImages(galleryImages);
      
      // 自动选择所有图�?
      setSelectedImages(galleryImages);
      
    } catch (error) {
      console.error('扫描相册失败:', error);
      Alert.alert('错误', '扫描相册失败: ' + error.message);
    } finally {
      setScanning(false);
    }
  };

  // 处理图片分类
  const handleProcessImages = async () => {
    if (selectedImages.length === 0) {
      Alert.alert('提示', '没有图片需要处�?);
      return;
    }

    setProcessing(true);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const image of selectedImages) {
        try {
          // 使用智能分类
          const classificationResult = await ImageClassifierService.smartClassifyImage(
            image.uri,
            {
              timestamp: image.timestamp,
              fileSize: image.fileSize,
              fileName: image.fileName,
            }
          );

          // 保存分类结果
          await ImageStorageService.saveImageClassification({
            uri: image.uri,
            category: classificationResult.category,
            confidence: classificationResult.confidence,
            timestamp: image.timestamp,
            size: image.fileSize,
            fileName: image.fileName,
          });

          successCount++;
          logger.debug(`图片分类成功: ${image.fileName} -> ${classificationResult.category}`);
        } catch (error) {
          console.error(`图片分类失败 ${image.fileName}:`, error);
          failCount++;
        }
      }

      const message = `处理完成\n成功: ${successCount} 张\n失败: ${failCount} 张`;
      Alert.alert('完成', message, [
        {
          text: '确定',
          onPress: () => {
            navigation.goBack();
          },
        },
      ]);
    } catch (error) {
      Alert.alert('错误', '处理过程中发生错�? ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  // 切换图片选择状�?
  const toggleImageSelection = (imageId) => {
    setSelectedImages(prev => {
      if (prev.find(img => img.id === imageId)) {
        return prev.filter(img => img.id !== imageId);
      } else {
        const image = allImages.find(img => img.id === imageId);
        return [...prev, image];
      }
    });
  };

  // 全�?取消全�?
  const toggleSelectAll = () => {
    if (selectedImages.length === allImages.length) {
      setSelectedImages([]);
    } else {
      setSelectedImages([...allImages]);
    }
  };

  // 渲染图片�?
  const renderImageItem = ({ item }) => {
    const isSelected = selectedImages.find(img => img.id === item.id);
    
    return (
      <TouchableOpacity
        style={[styles.imageItem, isSelected && styles.imageItemSelected]}
        onPress={() => toggleImageSelection(item.id)}>
        <Image source={{ uri: item.uri }} style={styles.imageThumbnail} />
        {isSelected && (
          <View style={styles.selectedOverlay}>
            <Text style={styles.selectedIcon}>�?/Text>
          </View>
        )}
        <Text style={styles.imageName} numberOfLines={1}>
          {item.fileName}
        </Text>
        <Text style={styles.imageInfo}>
          {new Date(item.timestamp).toLocaleDateString()}
        </Text>
      </TouchableOpacity>
    );
  };

  if (scanning) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>正在扫描相册...</Text>
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
          <Text style={styles.backIcon}>�?/Text>
        </TouchableOpacity>
        <Text style={styles.title}>相册管理</Text>
        <TouchableOpacity
          style={styles.selectAllButton}
          onPress={toggleSelectAll}>
          <Text style={styles.selectAllText}>
            {selectedImages.length === allImages.length ? '取消全�? : '全�?}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 统计信息 */}
      <View style={styles.statsSection}>
        <Text style={styles.statsText}>
          相册中共�?{allImages.length} 张图片，已选择 {selectedImages.length} �?
        </Text>
      </View>

      {/* 图片网格 */}
      <FlatList
        data={allImages}
        renderItem={renderImageItem}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={styles.imagesGrid}
        showsVerticalScrollIndicator={false}
      />

      {/* 底部操作按钮 */}
      <View style={styles.bottomActions}>
        <TouchableOpacity
          style={[styles.processButton, processing && styles.processButtonDisabled]}
          onPress={handleProcessImages}
          disabled={processing || selectedImages.length === 0}>
          {processing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.processButtonText}>
              🚀 开始分类处�?({selectedImages.length})
            </Text>
          )}
        </TouchableOpacity>
      </View>
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
  selectAllButton: {
    padding: 8,
  },
  selectAllText: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '500',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 16,
  },
  statsSection: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  imagesGrid: {
    padding: 8,
  },
  imageItem: {
    flex: 1,
    margin: 4,
    alignItems: 'center',
    position: 'relative',
  },
  imageItemSelected: {
    opacity: 0.8,
  },
  imageThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginBottom: 4,
  },
  selectedOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIcon: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imageName: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
    marginBottom: 2,
  },
  imageInfo: {
    fontSize: 8,
    color: '#666',
    textAlign: 'center',
  },
  bottomActions: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  processButton: {
    backgroundColor: '#FF9800',
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  processButtonDisabled: {
    backgroundColor: '#ccc',
  },
  processButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default ImageUploadScreen;
