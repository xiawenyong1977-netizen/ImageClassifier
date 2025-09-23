/**
 * 相似度检测API接口
 * 提供相似度检测的对外接口
 */

import ImageSimilarityService from './ImageSimilarityService.js';

class SimilarityAPI {
  constructor() {
    this.similarityService = new ImageSimilarityService();
    this.isInitialized = false;
  }

  /**
   * 初始化API
   */
  async initialize() {
    if (!this.isInitialized) {
      await this.similarityService.initialize();
      this.isInitialized = true;
      console.log('✅ SimilarityAPI 初始化成功');
    }
  }

  /**
   * 检测相似图片
   * @param {Object} options - 检测选项
   * @returns {Promise<Object>} 检测结果
   */
  async detectSimilarImages(options = {}) {
    await this.initialize();
    
    try {
      console.log('🚀 开始相似图片检测...');
      const result = await this.similarityService.detectSimilarImages(options);
      
      if (result.success) {
        console.log(`✅ 相似图片检测完成: 发现${result.groups.length}个相似组, 处理${result.processed}张图片`);
      } else {
        console.error('❌ 相似图片检测失败:', result.error);
      }
      
      return result;
    } catch (error) {
      console.error('❌ 相似图片检测API调用失败:', error);
      return {
        success: false,
        error: error.message,
        groups: [],
        processed: 0
      };
    }
  }

  /**
   * 获取相似图片组
   * @param {string} groupType - 组类型过滤
   * @returns {Promise<Array>} 相似图片组列表
   */
  async getSimilarityGroups(groupType = 'all') {
    await this.initialize();
    
    try {
      // 直接调用存储服务的优化版本
      const groups = await this.storageService.getSimilarityGroups(groupType);
      console.log(`📊 获取到${groups.length}个相似图片组`);
      return groups;
    } catch (error) {
      console.error('❌ 获取相似图片组失败:', error);
      return [];
    }
  }

  /**
   * 获取特定图片的相似图片
   * @param {string} imageId - 图片ID
   * @param {number} limit - 返回数量限制
   * @returns {Promise<Array>} 相似图片列表
   */
  async getSimilarImages(imageId, limit = 10) {
    await this.initialize();
    
    try {
      // 直接调用存储服务的优化版本
      const similarImages = await this.storageService.getSimilarImages(imageId, limit);
      console.log(`📊 找到${similarImages.length}张相似图片`);
      return similarImages;
    } catch (error) {
      console.error('❌ 获取相似图片失败:', error);
      return [];
    }
  }

  /**
   * 删除相似组
   * @param {string} groupId - 相似组ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteSimilarityGroup(groupId) {
    await this.initialize();
    
    try {
      // 直接调用存储服务的优化版本
      const success = await this.storageService.deleteSimilarityGroup(groupId);
      if (success) {
        console.log(`✅ 删除相似组成功: ${groupId}`);
      } else {
        console.log(`⚠️ 删除相似组失败: ${groupId}`);
      }
      return success;
    } catch (error) {
      console.error('❌ 删除相似组失败:', error);
      return false;
    }
  }

  /**
   * 获取检测统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getDetectionStats() {
    await this.initialize();
    
    try {
      // 直接调用存储服务的统计函数
      const stats = await this.storageService.getSimilarityStats();
      console.log('📊 相似度检测统计:', stats);
      return stats;
    } catch (error) {
      console.error('❌ 获取统计信息失败:', error);
      return { processed: 0, grouped: 0, groupTypes: {} };
    }
  }

  /**
   * 快速检测相似图片（使用默认参数）
   * @returns {Promise<Object>} 检测结果
   */
  async quickDetect() {
    return await this.detectSimilarImages({
      timeWindow: 300,      // 5分钟
      similarityThreshold: 0.8,
      groupType: 'similar',
      forceReprocess: false
    });
  }

  /**
   * 检测重复图片（高相似度阈值）
   * @returns {Promise<Object>} 检测结果
   */
  async detectDuplicates() {
    return await this.detectSimilarImages({
      timeWindow: 30,       // 30秒
      similarityThreshold: 0.95,
      groupType: 'duplicate',
      forceReprocess: false
    });
  }

  /**
   * 检测系列图片（长时间窗口）
   * @returns {Promise<Object>} 检测结果
   */
  async detectSeries() {
    return await this.detectSimilarImages({
      timeWindow: 1800,     // 30分钟
      similarityThreshold: 0.7,
      groupType: 'series',
      forceReprocess: false
    });
  }
}

// 创建单例实例
const similarityAPI = new SimilarityAPI();

export default similarityAPI;
