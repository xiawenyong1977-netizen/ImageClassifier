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
  FlatList,
  ScrollView,
  Modal,
} from 'react-native';
import { SafeAreaView, Alert } from '../../adapters/WebAdapters';
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
  const [currentImage, setCurrentImage] = useState(initialImage); // 当前图片完整信息
  const [allImagesState, setAllImagesState] = useState(allImages); // 可变的图片列表
  const [showInfo, setShowInfo] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const flatListRef = useRef(null);

  // 获取图片尺寸（优先使用数据库中的）
  const imageDimensions = currentImage?.imageDimensions || 
    (currentImage?.width && currentImage?.height ? 
      { width: currentImage.width, height: currentImage.height } : null);
  
  // 调试：检查当前图片是否有效
  React.useEffect(() => {
    if (!currentImage || !currentImage.uri) {
      logger.error(`⚠️ 当前图片无效！索引：${currentImageIndex}，总数：${allImagesState.length}`);
      logger.error('当前图片对象:', currentImage);
    } else {
      logger.debug(`✅ 当前图片：索引${currentImageIndex}/${allImagesState.length}，URI: ${currentImage.uri?.substring(0, 50)}...`);
    }
  }, [currentImageIndex]);

  // 初始化时滚动到正确的起始位置
  React.useEffect(() => {
    if (flatListRef.current && currentIndex > 0) {
      // 使用 setTimeout 确保 FlatList 已经渲染完成
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: currentIndex,
          animated: false
        });
        logger.debug(`🎬 初始化滚动到位置: ${currentIndex}`);
      }, 100);
    }
  }, []);

  // 当图片索引变化时，加载完整的图片详情
  React.useEffect(() => {
    const loadImageDetails = async () => {
      const imageData = allImagesState[currentImageIndex];
      if (!imageData || !imageData.id) {
        logger.warn('图片数据无效，跳过详情加载');
        return;
      }

      try {
        // 从数据库加载完整详情（包括检测结果）
        const fullDetails = await UnifiedDataService.readImageDetailsById(imageData.id);
        if (fullDetails) {
          setCurrentImage(fullDetails);
          logger.debug(`✅ 加载图片详情成功: ${imageData.id}`);
          logger.debug('图片数据:', {
            hasImageDimensions: !!fullDetails.imageDimensions,
            imageDimensions: fullDetails.imageDimensions,
            width: fullDetails.width,
            height: fullDetails.height,
            hasIdCard: !!fullDetails.idCardDetections,
            hasGeneral: !!fullDetails.generalDetections,
            hasMobileNet: !!fullDetails.mobileNetV3Detections
          });
        } else {
          // 如果加载失败，使用原始数据
          setCurrentImage(imageData);
          logger.warn('从数据库加载详情失败，使用列表数据');
        }
      } catch (error) {
        logger.error('加载图片详情失败:', error);
        setCurrentImage(imageData);
      }
    };

    loadImageDetails();
  }, [currentImageIndex, allImagesState]);

  // ==================== 工具函数 ====================

  /**
   * 重新加载图片列表（当图片被移出当前列表时）
   */
  const reloadImageList = async () => {
    try {
      logger.debug('🔄 重新加载图片列表...', { category, city, similarityGroupId });
      
      let updatedImages = [];
      
      // 根据来源重新加载
      if (similarityGroupId) {
        // 来自相似组
        logger.debug('从相似组重新加载...');
        const groupData = await UnifiedDataService.getSimilarityGroupImages(similarityGroupId);
        const groupImages = groupData.images || [];
        // 过滤掉 tobecleaned 分类的照片（保持与相似组页面一致）
        updatedImages = groupImages.filter(img => img.category !== 'tobecleaned');
      } else if (city) {
        // 来自城市分类
        logger.debug('从城市分类重新加载...');
        const cityImages = await UnifiedDataService.readImagesByLocation(city);
        // 过滤掉 tobecleaned 分类的照片（保持与城市页面一致）
        updatedImages = cityImages.filter(img => img.category !== 'tobecleaned');
      } else if (category) {
        // 来自普通分类
        logger.debug('从分类重新加载...');
        updatedImages = await UnifiedDataService.readImagesByCategory(category);
      } else {
        logger.warn('⚠️ 无法确定来源，无法重新加载');
        return false;
      }
      
      logger.debug(`✅ 重新加载完成，图片数：${allImagesState.length} → ${updatedImages.length}`);
      
      // 如果列表为空，返回上一页
      if (updatedImages.length === 0) {
        logger.debug('列表已空，返回上一页');
        Alert.alert('提示', '当前分类已无图片', [
          { text: '确定', onPress: goBack }
        ]);
        return false;
      }
      
      // 更新图片列表
      setAllImagesState(updatedImages);
      
      // 调整当前索引
      let newIndex = currentImageIndex;
      if (currentImageIndex >= updatedImages.length) {
        // 如果当前索引超出范围，跳到最后一张
        newIndex = updatedImages.length - 1;
        logger.debug(`索引超出范围，调整到最后一张：${newIndex}`);
      }
      
      // 滚动到正确位置
      if (flatListRef.current && newIndex !== currentImageIndex) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: newIndex,
            animated: true
          });
          setCurrentImageIndex(newIndex);
        }, 100);
      }
      
      return true;
    } catch (error) {
      logger.error('❌ 重新加载图片列表失败:', error);
      return false;
    }
  };

  /**
   * 计算显示的序号
   */
  const getDisplayNumbers = () => {
  return {
      displayIndex: currentImageIndex + 1,
      displayTotal: allImagesState.length
    };
  };


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
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
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
      const newIndex = currentImageIndex - 1;
      flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
      setCurrentImageIndex(newIndex);
    }
  };

  /**
   * 下一张
   */
  const goToNext = () => {
    if (currentImageIndex < allImagesState.length - 1) {
      const newIndex = currentImageIndex + 1;
      flatListRef.current?.scrollToIndex({ index: newIndex, animated: true });
      setCurrentImageIndex(newIndex);
    }
  };

  /**
   * 返回（携带当前图片 ID，用于高亮）
   */
  const goBack = () => {
    // 使用 setParams 更新当前路由的参数，然后返回
    if (navigation.canGoBack()) {
      // 先获取前一个屏幕的 key
      const routes = navigation.getState()?.routes;
      const prevRoute = routes?.[routes.length - 2];
      
      if (prevRoute) {
        // 设置前一个屏幕的参数
        navigation.navigate(prevRoute.name, {
          ...prevRoute.params,
          returnedImageId: currentImage?.id,
        });
      } else {
        navigation.goBack();
      }
    } else {
      navigation.goBack();
    }
  };

  // ==================== 图片操作 ====================

  /**
   * 删除/标记待处置（根据当前分类判断）
   */
  const handleDelete = () => {
    if (!currentImage || !currentImage.id) {
      Alert.alert('错误', '图片信息不完整，无法操作');
      return;
    }
    
    const isToBeCleanedCategory = currentImage.category === 'tobecleaned';
    
    if (isToBeCleanedCategory) {
      // 如果当前分类是 tobecleaned，执行真正的删除
      logger.debug('当前分类是tobecleaned，执行删除操作...');
    Alert.alert(
      '确认删除',
        '确定要删除这张图片吗？\n\n⚠️ 注意：这将永久删除相册中的文件，无法恢复！',
        [
          { 
            text: '取消', 
            style: 'cancel',
            onPress: () => logger.debug('用户取消删除')
          },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
              logger.debug('用户确认删除，开始删除流程...');
              try {
                logger.debug('调用writeDeleteImage方法...');
                const result = await UnifiedDataService.writeDeleteImage(currentImage.id);
                
                logger.debug('删除结果:', result);
              if (result.success) {
                  logger.debug('删除成功，准备返回上一页...');
                  Alert.alert('成功', '图片已删除', [
                    { text: '确定', onPress: goBack },
                  ]);
              } else {
                  logger.error('删除失败:', result.message);
                Alert.alert('删除失败', result.message);
              }
            } catch (error) {
                logger.error('❌ 删除图片失败:', error);
              Alert.alert('错误', '删除失败，请重试');
            }
          },
        },
      ]
    );
    } else {
      // 如果当前分类不是 tobecleaned，标记为待处置
      logger.debug('当前分类不是tobecleaned，标记为待处置...');
      Alert.alert(
        '标记为待处置',
        '确定要将这张图片标记为待处置吗？\n\n图片将被移动到"待处置"分类中。',
        [
          { 
            text: '取消', 
            style: 'cancel',
            onPress: () => logger.debug('用户取消标记为待处置')
          },
          {
            text: '标记',
            onPress: async () => {
              logger.debug('用户确认标记为待处置，开始更新分类...');
              try {
                // 更新分类为 tobecleaned
                await UnifiedDataService.updateImageCategory(
                  currentImage.id, 
                  'tobecleaned', 
                  'manual'
                );
                
                // 清理相似组数据（如果图片在相似组中）
                if (currentImage.similarityGroupIndex) {
                  await UnifiedDataService.removeImageFromSimilarityGroup(
                    currentImage.id, 
                    currentImage.similarityGroupIndex
                  );
                }
                
                // 更新本地状态
      setCurrentImage(prev => ({ 
        ...prev, 
                  category: 'tobecleaned',
                  confidence: 'manual',
                  similarityGroupIndex: null,
                  similarityScore: null,
                  similarityGroupType: null
                }));
                
                logger.debug('标记为待处置成功');
                
                // 重新加载图片列表
                await reloadImageList();
    } catch (error) {
                logger.error('标记为待处置失败:', error);
                Alert.alert('错误', '标记为待处置失败，请重试');
              }
            },
          },
        ]
      );
    }
  };

  /**
   * 获取所有分类（排除 tobecleaned）
   */
  const getAllCategories = () => {
    if (!configService || !configService.isConfigLoaded()) {
      return [];
    }
    
    return configService.getAllCategoriesWithUI()
      .filter(category => category.id !== 'tobecleaned')
      .map(category => {
        let name = category.chinese || category.english || category.id;
        // 将名称改为两行显示（每行2个字）
        if (name.length >= 3) {
          // 3个字或更多：每2个字换行
          const firstLine = name.substring(0, 2);
          const secondLine = name.substring(2);
          name = firstLine + '\n' + secondLine;
        }
        // 2个字或更少：不换行
        return {
          id: category.id,
          name: name,
          icon: '📷',
        };
      });
  };

  /**
   * 切换分类选择器显示
   */
  const toggleCategorySelector = () => {
    setShowActions(!showActions);
  };

  /**
   * 处理分类修改
   */
  const handleCategoryChange = async (newCategory) => {
    if (newCategory === currentImage.category) {
      return; // 如果选择的是当前分类，不做任何操作
    }

    try {
      logger.debug('修改分类前检查currentImage:', {
        hasIdCard: !!currentImage.idCardDetections,
        hasGeneral: !!currentImage.generalDetections,
      });
      
      // 使用专门的分类更新接口
      await UnifiedDataService.updateImageCategory(
        currentImage.id, 
        newCategory, 
        'manual'
      );
      
      // 更新本地状态
      setCurrentImage(prev => ({ 
        ...prev, 
        category: newCategory,
        confidence: 'manual'
      }));
      
      logger.debug('分类修改成功');
      
      // 自动关闭分类选择器
      setShowActions(false);
      
      // 重新加载图片列表（如果是从分类页进入的）
      if (category && category !== newCategory) {
        logger.debug('分类已改变，重新加载图片列表');
        await reloadImageList();
      }
    } catch (error) {
      logger.error('修改分类失败:', error);
      Alert.alert('错误', '修改分类失败，请重试');
    }
  };


  // ==================== 渲染函数 ====================

  /**
   * 渲染顶部导航栏
   */
  const renderHeader = () => {
    const { displayIndex, displayTotal } = getDisplayNumbers();
    const categoryName = currentImage?.category ? getCategoryDisplayName(currentImage.category) : '';

  return (
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.headerButton}>
          <Text style={styles.headerIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>
            {displayIndex} / {displayTotal}
          </Text>
          {categoryName && (
            <Text style={styles.headerCategory}>
              {categoryName}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={() => setShowInfo(!showInfo)} style={styles.headerButton}>
          <Text style={styles.headerIcon}>ℹ️</Text>
        </TouchableOpacity>
      </View>
    );
  };

  /**
   * 渲染图片信息（与 PC 端保持一致）
   */
  const renderImageInfo = () => {
    if (!showInfo) return null;

    const imageDimensions = currentImage.imageDimensions;

  return (
      <View style={styles.infoPanel}>
        <View style={styles.infoPanelHeader}>
          <Text style={styles.infoPanelTitle}>图片信息</Text>
          <TouchableOpacity onPress={() => setShowInfo(false)}>
            <Text style={styles.infoPanelClose}>✕</Text>
        </TouchableOpacity>
      </View>

        <ScrollView style={styles.infoContent}>
          {/* 基本信息 */}
            <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>拍摄时间:</Text>
            <Text style={styles.infoValue}>
              {currentImage.takenAt ? formatDate(currentImage.takenAt) : '未知'}
              </Text>
            </View>

            <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>文件时间:</Text>
            <Text style={styles.infoValue}>
              {currentImage.timestamp ? formatDate(currentImage.timestamp) : '未知'}
            </Text>
          </View>

          {/* GPS 位置信息 */}
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
            <Text style={styles.infoLabel}>文件路径:</Text>
            <Text style={styles.infoValue} numberOfLines={3}>
              {currentImage.uri ? currentImage.uri.replace('file://', '') : '未知'}
              </Text>
            </View>

            <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>尺寸:</Text>
            <Text style={styles.infoValue}>
                {imageDimensions ? 
                  `${imageDimensions.width} × ${imageDimensions.height}` : 
                '未知'
                }
              </Text>
            </View>

            <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>大小:</Text>
            <Text style={styles.infoValue}>
              {formatFileSize(currentImage.size)}
              </Text>
            </View>

            <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>分类:</Text>
            <Text style={styles.infoValue}>
              {getCategoryDisplayName(currentImage.category)}
                {currentImage.confidence === 'manual' ? ' (人工)' : 
                 currentImage.confidence ? ` (${(currentImage.confidence * 100).toFixed(1)}%)` : ''}
              </Text>
            </View>

          {/* 检测结果 */}
          {(currentImage.idCardDetections && currentImage.idCardDetections.length > 0) ||
           (currentImage.generalDetections && currentImage.generalDetections.length > 0) ||
           (currentImage.mobileNetV3Detections && currentImage.mobileNetV3Detections.predictions && currentImage.mobileNetV3Detections.predictions.length > 0) ? (
              <>
                <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>🔍 检测结果:</Text>
                <Text style={styles.infoValue}>
                  {currentImage.message && currentImage.message !== '图像分类完成' ? 
                    currentImage.message : 
                    `${((currentImage.idCardDetections?.length || 0) + (currentImage.generalDetections?.length || 0) + (currentImage.mobileNetV3Detections?.predictions?.length || 0))} 个物体`
                    }
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
                    </View>
                  ))}
                  </View>
                )}
                
              {/* 通用物体检测结果 */}
              {currentImage.generalDetections && currentImage.generalDetections.length > 0 && (
                <View style={styles.detectionSection}>
                  <Text style={styles.detectionTitle}>🌐 通用物体检测:</Text>
                  {currentImage.generalDetections.slice(0, 5).map((detection, index) => {
                    const objectInfo = configService.getYoloObjectById(detection.classId);
                    const className = objectInfo ? objectInfo.chinese || objectInfo.english : `Class ${detection.classId}`;
                    
                    return (
                      <View key={index} style={styles.detectionItem}>
                        <Text style={styles.detectionText}>
                          {className} ({(detection.confidence * 100).toFixed(1)}%)
                    </Text>
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
              <Text style={styles.infoValue}>
                {currentImage.message && currentImage.message !== '图像分类完成' ? 
                  currentImage.message : 
                  '未检测到物体'
                }
              </Text>
            </View>
          )}
        </ScrollView>
          </View>
    );
  };

  /**
   * 渲染底部操作栏
   */
  const renderActions = () => {
    const isToBeCleanedCategory = currentImage?.category === 'tobecleaned';
    
    return (
      <View style={styles.actionsBar}>
        {/* 删除/暂存按钮（根据当前分类显示） */}
        <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
          <Text style={styles.actionIcon}>{isToBeCleanedCategory ? '🗑️' : '📦'}</Text>
          <Text style={styles.actionLabel}>{isToBeCleanedCategory ? '删除' : '暂存'}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={toggleCategorySelector}>
          <Text style={styles.actionIcon}>🏷️</Text>
          <Text style={styles.actionLabel}>分类</Text>
        </TouchableOpacity>
        </View>
    );
  };

  /**
   * 渲染分类选择器（覆盖在图片底部）
   */
  const renderCategorySelector = () => {
    if (!showActions) return null;

    const categories = getAllCategories();
    
    logger.debug('渲染分类选择器:', {
      currentCategory: currentImage?.category,
      categories: categories.map(c => c.id)
    });

    return (
      <View style={styles.categorySelector}>
        <View style={styles.categoryGrid}>
          {categories.map((cat) => {
            const isSelected = currentImage?.category === cat.id;
            logger.debug(`分类 ${cat.id}: ${isSelected ? '选中' : '未选中'}`);
            
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryItem,
                  isSelected && styles.selectedCategory
                ]}
                onPress={() => handleCategoryChange(cat.id)}
              >
                <Text style={[
                  styles.categoryName,
                  isSelected && styles.selectedCategoryText
                ]}>{cat.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  /**
   * 渲染导航箭头（已移除）
   * 现代移动端设计趋势：完全移除导航按钮，使用纯手势操作
   * 用户可以通过左右滑动来切换图片，更符合现代APP的设计理念
   */
  const renderNavigationArrows = () => {
    // 完全移除导航按钮，使用手势操作
    return null;
  };

  // ==================== 主渲染 ====================

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航栏 */}
      {renderHeader()}

      {/* 主图片区域 */}
      <View style={styles.imageContainer}>
        <FlatList
          ref={flatListRef}
          data={allImagesState}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item, index) => item.id || `image-${index}`}
          getItemLayout={(data, index) => ({
            length: SCREEN_WIDTH,
            offset: SCREEN_WIDTH * index,
            index,
          })}
          onMomentumScrollEnd={(e) => {
            const offsetX = e.nativeEvent.contentOffset.x;
            const index = Math.round(offsetX / SCREEN_WIDTH);
            if (index !== currentImageIndex) {
              setCurrentImageIndex(index);
            }
          }}
          renderItem={({ item, index }) => (
            <View style={styles.imagePage}>
              <Image
                source={{ uri: item.uri }}
                style={styles.image}
                resizeMode="contain"
                onError={(e) => {
                  logger.error(`❌ 图片[${index}]加载失败: ${e.nativeEvent.error}`);
                }}
              />
          </View>
          )}
        />

        {/* 导航箭头 */}
        {renderNavigationArrows()}

        {/* 分类选择器（覆盖在图片底部） */}
        {renderCategorySelector()}
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
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  headerCategory: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
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
  imagePlaceholder: {
    width: SCREEN_WIDTH,
    height: '100%',
    backgroundColor: '#000000',
  },
  
  // 导航箭头样式已移除 - 使用纯手势操作
  
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
  
  // 检测结果样式
  detectionSection: {
    marginTop: 8,
    paddingLeft: 80,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3A3A3C',
  },
  detectionTitle: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 4,
  },
  detectionItem: {
    paddingVertical: 2,
  },
  detectionText: {
    fontSize: 13,
    color: '#FFFFFF',
  },
  detectionMore: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4,
    fontStyle: 'italic',
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
  
  // 分类选择器
  categorySelector: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(28, 28, 30, 0.95)',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#3A3A3C',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 8,
  },
  categoryItem: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    backgroundColor: 'rgba(58, 58, 60, 0.5)',
    width: 52,
    minHeight: 50,
  },
  selectedCategory: {
    borderColor: '#007AFF',
    borderWidth: 2,
    backgroundColor: 'rgba(0, 122, 255, 0.3)',
  },
  categoryName: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 48,
  },
  selectedCategoryText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});

export default ImagePreviewScreen;
