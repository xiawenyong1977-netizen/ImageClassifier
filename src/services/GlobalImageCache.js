// 全局图片缓存服务 - 单例模式，避免重复加载
import configService from './ConfigService.js';
import { logger, getLocalPath } from '../adapters/WebAdapters';

class GlobalImageCache {
  constructor() {
    this.cache = {
      allImages: [],
      categoryCounts: {},
      cityCounts: {},
      colorCounts: {},
      directoryCounts: {}, // 目录统计
      recentImages: [],
      selectedCategoryCounts: {}, // 选中图片的分类统计
      selectedCityCounts: {}, // 选中图片的城市统计
      selectedSimilarityGroupCounts: {} // 选中图片的相似组统计
    };
    
    // ID到索引的映射，用于快速查找
    this.imageIdToIndex = new Map();
    this.isLoading = false;
    this.isLoaded = false;
    this.listeners = new Set();
    this.imageStorageService = null; // 延迟获取，避免循环依赖
    
    // 选中状态管理
    this.selectionListeners = new Set();
  }
  
  /**
   * 获取存储服务实例（从 UnifiedDataService 获取，避免重复创建）
   */
  getStorageService() {
    if (!this.imageStorageService) {
      // 动态导入避免循环依赖
      const UnifiedDataService = require('./UnifiedDataService.js').default;
      this.imageStorageService = UnifiedDataService.imageStorageService;
    }
    return this.imageStorageService;
  }

  // 添加监听器
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // 通知所有监听器
  notifyListeners() {
    this.listeners.forEach(callback => callback(this.cache));
  }

  // 构建缓存
  async buildCache() {
    if (this.isLoading) {
      // 如果正在加载，等待完成
      logger.debug('缓存正在构建中，等待完成...');
      return new Promise((resolve) => {
        const checkLoaded = () => {
          if (this.isLoaded) {
            resolve(this.cache);
          } else {
            setTimeout(checkLoaded, 100);
          }
        };
        checkLoaded();
      });
    }

    if (this.isLoaded) {
      // 已加载，直接返回，不打印日志（避免日志污染）
      return this.cache;
    }

    // 只在真正开始构建时打印
    this.isLoading = true;

    try {
      // 确保 ConfigService 已初始化
      if (!configService.isConfigLoaded()) {
        logger.debug('⏳ ConfigService 未加载，开始初始化...');
        await configService.initialize();
        logger.debug('✅ ConfigService 初始化完成');
      }
      
      
      // 获取存储服务实例（共享 UnifiedDataService 的实例）
      const storageService = this.getStorageService();
      
      // 获取所有图片的精简数据（ImageStorageService已经做了数据转换）
      const allImages = await storageService.getImages();
      
      // 检查返回的数据类型
      if (!Array.isArray(allImages)) {
        logger.error(`buildCache: getImages() 返回的不是数组! 类型: ${typeof allImages}, 值:`, allImages);
      }
      
      // 确保 allImages 是数组
      if (!Array.isArray(allImages)) {
        logger.warn('allImages 不是数组，初始化为空数组');
        this.cache.allImages = [];
      } else {
        // 直接使用ImageStorageService返回的数据，避免重复转换
        this.cache.allImages = allImages;
      }
      
      // 验证数据完整性
      let missingCategoryCount = 0;
      this.cache.allImages.forEach(img => {
        if (!img.category) {
          missingCategoryCount++;
          logger.warn(`图片 ${img.id} 缺少分类信息:`, {
            id: img.id,
            fileName: img.fileName,
            category: img.category,
            hasCategory: 'category' in img
          });
        }
      });
      
      if (missingCategoryCount > 0) {
        logger.warn(`发现 ${missingCategoryCount} 张图片缺少分类信息`);
      }
      
      // 更新ID到索引的映射
      this._rebuildImageIdIndex();
      
      // 不再维护 imagesByCategory 和 imagesByCity 索引
      // 直接通过过滤 allImages 来获取数据
      
      // 计算统计信息
      this._rebuildCategoryCounts();
      this._rebuildCityCounts();
      this._rebuildColorCounts();
      this._rebuildDirectoryCounts();
      
      // 加载相似组数据到图片对象中
      await this._loadSimilarityGroupData();
      
      // 获取最近图片（从缓存中取前20张）
      this.cache.recentImages = this.cache.allImages
        .sort((a, b) => {
          const timeA = a.takenAt ? new Date(a.takenAt).getTime() : a.timestamp;
          const timeB = b.takenAt ? new Date(b.takenAt).getTime() : b.timestamp;
          return timeB - timeA;
        })
        .slice(0, 20);
      
      this.isLoaded = true;
      this.isLoading = false;
      
      // 通知所有监听器
      this.notifyListeners();
      
      return this.cache;
    } catch (error) {
      console.error('❌ 构建图片缓存失败:', error);
      this.isLoading = false;
      throw error;
    }
  }

