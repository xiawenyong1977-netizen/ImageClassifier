// 统一数据服务 - 封装缓存和数据库的复杂逻辑
import GlobalImageCache from './GlobalImageCache.js';
import ImageStorageService from './ImageStorageService.js';
import ImageSimilarityService from './ImageSimilarityService.js';
import configService from './ConfigService.js';

class UnifiedDataService {
  constructor() {
    this.imageStorageService = new ImageStorageService();
    this.imageSimilarityService = new ImageSimilarityService();
    this.imageCache = GlobalImageCache;
    this.configService = configService;
    this.isInitialized = false;
    
    // 缓存变化监听器
    this.cacheListeners = new Set();
    
    // 监听缓存变化，转发给外部监听器
    this.imageCache.addListener((cache) => {
      this.cacheListeners.forEach(listener => listener(cache));
    });
  }

  // ==================== 监听器接口 ====================
  
  /**
   * 添加缓存变化监听器
   */
  addCacheListener(callback) {
    this.cacheListeners.add(callback);
    return () => this.cacheListeners.delete(callback);
  }
  
  // ==================== 初始化接口 ====================
  
  /**
   * 初始化服务
   * 包括缓存构建、数据库连接等
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('🔄 UnifiedDataService 已经初始化');
      return true;
    }

    try {
      console.log('🚀 开始初始化 UnifiedDataService...');
      
      // 1. 初始化数据库服务
      await this.imageStorageService.ensureInitialized();
      console.log('✅ 数据库服务初始化完成');
      
      // 2. 初始化相似度检测服务
      await this.imageSimilarityService.initialize();
      console.log('✅ 相似度检测服务初始化完成');
      
      // 3. 构建缓存
      await this.imageCache.buildCache();
      console.log('✅ 缓存构建完成');
      
      this.isInitialized = true;
      console.log('🎉 UnifiedDataService 初始化完成');
      return true;
      
    } catch (error) {
      console.error('❌ UnifiedDataService 初始化失败:', error);
      throw error;
    }
  }

  // ==================== 读接口 ====================
  
  /**
   * 获取所有图片
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readAllImages() {
    try {
      // 先从缓存读取
      const cache = this.imageCache.getCache();
      if (cache.allImages && cache.allImages.length > 0) {
        console.log('📖 从缓存读取所有图片:', cache.allImages.length);
        return cache.allImages;
      }
      
      // 缓存没有，从数据库读取并更新缓存
      console.log('📖 从数据库读取所有图片');
      await this.imageCache.refreshCache();
      
      const updatedCache = this.imageCache.getCache();
      return updatedCache.allImages;
      
    } catch (error) {
      console.error('❌ 读取所有图片失败:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取图片基本信息
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readImageById(imageId) {
    try {
      // 先从缓存查找
      const cache = this.imageCache.getCache();
      const cachedImage = cache.allImages.find(img => img.id === imageId);
      
      if (cachedImage) {
        console.log('📖 从缓存读取图片基本信息:', imageId);
        return cachedImage;
      }
      
      // 缓存没有，从数据库读取
      console.log('📖 从数据库读取图片基本信息:', imageId);
      const image = await this.imageStorageService.getImageById(imageId);
      
      // 如果找到图片，将其添加到缓存中（增量更新，性能更好）
      if (image) {
        this.imageCache.addImageToCache(image);
      }
      
      return image;
      
    } catch (error) {
      console.error('❌ 读取图片基本信息失败:', error);
      throw error;
    }
  }

  /**
   * 根据ID获取图片详细信息
   * 用于图片详情页面，包含所有字段
   */
  async readImageDetailsById(imageId) {
    try {
      console.log('📖 从数据库读取图片详细信息:', imageId);
      const fullImage = await this.imageStorageService.getImageDetailsById(imageId);
      
      return fullImage;
      
    } catch (error) {
      console.error('❌ 读取图片详细信息失败:', error);
      throw error;
    }
  }

