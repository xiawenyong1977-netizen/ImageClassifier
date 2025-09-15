import { AsyncStorage, RNFS } from '../adapters/WebAdapters';
import MediaStoreService from './MediaStoreService';

// Platform detection for web and mobile
let Platform;
try {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    // Web environment
    Platform = { OS: 'web' };
  } else {
    // Mobile environment
    Platform = eval('require("react-native").Platform');
  }
} catch (error) {
  // If detection fails, default to web environment
  Platform = { OS: 'web' };
}

class ImageStorageService {
  constructor() {
    this.storageKeys = {
      images: 'classified_images',
      stats: 'image_stats',
      settings: 'app_settings',
    };
    this.isInitialized = false;
    // 添加保存锁，防止并发保存导致数据丢失
    this.saveLock = null;
  }

  // 获取分类显示名称
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

  // Initialize check
  async ensureInitialized() {
    if (this.isInitialized) return;
    
    try {
      // Try a simple AsyncStorage operation to verify if it's available
      await AsyncStorage.getItem('test');
      this.isInitialized = true;
    } catch (error) {
      console.warn('AsyncStorage not ready yet:', error);
      // Wait for a while and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        await AsyncStorage.getItem('test');
        this.isInitialized = true;
      } catch (retryError) {
        console.error('AsyncStorage initialization failed:', retryError);
        throw new Error('AsyncStorage not available');
      }
    }
  }

  // 批量保存图片详细信息
  async saveImageDetailedInfo(imageDataArray) {
    try {
      await this.ensureInitialized();
      
      if (!imageDataArray || imageDataArray.length === 0) {
        return;
      }
      
      // 等待之前的保存操作完成
      while (this.saveLock) {
        console.log('⏳ 等待之前的保存操作完成...');
        await this.saveLock;
      }
      
      // 创建新的保存锁
      this.saveLock = this._performSave(imageDataArray);
      const result = await this.saveLock;
      this.saveLock = null;
      
      return result;
      
    } catch (error) {
      console.error('Batch save failed:', error);
      this.saveLock = null; // 确保锁被释放
      throw error;
    }
  }
  
  // 实际执行保存操作的方法
  async _performSave(imageDataArray) {
    // 获取现有图片数据
    const existingImages = await this.getImages();
    console.log(`Existing image count: ${existingImages.length}`);
    
    // 批量处理
    const newImages = [];
    const updatedImages = [];
    
    for (const imageData of imageDataArray) {
      const { uri, category, confidence, timestamp, fileName, size } = imageData;
      
      // 检查是否已存在
      const existingIndex = existingImages.findIndex(img => img.uri === uri);
      
      // 生成更稳定的ID，基于URI的哈希值
      const generateStableId = (uri) => {
        // 使用URI的简单哈希作为ID基础，确保相同URI总是生成相同ID
        let hash = 0;
        for (let i = 0; i < uri.length; i++) {
          const char = uri.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // 转换为32位整数
        }
        return `img_${Math.abs(hash).toString(36)}_${Date.now()}`;
      };
      
      const imageRecord = {
        id: existingIndex >= 0 ? existingImages[existingIndex].id : generateStableId(uri),
        uri,
        category,
        confidence,
        timestamp,
        fileName,
        size,
        takenAt: imageData.takenAt || null,
        latitude: imageData.latitude || null,
        longitude: imageData.longitude || null,
        altitude: imageData.altitude || null,
        accuracy: imageData.accuracy || null,
        address: imageData.address || null,
        city: imageData.city || null,
        country: imageData.country || null,
        province: imageData.province || null,
        district: imageData.district || null,
        street: imageData.street || null,
        locationSource: imageData.locationSource || null,
        cityDistance: imageData.cityDistance || null,
        createdAt: existingIndex >= 0 ? existingImages[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        // 更新现有记录
        existingImages[existingIndex] = imageRecord;
        updatedImages.push(fileName);
      } else {
        // 添加新记录
        existingImages.push(imageRecord);
        newImages.push(fileName);
      }
    }
    
    // 保存到AsyncStorage
    await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(existingImages));
    
    // 更新统计信息
    await this.updateStats();
    
    console.log(`Batch save completed: ${newImages.length} new, ${updatedImages.length} updated`);
    return { newCount: newImages.length, updatedCount: updatedImages.length };
  }

  // Save image classification result
  async saveImageClassification(imageData) {
    try {
      await this.ensureInitialized();
      
      const { uri, category, confidence, timestamp, fileName, size } = imageData;
      
      // Gallery scan only generates local files, no need to verify
      
      // Get existing image data
      const existingImages = await this.getImages();
      console.log(`Existing image count: ${existingImages.length}`);
      
      // Check if already exists
      const existingIndex = existingImages.findIndex(img => img.uri === uri);
      
      // 生成更稳定的ID，基于URI的哈希值
      const generateStableId = (uri) => {
        // 使用URI的简单哈希作为ID基础，确保相同URI总是生成相同ID
        let hash = 0;
        for (let i = 0; i < uri.length; i++) {
          const char = uri.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // 转换为32位整数
        }
        return `img_${Math.abs(hash).toString(36)}_${Date.now()}`;
      };
      
      const imageRecord = {
        id: existingIndex >= 0 ? existingImages[existingIndex].id : generateStableId(uri),
        uri,
        category,
        confidence,
        timestamp,
        fileName,
        size,
        takenAt: imageData.takenAt || null,
        // Location information
        latitude: imageData.latitude || null,
        longitude: imageData.longitude || null,
        altitude: imageData.altitude || null,
        accuracy: imageData.accuracy || null,
        address: imageData.address || null,
        city: imageData.city || null,
        country: imageData.country || null,
        province: imageData.province || null,
        district: imageData.district || null,
        street: imageData.street || null,
        locationSource: imageData.locationSource || null,
        cityDistance: imageData.cityDistance || null,
        // Additional metadata
        createdAt: existingIndex >= 0 ? existingImages[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      if (existingIndex >= 0) {
        // Update existing record
        existingImages[existingIndex] = imageRecord;
        console.log(`Updated existing image record: ${fileName}`);
      } else {
        // Add new record
        existingImages.push(imageRecord);
        console.log(`Added new image record: ${fileName}`);
      }
      
      // Save to AsyncStorage
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(existingImages));
      
      // Update statistics
      await this.updateStats();
      
      console.log(`Image classification saved successfully: ${fileName}`);
      return imageRecord;
      
    } catch (error) {
      console.error('Failed to save image classification:', error);
      throw error;
    }
  }

  // Get all images (精简结构)
  async getImages() {
    try {
      await this.ensureInitialized();
      
      const imagesJson = await AsyncStorage.getItem(this.storageKeys.images);
      if (!imagesJson) {
        return [];
      }
      
      const fullImages = JSON.parse(imagesJson);
      console.log(`📊 ImageStorageService.getImages() 从数据库读取到 ${fullImages.length} 张图片`);
      
      // 转换为精简数据结构 - 只包含界面显示必需字段
      const simplifiedImages = fullImages.map(img => {
        // 调试：检查原始数据中的分类信息
        if (!img.category) {
          console.warn(`⚠️ 图片 ${img.id} 在数据库中缺少分类信息:`, {
            id: img.id,
            fileName: img.fileName,
            category: img.category,
            hasCategory: 'category' in img
          });
        }
        
        return {
          id: img.id,
          timestamp: img.timestamp,
          takenAt: img.takenAt,
          category: img.category,
          city: img.city || img.location?.city,
          country: img.country || img.location?.country,
          fileName: img.fileName,
          uri: img.uri,
          size: img.size,
          // 只保留界面显示必需字段，其他按需加载
        };
      });
      
      return simplifiedImages;
      
    } catch (error) {
      console.error('Failed to get images:', error);
      return [];
    }
  }

  // Get image by ID (精简结构)
  async getImageById(imageId) {
    try {
      const allImages = await this.getImages();
      const image = allImages.find(img => img.id === imageId);
      return image || null;
    } catch (error) {
      console.error('Failed to get image by ID:', error);
      return null;
    }
  }

  // Get full image details by ID (完整结构)
  async getImageDetailsById(imageId) {
    try {
      await this.ensureInitialized();
      
      const imagesJson = await AsyncStorage.getItem(this.storageKeys.images);
      if (!imagesJson) {
        return null;
      }
      
      const fullImages = JSON.parse(imagesJson);
      const image = fullImages.find(img => img.id === imageId);
      return image || null;
      
    } catch (error) {
      console.error('Failed to get image details by ID:', error);
      return null;
    }
  }

  // Get multiple images by IDs
  async getImagesByIds(imageIds) {
    try {
      const allImages = await this.getImages();
      const images = allImages.filter(img => imageIds.includes(img.id));
      return images;
    } catch (error) {
      console.error('Failed to get images by IDs:', error);
      return [];
    }
  }

  // Get images by category (精简结构)
  async getImagesByCategory(category) {
    try {
      const allImages = await this.getImages();
      const filteredImages = allImages.filter(img => img.category === category);
      
      // 按拍摄时间排序（最新的在前）
      const sortedImages = filteredImages.sort((a, b) => {
        const timeA = a.takenAt ? new Date(a.takenAt).getTime() : new Date(a.timestamp).getTime();
        const timeB = b.takenAt ? new Date(b.takenAt).getTime() : new Date(b.timestamp).getTime();
        return timeB - timeA; // 降序，最新的在前
      });
      
      return sortedImages;
      
    } catch (error) {
      console.error('Failed to get images by category:', error);
      return [];
    }
  }

  // Get recent images (精简结构)
  async getRecentImages(limit = 20) {
    try {
      const allImages = await this.getImages();
      const recentImages = allImages
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
      
      return recentImages;
      
    } catch (error) {
      console.error('Failed to get recent images:', error);
      return [];
    }
  }

  // Get category counts
  async getCategoryCounts() {
    try {
      const allImages = await this.getImages();
      const counts = {};
      
      allImages.forEach(image => {
        if (!image.category) {
          console.error(`❌ 图片 ${image.id} 缺少分类信息:`, image);
          throw new Error(`图片 ${image.id} 缺少分类信息`);
        }
        const category = image.category;
        counts[category] = (counts[category] || 0) + 1;
      });
      
      return counts;
      
    } catch (error) {
      console.error('Failed to get category counts:', error);
      return {};
    }
  }

  // 获取默认扫描路径（平台相关）
  getDefaultScanPaths() {
    if (Platform.OS === 'web') {
      return ['D:\\Pictures'];
    } else {
      return [
        '/storage/emulated/0/DCIM/Camera',
        '/storage/emulated/0/DCIM/Screenshots',
        '/storage/emulated/0/Pictures',
        '/storage/emulated/0/Download',
        '/storage/emulated/0/WeChat/WeChat Images',
        '/storage/emulated/0/QQ_Images',
        '/storage/emulated/0/Telegram',
        '/storage/emulated/0/WhatsApp/Media/WhatsApp Images',
      ];
    }
  }

  // Get settings
  async getSettings() {
    try {
      await this.ensureInitialized();
      const settingsData = await AsyncStorage.getItem('app_settings');
      
      if (settingsData) {
        const parsed = JSON.parse(settingsData);
        
        // 确保必要的设置项存在，但不要覆盖用户已有的配置
        const result = { ...parsed };
        
        // 只有在用户配置中完全没有这些项时才使用默认值
        if (result.scanPaths === undefined || result.scanPaths === null) {
          result.scanPaths = this.getDefaultScanPaths();
        }
        if (result.hideEmptyCategories === undefined || result.hideEmptyCategories === null) {
          result.hideEmptyCategories = false;
        }
        if (result.scanInterval === undefined || result.scanInterval === null) {
          result.scanInterval = 5;
        }
        
        return result;
      }
      
      // 如果没有设置数据，返回默认设置
      return {
        scanPaths: this.getDefaultScanPaths(),
        hideEmptyCategories: false,
        scanInterval: 5, // 默认5分钟扫描间隔
      };
      
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {
        scanPaths: this.getDefaultScanPaths(),
        hideEmptyCategories: false,
        scanInterval: 5, // 默认5分钟扫描间隔
      };
    }
  }

  // Save settings
  async saveSettings(settings) {
    try {
      await this.ensureInitialized();
      
      // 验证scanPaths不能为空数组
      if (settings.scanPaths && settings.scanPaths.length === 0) {
        throw new Error('Scan paths cannot be empty. Please provide at least one directory.');
      }
      
      await AsyncStorage.setItem('app_settings', JSON.stringify(settings));
      
      console.log('Settings saved:', settings);
      
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error; // 重新抛出错误，让调用者处理
    }
  }

  // Clear all images
  async clearAllImages() {
    try {
      await this.ensureInitialized();
      await AsyncStorage.removeItem(this.storageKeys.images);
      await AsyncStorage.removeItem(this.storageKeys.stats);
      console.log('All images cleared from database');
    } catch (error) {
      console.error('Failed to clear all images:', error);
      throw error;
    }
  }

  // Delete image
  async deleteImage(imageId) {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      const imageIndex = allImages.findIndex(img => img.id === imageId);
      
      if (imageIndex === -1) {
        throw new Error('Image not found');
      }
      
      const image = allImages[imageIndex];
      console.log(`Deleting image: ${image.fileName}`);
      
      // Try to delete physical file
      try {
        if (image.uri && image.uri.startsWith('file://')) {
          const filePath = image.uri.replace('file://', '');
          const exists = await RNFS.exists(filePath);
          if (exists) {
            await RNFS.unlink(filePath);
            console.log(`Physical file deleted: ${filePath}`);
          }
        }
      } catch (fileError) {
        console.warn('Failed to delete physical file:', fileError);
      }
      
      // Remove from storage
      allImages.splice(imageIndex, 1);
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(allImages));
      
      // Update statistics
      await this.updateStats();
      
      console.log(`Image deleted successfully: ${image.fileName}`);
      return true;
      
    } catch (error) {
      console.error('Failed to delete image:', error);
      throw error;
    }
  }

  // Delete multiple images with progress callback
  async deleteImages(imageIds, onProgress) {
    try {
      await this.ensureInitialized();
      
      console.log(`Deleting ${imageIds.length} images...`);
      
      let filesDeleted = 0;
      let filesFailed = 0;
      
      // Initialize progress
      if (onProgress) {
        onProgress({
          filesDeleted: 0,
          filesFailed: 0,
          total: imageIds.length
        });
      }
      
      for (let i = 0; i < imageIds.length; i++) {
        try {
          await this.deleteImage(imageIds[i]);
          filesDeleted++;
          console.log(`Deleted image ${i + 1}/${imageIds.length}: ${imageIds[i]}`);
        } catch (error) {
          filesFailed++;
          console.error(`Failed to delete image ${imageIds[i]}:`, error);
        }
        
        // Update progress
        if (onProgress) {
          onProgress({
            filesDeleted,
            filesFailed,
            total: imageIds.length
          });
        }
      }
      
      console.log(`Batch delete completed: ${filesDeleted} deleted, ${filesFailed} failed`);
      return { success: true, filesDeleted, filesFailed };
      
    } catch (error) {
      console.error('Failed to delete images:', error);
      throw error;
    }
  }

  // Delete multiple images with progress callback
  async deleteImages(imageIds, onProgress) {
    try {
      await this.ensureInitialized();
      
      console.log(`Deleting ${imageIds.length} images...`);
      
      let filesDeleted = 0;
      let filesFailed = 0;
      
      // Initialize progress
      if (onProgress) {
        onProgress({
          filesDeleted: 0,
          filesFailed: 0,
          total: imageIds.length
        });
      }
      
      for (let i = 0; i < imageIds.length; i++) {
        try {
          await this.deleteImage(imageIds[i]);
          filesDeleted++;
          console.log(`Deleted image ${i + 1}/${imageIds.length}: ${imageIds[i]}`);
        } catch (error) {
          filesFailed++;
          console.error(`Failed to delete image ${imageIds[i]}:`, error);
        }
        
        // Update progress
        if (onProgress) {
          onProgress({
            filesDeleted,
            filesFailed,
            total: imageIds.length
          });
        }
      }
      
      console.log(`Batch delete completed: ${filesDeleted} deleted, ${filesFailed} failed`);
      return { success: true, filesDeleted, filesFailed };
      
    } catch (error) {
      console.error('Failed to delete images:', error);
      throw error;
    }
  }

  // Delete image with progress callback and result
  async deleteImageWithResult(imageId, onProgress) {
    try {
      console.log('🗑️ deleteImageWithResult 开始执行，图片ID:', imageId);
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      console.log('🗑️ 当前图片总数:', allImages.length);
      const imageIndex = allImages.findIndex(img => img.id === imageId);
      console.log('🗑️ 图片索引:', imageIndex);
      
      if (imageIndex === -1) {
        console.log('🗑️ 图片未找到');
        return {
          success: false,
          message: 'Image not found'
        };
      }
      
      const image = allImages[imageIndex];
      console.log(`Deleting image: ${image.fileName}`);
      
      // 初始化进度
      if (onProgress) {
        onProgress({
          filesDeleted: 0,
          filesFailed: 0,
          total: 1
        });
      }
      
      // Try to delete physical file
      let fileDeleted = false;
      try {
        if (image.uri && image.uri.startsWith('file://')) {
          const filePath = image.uri.replace('file://', '');
          const exists = await RNFS.exists(filePath);
          if (exists) {
            await RNFS.unlink(filePath);
            console.log(`Physical file deleted: ${filePath}`);
            fileDeleted = true;
          }
        }
      } catch (fileError) {
        console.warn('Failed to delete physical file:', fileError);
        return {
          success: false,
          message: `Failed to delete physical file: ${fileError.message}`
        };
      }
      
      // Remove from storage
      allImages.splice(imageIndex, 1);
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(allImages));
      
      // Update statistics
      await this.updateStats();
      
      // 更新最终进度
      if (onProgress) {
        onProgress({
          filesDeleted: fileDeleted ? 1 : 0,
          filesFailed: fileDeleted ? 0 : 1,
          total: 1
        });
      }
      
      console.log(`Image deleted successfully: ${image.fileName}`);
      return {
        success: true,
        message: 'Image deleted successfully'
      };
      
    } catch (error) {
      console.error('Failed to delete image:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  // Update statistics
  async updateStats() {
    try {
      const allImages = await this.getImages();
      
      const stats = {
        totalImages: allImages.length,
        classified: 0, // 已分类照片数量
        byCategory: {},
        byDate: {},
        totalSize: 0,
        lastUpdated: new Date().toISOString(),
      };
      
      // Calculate statistics
      allImages.forEach(img => {
        // Count classified images (non-other category)
        if (img.category && img.category !== 'other') {
          stats.classified++;
        }
        
        // By category
        if (!stats.byCategory[img.category]) {
          stats.byCategory[img.category] = 0;
        }
        stats.byCategory[img.category]++;
        
        // By date
        const date = new Date(img.timestamp).toDateString();
        if (!stats.byDate[date]) {
          stats.byDate[date] = 0;
        }
        stats.byDate[date]++;
        
        // Total size
        stats.totalSize += img.size || 0;
      });
      
      // Calculate average size
      stats.averageSize = stats.totalImages > 0 ? stats.totalSize / stats.totalImages : 0;
      
      // Save statistics
      await AsyncStorage.setItem(this.storageKeys.stats, JSON.stringify(stats));
      
      console.log('Statistics updated successfully');
      return stats;
      
    } catch (error) {
      console.error('Failed to update statistics:', error);
      throw error;
    }
  }

  // Get statistics
  async getStats() {
    try {
      const statsJson = await AsyncStorage.getItem(this.storageKeys.stats);
      if (!statsJson) {
        return await this.updateStats();
      }
      
      const stats = JSON.parse(statsJson);
      return stats;
      
    } catch (error) {
      console.error('Failed to get statistics:', error);
      return await this.updateStats();
    }
  }

  // Clear all data
  async clearAllData() {
    try {
      await this.ensureInitialized();
      
      console.log('Clearing all image data...');
      
      // Clear images
      await AsyncStorage.removeItem(this.storageKeys.images);
      
      // Clear statistics
      await AsyncStorage.removeItem(this.storageKeys.stats);
      
      // Clear settings
      await AsyncStorage.removeItem(this.storageKeys.settings);
      
      console.log('All data cleared successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw error;
    }
  }

  // Export data
  async exportData() {
    try {
      const images = await this.getImages();
      const stats = await this.getStats();
      
      const exportData = {
        images,
        stats,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
      };
      
      console.log(`Exported ${images.length} images and statistics`);
      return exportData;
      
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  // Import data
  async importData(importData) {
    try {
      await this.ensureInitialized();
      
      if (!importData || !importData.images) {
        throw new Error('Invalid import data');
      }
      
      console.log(`Importing ${importData.images.length} images...`);
      
      // Save images
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(importData.images));
      
      // Save statistics if available
      if (importData.stats) {
        await AsyncStorage.setItem(this.storageKeys.stats, JSON.stringify(importData.stats));
      } else {
        // Update statistics
        await this.updateStats();
      }
      
      console.log('Data imported successfully');
      return true;
      
    } catch (error) {
      console.error('Failed to import data:', error);
      throw error;
    }
  }

  // Search images (精简结构)
  async searchImages(query) {
    try {
      const allImages = await this.getImages();
      
      if (!query || query.trim() === '') {
        return allImages;
      }
      
      const searchTerm = query.toLowerCase();
      const filteredImages = allImages.filter(img => 
        img.fileName.toLowerCase().includes(searchTerm) ||
        img.category.toLowerCase().includes(searchTerm) ||
        (img.city && img.city.toLowerCase().includes(searchTerm)) ||
        (img.country && img.country.toLowerCase().includes(searchTerm))
      );
      
      console.log(`Found ${filteredImages.length} images matching: ${query}`);
      return filteredImages;
      
    } catch (error) {
      console.error('Failed to search images:', error);
      return [];
    }
  }

  // Get images by date range
  async getImagesByDateRange(startDate, endDate) {
    try {
      const allImages = await this.getImages();
      
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime();
      
      const filteredImages = allImages.filter(img => {
        const imgDate = new Date(img.timestamp).getTime();
        return imgDate >= start && imgDate <= end;
      });
      
      console.log(`Found ${filteredImages.length} images in date range: ${startDate} to ${endDate}`);
      return filteredImages;
      
    } catch (error) {
      console.error('Failed to get images by date range:', error);
      return [];
    }
  }

  // Get images by location (精简结构)
  async getImagesByLocation(city, country) {
    try {
      const allImages = await this.getImages();
      
      let filteredImages = allImages;
      
      if (city) {
        filteredImages = filteredImages.filter(img => 
          img.city && img.city.toLowerCase().includes(city.toLowerCase())
        );
      }
      
      if (country) {
        filteredImages = filteredImages.filter(img => 
          img.country && img.country.toLowerCase().includes(country.toLowerCase())
        );
      }
      
      // 按拍摄时间排序（最新的在前）
      const sortedImages = filteredImages.sort((a, b) => {
        const timeA = a.takenAt ? new Date(a.takenAt).getTime() : new Date(a.timestamp).getTime();
        const timeB = b.takenAt ? new Date(b.takenAt).getTime() : new Date(b.timestamp).getTime();
        return timeB - timeA; // 降序，最新的在前
      });
      
      console.log(`Found ${sortedImages.length} images in location: ${city || 'any'}, ${country || 'any'}`);
      return sortedImages;
      
    } catch (error) {
      console.error('Failed to get images by location:', error);
      return [];
    }
  }

  // Get duplicate images
  async getDuplicateImages() {
    try {
      const allImages = await this.getImages();
      const duplicates = [];
      const seen = new Map();
      
      allImages.forEach(img => {
        const key = `${img.fileName}_${img.size}`;
        if (seen.has(key)) {
          duplicates.push({
            original: seen.get(key),
            duplicate: img,
          });
        } else {
          seen.set(key, img);
        }
      });
      
      console.log(`Found ${duplicates.length} duplicate image pairs`);
      return duplicates;
      
    } catch (error) {
      console.error('Failed to get duplicate images:', error);
      return [];
    }
  }

  // Get storage usage
  async getStorageUsage() {
    try {
      const allImages = await this.getImages();
      
      const usage = {
        totalImages: allImages.length,
        totalSize: 0,
        averageSize: 0,
        byCategory: {},
        byMonth: {},
      };
      
      allImages.forEach(img => {
        usage.totalSize += img.size || 0;
        
        // By category
        if (!usage.byCategory[img.category]) {
          usage.byCategory[img.category] = { count: 0, size: 0 };
        }
        usage.byCategory[img.category].count++;
        usage.byCategory[img.category].size += img.size || 0;
        
        // By month
        const month = new Date(img.timestamp).toISOString().substring(0, 7);
        if (!usage.byMonth[month]) {
          usage.byMonth[month] = { count: 0, size: 0 };
        }
        usage.byMonth[month].count++;
        usage.byMonth[month].size += img.size || 0;
      });
      
      usage.averageSize = usage.totalImages > 0 ? usage.totalSize / usage.totalImages : 0;
      
      console.log(`Storage usage calculated: ${usage.totalImages} images, ${(usage.totalSize / 1024 / 1024).toFixed(2)} MB`);
      return usage;
      
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      return {
        totalImages: 0,
        totalSize: 0,
        averageSize: 0,
        byCategory: {},
        byMonth: {},
      };
    }
  }

  // 批量删除图片（根据URI列表）
  async removeImagesByUris(urisToRemove) {
    try {
      await this.ensureInitialized();
      
      if (!urisToRemove || urisToRemove.length === 0) {
        console.log('No images to remove');
        return { success: true, removedCount: 0 };
      }
      
      console.log(`Starting to remove ${urisToRemove.length} images by URIs...`);
      
      const allImages = await this.getImages();
      const urisSet = new Set(urisToRemove);
      
      // 过滤出需要保留的图片
      const remainingImages = allImages.filter(img => !urisSet.has(img.uri));
      
      console.log(`Found ${allImages.length} total images, removing ${allImages.length - remainingImages.length} images`);
      
      // 保存更新后的图片列表
      await AsyncStorage.setItem(this.storageKeys.images, JSON.stringify(remainingImages));
      
      // 更新统计信息
      await this.updateStats();
      
      console.log(`Successfully removed ${allImages.length - remainingImages.length} images`);
      return { 
        success: true, 
        removedCount: allImages.length - remainingImages.length 
      };
      
    } catch (error) {
      console.error('Failed to remove images by URIs:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // 获取所有图片的URI列表（优化性能）
  async getImageUris() {
    try {
      await this.ensureInitialized();
      
      const allImages = await this.getImages();
      return allImages.map(img => img.uri);
      
    } catch (error) {
      console.error('Failed to get image URIs:', error);
      return [];
    }
  }

  // 按日期分组图片（用于时间线显示）
  getGroupedImages(images) {
    console.log(`🔍 getGroupedImages 被调用，当前图片数量: ${images.length}`);
    const grouped = {};
    
    images.forEach(image => {
      // Prioritize taken time (takenAt), if not available use file time (timestamp)
      let date;
      if (image.takenAt) {
        date = new Date(image.takenAt);
      } else if (image.timestamp) {
        date = new Date(image.timestamp);
      } else if (image.createdAt) {
        date = new Date(image.createdAt);
      } else if (image.modifiedAt) {
        date = new Date(image.modifiedAt);
      } else {
        date = new Date();
      }
      
      const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(image);
    });
    
    // Sort images within each date group by taken time
    // If no taken time, sort by file time
    Object.keys(grouped).forEach(dateKey => {
      grouped[dateKey].sort((a, b) => {
        const timeA = a.takenAt || a.timestamp || a.createdAt || a.modifiedAt || 0;
        const timeB = b.takenAt || b.timestamp || b.createdAt || b.modifiedAt || 0;
        return new Date(timeB) - new Date(timeA); // Latest first
      });
    });
    
    // Sort dates in descending order (latest date first)
    const sortedDates = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a));
    
    return { grouped, sortedDates };
  }
}

export default ImageStorageService;