  // 获取缓存数据
  getCache() {
    return this.cache;
  }

  // 刷新缓存
  async refreshCache() {
    this.isLoaded = false;
    this.isLoading = false;
    return this.buildCache();
  }

  // 增量添加图片到缓存
  addImageToCache(image) {
    try {
      // 检查图片是否已存在
      const existingIndex = this.cache.allImages.findIndex(img => img.id === image.id);
      if (existingIndex !== -1) {
        logger.debug('📝 图片已存在于缓存中:', image.id);
        return false;
      }

      // 添加到主列表
      this.cache.allImages.push(image);
      
      // 更新ID索引映射
      this.imageIdToIndex.set(image.id, this.cache.allImages.length - 1);
      
      // 更新统计信息
      const normalizedCategory = this._normalizeCategoryId(image.category);
      this.cache.categoryCounts[normalizedCategory] = (this.cache.categoryCounts[normalizedCategory] || 0) + 1;
      // 城市统计
      if (image.city) {
        this.cache.cityCounts[image.city] = (this.cache.cityCounts[image.city] || 0) + 1;
      }
      // 颜色统计（排除 null、undefined 和空字符串）
      if (image.background_color && 
          typeof image.background_color === 'string' && 
          image.background_color.trim() !== '') {
        this.cache.colorCounts[image.background_color] = (this.cache.colorCounts[image.background_color] || 0) + 1;
      }
      // 目录统计
      const dirPath = this._extractDirectoryPath(image);
      if (dirPath) {
        this.cache.directoryCounts[dirPath] = (this.cache.directoryCounts[dirPath] || 0) + 1;
      }
      
      // 更新最近图片列表（保持前20张）
      this.cache.recentImages = this.cache.allImages
        .sort((a, b) => {
          const timeA = a.takenAt ? new Date(a.takenAt).getTime() : a.timestamp;
          const timeB = b.takenAt ? new Date(b.takenAt).getTime() : b.timestamp;
          return timeB - timeA;
        })
        .slice(0, 20);
      
      logger.debug('📝 图片已增量添加到缓存:', image.id);
      
      // 通知监听器
      this.notifyListeners();
      
      return true;
      
    } catch (error) {
      console.error('❌ 添加图片到缓存失败:', error);
      return false;
    }
  }

  // 按需加载图片详细信息
  async getImageDetails(imageId) {
    try {
      const fullImage = await this.imageStorageService.getImageById(imageId);
      return fullImage;
    } catch (error) {
      console.error('加载图片详细信息失败:', error);
      return null;
    }
  }