  /**
   * 根据分类获取图片
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readImagesByCategory(category) {
    try {
      // 使用标准化的分类ID
      const normalizedCategory = this.getCategoryId(category);
      console.log(`📖 读取分类图片: 原始=${category}, 标准化=${normalizedCategory}`);
      
      // 直接从缓存获取分类图片
      const categoryImages = this.imageCache.getImagesByCategory(normalizedCategory);
      console.log('📖 从缓存读取分类图片:', normalizedCategory, categoryImages.length);
      return categoryImages;
      
    } catch (error) {
      console.error('❌ 读取分类图片失败:', error);
      throw error;
    }
  }

  /**
   * 获取最近图片
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readRecentImages(limit = 20) {
    try {
      // 先从缓存读取
      const cache = this.imageCache.getCache();
      if (cache.recentImages && cache.recentImages.length > 0) {
        console.log('📖 从缓存读取最近图片:', cache.recentImages.length);
        return cache.recentImages.slice(0, limit);
      }
      
      // 缓存没有，从数据库读取并更新缓存
      console.log('📖 从数据库读取最近图片');
      await this.imageCache.refreshCache();
      
      const updatedCache = this.imageCache.getCache();
      return updatedCache.recentImages.slice(0, limit);
      
    } catch (error) {
      console.error('❌ 读取最近图片失败:', error);
      throw error;
    }
  }

  /**
   * 获取指定分类的最近图片
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readRecentImagesByCategory(category, limit = 4) {
    try {
      // 使用标准化的分类ID
      const normalizedCategory = this.getCategoryId(category);
      console.log(`📖 读取分类最近图片: 原始=${category}, 标准化=${normalizedCategory}`);
      
      // 直接从缓存获取分类图片
      const categoryImages = this.imageCache.getImagesByCategory(normalizedCategory);
      
      // 按时间排序并取前N张
      const recentImages = categoryImages
        .sort((a, b) => {
          const timeA = a.takenAt ? new Date(a.takenAt).getTime() : a.timestamp;
          const timeB = b.takenAt ? new Date(b.takenAt).getTime() : b.timestamp;
          return timeB - timeA;
        })
        .slice(0, limit);
      
      console.log('📖 从缓存读取分类最近图片:', normalizedCategory, recentImages.length);
      return recentImages;
      
    } catch (error) {
      console.error('❌ 读取分类最近图片失败:', error);
      throw error;
    }
  }

  /**
   * 获取指定城市的最近图片
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readRecentImagesByCity(city, limit = 4) {
    try {
      console.log(`📖 读取城市最近图片: ${city}`);
      
      // 直接从缓存获取城市图片
      const cityImages = this.imageCache.getImagesByCity(city);
      
      // 按时间排序并取前N张
      const recentImages = cityImages
        .sort((a, b) => {
          const timeA = a.takenAt ? new Date(a.takenAt).getTime() : a.timestamp;
          const timeB = b.takenAt ? new Date(b.takenAt).getTime() : b.timestamp;
          return timeB - timeA;
        })
        .slice(0, limit);
      
      console.log('📖 从缓存读取城市最近图片:', city, recentImages.length);
      return recentImages;
      
    } catch (error) {
      console.error('❌ 读取城市最近图片失败:', error);
      throw error;
    }
  }

  /**
   * 获取分类统计
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readCategoryCounts() {
    try {
      // 先从缓存读取
      const cache = this.imageCache.getCache();
      if (cache.categoryCounts && Object.keys(cache.categoryCounts).length > 0) {
        console.log('📖 从缓存读取分类统计');
        return cache.categoryCounts;
      }
      
      // 缓存没有，从数据库读取并更新缓存
      console.log('📖 从数据库读取分类统计');
      await this.imageCache.refreshCache();
      
      const updatedCache = this.imageCache.getCache();
      return updatedCache.categoryCounts;
      
    } catch (error) {
      console.error('❌ 读取分类统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取城市统计
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readCityCounts() {
    try {
      // 先从缓存读取
      const cache = this.imageCache.getCache();
      if (cache.cityCounts && Object.keys(cache.cityCounts).length > 0) {
        console.log('📖 从缓存读取城市统计');
        return cache.cityCounts;
      }
      
      // 缓存没有，从数据库读取并更新缓存
      console.log('📖 从数据库读取城市统计');
      await this.imageCache.refreshCache();
      
      const updatedCache = this.imageCache.getCache();
      return updatedCache.cityCounts;
      
    } catch (error) {
      console.error('❌ 读取城市统计失败:', error);
      throw error;
    }
  }

  /**
   * 根据城市/地区获取图片
   * 优先从缓存读取，缓存没有则从数据库读取
   */
  async readImagesByLocation(city, country) {
    try {
      // 直接从缓存获取城市图片
      let filteredImages = [];
      
      if (city) {
        filteredImages = this.imageCache.getImagesByCity(city);
      } else {
        // 如果没有指定城市，返回所有有城市信息的图片
        filteredImages = this.imageCache.getCache().allImages.filter(img => img.city);
      }
      
      // 如果指定了国家，进一步过滤
      if (country) {
        filteredImages = filteredImages.filter(img => 
          img.country && img.country.toLowerCase().includes(country.toLowerCase())
        );
      }
      
      console.log('📖 从缓存读取城市图片:', city, filteredImages.length);
      return filteredImages;
      
    } catch (error) {
      console.error('❌ 读取城市图片失败:', error);
      throw error;
    }
  }

