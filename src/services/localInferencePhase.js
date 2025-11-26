import { logger } from '../adapters/WebAdapters';
import UnifiedDataService from './UnifiedDataService';

/**
 * 本地推理阶段（共享函数）
 * 供 GalleryScannerService 和 GalleryScannerService.android 使用
 * 
 * @param {Object} context - 上下文对象，包含服务实例的属性和方法
 * @param {Array} context.images - 需要处理的图片列表（精简信息，包含 id 和 uri）
 * @param {Function} context.sendProgressMessage - 发送进度消息的方法
 * @param {Object} context.imageClassifier - 图像分类服务实例
 * @param {Function} [context.extractOriginalUri] - 提取原始 URI 的函数（PC 版本需要）
 * @param {number} [context.totalImagesToBeClassified] - 总分类目标（可选，Android 版本使用）
 * @param {number} [context.imagesClassified] - 已分类数量（可选，Android 版本使用）
 * @param {Function} [context.onClassifiedSuccessfully] - 分类成功回调（可选，PC 版本使用）
 * @returns {Promise<{processedCount: number, failedCount: number}>}
 */
export async function localInferencePhase(context) {
  const {
    images,
    sendProgressMessage,
    imageClassifier,
    extractOriginalUri,
    totalImagesToBeClassified,
    imagesClassified,
    onClassifiedSuccessfully,
  } = context;

  if (!images || images.length === 0) {
    logger.debug('📊 本地推理：无需处理');
    return { processedCount: 0, failedCount: 0 };
  }

  logger.info(`🤖 本地推理和规则映射：处理 ${images.length} 张图片`);

  // 发送开始处理消息（统一在开始时发送，不区分是否需要推理）
  if (totalImagesToBeClassified !== undefined && imagesClassified !== undefined) {
    await sendProgressMessage('local_inference', 0, images.length, imagesClassified, totalImagesToBeClassified);
  } else {
    sendProgressMessage('local_inference', 0, images.length);
  }

  // 批量读取完整信息（包含检测结果字段）
  const imageIds = images.map(img => img.id);
  const fullImageDataMap = await UnifiedDataService.imageStorageService.getImagesByIds(imageIds);

  // 转换为数组，保持顺序
  const fullImages = imageIds.map(id => {
    const img = fullImageDataMap.get(id);
    return img || null;
  }).filter(img => img !== null);

  if (fullImages.length === 0) {
    logger.warn(`⚠️ 无法读取图片详细信息，跳过`);
    return { processedCount: 0, failedCount: 0 };
  }

  let processedCount = 0;
  let failedCount = 0;
  let totalMappedCount = 0;

  // 一张一张处理：对每张图片进行物体检测（如果需要）和规则映射
  for (const image of fullImages) {
    try {
      const imageUri = extractOriginalUri ? extractOriginalUri(image) : image.uri;
      let categoryId = null;
      let detections = null;

      // 判断是否有物体检测结果
      const hasDetections = image.generalDetections || 
                           image.idCardDetections || 
                           image.mobileNetV3Detections;

      if (hasDetections) {
        // 有检测结果：使用 ImageClassifierService.MapObjectes2Category 进行规则映射
        try {
          // 先翻译 mobileNetV3Detections（如果包含 imagenet_class_xxx 格式）
          let translatedMobileNetV3Detections = image.mobileNetV3Detections;
          if (translatedMobileNetV3Detections && translatedMobileNetV3Detections.predictions) {
            const needsTranslation = Array.isArray(translatedMobileNetV3Detections.predictions) &&
              translatedMobileNetV3Detections.predictions.some(
                pred => pred.class && typeof pred.class === 'string' && pred.class.startsWith('imagenet_class_')
              );
            
            if (needsTranslation) {
              translatedMobileNetV3Detections = imageClassifier.translateMobileNetV3Detections(translatedMobileNetV3Detections);
            }
          }

          // 转换数据格式：从 { idCardDetections, generalDetections, mobileNetV3Detections } 
          // 到 { idCard, general, mobileNetV3 }
          const allModelResults = {
            idCard: image.idCardDetections || [],
            general: image.generalDetections || [],
            mobileNetV3: translatedMobileNetV3Detections ? {
              success: true,
              predictions: translatedMobileNetV3Detections.predictions || []
            } : null
          };

          // 获取图片尺寸信息
          const imageDimensions = image.imageDimensions || {
            width: image.width || 0,
            height: image.height || 0,
          };

          // 调用 MapObjectes2Category 进行规则映射
          categoryId = await imageClassifier.MapObjectes2Category(
            allModelResults,
            imageUri,
            imageDimensions
          );

          // 保存检测结果（如果需要更新，保存翻译后的结果）
          detections = {
            idCardDetections: image.idCardDetections || [],
            generalDetections: image.generalDetections || [],
            mobileNetV3Detections: translatedMobileNetV3Detections || null,
          };
        } catch (error) {
          logger.warn(`⚠️ 规则映射失败: ${image.fileName}`, error);
          failedCount++;
          continue;
        }
      } else {
        // 没有检测结果：调用分类函数（ImageClassifierService 会自动处理模型初始化）
        const imageData = {
          uri: imageUri,
          fileName: image.fileName,
          imageDimensions: image.imageDimensions || {
            width: image.width || 0,
            height: image.height || 0,
          },
        };

        // 如果图片没有尺寸信息，跳过推理
        if (!imageData.imageDimensions.width || !imageData.imageDimensions.height) {
          logger.warn(`⚠️ 图片缺少尺寸信息，跳过推理: ${image.fileName}`);
          failedCount++;
          continue;
        }

        try {
          // 调用分类函数（ImageClassifierService 会自动处理模型初始化）
          const classification = await imageClassifier.classifyImage(imageData);

          if (classification.success) {
            // classifyImage 已经返回了 categoryId（通过 MapObjectes2Category 规则映射）
            categoryId = classification.categoryId;
            
            // 保存检测结果
            detections = {
              idCardDetections: classification.idCardDetections || [],
              generalDetections: classification.generalDetections || [],
              mobileNetV3Detections: classification.mobileNetV3Detections || null,
            };
          }
        } catch (error) {
          logger.warn(`⚠️ 本地推理失败: ${image.fileName}`, error);
          failedCount++;
          continue;
        }
      }

      // 更新数据（如果有分类结果）
      if (categoryId && categoryId !== 'NA') {
        const updateItem = {
          uri: imageUri,
          id: image.id,
          category: categoryId,
          confidence: 0.8,
        };

        // 如果有新的检测结果，也一起更新
        if (detections) {
          updateItem.idCardDetections = detections.idCardDetections;
          updateItem.generalDetections = detections.generalDetections;
          updateItem.mobileNetV3Detections = detections.mobileNetV3Detections;
        }

        // 立即更新（不再批量更新）
        const updateResult = await UnifiedDataService.batchUpdateClassification([updateItem], false);
        
        if (updateResult.success) {
          totalMappedCount++;
          if (onClassifiedSuccessfully) {
            onClassifiedSuccessfully();
          }
        } else {
          failedCount++;
        }
      }

      processedCount++;

      // 每处理一张就更新进度
      if (totalImagesToBeClassified !== undefined && imagesClassified !== undefined) {
        await sendProgressMessage('local_inference', processedCount, fullImages.length, imagesClassified, totalImagesToBeClassified);
      } else {
        sendProgressMessage('local_inference', processedCount, fullImages.length);
      }

      // 让出控制权，避免UI卡顿
      await new Promise(resolve => setTimeout(resolve, 0));

    } catch (error) {
      logger.warn(`⚠️ 处理图片失败: ${image.fileName}`, error);
      failedCount++;
    }
  }

  logger.info(`✅ 本地推理和规则映射完成: 处理了 ${processedCount} 张图片，更新了 ${totalMappedCount} 张图片的分类`);

  return { processedCount, failedCount };
}