  // 更新单个图片的分类
  updateImageClassification(imageId, newCategory, additionalData = {}) {
    try {
      logger.debug(`🔄 更新图片分类: ${imageId} -> ${newCategory}`);
      
      // 找到要更新的图片
      const imageIndex = this.cache.allImages.findIndex(img => img.id === imageId);
      if (imageIndex === -1) {
        logger.debug(`⚠️ 未找到图片: ${imageId}`);
        return false;
      }
      
      const oldCategory = this.cache.allImages[imageIndex].category;
      
      // 更新图片分类，同时保留其他检测结果信息
      this.cache.allImages[imageIndex] = {
        ...this.cache.allImages[imageIndex], // 保留原有数据
        category: newCategory,               // 更新分类
        ...additionalData                   // 合并额外数据（如检测结果）
      };
      
      // 重新构建分类索引
      // 不再需要重建索引，直接通过过滤获取数据
      
      // 重新构建分类统计和城市统计（城市统计需要排除tobecleaned）
      this._rebuildCategoryCounts();
      this._rebuildCityCounts();
      this._rebuildColorCounts();
      this._rebuildDirectoryCounts();
    
      
      logger.debug(`✅ 图片分类更新完成: ${oldCategory} -> ${newCategory}`);
      
      // 通知监听器
      this.notifyListeners();
      
      return true;
      
    } catch (error) {
      console.error('❌ 更新图片分类失败:', error);
      return false;
    }
  }
  
  // 重新构建ID到索引的映射
  _rebuildImageIdIndex(forceLog = false) {
    if (forceLog) {
      logger.debug(`🔄 重新构建ID映射表，图片数量: ${this.cache.allImages.length}`);
    } else {
    }
    this.imageIdToIndex.clear();
    this.cache.allImages.forEach((img, index) => {
      this.imageIdToIndex.set(img.id, index);
    });
    if (forceLog) {
      logger.debug(`✅ ID映射表构建完成，映射条目数: ${this.imageIdToIndex.size}`);
    }
  }

  // 通过ID快速获取图片对象（O(1)复杂度）
  _getImageById(imageId) {
    const index = this.imageIdToIndex.get(imageId);
    
    // 调试：检查映射表状态
    if (index === undefined) {
      // 映射表中找不到，尝试直接查找
      const image = this.cache.allImages.find(img => img.id === imageId);
      if (image) {
        // 找到了说明映射表过期
        // 但如果正在构建缓存，不重建映射表，直接返回
        if (this.isLoading) {
          return image; // 安全：buildCache已经设置好完整的allImages
        }
        // 不在构建中，重建映射表
        this._rebuildImageIdIndex(false);
        return image;
      }
      
      // 确实没找到
      return null;
    }
    
    const image = this.cache.allImages[index];
    
    // 索引处没有对象
    if (!image) {
      // 如果正在构建缓存，直接返回null，不要重建
      if (this.isLoading) {
        return null;
      }
      this._rebuildImageIdIndex(false);
      return null;
    }
    
    // 验证ID匹配
    if (image.id !== imageId) {
      // 如果正在构建缓存，使用find查找，不要重建
      if (this.isLoading) {
        return this.cache.allImages.find(img => img.id === imageId) || null;
      }
      
      // 不在构建中，重建映射表
      this._rebuildImageIdIndex(false);
      const correctImage = this.cache.allImages.find(img => img.id === imageId);
      return correctImage || null;
    }
    
    return image;
  }

  // 重新构建分类统计
  _rebuildCategoryCounts() {
    this.cache.categoryCounts = {};
    this.cache.allImages.forEach((img, index) => {
      if (img.category) {
        // 使用标准化的分类ID作为键（英文ID）
        const normalizedCategory = this._normalizeCategoryId(img.category);
        this.cache.categoryCounts[normalizedCategory] = (this.cache.categoryCounts[normalizedCategory] || 0) + 1;
      }
    });
  }

  // 标准化分类ID（直接使用ConfigService）
  _normalizeCategoryId(categoryInput) {
    // 确保配置服务已加载
    if (!configService || !configService.isConfigLoaded()) {
      throw new Error('ConfigService未初始化或配置未加载');
    }
    
    const categoryMap = configService.getCategoryNameMap();
    
    // 如果输入已经是键名，直接返回
    if (categoryMap[categoryInput]) {
      return categoryInput;
    }
    
    // 如果是显示名称，查找对应的键名
    for (const [key, category] of Object.entries(categoryMap)) {
      if (category.chinese === categoryInput || category.english === categoryInput) {
        return key;
      }
    }
    
    // 如果都没找到，返回原值（支持 'NA' 等未配置的分类）
    return categoryInput;
  }

