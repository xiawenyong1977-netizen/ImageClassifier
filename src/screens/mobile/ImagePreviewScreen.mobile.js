/**
 * 芯图相册 - 移动端图片预览页
 * 
 * 功能：
 * 1. 全屏显示图片
 * 2. 左右滑动切换
 * 3. 缩放和平移
 * 4. 显示图片信息
 * 5. 图片操作（删除、暂存、重新分类、分享、照片创玩）
 */

import React, { useState, useRef, useCallback } from 'react';
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
  Share,
  NativeModules,
} from 'react-native';
import { SafeAreaView, Alert } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import WeChatAuthService from '../../services/WeChatAuthService';
import configService from '../../services/ConfigService';
import { logger, getUri, getLocalPath } from '../../adapters/WebAdapters';

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
  const [showEnhancePresets, setShowEnhancePresets] = useState(false);
  const [enhancePresets, setEnhancePresets] = useState({});
  const flatListRef = useRef(null);

  // 使用 getUri 统一获取图片 URI
  const resolveImageUri = useCallback((image) => {
    if (!image) return null;
    return getUri(image);
  }, []);

  const resolveLocalPath = useCallback((image) => {
    if (!image) return null;
    
    // 使用getLocalPath获取path（可能是相对路径或绝对路径）
    // getLocalPath会自动处理拼装格式（contentUri||path），提取path部分
    // 如果image.uri是file:// URI，getLocalPath也会自动处理
    const path = getLocalPath(image);
    if (path) {
      return path;
    }
    
    // 最后的回退：直接使用image.path字段（如果有）
    return image.path || null;
  }, []);

  // 获取图片尺寸（优先使用数据库中的）
  const imageDimensions = currentImage?.imageDimensions || 
    (currentImage?.width && currentImage?.height ? 
      { width: currentImage.width, height: currentImage.height } : null);
  const displayUri = resolveImageUri(currentImage);
  const displayLocalPath = resolveLocalPath(currentImage);
  
  // 调试：检查当前图片是否有效
  React.useEffect(() => {
    if (!currentImage || !displayUri) {
      logger.error(`⚠️ 当前图片无效！索引：${currentImageIndex}，总数：${allImagesState.length}`);
      logger.error('当前图片对象:', currentImage);
    } else {
      logger.debug(`✅ 当前图片：索引${currentImageIndex}/${allImagesState.length}，URI: ${displayUri?.substring(0, 50)}...`);
    }
  }, [currentImageIndex, currentImage, allImagesState.length, displayUri]);

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
      // 检查索引是否有效，如果无效则自动调整
      if (currentImageIndex < 0 || currentImageIndex >= allImagesState.length) {
        if (allImagesState.length > 0) {
          // 自动调整索引到有效范围（如果超出范围，调整到最后一张）
          const adjustedIndex = currentImageIndex >= allImagesState.length 
            ? allImagesState.length - 1 
            : Math.max(0, currentImageIndex);
          logger.debug(`图片索引无效：${currentImageIndex}/${allImagesState.length}，自动调整到：${adjustedIndex}`);
          setCurrentImageIndex(adjustedIndex);
          return; // 等待索引更新后重新触发 useEffect
        } else {
          // 列表为空，无法加载
          logger.warn(`图片索引无效：${currentImageIndex}/${allImagesState.length}，列表为空，跳过详情加载`);
          return;
        }
      }
      
      const imageData = allImagesState[currentImageIndex];
      if (!imageData || !imageData.id) {
        logger.warn(`图片数据无效（索引${currentImageIndex}），跳过详情加载`);
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
      
      // 调整当前索引（在更新列表之前）
      let newIndex = currentImageIndex;
      if (currentImageIndex >= updatedImages.length) {
        // 如果当前索引超出范围，跳到最后一张
        newIndex = Math.max(0, updatedImages.length - 1);
        logger.debug(`索引超出范围，调整到最后一张：${newIndex}`);
      }
      
      // 使用函数式更新确保索引和列表同步更新，避免 useEffect 在索引更新前执行
      setAllImagesState(updatedImages);
      if (newIndex !== currentImageIndex) {
        // 使用函数式更新，确保使用最新的列表状态
        setCurrentImageIndex(prevIndex => {
          // 再次检查，确保索引在有效范围内
          if (prevIndex >= updatedImages.length && updatedImages.length > 0) {
            const adjustedIndex = updatedImages.length - 1;
            logger.debug(`函数式更新：调整索引：${prevIndex} → ${adjustedIndex}`);
            return adjustedIndex;
          }
          return newIndex;
        });
      }
      
      // 滚动到正确位置
      if (flatListRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToIndex({
            index: newIndex,
            animated: true
          });
        }, 100);
      }
      
      return true;
    } catch (error) {
      logger.error('❌ 重新加载图片列表失败:', error);
      return false;
    }
  };

  /**
   * 重新加载图片列表并处理索引调整（公共函数）
   * @param {string} operationDescription - 操作描述，用于日志（如："删除"、"标记为待处置"、"修改分类"）
   * @returns {Promise<boolean>} - 是否成功重新加载
   */
  const reloadImageListWithIndexAdjustment = async (operationDescription) => {
    // 保存当前索引，用于判断是否是最后一张
    const wasLastImage = currentImageIndex === allImagesState.length - 1;
    
    // 重新加载图片列表（reloadImageList 会处理索引调整）
    const reloadSuccess = await reloadImageList();
    
    // 如果删除的是最后一张，使用函数式更新确保索引正确
    // 使用 setTimeout 确保状态更新完成后再检查
    if (reloadSuccess && wasLastImage) {
      setTimeout(() => {
        // 使用函数式更新获取最新的列表状态并调整索引
        setAllImagesState(prevList => {
          setCurrentImageIndex(prevIndex => {
            if (prevIndex >= prevList.length && prevList.length > 0) {
              const adjustedIndex = prevList.length - 1;
              logger.debug(`${operationDescription}最后一张后，调整索引：${prevIndex} → ${adjustedIndex}`);
              return adjustedIndex;
            }
            return prevIndex;
          });
          return prevList;
        });
      }, 50);
    }
    
    return reloadSuccess;
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
                logger.debug('调用writeDeleteImages方法...');
                const result = await UnifiedDataService.writeDeleteImages([currentImage.id]);
                
                logger.debug('删除结果:', result);
              if (result.success) {
                  logger.debug('删除成功，准备更新列表...');
                  
                  // 重新加载图片列表并处理索引调整
                  const reloadSuccess = await reloadImageListWithIndexAdjustment('删除');
                  
                  // 如果列表为空，reloadImageList 已经处理了返回上一页的逻辑
                  // 如果列表不为空，继续浏览
                  if (reloadSuccess) {
                    // 显示成功提示，但不自动返回
                    Alert.alert('成功', '图片已删除');
                  } else {
                    // 列表为空，reloadImageList 已经处理了返回逻辑，这里不需要额外操作
                    logger.debug('列表已空，已返回上一页');
                  }
              } else {
                  // 删除失败通常是权限问题，属于正常情况，使用 debug 级别
                  logger.debug('删除失败（可能是权限问题）:', result);
                Alert.alert('删除失败', `删除失败，请检查文件权限`);
              }
            } catch (error) {
                // 删除失败通常是权限问题，属于正常情况，使用 debug 级别
                logger.debug('删除图片失败（可能是权限问题）:', error);
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
                // 更新分类为 tobecleaned（服务层会自动清理相似组信息）
                await UnifiedDataService.updateImagesCategory([currentImage.id], 'tobecleaned', 'manual');
                
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
                
                // 重新加载图片列表并处理索引调整
                await reloadImageListWithIndexAdjustment('标记为待处置');
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
      await UnifiedDataService.updateImagesCategory([currentImage.id], newCategory, 'manual');
      
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
        await reloadImageListWithIndexAdjustment('修改分类');
      }
    } catch (error) {
      logger.error('修改分类失败:', error);
      Alert.alert('错误', '修改分类失败，请重试');
    }
  };

  /**
   * 分享当前图片
   */
  const handleShare = async () => {
    const shareUri = resolveImageUri(currentImage);
    if (!currentImage || !shareUri) {
      Alert.alert('错误', '图片信息不完整，无法分享');
      return;
    }

    try {
      const urls = [shareUri];
      
      // 优先尝试使用原生模块分享（支持单张和多张）
      const { MultiImageShareModule } = NativeModules;
      if (MultiImageShareModule && MultiImageShareModule.shareMultipleImages) {
        // 使用原生模块分享
        await MultiImageShareModule.shareMultipleImages(urls);
        logger.debug('✅ 原生模块分享成功');
      } else {
        // 原生模块不可用，使用React Native Share
        // 添加 title 参数，让微信等分享目标显示"来自：芯图相册"
        const result = await Share.share({
          url: shareUri,
          title: '芯图相册',
        });
        
        if (result.action === Share.sharedAction) {
          logger.debug('✅ 分享成功');
        } else if (result.action === Share.dismissedAction) {
          logger.debug('用户取消分享');
        }
      }
    } catch (error) {
      logger.error('❌ 分享失败:', error);
      Alert.alert('分享失败', '分享失败，请重试');
    }
  };

  /**
   * 打开照片创玩面板
   */
  const openEnhancePanel = async () => {
    try {
      // 切换展开/收起
      if (showEnhancePresets) {
        setShowEnhancePresets(false);
        return;
      }
      const settings = await UnifiedDataService.readSettings();
      const presets = settings?.aiEnhancePresets || {};
      setEnhancePresets(presets);
      setShowEnhancePresets(true);
    } catch (error) {
      logger.error('加载增强方案失败:', error);
      Alert.alert('错误', '加载增强方案失败，请稍后重试');
    }
  };

  /**
   * 点击增强方案：数量与额度检查
   */
  const handleEnhancePresetPress = async (presetId) => {
    try {
      const count = 1; // 单张图片
      
      // 会员状态检查
      const { isMember } = await WeChatAuthService.getMembershipStatus();
      if (!isMember) {
        Alert.alert('提示', '该功能仅对会员开放，请在设置页面开通终身会员后再试。');
        return;
      }

      // 额度检查
      const credits = await WeChatAuthService.getCredits();
      if (!credits || typeof credits.remaining !== 'number') {
        Alert.alert('错误', '获取额度失败，请稍后重试');
        return;
      }
      if (credits.remaining < count) {
        Alert.alert('提示', '剩余额度不足，请去"芯图相册"服务号购买额度');
        return;
      }

      // 弹出二次确认：显示剩余额度与本次消耗额度
      Alert.alert(
        '使用额度确认',
        `本次将消耗：${count}\n剩余额度：${credits.remaining}\n\n是否继续？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '确认',
            style: 'default',
            onPress: async () => {
              try {
                setShowEnhancePresets(false);
                const presetName = (enhancePresets && enhancePresets[presetId] && enhancePresets[presetId].name) ? enhancePresets[presetId].name : presetId;
                await performEnhance(presetId, presetName);
              } catch (e) {
                logger.error('提交增强失败:', e);
                Alert.alert('错误', e.message || '提交失败，请稍后重试');
              }
            }
          }
        ]
      );
    } catch (error) {
      logger.error('增强检查失败:', error);
      Alert.alert('错误', error.message || '操作失败，请稍后重试');
    }
  };

  /**
   * 执行增强
   */
  const performEnhance = async (presetId, presetDisplayName) => {
    try {
      logger.debug('准备提交增强任务', { presetId, count: 1 });
      
      const enhanceUri = resolveImageUri(currentImage);
      if (!currentImage || !currentImage.id || !enhanceUri) {
        Alert.alert('错误', '图片信息不完整');
        return;
      }

      const selectedItems = [{ id: currentImage.id, uri: enhanceUri }];

      // 直接导航到结果页，任务提交和轮询在结果页中处理
      if (typeof navigation !== 'undefined') {
        navigation.navigate('EnhanceResult', {
          presetName: presetDisplayName,
          presetId: presetId,
          selected: selectedItems,
          results: {},
          initialIndex: 0,
        });
      }
    } catch (error) {
      logger.error('导航到结果页失败:', error);
      Alert.alert('错误', error.message || '操作失败，请稍后重试');
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
              {displayLocalPath || (displayUri ? displayUri.replace('file://', '') : '未知')}
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
   * 渲染照片创玩面板
   */
  const renderEnhancePanel = () => {
    if (!showEnhancePresets) return null;

    return (
      <View style={styles.enhancePanel}>
        <ScrollView
          style={styles.enhanceList}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          contentContainerStyle={styles.enhanceListContent}
        >
          {Object.entries(enhancePresets)
            .sort(([, a], [, b]) => (a?.sortOrder || 0) - (b?.sortOrder || 0))
            .map(([presetId, preset], index) => (
              <TouchableOpacity
                key={presetId}
                style={[
                  styles.enhancePresetItem,
                  ((index + 1) % 4 !== 0) && { marginRight: 6 },
                ]}
                onPress={() => handleEnhancePresetPress(presetId)}
              >
                <Text style={styles.presetName} numberOfLines={1}>
                  {preset.name || presetId}
                </Text>
              </TouchableOpacity>
          ))}
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
        {/* 照片创玩面板 */}
        {isToBeCleanedCategory && renderEnhancePanel()}
        
        {/* 删除/暂存按钮（根据当前分类显示） */}
        <TouchableOpacity style={styles.actionButton} onPress={handleDelete}>
          <Text style={styles.actionIcon}>{isToBeCleanedCategory ? '🗑️' : '📦'}</Text>
          <Text style={styles.actionLabel}>{isToBeCleanedCategory ? '删除' : '暂存'}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.actionButton} onPress={toggleCategorySelector}>
          <Text style={styles.actionIcon}>🏷️</Text>
          <Text style={styles.actionLabel}>分类</Text>
        </TouchableOpacity>
        
        {/* 照片创玩按钮（仅在暂存箱显示） */}
        {isToBeCleanedCategory && (
          <TouchableOpacity style={styles.actionButton} onPress={openEnhancePanel}>
            <Text style={styles.actionIcon}>✨</Text>
            <Text style={styles.actionLabel}>照片创玩</Text>
          </TouchableOpacity>
        )}
        
        {/* 分享按钮 */}
        <TouchableOpacity style={styles.actionButton} onPress={handleShare}>
          <Text style={styles.actionIcon}>📤</Text>
          <Text style={styles.actionLabel}>分享</Text>
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
          renderItem={({ item, index }) => {
            const itemUri = resolveImageUri(item);
            return (
              <View style={styles.imagePage}>
                {itemUri ? (
                  <Image
                    source={{ uri: itemUri }}
                    style={styles.image}
                    resizeMode="contain"
                    onError={(e) => {
                      logger.error(`❌ 图片[${index}]加载失败: ${e.nativeEvent.error}`);
                    }}
                  />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}>
                    <Text style={styles.placeholderText}>无法加载图片</Text>
                  </View>
                )}
            </View>
            );
          }}
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
    backgroundColor: '#1C1C1E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#8E8E93',
    fontSize: 14,
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
    position: 'relative',
    flexDirection: 'row',
    backgroundColor: 'rgba(28, 28, 30, 0.9)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    justifyContent: 'space-around',
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
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
  
  // 照片创玩面板
  enhancePanel: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 88,
    backgroundColor: 'rgba(28, 28, 30, 0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  enhanceList: {
    maxHeight: 96,
    marginTop: 6,
  },
  enhanceListContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    paddingHorizontal: 0,
  },
  enhancePresetItem: {
    width: (SCREEN_WIDTH - 36 - 6 * 3) / 4,
    height: 44,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2C2C2E',
    backgroundColor: 'rgba(44, 44, 46, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
});

export default ImagePreviewScreen;
