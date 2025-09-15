// 全局图片缓存服务 - 单例模式，避免重复加载
import ImageStorageService from './ImageStorageService';

class GlobalImageCache {
  constructor() {
    this.cache = {
      allImages: [],
      categoryCounts: {},
      cityCounts: {},
      recentImages: [],
      selectedCategoryCounts: {}, // 选中图片的分类统计
      selectedCityCounts: {} // 选中图片的城市统计
    };
    
    // ID到索引的映射，用于快速查找
    this.imageIdToIndex = new Map();
    this.isLoading = false;
    this.isLoaded = false;
    this.listeners = new Set();
    this.imageStorageService = new ImageStorageService();
    
    // 选中状态管理
    this.selectionListeners = new Set();
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
      return this.cache;
    }

    this.isLoading = true;

    try {
      console.log('🔄 开始构建全局图片缓存...');
      
      // 获取所有图片的精简数据（ImageStorageService已经做了数据转换）
      const allImages = await this.imageStorageService.getImages();
      console.log(`📊 获取到 ${allImages.length} 张图片`);
      
      // 确保 allImages 是数组
      if (!Array.isArray(allImages)) {
        console.warn('⚠️ allImages 不是数组，初始化为空数组');
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
          console.warn(`⚠️ 图片 ${img.id} 缺少分类信息:`, {
            id: img.id,
            fileName: img.fileName,
            category: img.category,
            hasCategory: 'category' in img
          });
        }
      });
      
      if (missingCategoryCount > 0) {
        console.warn(`⚠️ 发现 ${missingCategoryCount} 张图片缺少分类信息`);
      }
      
      // 更新ID到索引的映射
      this._rebuildImageIdIndex();
      
      // 不再维护 imagesByCategory 和 imagesByCity 索引
      // 直接通过过滤 allImages 来获取数据
      
      // 计算统计信息
      console.log('🔄 开始重新计算分类统计...');
      this._rebuildCategoryCounts();
      this._rebuildCityCounts();
      console.log('✅ 分类统计计算完成');
      
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
      
      console.log('✅ 全局图片缓存构建完成');
      
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
        console.log('📝 图片已存在于缓存中:', image.id);
        return false;
      }

      // 添加到主列表
      this.cache.allImages.push(image);
      
      // 更新ID索引映射
      this.imageIdToIndex.set(image.id, this.cache.allImages.length - 1);
      
      // 更新统计信息
      const normalizedCategory = this._getCategoryId(image.category);
      this.cache.categoryCounts[normalizedCategory] = (this.cache.categoryCounts[normalizedCategory] || 0) + 1;
      if (image.city) {
        this.cache.cityCounts[image.city] = (this.cache.cityCounts[image.city] || 0) + 1;
      }
      
      // 更新最近图片列表（保持前20张）
      this.cache.recentImages = this.cache.allImages
        .sort((a, b) => {
          const timeA = a.takenAt ? new Date(a.takenAt).getTime() : a.timestamp;
          const timeB = b.takenAt ? new Date(b.takenAt).getTime() : b.timestamp;
          return timeB - timeA;
        })
        .slice(0, 20);
      
      console.log('📝 图片已增量添加到缓存:', image.id);
      
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
  updateImageClassification(imageId, newCategory) {
    try {
      console.log(`🔄 更新图片分类: ${imageId} -> ${newCategory}`);
      
      // 找到要更新的图片
      const imageIndex = this.cache.allImages.findIndex(img => img.id === imageId);
      if (imageIndex === -1) {
        console.warn(`⚠️ 未找到图片: ${imageId}`);
        return false;
      }
      
      const oldCategory = this.cache.allImages[imageIndex].category;
      
      // 更新图片分类
      this.cache.allImages[imageIndex].category = newCategory;
      
      // 重新构建分类索引
      // 不再需要重建索引，直接通过过滤获取数据
      
      // 重新构建分类统计
      this._rebuildCategoryCounts();
      
      console.log(`✅ 图片分类更新完成: ${oldCategory} -> ${newCategory}`);
      
      // 通知监听器
      this.notifyListeners();
      
      return true;
      
    } catch (error) {
      console.error('❌ 更新图片分类失败:', error);
      return false;
    }
  }
  
  // 重新构建ID到索引的映射
  _rebuildImageIdIndex() {
    console.log(`🔄 重新构建ID映射表，图片数量: ${this.cache.allImages.length}`);
    this.imageIdToIndex.clear();
    this.cache.allImages.forEach((img, index) => {
      this.imageIdToIndex.set(img.id, index);
    });
    console.log(`✅ ID映射表构建完成，映射条目数: ${this.imageIdToIndex.size}`);
  }

  // 通过ID快速获取图片对象（O(1)复杂度）
  _getImageById(imageId) {
    const index = this.imageIdToIndex.get(imageId);
    
    // 调试：检查映射表状态
    if (index === undefined) {
      console.warn(`⚠️ 图片ID ${imageId} 在映射表中未找到，尝试直接查找`);
      
      // Fallback: 直接遍历查找
      const image = this.cache.allImages.find(img => img.id === imageId);
      if (image) {
        console.warn(`⚠️ 通过直接查找找到了图片，映射表需要重建`);
        // 重建映射表
        this._rebuildImageIdIndex();
        return image;
      }
      
      console.warn(`⚠️ 直接查找也未找到图片 ${imageId}`);
      console.log(`🔍 映射表大小: ${this.imageIdToIndex.size}`);
      console.log(`🔍 缓存图片数量: ${this.cache.allImages.length}`);
      
      // 显示映射表中的前几个ID
      const mapEntries = Array.from(this.imageIdToIndex.entries()).slice(0, 5);
      console.log(`🔍 映射表前5个条目:`, mapEntries);
      
      return null;
    }
    
    const image = this.cache.allImages[index];
    if (!image) {
      console.error(`❌ 索引 ${index} 处的图片对象为空`);
      // 重建映射表
      this._rebuildImageIdIndex();
      return null;
    }
    
    // 验证ID是否匹配
    if (image.id !== imageId) {
      console.warn(`⚠️ ID不匹配! 查找: ${imageId}, 找到: ${image.id}，重建映射表`);
      // 重建映射表
      this._rebuildImageIdIndex();
      
      // 再次尝试直接查找
      const correctImage = this.cache.allImages.find(img => img.id === imageId);
      if (correctImage) {
        console.log(`✅ 重建映射表后找到正确图片: ${imageId}`);
        return correctImage;
      } else {
        console.warn(`⚠️ 重建映射表后仍未找到图片: ${imageId}`);
        return null;
      }
    }
    
    return image;
  }

  // 重新构建分类统计
  _rebuildCategoryCounts() {
    console.log('📊 开始计算分类统计，总图片数:', this.cache.allImages.length);
    this.cache.categoryCounts = {};
    this.cache.allImages.forEach((img, index) => {
      if (img.category) {
        // 使用标准化的分类ID作为键（英文ID）
        const normalizedCategory = this._getCategoryId(img.category);
        this.cache.categoryCounts[normalizedCategory] = (this.cache.categoryCounts[normalizedCategory] || 0) + 1;
        console.log(`📊 图片${index+1}: ${img.fileName} → ${img.category} → ${normalizedCategory}`);
      } else {
        console.log(`⚠️ 图片${index+1}: ${img.fileName} 没有分类信息`);
      }
    });
    console.log('📊 分类统计计算结果:', this.cache.categoryCounts);
  }

  // 获取标准化的分类ID（与UnifiedDataService保持一致）
  _getCategoryId(categoryInput) {
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


  // 更新选中统计 - 添加图片
  _updateSelectedStatsAdd(image) {
    if (!image.category) {
      console.error(`❌ 图片 ${image.id} 缺少分类信息:`, image);
      throw new Error(`图片 ${image.id} 缺少分类信息`);
    }
    const category = this._getCategoryId(image.category);
    this.cache.selectedCategoryCounts[category] = (this.cache.selectedCategoryCounts[category] || 0) + 1;
    
    if (image.city) {
      this.cache.selectedCityCounts[image.city] = (this.cache.selectedCityCounts[image.city] || 0) + 1;
    }
  }

  // 更新选中统计 - 移除图片
  _updateSelectedStatsRemove(image) {
    if (!image.category) {
      console.error(`❌ 图片 ${image.id} 缺少分类信息:`, image);
      throw new Error(`图片 ${image.id} 缺少分类信息`);
    }
    const category = this._getCategoryId(image.category);
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
  }

  // 清空选中统计
  _clearSelectedStats() {
    this.cache.selectedCategoryCounts = {};
    this.cache.selectedCityCounts = {};
  }

  // 获取选中图片的分类统计
  getSelectedCategoryCounts() {
    return { ...this.cache.selectedCategoryCounts };
  }

  // 获取选中图片的城市统计
  getSelectedCityCounts() {
    return { ...this.cache.selectedCityCounts };
  }
  
  // 删除单个图片
  removeImage(imageId) {
    try {
      console.log(`🗑️ 删除图片: ${imageId}`);
      
      // 找到要删除的图片
      const imageIndex = this.cache.allImages.findIndex(img => img.id === imageId);
      if (imageIndex === -1) {
        console.warn(`⚠️ 未找到图片: ${imageId}`);
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
      this._rebuildRecentImages();
      
      console.log(`✅ 图片删除完成: ${imageToDelete.fileName}`);
      
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
    this.cache.allImages.forEach(img => {
      if (img.city) {
        this.cache.cityCounts[img.city] = (this.cache.cityCounts[img.city] || 0) + 1;
      }
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
      console.log(`🗑️ 批量删除图片: ${imageIds.length} 张`);
      
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
      this._rebuildRecentImages();
      
      console.log(`✅ 批量删除完成: ${imagesToDelete.length}/${imageIds.length} 张图片`);
      
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
  getSelectedImages(category = null, city = null) {
    let filteredImages = this.cache.allImages.filter(img => img.selected);
    
    // 如果指定了分类，按分类过滤
    if (category) {
      const normalizedCategory = this._getCategoryId(category);
      filteredImages = filteredImages.filter(img => {
        if (!img.category) {
          console.error(`❌ 图片 ${img.id} 缺少分类信息:`, img);
          throw new Error(`图片 ${img.id} 缺少分类信息`);
        }
        const imgCategory = this._getCategoryId(img.category);
        return imgCategory === normalizedCategory;
      });
    }
    
    // 如果指定了城市，按城市过滤
    if (city) {
      filteredImages = filteredImages.filter(img => img.city === city);
    }
    
    return filteredImages;
  }

  // 获取指定分类的所有图片
  getImagesByCategory(category) {
    const normalizedCategory = this._getCategoryId(category);
    return this.cache.allImages.filter(img => {
      if (!img.category) {
        console.error(`❌ 图片 ${img.id} 缺少分类信息:`, img);
        throw new Error(`图片 ${img.id} 缺少分类信息`);
      }
      const imgCategory = this._getCategoryId(img.category);
      return imgCategory === normalizedCategory;
    });
  }

  // 获取指定城市的所有图片
  getImagesByCity(city) {
    return this.cache.allImages.filter(img => img.city === city);
  }

  // 检查图片是否被选中
  isImageSelected(imageId) {
    const image = this._getImageById(imageId);
    return image ? image.selected === true : false;
  }

  // 切换图片选中状态
  toggleImageSelection(imageId) {
    console.log(`🔄 GlobalImageCache 切换图片选择状态: ${imageId}`);
    
    // 使用快速查找获取图片对象
    const image = this._getImageById(imageId);
    if (!image) {
      console.warn(`⚠️ 未找到图片: ${imageId}`);
      return;
    }
    
    // 调试：检查图片对象的分类信息
    console.log(`🔍 图片对象详情:`, {
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
    console.log(`🔄 GlobalImageCache 新的选中状态: ${imageId} = ${image.selected}`);
    this.notifySelectionListeners();
  }

  // 设置图片选中状态
  setImageSelection(imageId, selected) {
    const image = this._getImageById(imageId);
    if (!image) {
      console.warn(`⚠️ 未找到图片: ${imageId}`);
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
    console.log('🗑️ 缓存已清空');
  }
}

// 导出单例实例
export default new GlobalImageCache();