  // 更新选中统计 - 添加图片
  _updateSelectedStatsAdd(image) {
    if (!image.category) {
      console.error(`❌ 图片 ${image.id} 缺少分类信息:`, image);
      throw new Error(`图片 ${image.id} 缺少分类信息`);
    }
    const category = this._normalizeCategoryId(image.category);
    this.cache.selectedCategoryCounts[category] = (this.cache.selectedCategoryCounts[category] || 0) + 1;
    
    logger.debug(`🔍 更新选中统计 - 添加图片: ${image.id}, city: ${image.city}, category: ${image.category}, similarityGroupIndex: ${image.similarityGroupIndex}`);
    if (image.city) {
      this.cache.selectedCityCounts[image.city] = (this.cache.selectedCityCounts[image.city] || 0) + 1;
      logger.debug(`🔍 城市选中统计更新: ${image.city} = ${this.cache.selectedCityCounts[image.city]}`);
    } else {
      logger.debug(`⚠️ 图片 ${image.id} 没有城市信息，跳过城市统计更新`);
    }
    
    if (image.similarityGroupIndex) {
      // 确保selectedSimilarityGroupCounts对象存在
      if (!this.cache.selectedSimilarityGroupCounts) {
        this.cache.selectedSimilarityGroupCounts = {};
      }
      this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex] = (this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex] || 0) + 1;
      logger.debug(`🔍 相似组选中统计更新: ${image.similarityGroupIndex} = ${this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex]}`);
    } else {
      logger.debug(`⚠️ 图片 ${image.id} 没有相似组信息，跳过相似组统计更新`);
    }
  }

  // 更新选中统计 - 移除图片
  _updateSelectedStatsRemove(image) {
    if (!image.category) {
      console.error(`❌ 图片 ${image.id} 缺少分类信息:`, image);
      throw new Error(`图片 ${image.id} 缺少分类信息`);
    }
    const category = this._normalizeCategoryId(image.category);
    if (this.cache.selectedCategoryCounts[category] > 0) {
      this.cache.selectedCategoryCounts[category]--;
      if (this.cache.selectedCategoryCounts[category] === 0) {
        delete this.cache.selectedCategoryCounts[category];
      }
    }
    
    if (image.city && this.cache.selectedCityCounts[image.city] > 0) {
      this.cache.selectedCityCounts[image.city]--;
      if (this.cache.selectedCityCounts[image.city] === 0) {
        delete this.cache.selectedCityCounts[image.city];
      }
    }
    
    if (image.similarityGroupIndex) {
      // 确保selectedSimilarityGroupCounts对象存在
      if (!this.cache.selectedSimilarityGroupCounts) {
        this.cache.selectedSimilarityGroupCounts = {};
      }
      if (this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex] > 0) {
        this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex]--;
        if (this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex] === 0) {
          delete this.cache.selectedSimilarityGroupCounts[image.similarityGroupIndex];
        }
      }
    }
  }

  // 清空选中统计
  _clearSelectedStats() {
    this.cache.selectedCategoryCounts = {};
    this.cache.selectedCityCounts = {};
    this.cache.selectedSimilarityGroupCounts = {};
  }

  // 加载相似组数据到图片对象中
  async _loadSimilarityGroupData() {
    try {
      // 获取相似组索引
      const similarityGroupIndex = await this.imageStorageService.getSimilarityGroupIndex();
      
      if (!similarityGroupIndex || Object.keys(similarityGroupIndex).length === 0) {
        return;
      }
      
      // 为每个图片设置相似组信息
      for (const [groupId, imageIds] of Object.entries(similarityGroupIndex)) {
        if (Array.isArray(imageIds)) {
          for (const imageId of imageIds) {
            const image = this._getImageById(imageId);
            if (image) {
              image.similarityGroupIndex = groupId;
            }
          }
        }
      }
      
    } catch (error) {
      console.error('❌ 加载相似组数据失败:', error);
    }
  }

  // 重新构建选中统计
  _rebuildSelectedStats() {
    logger.debug('📊 开始重新计算选中统计...');
    this.cache.selectedCategoryCounts = {};
    this.cache.selectedCityCounts = {};
    this.cache.selectedSimilarityGroupCounts = {};
    
    this.cache.allImages.forEach(img => {
      if (img.selected) {
        if (img.category) {
          const category = this._normalizeCategoryId(img.category);
          this.cache.selectedCategoryCounts[category] = (this.cache.selectedCategoryCounts[category] || 0) + 1;
        }
        if (img.city) {
          this.cache.selectedCityCounts[img.city] = (this.cache.selectedCityCounts[img.city] || 0) + 1;
        }
        if (img.similarityGroupIndex) {
          // 确保selectedSimilarityGroupCounts对象存在
          if (!this.cache.selectedSimilarityGroupCounts) {
            this.cache.selectedSimilarityGroupCounts = {};
          }
          this.cache.selectedSimilarityGroupCounts[img.similarityGroupIndex] = (this.cache.selectedSimilarityGroupCounts[img.similarityGroupIndex] || 0) + 1;
        }
      }
    });
    
    logger.debug('📊 选中统计重建完成:', {
      selectedCategoryCounts: this.cache.selectedCategoryCounts,
      selectedCityCounts: this.cache.selectedCityCounts,
      selectedSimilarityGroupCounts: this.cache.selectedSimilarityGroupCounts
    });
  }

  // 获取选中图片的分类统计
  getSelectedCategoryCounts() {
    return { ...this.cache.selectedCategoryCounts };
  }

  // 获取选中图片的城市统计
  getSelectedCityCounts() {
    return { ...this.cache.selectedCityCounts };
  }

  // 获取选中图片的相似组统计
  getSelectedSimilarityGroupCounts() {
    return { ...this.cache.selectedSimilarityGroupCounts };
  }

  // 手动更新相似组统计（用于相似组模式）
  _updateSimilarityGroupStats(groupId, isSelected) {
    if (isSelected) {
      this.cache.selectedSimilarityGroupCounts[groupId] = (this.cache.selectedSimilarityGroupCounts[groupId] || 0) + 1;
    } else {
      if (this.cache.selectedSimilarityGroupCounts[groupId] > 0) {
        this.cache.selectedSimilarityGroupCounts[groupId]--;
        if (this.cache.selectedSimilarityGroupCounts[groupId] === 0) {
          delete this.cache.selectedSimilarityGroupCounts[groupId];
        }
      }
    }
    logger.debug(`🔍 手动更新相似组统计: ${groupId} = ${this.cache.selectedSimilarityGroupCounts[groupId] || 0}`);
  }
  
  // 删除单个图片
  removeImage(imageId) {
    try {
      logger.debug(`🗑️ 删除图片: ${imageId}`);
      
      // 找到要删除的图片
      const imageIndex = this.cache.allImages.findIndex(img => img.id === imageId);
      if (imageIndex === -1) {
        logger.debug(`⚠️ 未找到图片: ${imageId}`);
        return false;
      }
      
      const imageToDelete = this.cache.allImages[imageIndex];
      
      // 从 allImages 中删除
      this.cache.allImages.splice(imageIndex, 1);
      
      // 重新构建ID索引映射（因为数组索引发生了变化）
      this._rebuildImageIdIndex();
      
      // 重新构建统计信息
      this._rebuildCategoryCounts();
      this._rebuildCityCounts();
      this._rebuildColorCounts();
      this._rebuildDirectoryCounts();
      this._rebuildRecentImages();
      
      logger.debug(`✅ 图片删除完成: ${imageToDelete.fileName}`);
      
      // 通知监听器
      this.notifyListeners();
      this.notifySelectionListeners();
      
      return true;
      
    } catch (error) {
      console.error('❌ 删除图片失败:', error);
      return false;
    }
  }
  
  // 重新构建城市统计
  _rebuildCityCounts() {
    this.cache.cityCounts = {};
    let cityImageCount = 0;
    
    this.cache.allImages.forEach(img => {
      if (img.city) {
        this.cache.cityCounts[img.city] = (this.cache.cityCounts[img.city] || 0) + 1;
        cityImageCount++;
      }
    });
    
  }

  // 重新构建颜色统计
  _rebuildColorCounts() {
    this.cache.colorCounts = {};
    
    this.cache.allImages.forEach(img => {
      // 只统计有背景颜色的图片（排除 null、undefined 和空字符串）
      // 检查 background_color 是否存在且不为空
      if (img.background_color && 
          typeof img.background_color === 'string' && 
          img.background_color.trim() !== '') {
        this.cache.colorCounts[img.background_color] = (this.cache.colorCounts[img.background_color] || 0) + 1;
      }
    });
  }

  // 从图片URI中提取目录路径
  _extractDirectoryPath(image) {
    try {
      const localPath = getLocalPath(image);
      if (!localPath || typeof localPath !== 'string') {
        return null;
      }
      
      // 规范化路径（统一使用正斜杠）
      const normalizedPath = localPath.replace(/\\/g, '/');
      
      // 找到最后一个路径分隔符的位置
      const lastSeparatorIndex = normalizedPath.lastIndexOf('/');
      if (lastSeparatorIndex === -1) {
        // 没有路径分隔符，说明是根目录或文件名
        return null;
      }
      
      // 提取目录路径
      const dirPath = normalizedPath.substring(0, lastSeparatorIndex);
      
      // 如果目录路径为空，返回 null
      if (!dirPath || dirPath.trim() === '') {
        return null;
      }
      
      return dirPath;
    } catch (error) {
      logger.debug('提取目录路径失败:', error);
      return null;
    }
  }

  // 重新构建目录统计
  _rebuildDirectoryCounts() {
    this.cache.directoryCounts = {};
    
    this.cache.allImages.forEach(img => {
      const dirPath = this._extractDirectoryPath(img);
      if (dirPath) {
        this.cache.directoryCounts[dirPath] = (this.cache.directoryCounts[dirPath] || 0) + 1;
      }
    });
  }

  // 根据目录获取图片
  getImagesByDirectory(directory) {
    if (!directory || typeof directory !== 'string') {
      return [];
    }
    
    // 规范化目录路径（统一使用正斜杠）
    const normalizedDir = directory.replace(/\\/g, '/');
    
    return this.cache.allImages.filter(img => {
      const imgDir = this._extractDirectoryPath(img);
      if (!imgDir) {
        return false;
      }
      
      // 规范化图片目录路径
      const normalizedImgDir = imgDir.replace(/\\/g, '/');
      
      // 精确匹配：只返回直接属于该目录的图片（不包含子目录）
      return normalizedImgDir === normalizedDir;
    });
  }
  
  // 重新构建最近图片
  _rebuildRecentImages() {
    this.cache.recentImages = this.cache.allImages
      .sort((a, b) => new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt))
      .slice(0, 20);
  }
  
  // 批量删除图片
  removeImages(imageIds) {
    try {
      logger.debug(`🗑️ 批量删除图片: ${imageIds.length} 张`);
      
      // 创建要删除的图片ID集合，提高查找效率
      const imageIdSet = new Set(imageIds);
      
      // 一次遍历找到所有要删除的图片
      const imagesToDelete = [];
      const remainingImages = [];
      
      this.cache.allImages.forEach(img => {
        if (imageIdSet.has(img.id)) {
          imagesToDelete.push(img);
        } else {
          remainingImages.push(img);
        }
      });
      
      if (imagesToDelete.length === 0) {
        console.warn('⚠️ 没有找到任何要删除的图片');
        return false;
      }
      
      // 更新 allImages 数组
      this.cache.allImages = remainingImages;
      
      // 重新构建ID索引映射（因为数组内容发生了变化）
      this._rebuildImageIdIndex();
      
      // 重新构建统计信息
      this._rebuildCategoryCounts();
      this._rebuildCityCounts();
      this._rebuildColorCounts();
      this._rebuildDirectoryCounts();
      this._rebuildSelectedStats();
      this._rebuildRecentImages();
      
      logger.debug(`✅ 批量删除完成: ${imagesToDelete.length}/${imageIds.length} 张图片`);
      
      // 通知监听器
      this.notifyListeners();
      this.notifySelectionListeners();
      
      return true;
      
    } catch (error) {
      console.error('❌ 批量删除图片失败:', error);
      return false;
    }
  }

  // ==================== 选中状态管理 ====================
  
  // 添加选中状态监听器
  addSelectionListener(callback) {
    this.selectionListeners.add(callback);
    return () => this.selectionListeners.delete(callback);
  }

  // 通知选中状态变化
  notifySelectionListeners() {
    const selectedImages = this.getSelectedImages();
    this.selectionListeners.forEach(callback => callback(selectedImages));
  }

  // 获取选中的图片对象数组
  getSelectedImages(category = null, city = null, similarityGroupId = null) {
    let filteredImages = this.cache.allImages.filter(img => img.selected);
    
    // 如果指定了分类，按分类过滤
    if (category) {
      const normalizedCategory = this._normalizeCategoryId(category);
      filteredImages = filteredImages.filter(img => {
        if (!img.category) {
          console.error(`❌ 图片 ${img.id} 缺少分类信息:`, img);
          throw new Error(`图片 ${img.id} 缺少分类信息`);
        }
        const imgCategory = this._normalizeCategoryId(img.category);
        return imgCategory === normalizedCategory;
      });
    }
    
    // 如果指定了城市，按城市过滤
    if (city) {
      filteredImages = filteredImages.filter(img => img.city === city);
    }
    
    // 如果指定了相似组，按相似组过滤
    if (similarityGroupId) {
      filteredImages = filteredImages.filter(img => img.similarityGroupIndex === similarityGroupId);
    }
    
    return filteredImages;
  }

  // 获取指定分类的所有图片
  getImagesByCategory(category) {
    const normalizedCategory = this._normalizeCategoryId(category);
    
    // 调试：统计分类分布
    if (category === 'NA') {
      const categoryStats = {};
      this.cache.allImages.forEach(img => {
        const cat = img?.category || 'null';
        categoryStats[cat] = (categoryStats[cat] || 0) + 1;
      });
      logger.debug(`🔍 [NA查询] 缓存中图片分类统计:`, categoryStats);
      logger.debug(`🔍 [NA查询] 标准化后的分类ID: ${normalizedCategory}, 缓存总数: ${this.cache.allImages.length}`);
    }
    
    const result = this.cache.allImages.filter(img => {
      // 🆕 添加空值检查
      if (!img || typeof img !== 'object') {
        console.warn(`⚠️ 发现无效的图片对象:`, img);
        return false;
      }
      
      if (!img.category) {
        console.error(`❌ 图片 ${img.id || 'unknown'} 缺少分类信息:`, img);
        return false; // 改为返回false而不是抛出错误
      }
      
      const imgCategory = this._normalizeCategoryId(img.category);
      return imgCategory === normalizedCategory;
    });
    
    if (category === 'NA') {
      logger.debug(`🔍 [NA查询] 找到 ${result.length} 张NA分类图片`);
    }
    
    return result;
  }

  // 获取指定城市的所有图片
  getImagesByCity(city) {
    return this.cache.allImages.filter(img => {
      // 🆕 添加空值检查
      if (!img || typeof img !== 'object') {
        console.warn(`⚠️ 发现无效的图片对象:`, img);
        return false;
      }
      return img.city === city;
    });
  }

  // 获取指定相似组的所有图片
  getImagesBySimilarityGroup(groupId) {
    return this.cache.allImages.filter(img => {
      // 🆕 添加空值检查
      if (!img || typeof img !== 'object') {
        console.warn(`⚠️ 发现无效的图片对象:`, img);
        return false;
      }
      return img.similarityGroupIndex === groupId;
    });
  }

  // 检查图片是否被选中
  isImageSelected(imageId) {
    const image = this._getImageById(imageId);
    return image ? image.selected === true : false;
  }

  // 切换图片选中状态
  toggleImageSelection(imageId) {
    logger.debug(`🔄 GlobalImageCache 切换图片选择状态: ${imageId}`);
    
    // 使用快速查找获取图片对象
    const image = this._getImageById(imageId);
    if (!image) {
      logger.debug(`⚠️ 未找到图片: ${imageId}`);
      return;
    }
    
    // 调试：检查图片对象的分类信息
    logger.debug(`🔍 图片对象详情:`, {
      id: image.id,
      fileName: image.fileName,
      category: image.category,
      hasCategory: 'category' in image,
      categoryType: typeof image.category
    });
    
    if (image.selected) {
      image.selected = false;
      this._updateSelectedStatsRemove(image);
    } else {
      image.selected = true;
      this._updateSelectedStatsAdd(image);
    }
    logger.debug(`🔄 GlobalImageCache 新的选中状态: ${imageId} = ${image.selected}`);
    this.notifySelectionListeners();
  }

  // 设置图片选中状态
  setImageSelection(imageId, selected) {
    const image = this._getImageById(imageId);
    if (!image) {
      logger.debug(`⚠️ 未找到图片: ${imageId}`);
      return;
    }

    if (image.selected !== selected) {
      image.selected = selected;
      if (selected) {
        this._updateSelectedStatsAdd(image);
      } else {
        this._updateSelectedStatsRemove(image);
      }
      this.notifySelectionListeners();
    }
  }

  // 批量设置图片选中状态（不触发通知）
  setImageSelectionBatch(imageIds, selected) {
    imageIds.forEach(id => {
      const image = this._getImageById(id);
      if (image && image.selected !== selected) {
        image.selected = selected;
        if (selected) {
          this._updateSelectedStatsAdd(image);
        } else {
          this._updateSelectedStatsRemove(image);
        }
      }
    });
    // 不立即通知，等待外部调用 notifySelectionListeners
  }

  

  // 添加到选中状态 - 不清空现有选中
  addToSelection(imageIds) {
    imageIds.forEach(id => {
      const image = this._getImageById(id);
      if (image && !image.selected) {
        image.selected = true;
        this._updateSelectedStatsAdd(image);
      }
    });
    this.notifySelectionListeners();
  }

  // 批量添加到选中状态 - 优化版本，避免创建大数组
  addToSelectionBatch(imageObjects) {
    imageObjects.forEach(img => {
      if (!img.selected) {
        img.selected = true;
        this._updateSelectedStatsAdd(img);
      }
    });
    this.notifySelectionListeners();
  }

  // 批量取消选择（优化版本）- 取消指定图片的选中状态
  deselectBatch(imageIds) {
    // 使用O(1)快速查找，避免遍历整个数组
    imageIds.forEach(id => {
      const image = this._getImageById(id);
      if (image && image.selected) {
        image.selected = false;
        this._updateSelectedStatsRemove(image);
      }
    });
    this.notifySelectionListeners();
  }




  // 获取选中数量
  getSelectedCount() {
    return this.cache.allImages.filter(img => img.selected).length;
  }

  // 清空缓存
  clearCache() {
    this.cache = {
      allImages: [],
      categoryCounts: {},
      cityCounts: {},
      selectedCategoryCounts: {},
      selectedCityCounts: {},
    };
    this.imageIdToIndex.clear();
    // 不要清空监听器，保持现有的监听器
    // this.listeners = new Set();
    // this.selectionListeners = new Set();
    
    // 通知所有监听器缓存已清空
    this.notifyListeners();
    this.notifySelectionListeners();
    logger.debug('🗑️ 缓存已清空');
  }
}

// 导出单例实例
export default new GlobalImageCache();