  /**
   * 搜索图片
   * 优先从缓存搜索，缓存没有则从数据库搜索
   */

  // ==================== 写接口 ====================
  
  /**
   * 更新图片分类ID（独立接口，只更新分类相关字段）
   */
  async updateImageCategory(imageId, newCategory, newConfidence = 'manual') {
    try {
      console.log('✍️ 更新图片分类:', imageId, '->', newCategory);
      
      // 1. 先写数据库
      const updatedImage = await this.imageStorageService.updateImageCategory(imageId, newCategory, newConfidence);
      console.log('✅ 数据库更新完成');
      
      // 2. 精确更新缓存（只更新分类相关字段）
      const updateSuccess = this.imageCache.updateImageClassification(
        imageId, 
        newCategory, 
        { confidence: newConfidence } // 只传递需要更新的字段
      );
      if (updateSuccess) {
        console.log('✅ 缓存精确更新完成');
      } else {
        console.warn('⚠️ 缓存精确更新失败，将进行全量更新');
        await this.imageCache.refreshCache();
        console.log('✅ 缓存全量更新完成');
      }
      
      return updatedImage;
      
    } catch (error) {
      console.error('❌ 更新图片分类失败:', error);
      throw error;
    }
  }

  /**
   * 保存图片分类结果
   * 先写缓存，再写数据库
   */
  async writeImageClassification(imageData) {
    try {
      console.log('✍️ 保存图片分类结果:', imageData.fileName);
      
      // 1. 先写数据库
      const savedImage = await this.imageStorageService.saveImageClassification(imageData);
      console.log('✅ 数据库写入完成');
      
      // 2. 精确更新缓存
      const updateSuccess = this.imageCache.updateImageClassification(savedImage.id, savedImage.category);
      if (updateSuccess) {
        console.log('✅ 缓存精确更新完成');
      } else {
        console.warn('⚠️ 缓存精确更新失败，将进行全量更新');
        await this.imageCache.refreshCache();
        console.log('✅ 缓存全量更新完成');
      }
      
      return savedImage;
      
    } catch (error) {
      console.error('❌ 保存图片分类失败:', error);
      throw error;
    }
  }

  /**
   * 批量保存图片分类结果
   * 先写缓存，再写数据库
   */

