import { logger } from '../adapters/WebAdapters';
import UnifiedDataService from './UnifiedDataService';

/**
 * 相似度检测阶段（增量检测：只处理本次扫描更新的图片）
 * 共享函数，供 GalleryScannerService 和 GalleryScannerService.android 使用
 * 
 * @param {Object} context - 上下文对象，包含服务实例的属性和方法
 * @param {Date} context.scanStartTimestamp - 扫描开始时间戳（Date 对象）
 * @param {Function} context.sendProgressMessage - 发送进度消息的方法
 * @param {Object} context.similarityService - 相似度检测服务实例
 * @param {number} [context.totalImagesToBeClassified] - 总分类目标（可选，Android 版本使用）
 * @returns {Promise<void>}
 */
export async function similarityDetectionPhase(context) {
  const { scanStartTimestamp, sendProgressMessage, similarityService, totalImagesToBeClassified } = context;
  
  logger.info('🔍 阶段6: 开始相似度检测');
  
  try {
    // 🔥 优化：只查询本次扫描后更新的图片，而不是所有图片
    // 使用扫描开始时间作为基准点
    let scanStartTime = scanStartTimestamp;
    // 确保 scanStartTime 是 Date 对象
    if (!scanStartTime || !(scanStartTime instanceof Date)) {
      // 如果没有记录扫描开始时间，使用当前时间减去24小时作为默认值
      scanStartTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      logger.warn(`⚠️ 扫描开始时间未记录，使用默认值: ${scanStartTime.toISOString()}`);
    }
    const sinceTimeStr = scanStartTime.toISOString();
    
    logger.info(`📊 阶段6: 查询 ${sinceTimeStr} 之后更新的图片`);
    let imagesForSimilarity = await UnifiedDataService.readImagesUpdatedAfter(sinceTimeStr);
    
    if (!imagesForSimilarity || imagesForSimilarity.length === 0) {
      logger.info('📊 阶段6: 没有最近更新的图片，跳过相似度检测');
      return;
    }
    
    // 过滤掉暂存箱（tobecleaned）和手机截图（screenshot）分类的图片
    const beforeFilterCount = imagesForSimilarity.length;
    const tobecleanedCount = imagesForSimilarity.filter(img => img.category === 'tobecleaned').length;
    const screenshotCount = imagesForSimilarity.filter(img => img.category === 'screenshot').length;
    imagesForSimilarity = imagesForSimilarity.filter(image => {
      return image.category !== 'tobecleaned' && image.category !== 'screenshot';
    });
    const filteredCount = beforeFilterCount - imagesForSimilarity.length;
    if (filteredCount > 0) {
      logger.info(`📊 阶段6: 已排除 ${filteredCount} 张图片（tobecleaned: ${tobecleanedCount}, screenshot: ${screenshotCount}）`);
    }
    
    if (imagesForSimilarity.length === 0) {
      logger.info('📊 阶段6: 过滤后没有图片，跳过相似度检测');
      return;
    }
    
    const totalFoundThisPhase = imagesForSimilarity.length;
    logger.info(`🔍 阶段6: 开始相似度检测，处理 ${totalFoundThisPhase} 张最近更新的图片`);
    
    // 发送开始处理消息
    // Android 版本有额外的参数，PC 版本没有
    if (totalImagesToBeClassified !== undefined) {
      await sendProgressMessage('similarity_detection', 0, totalFoundThisPhase, 0, totalImagesToBeClassified);
    } else {
      sendProgressMessage('similarity_detection', 0, totalFoundThisPhase);
    }
    
    // 批量进行相似度检测
    logger.info(`🔍 开始调用相似度检测服务，参数: timeWindow=300, similarityThreshold=0.8`);
    const result = await similarityService.detectSimilarImages({
      timeWindow: 300, // 5分钟时间窗口
      similarityThreshold: 0.8,
      groupType: 'similar',
      images: imagesForSimilarity,
      clearExisting: false, // 🔥 改为 false，不清除现有相似组，只检测新分类的图片
      onProgress: async (processed, total, groups) => {
        // 更新相似组数量（使用传递的groups参数）
        const groupsCount = groups || 0;
        logger.debug(`🔍 相似度检测进度: processed=${processed}, total=${total}, groups=${groupsCount}`);
        // 发送进度消息
        // Android 版本有额外的参数，PC 版本没有
        const progressPromise = totalImagesToBeClassified !== undefined
          ? sendProgressMessage('similarity_detection', processed, total, groupsCount, totalImagesToBeClassified)
          : sendProgressMessage('similarity_detection', processed, total);
        
        // 注意：不等待完成，避免阻塞相似度检测进度回调
        progressPromise.catch(err => {
          logger.warn('⚠️ 发送相似度检测进度消息失败:', err);
        });
      }
    });
    
    logger.info(`🔍 相似度检测服务返回结果:`, {
      success: result.success,
      groupsLength: result.groups ? result.groups.length : 0,
      processed: result.processed,
      total: result.total,
      error: result.error
    });
    
    if (result.success) {
      logger.info(`✅ 阶段6完成: 相似度检测成功，发现 ${result.groups.length} 个相似组`);
      // 发送相似度检测完成消息
      const totalWindows = result.windows || 0;
      if (totalImagesToBeClassified !== undefined) {
        await sendProgressMessage('similarity_detection', totalWindows, totalWindows, result.groups.length, totalImagesToBeClassified);
      } else {
        await sendProgressMessage('similarity_detection', totalWindows, totalWindows);
      }
    } else {
      logger.error(`❌ 阶段6失败: 相似度检测失败: ${result.error}`);
    }
    
  } catch (error) {
    logger.error('❌ 阶段6失败:', error);
    throw error;
  }
}

