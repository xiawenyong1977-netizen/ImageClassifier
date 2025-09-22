import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Dimensions, Modal, ActivityIndicator } from 'react-native';
import { SafeAreaView, Alert } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageClassifierService from '../../services/ImageClassifierService';
import configService from '../../services/ConfigService';

// Helper function to get category information
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

// Helper function to get all categories for selection
const getAllCategories = () => {
  // 确保配置服务已加载
  if (!configService || !configService.isConfigLoaded()) {
    throw new Error('ConfigService未初始化或配置未加载');
  }
  
  return configService.getAllCategoriesWithUI().map(category => ({
    id: category.id,
    name: category.chinese || category.english || category.id,
    icon: '📷', // 默认图标
    color: '#607D8B' // 默认颜色
  }));
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Helper function to convert file URI to web-accessible format
const getWebAccessibleUri = (uri) => {
  if (!uri) return null;
  
  // If it's already a web URL, return as is
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return uri;
  }
  
  // If it's a file:// URI, convert to web-accessible format
  if (uri.startsWith('file://')) {
    // For Electron environment, we can use the file:// protocol
    if (typeof window !== 'undefined' && window.require) {
      return uri;
    }
    
    // For web environment, we'll show placeholder
    return null;
  }
  
  return uri;
};

const ImagePreviewScreen = ({ route = {}, navigation = {}, imageId, onBack, fromScreen, onDataChange }) => {
  console.log('🚀 ImagePreviewScreen 组件开始渲染');
  console.log('📸 接收到的图片ID:', imageId);
  console.log('📸 接收到的route参数:', route);
  
  // 直接从URL参数获取图片ID
  const getImageIdFromURL = () => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('imageId');
    }
    return null;
  };
  
  const finalImageId = imageId || route.params?.imageId || getImageIdFromURL();
  console.log('📸 最终使用的图片ID:', finalImageId);
  const [currentImage, setCurrentImage] = useState(null);
  const [imageDimensions, setImageDimensions] = useState(null);
  const [showDeleteProgress, setShowDeleteProgress] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ filesDeleted: 0, filesFailed: 0, total: 1 });
  const [loading, setLoading] = useState(true);

  const [imageClassifierService] = useState(new ImageClassifierService());

  // 根据 finalImageId 从数据库中加载完整的图片信息
  useEffect(() => {
    const loadImageDetails = async () => {
      if (!finalImageId) {
        console.log('❌ 没有图片ID，无法加载详情');
        setLoading(false);
        return;
      }

      try {
        console.log(`📸 开始从数据库加载图片详情: ${finalImageId}`);
        setLoading(true);
        
        const fullImageDetails = await UnifiedDataService.readImageDetailsById(finalImageId);
        if (fullImageDetails) {
          console.log(`✅ 图片详情加载成功: ${finalImageId}`);
          console.log('🔍 图片数据结构调试:', {
            hasMobileNetV3: !!fullImageDetails.mobileNetV3Detections,
            mobileNetV3Type: typeof fullImageDetails.mobileNetV3Detections,
            mobileNetV3Value: fullImageDetails.mobileNetV3Detections,
            hasPredictions: !!fullImageDetails.mobileNetV3Detections?.predictions,
            predictionsLength: fullImageDetails.mobileNetV3Detections?.predictions?.length
          });
          setCurrentImage(fullImageDetails);
        } else {
          console.log(`❌ 图片详情加载失败: ${finalImageId}`);
        }
      } catch (error) {
        console.error(`❌ 加载图片详情异常: ${finalImageId}`, error);
      } finally {
        setLoading(false);
      }
    };

    loadImageDetails();
  }, [finalImageId]);

  // 获取图片尺寸
  useEffect(() => {
    if (currentImage && currentImage.uri) {
      console.log('开始获取图片尺寸:', currentImage.uri);
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
      console.log('没有图片URI，无法获取尺寸');
    }
  }, [currentImage?.uri]);

  const handleBack = () => {
    // 使用传入的 onBack 回调
    if (onBack) {
      onBack();
    }
  };

  const handleDelete = () => {
    console.log('🗑️ 删除按钮被点击，currentImage:', currentImage);
    console.log('🗑️ 图片ID:', currentImage?.id);
    
    if (!currentImage || !currentImage.id) {
      console.error('🗑️ 错误：currentImage 或 currentImage.id 不存在');
      Alert.alert('错误', '图片信息不完整，无法删除');
      return;
    }
    
    console.log('🗑️ 准备显示确认对话框...');
    Alert.alert(
      '确认删除',
      '确定要删除这张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复！',
      [
        { 
          text: '取消', 
          style: 'cancel',
          onPress: () => console.log('🗑️ 用户取消删除')
        },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            console.log('🗑️ 用户确认删除，开始删除流程...');
            try {
              // 显示自定义进度对话框
              setShowDeleteProgress(true);
              setDeleteProgress({ filesDeleted: 0, filesFailed: 0, total: 1 });
              
              console.log('🗑️ 调用deleteImage方法...');
              const result = await UnifiedDataService.writeDeleteImage(currentImage.id);
              
              console.log('🗑️ 删除结果:', result);
              if (result.success) {
                console.log('🗑️ 删除成功，准备返回上一页...');
                // 延迟关闭进度对话框，让用户看到最终结果
                setTimeout(() => {
                  setShowDeleteProgress(false);
                  handleBack();
                }, 1000);
              } else {
                console.log('🗑️ 删除失败:', result.message);
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
      return; // 如果选择的是当前分类，不做任何操作
    }

    try {
      // 调试：检查currentImage是否包含检测结果
      console.log('🔍 修改分类前检查currentImage:');
      console.log('  - currentImage.idCardDetections:', currentImage.idCardDetections ? '存在' : '不存在');
      console.log('  - currentImage.generalDetections:', currentImage.generalDetections ? '存在' : '不存在');
      console.log('  - 检测结果详情:', {
        idCardDetections: currentImage.idCardDetections,
        generalDetections: currentImage.generalDetections
      });
      
      // 调试：修改分类前检查数据库中其他图片的检测结果
      console.log('🔍 修改分类前检查数据库中其他图片的检测结果...');
      const allImages = await UnifiedDataService.readAllImages();
      const otherImagesWithDetections = allImages.filter(img => 
        img.id !== currentImage.id && (img.idCardDetections || img.generalDetections)
      );
      console.log(`  - 数据库中其他图片有检测结果的数量: ${otherImagesWithDetections.length}`);
      
      // 使用专门的分类更新接口，只更新分类相关字段
      await UnifiedDataService.updateImageCategory(
        currentImage.id, 
        newCategory, 
        'manual'
      );
      
      // 调试：修改分类后检查数据库中其他图片的检测结果
      console.log('🔍 修改分类后检查数据库中其他图片的检测结果...');
      const allImagesAfter = await UnifiedDataService.readAllImages();
      const otherImagesWithDetectionsAfter = allImagesAfter.filter(img => 
        img.id !== currentImage.id && (img.idCardDetections || img.generalDetections)
      );
      console.log(`  - 数据库中其他图片有检测结果的数量: ${otherImagesWithDetectionsAfter.length}`);
      // 更新本地状态，将置信度设置为"人工"
      setCurrentImage(prev => ({ 
        ...prev, 
        category: newCategory,
        confidence: 'manual' // 标记为人工分类
      }));
      console.log(`图片分类已修改为: ${getCategoryInfo(newCategory).name} (人工分类)`);
      
      // 通知父组件数据已变化
      if (onDataChange) {
        onDataChange();
      }
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

  // 获取文件名
  const getDisplayFileName = () => {
    // 优先使用 fileName 字段
    if (currentImage.fileName) {
      return currentImage.fileName;
    }
    
    // 如果没有 fileName，从 URI 中提取
    if (currentImage.uri) {
      const uriParts = currentImage.uri.split('/');
      const lastPart = uriParts[uriParts.length - 1];
      
      // 如果最后一部分包含查询参数，去掉查询参数
      if (lastPart.includes('?')) {
        return lastPart.split('?')[0];
      }
      
      return lastPart;
    }
    
    // 默认值
    return '图片预览';
  };

  // 显示加载状态
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>正在加载图片详情...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!currentImage) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>图片未找到</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}>
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {getDisplayFileName()}
        </Text>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>

      {/* 主内容区域 - 使用Flex布局，避免滚动条 */}
      <View style={styles.mainContent}>
        {/* 图片和信息区域 */}
        <View style={styles.contentRow}>
          {/* 左侧区域：图片和分类选择器 */}
          <View style={styles.leftPanel}>
            {/* 图片显示区域 */}
            <View style={styles.imageContainer}>
            {(() => {
              const webUri = getWebAccessibleUri(currentImage.uri);
              return webUri ? (
                <Image
                  source={{ uri: webUri }}
                  style={styles.image}
                  resizeMode="contain"
                  onError={(error) => {
                    console.log('Image load error:', error.nativeEvent?.error);
                  }}
                  onLoad={() => {
                    console.log('Image loaded successfully');
                  }}
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.placeholderText}>📷</Text>
                  <Text style={styles.placeholderFileName}>
                    {currentImage.fileName || 'Image Preview'}
                  </Text>
                  <Text style={styles.placeholderSubtext}>
                    {currentImage.uri ? 'Local file' : 'No preview available'}
                  </Text>
                </View>
              );
            })()}
          </View>

          {/* 分类选择器 - 与图片区域对齐 */}
          <View style={styles.categorySelector}>
            <View style={styles.categoryGrid}>
              {getAllCategories().map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryItem,
                    currentImage.category === category.id && styles.selectedCategory
                  ]}
                  onPress={() => handleCategoryChange(category.id)}
                >
                  <Text style={styles.categoryIcon}>{category.icon}</Text>
                  <Text style={styles.categoryName}>{category.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          </View>
          
          {/* 图片信息区域 - 右侧固定宽度 */}
          <View style={styles.infoPanel}>
            <Text style={styles.infoPanelTitle}>图片信息</Text>
            
            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>拍摄时间:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.takenAt ? formatDate(currentImage.takenAt) : '未知'}
                </Text>
                {console.log('📸 当前图片EXIF数据:', {
                  takenAt: currentImage.takenAt,
                  timestamp: currentImage.timestamp,
                  uri: currentImage.uri,
                  latitude: currentImage.latitude,
                  longitude: currentImage.longitude,
                  altitude: currentImage.altitude,
                  accuracy: currentImage.accuracy,
                  address: currentImage.address,
                  city: currentImage.city,
                  province: currentImage.province,
                  country: currentImage.country,
                  cityDistance: currentImage.cityDistance,
                  locationSource: currentImage.locationSource
                })}
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>文件时间:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.timestamp ? formatDate(currentImage.timestamp) : '未知'}
                </Text>
              </View>

              {/* 位置信息 */}
              {currentImage.latitude && currentImage.longitude && (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>GPS坐标:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.latitude.toFixed(6)}, {currentImage.longitude.toFixed(6)}
                    </Text>
                  </View>
                  
                  {currentImage.city && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>拍摄城市:</Text>
                      <Text style={styles.infoValue}>
                        {currentImage.city}
                        {currentImage.province && `, ${currentImage.province}`}
                        {currentImage.cityDistance && ` (距离${currentImage.cityDistance}km)`}
                      </Text>
                    </View>
                  )}
                  
                  {currentImage.altitude && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>海拔高度:</Text>
                      <Text style={styles.infoValue}>
                        {currentImage.altitude}m
                      </Text>
                    </View>
                  )}
                  
                  {currentImage.accuracy && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>GPS精度:</Text>
                      <Text style={styles.infoValue}>
                        ±{currentImage.accuracy}m
                      </Text>
                    </View>
                  )}
                </>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>尺寸:</Text>
                <Text style={styles.infoValue}>
                  {imageDimensions ? 
                    `${imageDimensions.width} × ${imageDimensions.height}` : 
                    '加载中...'
                  }
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>大小:</Text>
                <Text style={styles.infoValue}>
                  {formatFileSize(currentImage.size || 0)}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>分类:</Text>
                <Text style={styles.infoValue}>
                  {getCategoryInfo(currentImage.category).name}
                  {currentImage.confidence === 'manual' ? ' (人工)' : 
                   currentImage.confidence ? ` (${(currentImage.confidence * 100).toFixed(1)}%)` : ''}
                </Text>
              </View>

              {/* 检测结果显示 */}
              {(currentImage.idCardDetections && currentImage.idCardDetections.length > 0) ||
               (currentImage.generalDetections && currentImage.generalDetections.length > 0) ||
               (currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0) ? (
                <>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🔍 检测结果:</Text>
                    <Text style={styles.infoValue}>
                      {((currentImage.idCardDetections?.length || 0) + (currentImage.generalDetections?.length || 0) + (currentImage.mobileNetV3Detections?.predictions?.length || 0))} 个物体
                    </Text>
                  </View>

                  {/* 身份证检测结果 */}
                  {currentImage.idCardDetections && currentImage.idCardDetections.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🆔 身份证检测:</Text>
                      {currentImage.idCardDetections.map((detection, index) => (
                        <View key={index} style={styles.detectionItem}>
                          <Text style={styles.detectionText}>
                            {detection.class === 'id_card_front' ? '身份证正面' : '身份证背面'}
                            ({(detection.confidence * 100).toFixed(1)}%)
                          </Text>
                          {detection.bbox && (
                            <Text style={styles.bboxText}>
                              位置: [{detection.bbox.map(v => v.toFixed(2)).join(', ')}]
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* 通用物体检测结果 */}
                  {currentImage.generalDetections && currentImage.generalDetections.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🌐 通用物体检测:</Text>
                      {currentImage.generalDetections.slice(0, 5).map((detection, index) => {
                        // 获取类别名称
                        const objectInfo = configService.getYoloObjectById(detection.classId);
                        const className = objectInfo ? objectInfo.chinese || objectInfo.english : `Class ${detection.classId}`;
                        
                        return (
                          <View key={index} style={styles.detectionItem}>
                            <Text style={styles.detectionText}>
                              {className} ({(detection.confidence * 100).toFixed(1)}%)
                            </Text>
                            {detection.bbox && (
                              <Text style={styles.bboxText}>
                                位置: [{detection.bbox.map(v => v.toFixed(2)).join(', ')}]
                              </Text>
                            )}
                          </View>
                        );
                      })}
                      {currentImage.generalDetections.length > 5 && (
                        <Text style={styles.detectionMore}>
                          ... 还有 {currentImage.generalDetections.length - 5} 个物体
                        </Text>
                      )}
                    </View>
                  )}

                  {/* MobileNetV3 分类结果 */}
                  {currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0 && (
                    <View style={styles.detectionSection}>
                      <Text style={styles.detectionTitle}>🧠 MobileNetV3 分类:</Text>
                      {currentImage.mobileNetV3Detections.predictions.slice(0, 5).map((prediction, index) => {
                        // 获取MobileNetV3分类的中文名称
                        const mobileNetV3ClassInfo = configService?.getMobileNetV3ClassByEnglishName(prediction.class);
                        const displayName = mobileNetV3ClassInfo?.chinese || prediction.class;
                        
                        return (
                          <View key={index} style={styles.detectionItem}>
                            <Text style={styles.detectionText}>
                              {displayName} ({(prediction.probability * 100).toFixed(1)}%)
                            </Text>
                          </View>
                        );
                      })}
                      {currentImage.mobileNetV3Detections.predictions.length > 5 && (
                        <Text style={styles.detectionMore}>
                          ... 还有 {currentImage.mobileNetV3Detections.predictions.length - 5} 个分类
                        </Text>
                      )}
                    </View>
                  )}
                </>
              ) : (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>🔍 检测结果:</Text>
                  <Text style={styles.infoValue}>未检测到物体</Text>
                </View>
              )}
            </View>

            {/* GPS位置信息 */}
            {currentImage.location && (
              <View style={styles.infoSection}>
                <Text style={styles.sectionTitle}>位置信息</Text>
                
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>📍 位置:</Text>
                  <Text style={styles.infoValue}>
                    {currentImage.location.latitude && currentImage.location.longitude ? 
                      `${currentImage.location.latitude.toFixed(6)}, ${currentImage.location.longitude.toFixed(6)}` : 
                      '无GPS信息'
                    }
                  </Text>
                </View>
                
                {currentImage.location.altitude && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🏔️ 海拔:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.altitude.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.accuracy && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🎯 精度:</Text>
                    <Text style={styles.infoValue}>
                      ±{currentImage.location.accuracy.toFixed(1)}m
                    </Text>
                  </View>
                )}
                
                {currentImage.location.source && currentImage.location.source !== 'none' && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>📡 来源:</Text>
                    <Text style={styles.infoValue}>
                      {currentImage.location.source === 'exif' ? 'EXIF数据' : 
                       currentImage.location.source === 'mediastore' ? 'MediaStore' : 
                       currentImage.location.source}
                    </Text>
                  </View>
                )}
              </View>
            )}

            <View style={styles.infoSection}>
              <Text style={styles.sectionTitle}>文件路径</Text>
              <Text style={styles.filePath}>
                {currentImage.uri ? currentImage.uri.replace('file://', '').replace(/^\//, '') : '未知'}
              </Text>
            </View>
          </View>
          
        </View>
      </View>

      {/* 删除进度对话框 */}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    height: 60, // 固定高度
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
  // 主内容区域 - 使用Flex布局，避免滚动条
  mainContent: {
    flex: 1,
    flexDirection: 'column',
  },
  // 图片和信息行布局
  contentRow: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0, // 确保可以收缩
  },
  // 左侧区域：图片和分类选择器
  leftPanel: {
    flex: 1,
    flexDirection: 'column',
  },
  imageContainer: {
    flex: 1, // 占据剩余空间
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 400, // 增加最小高度
  },
  image: {
    width: '100%',
    height: '100%',
  },
  // 右侧信息面板
  infoPanel: {
    width: 300, // 固定宽度
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
    padding: 16,
    overflow: 'hidden',
  },
  infoPanelTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  infoSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
    flex: 0,
    marginRight: 8,
    minWidth: 80,
  },
  infoValue: {
    fontSize: 13,
    color: '#333',
    flex: 1,
    textAlign: 'right',
    fontWeight: '400',
  },
  filePath: {
    fontSize: 11,
    color: '#999',
    fontFamily: 'monospace',
    backgroundColor: '#f5f5f5',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  // 图片占位符样式
  imagePlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderFileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  categorySelector: {
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    // 固定高度，不占用太多空间
    height: 80, // 固定高度80px
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around', // 改为space-around，更均匀分布
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 8, // 添加水平内边距
  },
  categoryItem: {
    width: 60, // 固定宽度60px
    height: 50, // 固定高度50px
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  selectedCategory: {
    borderColor: '#2196F3',
    borderWidth: 2,
    backgroundColor: '#e0f7fa',
  },
  categoryIcon: {
    fontSize: 14, // 减小图标大小
    marginBottom: 2,
  },
  categoryName: {
    fontSize: 8, // 减小字体大小
    color: '#333',
    textAlign: 'center',
    flexShrink: 1,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#666',
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
  // 检测结果样式
  detectionSection: {
    marginTop: 8,
    marginBottom: 4,
  },
  detectionTitle: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  detectionItem: {
    marginLeft: 8,
    marginBottom: 2,
  },
  detectionText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '500',
  },
  detectionMore: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
    marginLeft: 8,
  },
  bboxText: {
    fontSize: 10,
    color: '#666',
    marginLeft: 8,
    marginTop: 2,
    fontFamily: 'monospace',
  },
});

export default ImagePreviewScreen;
