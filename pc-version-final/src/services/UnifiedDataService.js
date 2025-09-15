// 统一数据服务 - 封装缓存和数据库的复杂逻辑
import GlobalImageCache from './GlobalImageCache';
import ImageStorageService from './ImageStorageService';

class UnifiedDataService {
  constructor() {
    this.imageStorageService = new ImageStorageService();
    this.imageCache = GlobalImageCache;
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
      
      // 2. 构建缓存
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
   * 获取分类显示名称
   */
  getCategoryDisplayName(categoryId) {
    const categoryMap = {
      wechat: '微信截图',
      meeting: '会议场景',
      document: '工作照片',
      people: '社交活动',
      life: '生活记录',
      game: '游戏截图',
      food: '美食记录',
      travel: '旅行风景',
      pet: '宠物照片',
      other: '其他图片',
    };
    
    return categoryMap[categoryId] || categoryId;
  }

  /**
   * 获取分类ID（从显示名称或ID获取标准化的分类ID）
   */
  getCategoryId(categoryInput) {
    const categoryMap = {
      wechat: '微信截图',
      meeting: '会议场景',
      document: '工作照片',
      people: '社交活动',
      life: '生活记录',
      game: '游戏截图',
      food: '美食记录',
      travel: '旅行风景',
      pet: '宠物照片',
      other: '其他图片',
    };
    
    // 如果输入已经是ID，直接返回
    if (categoryMap[categoryInput]) {
      return categoryInput;
    }
    
    // 如果是显示名称，查找对应的ID
    for (const [id, displayName] of Object.entries(categoryMap)) {
      if (displayName === categoryInput) {
        return id;
      }
    }
    
    // 如果都没找到，返回原值
    return categoryInput;
  }

  /**
   * 获取所有分类ID列表
   */
  getAllCategoryIds() {
    return [
      'wechat', 'meeting', 'document', 'people', 'life', 
      'game', 'food', 'travel', 'pet', 'other'
    ];
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
   * 取消当前分类的所有选中状态
   * 用于"取消选择"按钮
   */
  clearCategorySelection(category) {
    try {
      const categoryImages = this.imageCache.getImagesByCategory(category);
      const imageIds = categoryImages.map(img => img.id);
      
      // 使用批量取消选择
      this.imageCache.deselectBatch(imageIds);
      
      return imageIds.length;
      
    } catch (error) {
      console.error('❌ 取消分类选中状态失败:', error);
      return 0;
    }
  }


  /**
   * 按城市取消选中图片
   * 取消选中指定城市的所有图片
   */
  deselectImagesByCity(city) {
    try {
      const cache = this.imageCache.getCache();
      const cityImages = this.imageCache.getImagesByCity(city);
      const imageIds = cityImages.map(img => img.id);
      
      imageIds.forEach(imageId => {
        this.setImageSelection(imageId, false);
      });
      
      console.log(`📊 按城市取消选中图片: ${city}, 数量: ${imageIds.length}`);
      return imageIds.length;
      
    } catch (error) {
      console.error('❌ 按城市取消选中图片失败:', error);
      return 0;
    }
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
}

// 导出单例实例
export default new UnifiedDataService();
