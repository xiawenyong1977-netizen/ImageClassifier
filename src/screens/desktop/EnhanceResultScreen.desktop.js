import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import i18n, { getDefaultPresets } from '../../i18n';
import { View, Text, StyleSheet, Image, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { Alert, logger, getUri } from '../../adapters/WebAdapters';
import UnifiedDataService from '../../services/UnifiedDataService';
import ImageEnhanceService from '../../services/ImageEnhanceService';
import WeChatAuthService from '../../services/WeChatAuthService';

/**
 * EnhanceResultScreen - 照片创玩结果展示屏幕（桌面端）
 * 参照移动端实现，自己处理完整的增强流程
 * 
 * Props:
 * - visible: boolean - 是否显示
 * - onClose: function - 关闭回调
 * - preset: string - 预设方案ID（必须）
 * - availablePresets: Array<{id: string, name: string}> | Object - 可用预设列表
 * - selectedImages: Array<{id: string, uri: string, fileName: string}> - 选中的图片（必须）
 * - initialIndex?: number - 初始图片索引（可选，默认0）
 * - allImages: Array - 所有图片列表（用于查找原图信息，可选）
 * - categoryImages: Array - 当前分类图片列表（用于查找原图信息，可选，优先使用）
 * - onDataChange: function - 数据变化回调（可选）
 * - isInStagingBox: boolean - 当前图片是否在暂存箱（可选）
 */
const EnhanceResultScreen = ({
  visible,
  onClose,
  preset,
  availablePresets = [],
  selectedImages = [],
  initialIndex = 0,
  allImages = [],
  categoryImages = [],
  onDataChange,
  isInStagingBox = false
}) => {
  const { t } = useTranslation('common');
  
  // 内部状态管理
  const [currentIndex, setCurrentIndex] = useState(Math.min(Math.max(initialIndex, 0), Math.max(selectedImages.length - 1, 0)));
  const [internalResults, setInternalResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    status: 'idle',
    imageStatuses: []
  });
  
  // 跟踪是否有保存操作
  const hasSavedRef = useRef(false);
  const abortControllerRef = useRef(null);
  const hasStartedRef = useRef(false); // 防止重复启动
  
  // 当 visible 变为 false 时重置状态
  useEffect(() => {
    if (!visible) {
      hasSavedRef.current = false;
      hasStartedRef.current = false;
      // 取消正在进行的任务
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [visible]);
  
  // 当 visible 变为 true 且索引变化时，更新 currentIndex
  useEffect(() => {
    if (visible && initialIndex !== undefined) {
      setCurrentIndex(Math.min(Math.max(initialIndex, 0), Math.max(selectedImages.length - 1, 0)));
    }
  }, [visible, initialIndex, selectedImages.length]);
  
  // 提交任务并开始轮询（参照移动端实现）
  useEffect(() => {
    // 如果不可见、没有预设、没有图片、或已经启动过，不执行
    if (!visible || !preset || selectedImages.length === 0 || hasStartedRef.current) {
      return;
    }
    
    // 如果已经有结果，不重新提交
    if (internalResults.length > 0 && internalResults.some(r => r.status === 'success' || r.status === 'completed')) {
      return;
    }

    const submitAndPoll = async () => {
      try {
        logger.debug('🚀 开始提交增强任务', { preset, count: selectedImages.length });
        
        // 🔥 移除额度检查（入口已经检查过了，不需要重复检查）
        
        // 初始化所有图片为 processing 状态
        const initialResults = selectedImages.map((img, index) => ({
          status: 'pending',
          originalImageId: img.id,
          originalUri: getUri(img),
          originalFileName: img.fileName || 'enhanced.jpg'
        }));
        setInternalResults(initialResults);
        setIsProcessing(true);
        setProgress({
          current: 0,
          total: selectedImages.length,
          status: 'processing',
          imageStatuses: []
        });
        
        // 创建 AbortController 用于取消轮询
        abortControllerRef.current = new AbortController();
        
        // 1. 预处理所有图片
        logger.debug(`📦 开始预处理 ${selectedImages.length} 张图片...`);
        const preparedImages = [];
        
        for (let i = 0; i < selectedImages.length; i++) {
          const image = selectedImages[i];
          logger.debug(`  预处理 ${i + 1}/${selectedImages.length}: ${image.fileName || image.id}`);
          
          try {
            const imageUri = getUri(image);
            if (!imageUri) {
              throw new Error(`${t('imagePreview.cannotGetImageUriError')}: ${image.fileName || image.id}`);
            }
            const preparedImage = await ImageEnhanceService.prepareImageForEnhance(imageUri);
            preparedImages.push({
              ...preparedImage,
              originalImage: image  // 保存原始图片信息
            });
          } catch (error) {
            logger.error(`预处理失败: ${image.fileName || image.id}`, error);
            // 预处理失败的图片跳过
          }
        }
        
        if (preparedImages.length === 0) {
          throw new Error(t('imagePreview.allImagesFailedMessage'));
        }
        
        logger.debug(`✅ 预处理完成: ${preparedImages.length}/${selectedImages.length} 张`);
        
        // 2. 提交任务
        const taskResult = await ImageEnhanceService.submitEnhanceTask(
          preparedImages,
          preset
        );
        
        logger.debug(`✅ 批量任务已提交: taskId=${taskResult.task_id}, total=${taskResult.total_images}`);
        
        // 立即更新UI，显示任务已开始
        setProgress({
          current: 0,
          total: taskResult.total_images,
          status: 'processing',
          progress: 0,
          imageStatuses: []
        });
        
        // 3. 轮询任务状态
        let pollCount = 0;
        const enhanceResult = await ImageEnhanceService.pollTaskStatus(
          taskResult.task_id,
          (status) => {
            pollCount++;
            
            // 基于 completed_images 和 status 更新进度
            const completedImages = status.completed_images || 0;
            
            // 计算进度百分比
            let progressPercent = 0;
            if (completedImages > 0) {
              progressPercent = (completedImages / taskResult.total_images) * 100;
            } else if (status.status === 'processing') {
              const estimatedCurrent = Math.min(pollCount * 0.2, taskResult.total_images);
              progressPercent = (estimatedCurrent / taskResult.total_images) * 100;
            }
            
            // 解析每张图片的实时状态
            const imageStatuses = (status.results || []).filter(img => img != null);
            
            setProgress({
              current: completedImages > 0 ? completedImages : Math.floor(pollCount * 0.2),
              total: taskResult.total_images,
              status: status.status === 'completed' ? 'completed' : 'processing',
              progress: progressPercent,
              imageStatuses: imageStatuses
            });
            
            // 实时更新已完成图片的URI到internalResults
            setInternalResults(prevResults => {
              const newResults = [...prevResults];
              let hasUpdate = false;
              
              imageStatuses.forEach((imgStatus) => {
                if (!imgStatus || imgStatus.index == null) return;
                const index = imgStatus.index;
                
                if (imgStatus.status === 'completed' && imgStatus.result_url) {
                  if (index < 0 || index >= selectedImages.length) return;
                  
                  const originalImage = selectedImages[index];
                  if (originalImage) {
                    const enhancedUrl = imgStatus.result_url || imgStatus.url || imgStatus.enhanced_url;
                    const originalImageUri = getUri(originalImage);
                    
                    if (!newResults[index] || !newResults[index].enhancedUri) {
                      newResults[index] = {
                        ...newResults[index],
                        originalImageId: originalImage.id,
                        originalUri: originalImageUri,
                        originalFileName: originalImage.fileName || 'enhanced.jpg',
                        enhancedUri: enhancedUrl,
                        taskId: taskResult.task_id,
                        preset: preset,
                        status: 'success'
                      };
                      hasUpdate = true;
                    }
                  }
                } else if (imgStatus.status === 'failed') {
                  if (index < 0 || index >= selectedImages.length) return;
                  
                  newResults[index] = {
                    ...newResults[index],
                    status: 'failed',
                    errorMessage: imgStatus.error || t('common.failed')
                  };
                  hasUpdate = true;
                }
              });
              
              return hasUpdate ? newResults : prevResults;
            });
            
            logger.debug(`📊 进度更新 [轮询${pollCount}次]: ${completedImages}/${taskResult.total_images} (${progressPercent.toFixed(1)}%)`);
          },
          abortControllerRef.current?.signal
        );
        
        logger.debug(`✅ 任务完成，收到 ${enhanceResult.results?.length || 0} 个结果`);
        
        // 清理 AbortController
        if (abortControllerRef.current) {
          abortControllerRef.current = null;
        }
        
        // 4. 处理最终结果
        let successCount = 0;
        let failedCount = 0;
        const finalResults = [];
        
        if (enhanceResult.results && enhanceResult.results.length > 0) {
          enhanceResult.results.forEach((result, index) => {
            const originalImage = preparedImages[index]?.originalImage || selectedImages[index];
            const enhancedUrl = result.result_url || result.url || result.enhanced_url || result.image_url || result.output_url;
            
            if (result.status === 'completed' && enhancedUrl && originalImage) {
              const originalImageUri = getUri(originalImage);
              finalResults.push({
                originalImageId: originalImage.id,
                originalUri: originalImageUri,
                originalFileName: originalImage.fileName || 'enhanced.jpg',
                enhancedUri: enhancedUrl,
                taskId: taskResult.task_id,
                preset: preset,
                status: 'success'
              });
              successCount++;
            } else if (originalImage) {
              const originalImageUri = getUri(originalImage);
              finalResults.push({
                originalImageId: originalImage.id,
                originalUri: originalImageUri,
                originalFileName: originalImage.fileName || 'enhanced.jpg',
                status: 'failed',
                errorMessage: result.error || t('common.failed')
              });
              failedCount++;
            }
          });
        }
        
        // 更新最终结果
        setInternalResults(finalResults);
        setIsProcessing(false);
        setProgress(prev => ({
          ...prev,
          status: 'completed',
          current: successCount,
          total: finalResults.length
        }));
        
        if (finalResults.length === 0 || finalResults.every(r => r.status === 'failed')) {
          Alert.alert(t('imagePreview.operationComplete'), t('imagePreview.allImagesFailedMessage'));
        }
        
      } catch (error) {
        // 清理 AbortController
        if (abortControllerRef.current) {
          abortControllerRef.current = null;
        }
        setIsProcessing(false);
        setProgress(prev => ({
          ...prev,
          status: 'failed'
        }));
        
        // 如果是用户取消操作，不显示错误提示
        if (error.message && error.message.includes('轮询已被用户取消')) {
          logger.debug('🛑 用户取消了增强任务');
          return;
        }
        
        logger.error('❌ 增强处理失败:', error);
        if (visible) {
          Alert.alert(t('common.errorTitle'), t('imagePreview.processFailed', { error: error.message }));
        }
      }
    };
    
    // 标记已启动，防止重复
    hasStartedRef.current = true;
    submitAndPoll();
    
    // 清理函数：组件卸载或 visible 变为 false 时取消任务
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [visible, preset, selectedImages.length]); // 只在 visible、preset 或图片数量变化时重新执行
  
  // 使用内部状态
  const currentResults = internalResults;
  
  // 更新结果的统一方法（只更新内部状态）
  const updateResult = (index, updatedResult) => {
    setInternalResults(prev => 
      prev.map((r, i) => i === index ? { ...r, ...updatedResult } : r)
    );
  };
  // 获取当前图片的信息
  const currentImage = selectedImages[currentIndex] || selectedImages[0] || {};
  const currentResult = currentResults[currentIndex] || {};
  const isFailed = currentResult.status === 'failed';
  const isSaved = currentResult.saved === true;
  
  // 调试日志
  logger.debug(`🔍 EnhanceResultScreen当前图片: index=${currentIndex}, currentResults.length=${currentResults.length}, currentResult=`, {
    status: currentResult.status,
    hasEnhancedUri: !!currentResult.enhancedUri,
    enhancedUri: currentResult.enhancedUri || 'N/A'
  });
  
  // 获取当前预设名称（支持国际化）
  const getPresetName = () => {
    if (!preset) {
      return t('enhanceResult.defaultPresetName');
    }
    
    // 获取当前语言的默认预设翻译
    const currentLang = i18n.language || 'zh';
    const defaultPresets = getDefaultPresets(currentLang);
    const zhDefaults = getDefaultPresets('zh');
    const enDefaults = getDefaultPresets('en');
    
    // 从 availablePresets 中查找预设信息
    let presetInfo = null;
    if (Array.isArray(availablePresets)) {
      presetInfo = availablePresets.find(p => p.id === preset);
    } else if (availablePresets && typeof availablePresets === 'object') {
      presetInfo = availablePresets[preset];
    }
    
    // 如果找到了预设信息
    if (presetInfo && presetInfo.name) {
      // 判断是否是默认预设（通过比较名称是否等于中文或英文的默认值）
      const defaultPreset = defaultPresets[preset];
      const isDefaultName = defaultPreset && (
        presetInfo.name === zhDefaults[preset]?.name ||
        presetInfo.name === enDefaults[preset]?.name
      );
      
      // 如果是默认预设，使用当前语言的翻译；否则使用用户自定义的名称
      return (defaultPreset && isDefaultName) 
        ? defaultPreset.name 
        : presetInfo.name;
    }
    
    // 如果没有找到预设信息，尝试使用默认预设
    const defaultPreset = defaultPresets[preset];
    if (defaultPreset) {
      return defaultPreset.name;
    }
    
    // 最后回退到翻译键
    return t('enhanceResult.defaultPresetName');
  };

  const presetDisplayName = getPresetName();
  
  // 保存增强图片的处理函数
  const handleSaveAndAdd = async () => {
    if (currentResults.length === 0) return;
    
    // 获取当前索引的结果
    const resultToAdd = currentResults[currentIndex];
    if (!resultToAdd) return;
    
    // 检查状态和 enhancedUri
    if (resultToAdd.status !== 'success' && resultToAdd.status !== 'completed') {
      Alert.alert(t('common.tip'), t('enhanceResult.noResultToSave'));
      return;
    }
    
    if (!resultToAdd.enhancedUri) {
      Alert.alert(t('common.tip'), t('enhanceResult.noResultToSave'));
      return;
    }
    
    if (resultToAdd.saved) {
      Alert.alert(t('common.tip'), t('enhanceResult.alreadySaved'));
      return;
    }
    
    try {
      logger.debug('💾 开始保存增强结果:', resultToAdd);
      
      // 1. 下载增强后的图片
      const imageBlob = await ImageEnhanceService.downloadEnhancedImage(resultToAdd.enhancedUri);
      
      // 2. 保存到 xualbum 目录
      const saveResult = await ImageEnhanceService.saveToXualbum(
        imageBlob,
        resultToAdd.originalFileName || 'enhanced.jpg'
      );
      
      logger.debug('✅ 图片已保存到:', saveResult.filePath);
      
      // 3. 拼装 URI 格式：fileUri||filePath（桌面端）
      // fileUri: file:// URI 格式
      // filePath: 绝对路径
      const fileUri = `file:///${saveResult.filePath.replace(/\\/g, '/')}`;
      const filePath = saveResult.filePath;
      const newImageUri = `${fileUri}||${filePath}`;
      
      // 4. 从原图获取完整信息（用于获取检测结果和描述信息）
      // 优先使用 categoryImages，如果没有则使用 allImages
      const imageList = categoryImages.length > 0 ? categoryImages : allImages;
      
      let originalImage = null;
      try {
        if (resultToAdd.originalImageId) {
          originalImage = await UnifiedDataService.readImageDetailsById(resultToAdd.originalImageId);
          logger.debug('✅ 从数据库获取完整原图信息');
        } else if (resultToAdd.originalUri != null) {
          // 如果没有 ID，尝试从图片列表查找
          const targetOriginalUri = getUri(resultToAdd.originalUri);
          if (targetOriginalUri && imageList.length > 0) {
            const tempImage = imageList.find(img => {
              const imgUri = getUri(img);
              return imgUri && targetOriginalUri && imgUri === targetOriginalUri;
            });
            if (tempImage?.id) {
              originalImage = await UnifiedDataService.readImageDetailsById(tempImage.id);
              logger.debug('✅ 通过URI找到ID，从数据库获取完整原图信息');
            }
          }
        }
      } catch (error) {
        logger.warn('⚠️ 从数据库查询原图详细信息失败:', error);
        // 降级到使用精简信息
        if (imageList.length > 0) {
          originalImage = imageList.find(img => {
            if (resultToAdd.originalImageId && img.id === resultToAdd.originalImageId) {
              return true;
            }
            if (resultToAdd.originalUri != null) {
              const imgUri = getUri(img);
              const targetOriginalUri = getUri(resultToAdd.originalUri);
              return imgUri && targetOriginalUri && imgUri === targetOriginalUri;
            }
            return false;
          });
        }
      }
      
      // 5. 添加到数据库（保持原图的分类）
      const timestamp = Date.now();
      
      // 从原图获取尺寸信息（readImageDetailsById 返回的数据已包含 width 和 height）
      const width = originalImage?.width || null;
      const height = originalImage?.height || null;
      
      // 复制原图的所有元数据，只改变 uri 指向新保存的图片
      const completeImageData = {
        uri: newImageUri, // 新保存的图片 URI
        fileName: saveResult.fileName,
        // 复制原图的所有元数据
        category: originalImage?.category || 'other', // 保持原图的分类，如果没有则默认为 other
        confidence: originalImage?.confidence ?? 1.0, // 保持原图的置信度，如果没有则默认为 1.0
        timestamp: timestamp, // 文件时间戳使用新保存的时间
        takenAt: originalImage?.takenAt || timestamp || null, // 保持原图的拍摄时间，如果没有则使用当前时间
        size: imageBlob.size || 0, // 新保存图片的文件大小
        // 🔥 设置 width 和 height（必需字段）
        width: width,
        height: height,
        // 复制原图的所有检测结果和描述信息
        idCardDetections: originalImage?.idCardDetections || [],
        generalDetections: originalImage?.generalDetections || [],
        mobileNetV3Detections: originalImage?.mobileNetV3Detections || null,
        message: originalImage?.message || null,
        // 复制原图的其他元数据
        ...(originalImage?.imageDimensions && { imageDimensions: originalImage.imageDimensions }),
        ...(originalImage?.city && { city: originalImage.city }),
        ...(originalImage?.color && { color: originalImage.color }),
      };
      
      // 验证必要字段
      if (!completeImageData.category) {
        logger.warn('⚠️ 图片数据缺少category，自动设置为other');
        completeImageData.category = 'other';
      }
      if (!completeImageData.timestamp) {
        logger.warn('⚠️ 图片数据缺少timestamp，使用当前时间');
        completeImageData.timestamp = Date.now();
      }
      // 🔥 验证 width 和 height（必需字段）
      if (!completeImageData.width || !completeImageData.height) {
        logger.warn(`⚠️ 图片数据缺少width或height: width=${completeImageData.width}, height=${completeImageData.height}`);
        // 如果缺少尺寸，尝试从新保存的图片中读取（PC端可以使用 ImageProcessor）
        // 但为了不阻塞保存流程，先使用默认值或从原图获取
        if (!completeImageData.width) completeImageData.width = 0;
        if (!completeImageData.height) completeImageData.height = 0;
      }
      
      // 生成预期ID以便后续验证（使用与存储服务相同的算法）
      let expectedImageId;
      try {
        const storageService = UnifiedDataService.imageStorageService;
        if (storageService?.storage?.generateStableId) {
          expectedImageId = storageService.storage.generateStableId(newImageUri);
        } else {
          // 备用算法（与generateStableId相同的逻辑）
          let hash = 0;
          for (let i = 0; i < newImageUri.length; i++) {
            const char = newImageUri.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          expectedImageId = `img_${Math.abs(hash).toString(36)}`;
        }
      } catch (e) {
        logger.warn('⚠️ 生成预期ID失败:', e);
        expectedImageId = null;
      }
      
      // 使用 writeImageDetailedInfo 保存图片数据（服务层会自动刷新缓存）
      await UnifiedDataService.writeImageDetailedInfo([completeImageData], true);
      
      // 缓存刷新已由 writeImageDetailedInfo 处理，不需要手动刷新
      
      // 7. 标记该图片为已保存
      updateResult(currentIndex, { saved: true, savedAt: timestamp });
      
      // 标记有保存操作
      hasSavedRef.current = true;
      
      Alert.alert(t('enhanceResult.saveSuccessTitle'), t('enhanceResult.saveSuccess'));
      
      // 通知父组件数据已变化
      if (onDataChange) {
        onDataChange();
      }
      
    } catch (error) {
      logger.error('❌ 保存失败:', error);
      Alert.alert(t('enhanceResult.saveFailedTitle'), error.message || t('enhanceResult.saveFailed'));
    }
  };

  // 获取图片状态（从内部状态）
  const getImageStatus = (index) => {
    // 优先使用results（处理完成后的最终结果）
    if (currentResults.length > 0 && currentResults[index]) {
      if (currentResults[index].status === 'failed') return 'failed';
      if (currentResults[index].status === 'success' || currentResults[index].status === 'completed') return 'completed';
    }
    
    // 其次使用后端实时状态
    if (progress.imageStatuses && progress.imageStatuses.length > 0) {
      const imageStatus = progress.imageStatuses.find(img => img.index === index);
      if (imageStatus) {
        return imageStatus.status === 'completed' ? 'completed' : 
               imageStatus.status === 'failed' ? 'failed' : 'processing';
      }
    }
    
    // 如果正在处理，根据进度估算
    if (isProcessing) {
      if (index < progress.current) return 'completed';
      if (index === progress.current) return 'processing';
      return 'pending';
    }
    
    return 'pending';
  };

  // 导航按钮处理
  const goToPrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < selectedImages.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  // 大图对比视图
  const renderComparisonView = () => {
    const status = getImageStatus(currentIndex);
    
    // 显示原图
    const renderOriginalImage = () => {
      // 使用 getUri 获取正确的 URI（PC端：file://，移动端：content://）
      const imageUri = getUri(currentImage);
      if (!imageUri) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>{t('enhanceResult.originalImage')}</Text>
              {selectedImages.length > 1 && (
                <Text style={styles.enhanceComparisonImageCounter}>
                  {currentIndex + 1}/{selectedImages.length}
                </Text>
              )}
            </View>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              <Text style={styles.enhanceComparisonPlaceholderIcon}>📷</Text>
              <Text style={styles.enhanceComparisonPlaceholderText}>{t('enhanceResult.cannotLoadImage')}</Text>
            </View>
          </View>
        );
      }
      
      return (
        <View style={styles.enhanceComparisonImageContainer}>
          <View style={styles.enhanceComparisonImageLabelContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>{t('enhanceResult.originalImage')}</Text>
            {selectedImages.length > 1 && (
              <Text style={styles.enhanceComparisonImageCounter}>
                {currentIndex + 1}/{selectedImages.length}
              </Text>
            )}
          </View>
          <Image
            source={{ uri: imageUri }}
            style={styles.enhanceComparisonImage}
            resizeMode="contain"
            onError={(error) => logger.error('❌ 原图加载失败:', imageUri, error)}
            onLoad={() => logger.debug('✅ 原图加载成功:', imageUri)}
          />
        </View>
      );
    };

    // 显示增强图或状态
    const renderEnhancedImage = () => {
      // 未开始处理
      if (!isProcessing && currentResults.length === 0) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>{presetDisplayName}</Text>
            </View>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              <Text style={styles.enhanceComparisonPlaceholderIcon}>🎨</Text>
              <Text style={styles.enhanceComparisonPlaceholderText}>{t('enhanceResult.selectPresetToStart')}</Text>
            </View>
          </View>
        );
      }

      // 处理中 - 显示状态
      if (status === 'pending' || status === 'processing') {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>
                {status === 'processing' ? t('enhanceResult.processing') : t('enhanceResult.waiting')}
              </Text>
            </View>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              {status === 'processing' ? (
                <>
                  <ActivityIndicator size="large" color="#2196F3" />
                  <Text style={styles.enhanceComparisonPlaceholderText}>{t('enhanceResult.processingWithPreset', { preset: presetDisplayName })}</Text>
                </>
              ) : (
                <>
                  <Text style={styles.enhanceComparisonPlaceholderIcon}>⏳</Text>
                  <Text style={styles.enhanceComparisonPlaceholderText}>{t('enhanceResult.waiting')}</Text>
                </>
              )}
            </View>
          </View>
        );
      }

      // 处理失败
      if (status === 'failed' || isFailed) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>{t('enhanceResult.failed')}</Text>
            </View>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonFailedContainer]}>
              <Text style={styles.enhanceComparisonFailedIcon}>⚠️</Text>
              <Text style={styles.enhanceComparisonFailedTitle}>{t('enhanceResult.failedWithPreset', { preset: presetDisplayName })}</Text>
              <Text style={styles.enhanceComparisonFailedMessage}>
                {currentResult.errorMessage || t('enhanceResult.unknownError')}
              </Text>
              <Text style={styles.enhanceComparisonFailedHint}>
                {t('enhanceResult.retryHint')}
              </Text>
            </View>
          </View>
        );
      }

      // 处理成功 - 显示增强后的图片
      if (status === 'completed' && currentResult.enhancedUri) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>{presetDisplayName}</Text>
            </View>
            <Image
              source={{ uri: currentResult.enhancedUri }}
              style={styles.enhanceComparisonImage}
              resizeMode="contain"
              onError={(error) => logger.error('❌ Image加载失败:', currentResult.enhancedUri, error)}
              onLoad={() => logger.debug('✅ Image加载成功:', currentResult.enhancedUri)}
            />
          </View>
        );
      }

      // 状态为 completed 但还没有 enhancedUri，可能是正在加载
      if (status === 'completed' && !currentResult.enhancedUri) {
        return (
          <View style={styles.enhanceComparisonImageContainer}>
            <View style={styles.enhanceComparisonImageLabelContainer}>
              <Text style={styles.enhanceComparisonImageLabel}>{t('enhanceResult.loading')}</Text>
            </View>
            <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.enhanceComparisonPlaceholderText}>{t('enhanceResult.loadingResult', { preset: presetDisplayName })}</Text>
            </View>
          </View>
        );
      }

      // 默认占位（其他未知状态）
      return (
        <View style={styles.enhanceComparisonImageContainer}>
          <View style={styles.enhanceComparisonImageLabelContainer}>
            <Text style={styles.enhanceComparisonImageLabel}>{presetDisplayName}</Text>
          </View>
          <View style={[styles.enhanceComparisonImage, styles.enhanceComparisonPlaceholder]}>
            <Text style={styles.enhanceComparisonPlaceholderText}>{t('enhanceResult.noResult', { preset: presetDisplayName })}</Text>
          </View>
        </View>
      );
    };

    return (
      <View style={styles.enhanceComparisonSection}>
        <View style={styles.enhanceComparisonContainer}>
          {/* 左侧：原图和增强图 */}
          <View style={styles.enhanceComparisonImages}>
            {renderOriginalImage()}
            {renderEnhancedImage()}
          </View>

          {/* 右侧：操作按钮区 */}
          <View style={styles.enhanceComparisonRightButtons}>
            {/* 导航按钮：只在有多张图片时显示 */}
            {selectedImages.length > 1 && (
              <>
                {/* 上一张按钮 */}
                <TouchableOpacity
                  style={[
                    styles.enhanceComparisonNavButtonVertical,
                    currentIndex === 0 && styles.enhanceComparisonNavButtonDisabled
                  ]}
                  onPress={goToPrevious}
                  disabled={currentIndex === 0}
                >
                  <Text style={styles.enhanceComparisonNavButtonText}>↑</Text>
                </TouchableOpacity>

                {/* 下一张按钮 */}
                <TouchableOpacity
                  style={[
                    styles.enhanceComparisonNavButtonVertical,
                    currentIndex === selectedImages.length - 1 && styles.enhanceComparisonNavButtonDisabled
                  ]}
                  onPress={goToNext}
                  disabled={currentIndex === selectedImages.length - 1}
                >
                  <Text style={styles.enhanceComparisonNavButtonText}>↓</Text>
                </TouchableOpacity>
              </>
            )}

            {/* 保存按钮：始终显示 */}
            <TouchableOpacity
              style={[
                styles.enhanceComparisonSaveButtonVertical,
                (status !== 'completed' || !currentResult.enhancedUri || isSaved) && styles.enhanceComparisonSaveButtonDisabled
              ]}
              onPress={handleSaveAndAdd}
              disabled={status !== 'completed' || !currentResult.enhancedUri || isSaved}
            >
              <Text style={[
                styles.enhanceComparisonSaveButtonText,
                (status !== 'completed' || !currentResult.enhancedUri || isSaved) && styles.enhanceComparisonSaveButtonTextDisabled
              ]}>
                {isSaved ? '✅' : '💾'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // 处理关闭，传递是否有保存的信息
  const handleClose = () => {
    // 如果任务还在进行中，显示确认提示
    if (isProcessing && progress.status === 'processing') {
      Alert.alert(
        t('imagePreview.confirmClose'),
        t('imagePreview.enhanceCloseMessage'),
        [
          {
            text: t('common.cancelButton'),
            style: 'cancel'
          },
          {
            text: t('common.confirmButton'),
            onPress: () => {
              // 取消轮询任务
              if (abortControllerRef.current) {
                logger.debug('🛑 用户确认关闭模态框，取消轮询任务');
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
              }
              
              const hasSaved = hasSavedRef.current;
              hasSavedRef.current = false;
              hasStartedRef.current = false;
              
              if (onClose) {
                onClose(hasSaved);
              }
            }
          }
        ]
      );
      return;
    }
    
    // 任务已完成或未开始，直接关闭
    const hasSaved = hasSavedRef.current;
    hasSavedRef.current = false;
    hasStartedRef.current = false;
    
    if (onClose) {
      onClose(hasSaved);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.enhanceModalOverlay}>
        <View style={styles.enhanceModalContent}>
          {/* 标题栏 */}
          <View style={styles.enhanceModalHeader}>
            <View style={styles.enhanceModalTitleContainer}>
              <Text style={styles.enhanceModalTitle}>{getPresetName()}</Text>
              <Text style={styles.enhanceModalCounter}>
                {currentResults.filter(r => (r.status === 'success' || r.status === 'completed') && r.enhancedUri).length}/{selectedImages.length}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} style={styles.enhanceModalCloseButton}>
              <Text style={styles.enhanceModalCloseButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 大图对比视图 */}
          {renderComparisonView()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  enhanceModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '95%',
    maxWidth: 1200,
    maxHeight: '90%',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'column',
  },
  enhanceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  enhanceModalTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  enhanceModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 12,
  },
  enhanceModalCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2196F3',
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  enhanceModalCloseButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#f5f5f5',
  },
  enhanceModalCloseButtonText: {
    fontSize: 18,
    color: '#666',
    lineHeight: 18,
    fontWeight: 'bold',
  },
  enhanceComparisonSection: {
    flex: 1,
    minHeight: 480,
  },
  enhanceComparisonContainer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    height: '100%',
  },
  enhanceComparisonImages: {
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  enhanceComparisonRightButtons: {
    width: 80,
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceComparisonImageContainer: {
    flex: 1,
    maxWidth: 500,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  enhanceComparisonImageLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  enhanceComparisonImageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginRight: 8,
  },
  enhanceComparisonImageCounter: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  enhanceComparisonImage: {
    width: '100%',
    height: 480,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  enhanceComparisonPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  enhanceComparisonPlaceholderIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceComparisonPlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  enhanceComparisonFailedContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
    borderWidth: 1,
    borderColor: '#ffcccc',
  },
  enhanceComparisonFailedIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  enhanceComparisonFailedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f44336',
    marginBottom: 8,
  },
  enhanceComparisonFailedMessage: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  enhanceComparisonFailedHint: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  enhanceComparisonNavButtonVertical: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 12,
  },
  enhanceComparisonNavButtonDisabled: {
    opacity: 0.3,
  },
  enhanceComparisonNavButtonText: {
    fontSize: 24,
    color: '#333',
    lineHeight: 24,
  },
  enhanceComparisonSaveButtonVertical: {
    width: 60,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  enhanceComparisonSaveButtonDisabled: {
    backgroundColor: '#e0e0e0',
    shadowOpacity: 0,
    elevation: 0,
  },
  enhanceComparisonSaveButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  enhanceComparisonSaveButtonTextDisabled: {
    color: '#999',
  },
});

export default EnhanceResultScreen;

