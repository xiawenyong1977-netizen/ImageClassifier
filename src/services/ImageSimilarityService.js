/**
 * 图片相似度检测服务
 * 负责图片相似度检测的核心逻辑和API接口
 * 包含时间窗口 + 颜色直方图的相似度检测算法
 */

import ColorHistogramExtractor from './ColorHistogramExtractor.js';
import { logger } from '../adapters/WebAdapters.js';

class ImageSimilarityService {
  constructor() {
    this.unifiedDataService = null; // 延迟初始化
    this.isInitialized = false;
    
    // 相似度检测配置
    this.defaultOptions = {
      timeWindow: 300,        // 5分钟
      similarityThreshold: 0.8,
      groupType: 'similar',
      histogramBins: 256      // RGB直方图bin数量
    };
    
    this.histogramExtractor = new ColorHistogramExtractor();
  }

  /**
   * 获取UnifiedDataService实例（延迟导入避免循环依赖）
   */
  getUnifiedDataService() {
    if (!this.unifiedDataService) {
      // 动态导入避免循环依赖
      const UnifiedDataService = require('./UnifiedDataService.js').default;
      this.unifiedDataService = UnifiedDataService;
    }
    return this.unifiedDataService;
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      logger.debug('ImageSimilarityService 开始初始化...');
      // 获取UnifiedDataService实例
      this.getUnifiedDataService();
      this.isInitialized = true;
      logger.debug('ImageSimilarityService 初始化成功');
    } catch (error) {
      logger.error('ImageSimilarityService 初始化失败:', error);
      throw error;
    }
  }

  /**
   * 检测相似图片
   * @param {Object} options - 检测选项
   * @param {number} options.timeWindow - 时间窗口（秒），默认300秒（5分钟）
   * @param {number} options.similarityThreshold - 相似度阈值，默认0.8
  
   * @returns {Object} 检测结果
   */
  async detectSimilarImages(options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      timeWindow = 300, // 5分钟
      similarityThreshold = 0.8,
    } = options;

    logger.debug(`开始相似图片检测: 时间窗口=${timeWindow}秒, 阈值=${similarityThreshold}`);

    try {
      // 获取所有图片数据（精简信息）
      const allImages = await this.getUnifiedDataService().readAllImages();
      
      if (!allImages || allImages.length === 0) {
        logger.debug('⚠️ 没有找到图片数据');
        return { success: true, groups: [], processed: 0 };
      }

      // 每次检测都清空现有相似度数据，完全重新检测
      logger.debug('🧹 清空现有相似度数据，开始完全重新检测');
      await this.getUnifiedDataService().clearSimilarityData();
     
      logger.debug(`📊 总图片数: ${allImages.length}, 开始重新检测相似度`);

      // 执行相似度检测
      const detectionResult = await this.detectSimilarityGroups(
        allImages,
        {
          timeWindow,
          similarityThreshold,
          groupType: 'similar',
        }
      );

      // 保存检测结果
      await this._saveDetectionResults(detectionResult);

      logger.debug(`✅ 相似度检测完成: 发现${detectionResult.groups.length}个相似组, 处理${detectionResult.processed}张图片`);

      return {
        success: true,
        groups: detectionResult.groups,
        processed: detectionResult.processed,
        total: allImages.length
      };

    } catch (error) {
      console.error('❌ 相似度检测失败:', error);
      return {
        success: false,
        error: error.message,
        groups: [],
        processed: 0
      };
    }
  }

  /**
   * 保存检测结果到存储
   * @param {Object} detectionResult - 检测结果
   * @private
   */
  async _saveDetectionResults(detectionResult) {
    try {
      // 从检测结果中提取所有处理过的图片
      const processedImages = [];
      for (const group of detectionResult.groups) {
        processedImages.push(...group.images);
      }

      // 准备批量更新的相似度数据
      const imageSimilarityArray = processedImages.map(imageData => ({
        imageId: imageData.id,
        similarityInfo: {
          similarity_group_id: imageData.similarity_group_id,
          similarity_group_type: imageData.similarity_group_type,
          similarity_score: imageData.similarity_score,
          is_similarity_processed: true
        }
      }));

      // 使用批量更新函数，避免多次读取全部数据
      await this.getUnifiedDataService().updateImagesSimilarity(imageSimilarityArray);
      logger.debug(`✅ 保存检测结果成功，批量更新${imageSimilarityArray.length}张图片`);

    } catch (error) {
      console.error('❌ 保存检测结果失败:', error);
      throw error;
    }
  }

  // ==================== 相似度检测核心算法方法 ====================

  /**
   * 检测相似图片组
   * @param {Array} images - 图片数据数组
   * @param {Object} options - 检测选项
   * @returns {Object} 检测结果
   */
  async detectSimilarityGroups(images, options = {}) {
    const opts = { ...this.defaultOptions, ...options };
    
    // 1. 过滤掉没有takenAt的图片
    const imagesWithTime = images.filter(image => {
      if (!image.takenAt) return false;
      // 确保takenAt是字符串类型
      const takenAtStr = String(image.takenAt);
      return takenAtStr.trim() !== '';
    });
    
    logger.debug(`🔍 开始相似度检测: 输入${images.length}张图片, 有效${imagesWithTime.length}张图片, 时间窗口=${opts.timeWindow}秒`);
    
    if (imagesWithTime.length === 0) {
      logger.debug('⚠️ 没有有效的图片进行相似度检测');
      return {
        groups: [],
        processed: 0,
        windows: 0,
        options: opts
      };
    }
    
    try {
      // 2. 按时间排序
      const sortedImages = this._sortImagesByTime(imagesWithTime);
      
      // 3. 创建时间窗口
      const timeWindows = this._createTimeWindows(sortedImages, opts.timeWindow);
      
      logger.debug(`📊 创建了${timeWindows.length}个时间窗口`);
      
      // 4. 在每个时间窗口内检测相似图片
      const allGroups = [];
      let processedCount = 0;
      
      for (let i = 0; i < timeWindows.length; i++) {
        const window = timeWindows[i];
        logger.debug(`🪟 处理时间窗口${i + 1}: ${window.length}张图片`);
        
        // 提取特征
        const windowWithFeatures = await this._extractFeaturesForWindow(window);
        
        // 检测相似组
        const windowGroups = this._findSimilarGroupsInWindow(windowWithFeatures, opts);
        
        allGroups.push(...windowGroups);
        processedCount += window.length;
        
        logger.debug(`✅ 窗口${i + 1}完成: 发现${windowGroups.length}个相似组`);
      }
      
      // 5. 合并跨窗口的相似组
      const mergedGroups = this._mergeSimilarGroups(allGroups);
      
      logger.debug(`🎯 相似度检测完成: 发现${mergedGroups.length}个相似组, 处理${processedCount}张图片`);
      
      return {
        groups: mergedGroups,
        processed: processedCount,
        windows: timeWindows.length,
        options: opts
      };
      
    } catch (error) {
      console.error('❌ 相似度检测失败:', error);
      throw error;
    }
  }

  /**
   * 按时间排序图片
   * @param {Array} images - 图片数组
   * @returns {Array} 按时间排序的图片数组
   * @private
   */
  _sortImagesByTime(images) {
    return images.sort((a, b) => {
      const timeA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
      const timeB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
      return timeA - timeB;
    });
  }

  /**
   * 创建时间窗口
   * @param {Array} sortedImages - 按时间排序的图片数组
   * @param {number} timeWindow - 时间窗口大小（秒）
   * @returns {Array} 时间窗口数组
   * @private
   */
  _createTimeWindows(sortedImages, timeWindow) {
    const windows = [];
    const windowMs = timeWindow * 1000; // 转换为毫秒
    
    let currentWindow = [];
    let windowStartTime = null;
    
    for (const image of sortedImages) {
      const imageTime = image.takenAt ? new Date(image.takenAt).getTime() : 0;
      
      if (windowStartTime === null) {
        // 第一个图片，开始新窗口
        windowStartTime = imageTime;
        currentWindow = [image];
      } else if (imageTime - windowStartTime <= windowMs) {
        // 在时间窗口内，添加到当前窗口
        currentWindow.push(image);
      } else {
        // 超出时间窗口，保存当前窗口并开始新窗口
        if (currentWindow.length > 1) {
          windows.push([...currentWindow]);
        }
        windowStartTime = imageTime;
        currentWindow = [image];
      }
    }
    
    // 保存最后一个窗口
    if (currentWindow.length > 1) {
      windows.push(currentWindow);
    }
    
    return windows;
  }

  /**
   * 为时间窗口内的图片提取特征
   * @param {Array} windowImages - 时间窗口内的图片数组
   * @returns {Array} 包含特征的图片数组
   * @private
   */
  async _extractFeaturesForWindow(windowImages) {
    const imagesWithFeatures = [];
    
    for (const image of windowImages) {
      try {
        let features = image.similarity_features;
        
        // 如果没有特征或需要重新提取
        if (!features || !features.color_histogram) {
          features = await this._extractColorHistogram(image);
          
          // 保存特征到图片对象
          const updatedImage = {
            ...image,
            similarity_features: features,
            color_histogram: features.color_histogram
          };
          imagesWithFeatures.push(updatedImage);
        } else {
          imagesWithFeatures.push(image);
        }
      } catch (error) {
        console.warn(`⚠️ 提取图片${image.fileName}特征失败:`, error);
        imagesWithFeatures.push(image);
      }
    }
    
    return imagesWithFeatures;
  }

  /**
   * 提取颜色直方图特征
   * @param {Object} image - 图片对象
   * @returns {Object} 特征对象
   * @private
   */
  async _extractColorHistogram(image) {
    try {
      // 使用真实的颜色直方图提取器
      const features = await this.histogramExtractor.extractHistogram(image.uri);
      
      logger.debug(`✅ 提取图片特征成功: ${image.fileName}`);
      return features;
    } catch (error) {
      console.error('❌ 提取颜色直方图失败:', error);
      // 如果提取失败，返回默认特征
      return this._generateDefaultFeatures();
    }
  }

  /**
   * 生成默认特征（当提取失败时使用）
   * @returns {Object} 默认特征对象
   * @private
   */
  _generateDefaultFeatures() {
    return {
      color_histogram: {
        rgb: {
          r: new Array(256).fill(0),
          g: new Array(256).fill(0),
          b: new Array(256).fill(0)
        },
        hsv: {
          h: new Array(360).fill(0),
          s: new Array(100).fill(0),
          v: new Array(100).fill(0)
        }
      },
      dominant_colors: [],
      brightness: 0.5,
      contrast: 0.5,
      extracted_at: new Date().toISOString()
    };
  }

  /**
   * 在时间窗口内查找相似组
   * @param {Array} windowImages - 包含特征的图片数组
   * @param {Object} options - 检测选项
   * @returns {Array} 相似组数组
   * @private
   */
  _findSimilarGroupsInWindow(windowImages, options) {
    const groups = [];
    const processed = new Set();
    
    for (let i = 0; i < windowImages.length; i++) {
      if (processed.has(i)) continue;
      
      const image1 = windowImages[i];
      const similarImages = [image1];
      processed.add(i);
      
      // 查找与当前图片相似的图片
      for (let j = i + 1; j < windowImages.length; j++) {
        if (processed.has(j)) continue;
        
        const image2 = windowImages[j];
        const similarity = this._calculateSimilarity(image1, image2);
        
        if (similarity >= options.similarityThreshold) {
          similarImages.push(image2);
          processed.add(j);
          logger.debug(`🔗 发现相似图片: ${image1.fileName} <-> ${image2.fileName} (相似度: ${(similarity * 100).toFixed(1)}%)`);
        }
      }
      
      // 如果找到相似图片，创建组
      if (similarImages.length > 1) {
        const group = this._createSimilarityGroup(similarImages, options.groupType);
        groups.push(group);
      }
    }
    
    return groups;
  }

  /**
   * 计算两张图片的相似度
   * @param {Object} image1 - 图片1
   * @param {Object} image2 - 图片2
   * @returns {number} 相似度分数 (0-1)
   * @private
   */
  _calculateSimilarity(image1, image2) {
    const features1 = image1.similarity_features;
    const features2 = image2.similarity_features;
    
    if (!features1 || !features2) {
      return 0;
    }
    
    // 计算颜色直方图相似度
    const colorSimilarity = this._calculateHistogramSimilarity(
      features1.color_histogram,
      features2.color_histogram
    );
    
    // 计算其他特征相似度
    const brightnessSimilarity = this._calculateFeatureSimilarity(
      features1.brightness,
      features2.brightness
    );
    
    const contrastSimilarity = this._calculateFeatureSimilarity(
      features1.contrast,
      features2.contrast
    );
    
    // 加权平均
    const similarity = (
      colorSimilarity * 0.7 +
      brightnessSimilarity * 0.15 +
      contrastSimilarity * 0.15
    );
    
    return Math.min(1, Math.max(0, similarity));
  }

  /**
   * 计算直方图相似度
   * @param {Object} hist1 - 直方图1
   * @param {Object} hist2 - 直方图2
   * @returns {number} 相似度分数
   * @private
   */
  _calculateHistogramSimilarity(hist1, hist2) {
    // 计算RGB直方图的余弦相似度
    const rgbSimilarity = this._calculateCosineSimilarity(
      [...hist1.rgb.r, ...hist1.rgb.g, ...hist1.rgb.b],
      [...hist2.rgb.r, ...hist2.rgb.g, ...hist2.rgb.b]
    );
    
    // 计算HSV直方图的余弦相似度
    const hsvSimilarity = this._calculateCosineSimilarity(
      [...hist1.hsv.h, ...hist1.hsv.s, ...hist1.hsv.v],
      [...hist2.hsv.h, ...hist2.hsv.s, ...hist2.hsv.v]
    );
    
    // 加权平均
    return rgbSimilarity * 0.6 + hsvSimilarity * 0.4;
  }

  /**
   * 计算余弦相似度
   * @param {Array} vec1 - 向量1
   * @param {Array} vec2 - 向量2
   * @returns {number} 余弦相似度
   * @private
   */
  _calculateCosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) return 0;
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) return 0;
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 计算特征相似度
   * @param {number} val1 - 值1
   * @param {number} val2 - 值2
   * @returns {number} 相似度分数
   * @private
   */
  _calculateFeatureSimilarity(val1, val2) {
    if (val1 === undefined || val2 === undefined) return 0;
    
    const diff = Math.abs(val1 - val2);
    return Math.max(0, 1 - diff);
  }

  /**
   * 创建相似组
   * @param {Array} similarImages - 相似图片数组
   * @param {string} groupType - 组类型
   * @returns {Object} 相似组对象
   * @private
   */
  _createSimilarityGroup(similarImages, groupType) {
    const groupId = this._generateGroupId();
    
    // 为每张图片分配相似组信息
    const processedImages = similarImages.map((image, index) => {
      const similarityScore = index === 0 ? 1.0 : 
        this._calculateSimilarity(similarImages[0], image);
      
      return {
        ...image,
        similarity_group_id: groupId,
        similarity_group_type: groupType,
        similarity_score: similarityScore
      };
    });
    
    const group = {
      id: groupId,
      type: groupType,
      images: processedImages,
      confidence: this._calculateGroupConfidence(processedImages),
      created_at: new Date().toISOString()
    };
    
    return group;
  }

  /**
   * 计算组置信度
   * @param {Array} images - 图片数组
   * @returns {number} 置信度分数
   * @private
   */
  _calculateGroupConfidence(images) {
    if (images.length <= 1) return 0;
    
    const scores = images.slice(1).map(img => img.similarity_score || 0);
    const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    
    return averageScore;
  }

  /**
   * 生成组ID
   * @returns {string} 组ID
   * @private
   */
  _generateGroupId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `group_${timestamp}_${random}`;
  }

  /**
   * 合并相似组
   * @param {Array} groups - 相似组数组
   * @returns {Array} 合并后的相似组数组
   * @private
   */
  _mergeSimilarGroups(groups) {
    // 简化实现，实际应该检查跨窗口的相似性
    return groups;
  }
}

export default ImageSimilarityService;
