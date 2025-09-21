import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ScrollView, Dimensions, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '../adapters/WebAdapters';
import ImageStorageService from '../services/ImageStorageService';
import ImageClassifierService from '../services/ImageClassifierService';
import configService from '../services/ConfigService';

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

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const ImagePreviewScreen = ({ route, navigation }) => {
  const { image } = route.params;
  const [currentImage, setCurrentImage] = useState(image);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 1 });

  // 获取图片尺寸
  useEffect(() => {
    if (currentImage.uri) {
      console.log('开始获取图片尺�?', currentImage.uri);
      Image.getSize(
        currentImage.uri,
        (width, height) => {
          console.log('图片尺寸获取成功:', width, '×', height);
          setImageDimensions({ width, height });
        },
        (error) => {
          console.log('获取图片尺寸失败:', error);
          setImageDimensions(null);
        }
      );
    } else {
      console.log('没有图片URI，无法获取尺�?);
    }
  }, [currentImage.uri]);



  const handleDelete = () => {
    Alert.alert(
      '确认删除',
      '确定要删除这张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复�?,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              // 显示自定义进度对话框
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: 1 });
              
              const result = await ImageStorageService.deleteImageWithResult(
                currentImage.id,
                (progress) => {
                  // 实时更新进度信息
                  setDeleteProgress(progress);
                }
              );
              
              if (result.success) {
                // 延迟关闭进度对话框，让用户看到最终结�?
                setTimeout(() => {
                  setShowDeleteProgress(false);
                  navigation.goBack();
                }, 1000);
              } else {
                setShowDeleteProgress(false);
                Alert.alert('删除失败', result.message);
              }
            } catch (error) {
              setShowDeleteProgress(false);
              Alert.alert('错误', '删除失败，请重试');
            }
          },
        },
      ]
    );
  };



  // 处理分类修改
  const handleCategoryChange = async (newCategory) => {
    if (newCategory === currentImage.category) {
      return; // 如果选择的是当前分类，不做任何操�?
    }

    try {
      // 直接修改分类，不需要确认提�?
      await ImageStorageService.updateImageCategory(currentImage.id, newCategory);
      // 更新本地状态，将置信度设置�?人工"
      setCurrentImage(prev => ({ 
        ...prev, 
        category: newCategory,
        confidence: 'manual' // 标记为人工分�?
      }));
      console.log(`图片分类已修改为: ${getCategoryInfo(newCategory).name} (人工分类)`);
    } catch (error) {
      console.error('修改分类失败:', error);
      Alert.alert('错误', '分类修改失败，请重试');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN');
  };





  // 获取文件�?
  const getDisplayFileName = () => {
    // 优先使用 fileName 字段
    if (currentImage.fileName) {
      return currentImage.fileName;
    }
    
    // 如果没有 fileName，从 URI 中提�?
    if (currentImage.uri) {
      const uriParts = currentImage.uri.split('/');
      const lastPart = uriParts[uriParts.length - 1];
      
      // 如果最后一部分包含查询参数，去掉查询参�?
      if (lastPart.includes('?')) {
        return lastPart.split('?')[0];
      }
      
      return lastPart;
    }
    
    // 默认�?
    return '图片预览';
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航�?*/}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backIcon}>�?/Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {getDisplayFileName()}
        </Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>🗑�?/Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* 图片显示区域 */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: currentImage.uri }}
            style={styles.image}
            resizeMode="contain"
          />
          
          {/* 图片信息 - 透明叠加到图片上 */}
          <View style={styles.overlayInfo}>
            <View style={styles.infoRow}>
              <Text style={styles.overlayLabel}>拍摄时间:</Text>
              <Text style={styles.overlayValue}>
                {currentImage.takenAt ? formatDate(currentImage.takenAt) : '�?}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.overlayLabel}>文件时间:</Text>
              <Text style={styles.overlayValue}>
                {currentImage.timestamp ? formatDate(currentImage.timestamp) : '�?}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.overlayLabel}>尺寸:</Text>
              <Text style={styles.overlayValue}>
                {imageDimensions ? 
                  `${imageDimensions.width} × ${imageDimensions.height}` : 
                  '加载�?..'
                }
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.overlayLabel}>大小:</Text>
              <Text style={styles.overlayValue}>
                {formatFileSize(currentImage.size || 0)}
              </Text>
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.overlayLabel}>分类:</Text>
              <Text style={styles.overlayValue}>
                {getCategoryInfo(currentImage.category).name}
                {currentImage.confidence === 'manual' ? ' (人工)' : 
                 currentImage.confidence ? ` (${(currentImage.confidence * 100).toFixed(1)}%)` : ''}
              </Text>
            </View>

            {/* GPS位置信息 */}
            {currentImage.location && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.overlayLabel}>📍 位置:</Text>
                  <Text style={styles.overlayValue}>
                    {currentImage.location.latitude && currentImage.location.longitude ? 
                      `${currentImage.location.latitude.toFixed(6)}, ${currentImage.location.longitude.toFixed(6)}` : 
                      '无GPS信息'
                    }
                  </Text>
                </View>
                
                {currentImage.location.altitude && (
                  <View style={styles.infoRow}>
                    <Text style={styles.overlayLabel}>🏔�?海拔:</Text>
                    <Text style={styles.overlayValue}>
                      {currentImage.location.altitude.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.accuracy && (
                  <View style={styles.infoRow}>
                    <Text style={styles.overlayLabel}>🎯 精度:</Text>
                    <Text style={styles.overlayValue}>
                      ±{currentImage.location.accuracy.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.source && currentImage.location.source !== 'none' && (
                  <View style={styles.infoRow}>
                    <Text style={styles.overlayLabel}>📡 来源:</Text>
                    <Text style={styles.overlayValue}>
                      {currentImage.location.source === 'exif' ? 'EXIF数据' : 
                       currentImage.location.source === 'mediastore' ? 'MediaStore' : 
                       currentImage.location.source}
                    </Text>
                  </View>
                )}
              </>
            )}

            <View style={styles.infoRow}>
              <Text style={styles.overlayLabel}>路径:</Text>
              <Text style={styles.overlayValue}>
                {currentImage.uri ? currentImage.uri.replace('file://', '') : '未知'}
              </Text>
            </View>
          </View>
        </View>

        {/* 分类选择�?*/}
        <View style={styles.categorySelector}>
          <View style={styles.categoryGrid}>
            {(() => {
              if (!configService || !configService.isConfigLoaded()) {
                return <Text>配置服务未初始化</Text>;
              }
              return configService.getAllCategoriesWithUI().map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.categoryItem,
                  currentImage.category === category.id && styles.categoryItemActive
                ]}
                onPress={() => handleCategoryChange(category.id)}>
                <Text style={styles.categoryIcon}>📷</Text>
                <Text style={[
                  styles.categoryName,
                  currentImage.category === category.id && styles.categoryNameActive
                ]}>
                  {category.chinese || category.english || category.id}
                </Text>
              </TouchableOpacity>
            ));
            })()}
          </View>
        </View>
      </ScrollView>

      {/* 自定义进度对话框 */}
      <Modal
        visible={showDeleteProgress}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDeleteProgress(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.modalText}>
              正在删除图片文件...
            </Text>
            <Text style={styles.modalText}>
              已删�? {deleteProgress.filesDeleted} �?
              失败: {deleteProgress.filesFailed} �?
            </Text>
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
  menuButton: {
    padding: 8,
  },
  menuIcon: {
    fontSize: 20,
    color: '#333',
  },
  scrollView: {
    flex: 1,
  },
  imageContainer: {
    width: screenWidth,
    height: screenWidth,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlayInfo: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.7)', // 稍微深一点的半透明背景
    padding: 12,
    borderRadius: 8,
    minWidth: 250,
    maxWidth: 320,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    width: '100%',
    marginBottom: 2,
  },
  overlayLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)', // 稍微透明的白�?
    flex: 0,
    fontWeight: '500',
    marginRight: 8,
  },
  overlayValue: {
    fontSize: 12,
    color: '#fff',
    flex: 0,
    textAlign: 'right',
    fontWeight: '600',
    flexShrink: 0,
  },

  actionsContainer: {
    margin: 20,
    marginBottom: 40,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  actionButton: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: 'transparent',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#ff4444',
    fontSize: 20,
    fontWeight: '600',
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
  modalText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 10,
  },
  categorySelector: {
    margin: 20,
    marginBottom: 10,
  },
  categorySelectorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  categoryItem: {
    width: '18%', // 每行显示5个，留一些间�?
    alignItems: 'center',
    marginVertical: 6,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryItemActive: {
    borderColor: '#2196F3',
    borderWidth: 2,
    backgroundColor: '#e0f7fa', // 浅蓝色背�?
  },
  categoryIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryName: {
    fontSize: 10,
    color: '#333',
    textAlign: 'center',
  },
  categoryNameActive: {
    color: '#2196F3',
    fontWeight: '600',
  },

});

export default ImagePreviewScreen;