  /**
   * 删除图片
   * 先写缓存，再写数据库
   */
  async writeDeleteImage(imageId) {
    try {
      console.log('✍️ 删除图片:', imageId);
      
      // 1. 先写数据库
      const result = await this.imageStorageService.deleteImage(imageId);
      console.log('✅ 数据库删除完成');
      
      // 2. 精确删除缓存
      const deleteSuccess = this.imageCache.removeImage(imageId);
      if (deleteSuccess) {
        console.log('✅ 缓存精确删除完成');
      } else {
        console.warn('⚠️ 缓存精确删除失败，将进行全量更新');
        await this.imageCache.refreshCache();
        console.log('✅ 缓存全量更新完成');
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ 删除图片失败:', error);
      throw error;
    }
  }

  /**
   * 批量删除图片
   * 先写缓存，再写数据库
   */
  async writeDeleteImages(imageIds, onProgress) {
    try {
      console.log('✍️ 批量删除图片:', imageIds.length);
      
      // 1. 先写数据库
      const result = await this.imageStorageService.deleteImages(imageIds, onProgress);
      console.log('✅ 数据库批量删除完成');
      
      // 2. 精确批量删除缓存
      const deleteSuccess = this.imageCache.removeImages(imageIds);
      if (deleteSuccess) {
        console.log('✅ 缓存精确批量删除完成');
      } else {
        console.warn('⚠️ 缓存精确批量删除失败，将进行全量更新');
        await this.imageCache.refreshCache();
        console.log('✅ 缓存全量更新完成');
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ 批量删除图片失败:', error);
      throw error;
    }
  }

  /**
   * 读取应用设置
   * 直接从数据库读取
   */
  async readSettings() {
    try {
      console.log('📖 读取应用设置');
      
      const settings = await this.imageStorageService.getSettings();
      console.log('✅ 应用设置读取完成:', settings);
      console.log('🔧 hideEmptyCategories 值:', settings.hideEmptyCategories, '类型:', typeof settings.hideEmptyCategories);
      
      return settings;
      
    } catch (error) {
      console.error('❌ 读取设置失败:', error);
      throw error;
    }
  }

  /**
   * 保存应用设置
   * 先写缓存，再写数据库
   */
  async writeSettings(settings) {
    try {
      console.log('✍️ 保存应用设置');
      
      // 1. 先写数据库
      await this.imageStorageService.saveSettings(settings);
      console.log('✅ 数据库设置保存完成');
      
      // 2. 缓存不需要更新（设置不涉及图片数据）
      
      return true;
      
    } catch (error) {
      console.error('❌ 保存设置失败:', error);
      throw error;
    }
  }

  // ==================== 工具方法 ====================
  
  /**
   * 获取分类显示名称（从配置文件读取）
   */
  getCategoryDisplayName(categoryId) {
    // 如果配置服务可用，从配置读取
    if (this.configService && this.configService.isConfigLoaded()) {
      return this.configService.getCategoryDisplayName(categoryId, 'chinese');
    }
    
    // 后备方案：返回原ID
    return categoryId;
  }

  /**
   * 获取分类ID（从显示名称或ID获取标准化的分类ID）
   */
  getCategoryId(categoryInput) {
    // 如果配置服务可用，从配置读取
    if (this.configService && this.configService.isConfigLoaded()) {
      const categoryMap = this.configService.getCategoryNameMap();
      
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
    }
    
    // 如果都没找到，返回原值
    return categoryInput;
  }

  /**
   * 获取所有分类ID列表（从配置文件读取）
   */
  getAllCategoryIds() {
    // 如果配置服务可用，从配置读取
    if (this.configService && this.configService.isConfigLoaded()) {
      return this.configService.getAllCategoryIds();
    }
    
    // 后备方案：返回空数组
    return [];
  }

  /**
   * 强制刷新缓存（用于修复分类统计问题）
   */
  async forceRefreshCache() {
    try {
      console.log('🔄 强制刷新缓存...');
      await this.imageCache.refreshCache();
      console.log('✅ 缓存刷新完成');
    } catch (error) {
      console.error('❌ 强制刷新缓存失败:', error);
      throw error;
    }
  }


  // ==================== 缓存管理接口 ====================
  

  /**
   * 获取缓存状态
   */
  getCacheStatus() {
    const cache = this.imageCache.getCache();
    return {
      isLoaded: this.imageCache.isLoaded,
      isLoading: this.imageCache.isLoading,
      totalImages: cache.allImages ? cache.allImages.length : 0,
      categoryCount: Object.keys(cache.categoryCounts || {}).length,
      cityCount: Object.keys(cache.cityCounts || {}).length
    };
  }

  // ==================== 选中状态管理接口 ====================
  
  /**
   * 获取选中的图片
   */
  getSelectedImages(category = null, city = null) {
    return this.imageCache.getSelectedImages(category, city);
  }

  /**
   * 检查图片是否被选中
   */
  isImageSelected(imageId) {
    return this.imageCache.isImageSelected(imageId);
  }

  /**
   * 切换图片选中状态
   */
  toggleImageSelection(imageId) {
    this.imageCache.toggleImageSelection(imageId);
  }

  /**
   * 设置图片选中状态
   */
  setImageSelection(imageId, selected) {
    this.imageCache.setImageSelection(imageId, selected);
  }

  
  /**
   * 添加到选中状态
   * 不会清空现有选中，只是添加新的选中
   */
  addToSelection(imageIds) {
    this.imageCache.addToSelection(imageIds);
  }

  /**
   * 批量添加到选中状态 - 优化版本
   * 直接传递图片对象，避免创建大数组
   */
  addToSelectionBatch(imageObjects) {
    this.imageCache.addToSelectionBatch(imageObjects);
  }


  /**
   * 获取选中数量
   */
  getSelectedCount() {
    return this.imageCache.getSelectedCount();
  }

  /**
   * 获取按分类的选中状态统计
   * 返回每个分类的选中图片数量
   */
  getSelectedCountsByCategory() {
    try {
      // 直接使用预计算的统计，避免重复计算
      const categoryCounts = this.imageCache.getSelectedCategoryCounts();
      console.log('📊 按分类选中统计:', categoryCounts);
      return categoryCounts;
      
    } catch (error) {
      console.error('❌ 获取按分类选中统计失败:', error);
      return {};
    }
  }

  /**
   * 获取按城市的选中状态统计
   * 返回每个城市的选中图片数量
   */
  getSelectedCountsByCity() {
    try {
      // 直接使用预计算的统计，避免重复计算
      const cityCounts = this.imageCache.getSelectedCityCounts();
      console.log('📊 按城市选中统计:', cityCounts);
      return cityCounts;
      
    } catch (error) {
      console.error('❌ 获取按城市选中统计失败:', error);
      return {};
    }
  }

  /**
   * 获取按相似组的选中状态统计
   * 返回每个相似组的选中图片数量
   */
  getSelectedCountsBySimilarityGroup() {
    try {
      // 直接使用预计算的统计，避免重复计算
      const similarityGroupCounts = this.imageCache.getSelectedSimilarityGroupCounts();
      console.log('📊 按相似组选中统计:', similarityGroupCounts);
      return similarityGroupCounts;
      
    } catch (error) {
      console.error('❌ 获取按相似组选中统计失败:', error);
      return {};
    }
  }

  /**
   * 获取选中图片的详细信息统计
   * 包括总数、按分类、按城市、按时间等统计
   */
  getSelectedImagesStats() {
    try {
      const selectedImages = this.getSelectedImages(); // 获取所有选中图片用于统计
      const stats = {
        total: selectedImages.length,
        byCategory: {},
        byCity: {},
        byDate: {},
        totalSize: 0,
        averageSize: 0
      };
      
      selectedImages.forEach(image => {
        // 按分类统计
        if (!image.category) {
          console.error(`❌ 图片 ${image.id} 缺少分类信息:`, image);
          throw new Error(`图片 ${image.id} 缺少分类信息`);
        }
        const category = image.category;
        stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
        
        // 按城市统计
        if (image.city) {
          stats.byCity[image.city] = (stats.byCity[image.city] || 0) + 1;
        }
        
        // 按日期统计
        const date = new Date(image.timestamp).toDateString();
        stats.byDate[date] = (stats.byDate[date] || 0) + 1;
        
        // 大小统计
        stats.totalSize += image.size || 0;
      });
      
      // 计算平均大小
      stats.averageSize = stats.total > 0 ? stats.totalSize / stats.total : 0;
      
      console.log('📊 选中图片详细统计:', stats);
      return stats;
      
    } catch (error) {
      console.error('❌ 获取选中图片统计失败:', error);
      return {
        total: 0,
        byCategory: {},
        byCity: {},
        byDate: {},
        totalSize: 0,
        averageSize: 0
      };
    }
  }

  /**
   * 按分类选中图片
   * 选中指定分类的所有图片
   */
  selectImagesByCategory(category) {
    try {
      const cache = this.imageCache.getCache();
      const categoryImages = this.imageCache.getImagesByCategory(category);
      const imageIds = categoryImages.map(img => img.id);
      
      this.addToSelection(imageIds);
      console.log(`📊 按分类选中图片: ${category}, 数量: ${imageIds.length}`);
      
      return imageIds.length;
      
    } catch (error) {
      console.error('❌ 按分类选中图片失败:', error);
      return 0;
    }
  }

  /**
   * 按城市选中图片
   * 选中指定城市的所有图片
   */
  selectImagesByCity(city) {
    try {
      const cache = this.imageCache.getCache();
      const cityImages = this.imageCache.getImagesByCity(city);
      const imageIds = cityImages.map(img => img.id);
      
      this.addToSelection(imageIds);
      console.log(`📊 按城市选中图片: ${city}, 数量: ${imageIds.length}`);
      
      return imageIds.length;
      
    } catch (error) {
      console.error('❌ 按城市选中图片失败:', error);
      return 0;
    }
  }

  /**
   * 通用取消选中函数
   * 取消选中指定范围内的所有图片
   */
  _deselectImagesByFilter(filterType, filterValue) {
    try {
      let images;
      let logPrefix;
      
      if (filterType === 'category') {
        images = this.imageCache.getImagesByCategory(filterValue);
        logPrefix = '按分类取消选中图片';
      } else if (filterType === 'city') {
        images = this.imageCache.getImagesByCity(filterValue);
        logPrefix = '按城市取消选中图片';
      } else if (filterType === 'similarityGroup') {
        images = this.imageCache.getImagesBySimilarityGroup(filterValue);
        logPrefix = '按相似组取消选中图片';
      } else {
        throw new Error(`不支持的过滤类型: ${filterType}`);
      }
      
      const imageIds = images.map(img => img.id);
      
      imageIds.forEach(imageId => {
        this.setImageSelection(imageId, false);
        // 发送事件通知图片组件更新显示
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('imageSelectionChanged', {
            detail: {
              imageId: imageId,
              isSelected: false
            }
          });
          window.dispatchEvent(event);
        }
      });
      
      console.log(`📊 ${logPrefix}: ${filterValue}, 数量: ${imageIds.length}`);
      return imageIds.length;
      
    } catch (error) {
      console.error(`❌ ${filterType === 'category' ? '取消分类选中状态' : '按城市取消选中图片'}失败:`, error);
      return 0;
    }
  }

  /**
   * 取消当前分类的所有选中状态
   * 用于"取消选择"按钮
   */
  clearCategorySelection(category) {
    return this._deselectImagesByFilter('category', category);
  }

  /**
   * 按城市取消选中图片
   * 取消选中指定城市的所有图片
   */
  deselectImagesByCity(city) {
    return this._deselectImagesByFilter('city', city);
  }

  /**
   * 按相似组取消选中图片
   * 取消选中指定相似组的所有图片
   */
  deselectImagesBySimilarityGroup(groupId) {
    return this._deselectImagesByFilter('similarityGroup', groupId);
  }

  /**
   * 获取指定分类的选中图片
   */
  getSelectedImagesByCategory(category) {
    try {
      const categoryImages = this.getSelectedImages(category, null);
      console.log(`📊 获取分类选中图片: ${category}, 数量: ${categoryImages.length}`);
      return categoryImages;
    } catch (error) {
      console.error('❌ 获取分类选中图片失败:', error);
      return [];
    }
  }

  /**
   * 获取指定城市的选中图片
   */
  getSelectedImagesByCity(city) {
    try {
      const cityImages = this.getSelectedImages(null, city);
      console.log(`📊 获取城市选中图片: ${city}, 数量: ${cityImages.length}`);
      return cityImages;
    } catch (error) {
      console.error('❌ 获取城市选中图片失败:', error);
      return [];
    }
  }

  /**
   * 获取指定相似组的选中图片
   */
  getSelectedImagesBySimilarityGroup(groupId) {
    try {
      const groupImages = this.imageCache.getImagesBySimilarityGroup(groupId);
      const selectedImages = groupImages.filter(img => img.selected === true);
      console.log(`📊 获取相似组选中图片: ${groupId}, 数量: ${selectedImages.length}`);
      return selectedImages;
    } catch (error) {
      console.error('❌ 获取相似组选中图片失败:', error);
      return [];
    }
  }

  // ==================== 监听器接口 ====================
  
  /**
   * 添加数据变化监听器
   */
  addDataChangeListener(callback) {
    return this.imageCache.addListener(callback);
  }

  /**
   * 添加选中状态变化监听器
   */
  addSelectionChangeListener(callback) {
    return this.imageCache.addSelectionListener(callback);
  }

  /**
   * 清空所有数据
   */
  async clearAllData() {
    try {
      console.log('🗑️ 开始清空所有数据');
      
      // 清空数据库中的所有图片数据
      await this.imageStorageService.clearAllImages();
      
      // 清空缓存
      this.imageCache.clearCache();
      
      // 通知所有监听器数据已清空
      this.cacheListeners.forEach(listener => listener(this.imageCache.cache));
      
      console.log('✅ 所有数据已清空');
      return true;
      
    } catch (error) {
      console.error('❌ 清空数据失败:', error);
      throw error;
    }
  }

  // 获取所有图片的URI列表
  async getImageUris() {
    try {
      return await this.imageStorageService.getImageUris();
    } catch (error) {
      console.error('❌ 获取图片URI列表失败:', error);
      return [];
    }
  }

  // 根据URI列表删除图片
  async removeImagesByUris(urisToRemove, updateCache = true) {
    try {
      const result = await this.imageStorageService.removeImagesByUris(urisToRemove);
      if (result.success) {
        // 根据参数决定是否立即更新缓存
        if (updateCache) {
          // 更新缓存
          await this.imageCache.buildCache();
          // 通知监听器
          this.cacheListeners.forEach(listener => listener(this.imageCache.cache));
        }
      }
      return result;
    } catch (error) {
      console.error('❌ 根据URI删除图片失败:', error);
      throw error;
    }
  }

  // 批量保存图片详细信息
  async writeImageDetailedInfo(imageDataArray, updateCache = true) {
    try {
      await this.imageStorageService.saveImageDetailedInfo(imageDataArray);
      
      // 根据参数决定是否立即更新缓存
      if (updateCache) {
        // 更新缓存
        await this.imageCache.buildCache();
        // 通知监听器
        this.cacheListeners.forEach(listener => listener(this.imageCache.cache));
      }
    } catch (error) {
      console.error('❌ 批量保存图片详细信息失败:', error);
      throw error;
    }
  }

  // 获取分类规则
  async getClassificationRules() {
    try {
      return await this.imageStorageService.getClassificationRules();
    } catch (error) {
      console.error('❌ 获取分类规则失败:', error);
      throw error;
    }
  }

  // 保存分类规则
  async saveClassificationRules(rules) {
    try {
      await this.imageStorageService.saveClassificationRules(rules);
      console.log('✅ 分类规则保存成功');
      return true;
    } catch (error) {
      console.error('❌ 保存分类规则失败:', error);
      throw error;
    }
  }

  // 重置分类规则为默认值
  async resetClassificationRules() {
    try {
      const defaultRules = await this.imageStorageService.resetClassificationRules();
      console.log('✅ 分类规则已重置为默认值');
      return defaultRules;
    } catch (error) {
      console.error('❌ 重置分类规则失败:', error);
      throw error;
    }
  }

  // 更新单个分类规则
  async updateClassificationRule(objectClass, newCategory) {
    try {
      const rules = await this.imageStorageService.updateClassificationRule(objectClass, newCategory);
      console.log(`✅ 分类规则更新成功: ${objectClass} -> ${newCategory}`);
      return rules;
    } catch (error) {
      console.error('❌ 更新分类规则失败:', error);
      throw error;
    }
  }

  // 添加新的分类规则
  async addClassificationRule(objectClass, category) {
    try {
      const rules = await this.imageStorageService.addClassificationRule(objectClass, category);
      console.log(`✅ 新增分类规则: ${objectClass} -> ${category}`);
      return rules;
    } catch (error) {
      console.error('❌ 添加分类规则失败:', error);
      throw error;
    }
  }

  // 删除分类规则
  async removeClassificationRule(objectClass) {
    try {
      const rules = await this.imageStorageService.removeClassificationRule(objectClass);
      console.log(`✅ 删除分类规则: ${objectClass}`);
      return rules;
    } catch (error) {
      console.error('❌ 删除分类规则失败:', error);
      throw error;
    }
  }

  // ==================== 相似度检测接口 ====================

 

  /**
   * 获取相似度组统计信息
   * 返回相似组数组，每个组包含groupid、图片数量和最近一张照片的URI
   * @returns {Array} 相似组数组
   */
  async getSimilarityGroupsStats() {
    try {
      console.log('📊 获取相似度组统计信息...');
      
      // 使用 ImageStorageService 获取相似组数据
      const similarityGroups = await this.imageStorageService.getSimilarityGroups('similar');
      
      if (!similarityGroups || similarityGroups.length === 0) {
        console.log('📊 没有找到相似度组数据');
        return [];
      }
      
      // 获取所有图片数据用于获取最近照片的URI
      const allImages = await this.readAllImages();
      const imageMap = new Map(allImages.map(img => [img.id, img]));
      
      // 构建统计信息
      const groups = similarityGroups.map(group => {
        // 找到该组中最近的一张照片
        let latestImage = null;
        let latestTime = 0;
        
        group.images.forEach(imageInfo => {
          const image = imageMap.get(imageInfo.id);
          if (image) {
            const imageTime = image.takenAt ? new Date(image.takenAt).getTime() : image.timestamp;
            if (imageTime > latestTime) {
              latestTime = imageTime;
              latestImage = image;
            }
          }
        });
        
        return {
          groupId: group.id,
          imageCount: group.images.length,
          latestImageUri: latestImage ? latestImage.uri : null
        };
      });
      
      // 按组大小排序（从大到小）
      groups.sort((a, b) => b.imageCount - a.imageCount);
      
      console.log(`📊 相似度组统计: ${groups.length}个组`);
      return groups;
      
    } catch (error) {
      console.error('❌ 获取相似度组统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取指定相似组的照片精简信息
   * @param {string} groupId - 相似组ID
   * @returns {Object} 相似组信息，包含该组的所有照片精简信息
   */
  async getSimilarityGroupImages(groupId) {
    try {
      console.log(`📖 获取相似组照片信息: ${groupId}`);
      
      if (!groupId) {
        throw new Error('相似组ID不能为空');
      }
      
      // 使用 ImageStorageService 获取相似组信息
      const group = await this.imageStorageService.getSimilarityGroupById(groupId);
      
      if (!group) {
        console.log(`📖 未找到相似组 ${groupId}`);
        return {
          groupId,
          imageCount: 0,
          images: [],
          notFound: true
        };
      }
      
      // 获取所有图片数据用于获取完整信息
      const allImages = await this.readAllImages();
      const imageMap = new Map(allImages.map(img => [img.id, img]));
      
      // 构建精简信息，按相似度分数排序（从高到低）
      const images = group.images
        .sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0))
        .map(imageInfo => {
          const image = imageMap.get(imageInfo.id);
          if (image) {
            // 确保缓存中的图片对象有similarityGroupIndex属性
            image.similarityGroupIndex = groupId;
          }
          return {
            id: imageInfo.id,
            fileName: image ? image.fileName : 'Unknown',
            uri: image ? image.uri : null,
            category: image ? image.category : null,
            city: image ? image.city : null,
            takenAt: image ? image.takenAt : null,
            similarityScore: imageInfo.similarity_score || 0,
            similarityGroupIndex: groupId, // 添加相似组索引
            size: image ? image.size : 0,
            width: image ? image.width : 0,
            height: image ? image.height : 0,
            selected: image ? image.selected : false // 添加选中状态
          };
        });
      
      const result = {
        groupId: group.id,
        imageCount: images.length,
        images,
        confidence: group.confidence || 0,
        createdAt: group.created_at,
        notFound: false
      };
      
      console.log(`📖 相似组 ${groupId} 包含 ${images.length} 张图片`);
      return result;
      
    } catch (error) {
      console.error('❌ 获取相似组照片信息失败:', error);
      throw error;
    }
  }
}

// 导出单例实例
export default new UnifiedDataService();
