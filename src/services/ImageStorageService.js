import { AsyncStorage, RNFS } from '../adapters/WebAdapters.js';
import MediaStoreService from './MediaStoreService.js';

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

// IndexedDB 适配器类
class IndexedDBAdapter {
  constructor() {
    this.dbName = 'ImageClassifierDB';
    this.version = 2; // 增加版本号以支持新的对象存储
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => {
        console.error('❌ IndexedDB 初始化失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('✅ IndexedDB 初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // 创建图片存储表
        if (!db.objectStoreNames.contains('images')) {
          const imageStore = db.createObjectStore('images', { keyPath: 'id' });
          imageStore.createIndex('category', 'category', { unique: false });
          imageStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
        
        // 创建统计信息表
        if (!db.objectStoreNames.contains('stats')) {
          db.createObjectStore('stats', { keyPath: 'key' });
        }
        
        // 创建设置表
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        
        // 创建分类规则表
        if (!db.objectStoreNames.contains('classificationRules')) {
          db.createObjectStore('classificationRules', { keyPath: 'key' });
        }
        
        console.log('✅ IndexedDB 数据库结构创建完成');
      };
    });
  }

  async getItem(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([key], 'readonly');
      const store = transaction.objectStore(key);
      const request = store.getAll();
      
      request.onsuccess = () => {
        const results = request.result;
        if (results.length === 0) {
          resolve(null);
        } else if (key === 'images') {
          // 对于图片数据，返回数组
          resolve(results);
        } else {
          // 对于其他数据，返回第一个结果的值
          resolve(results[0].value);
        }
      };
      
      request.onerror = () => {
        console.error(`❌ IndexedDB 读取失败 (${key}):`, request.error);
        reject(request.error);
      };
    });
  }

  async setItem(key, value) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([key], 'readwrite');
      const store = transaction.objectStore(key);
      
      if (key === 'images') {
        // 对于图片数据，清空后批量插入
        store.clear();
        if (Array.isArray(value)) {
          value.forEach(item => {
            store.add(item);
          });
        }
      } else {
        // 对于其他数据，存储为键值对
        store.put({ key, value });
      }
      
      transaction.oncomplete = () => {
        console.log(`✅ IndexedDB 保存成功 (${key})`);
        resolve(true);
      };
      
      transaction.onerror = () => {
        console.error(`❌ IndexedDB 保存失败 (${key}):`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  async removeItem(key) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([key], 'readwrite');
      const store = transaction.objectStore(key);
      
      if (key === 'images') {
        // 对于图片数据，清空整个表
        store.clear();
      } else {
        // 对于其他数据，删除键值对
        store.delete(key);
      }
      
      transaction.oncomplete = () => {
        console.log(`✅ IndexedDB 删除成功 (${key})`);
        resolve(true);
      };
      
      transaction.onerror = () => {
        console.error(`❌ IndexedDB 删除失败 (${key}):`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['images', 'stats', 'settings'], 'readwrite');
      
      transaction.oncomplete = () => {
        console.log('✅ IndexedDB 清空成功');
        resolve(true);
      };
      
      transaction.onerror = () => {
        console.error('❌ IndexedDB 清空失败:', transaction.error);
        reject(transaction.error);
      };
      
      // 清空所有表
      transaction.objectStore('images').clear();
      transaction.objectStore('stats').clear();
      transaction.objectStore('settings').clear();
    });
  }
}

class ImageStorageService {
  constructor() {
    this.storageKeys = {
      images: 'images',
      stats: 'stats',
      settings: 'settings',
      classificationRules: 'classificationRules',
    };
    this.isInitialized = false;
    // 添加保存锁，防止并发保存导致数据丢失
    this.saveLock = null;
    
    // 根据平台选择存储方式
    if (Platform.OS === 'web') {
      // Web环境优先使用IndexedDB，失败时降级到localStorage
      this.storage = new IndexedDBAdapter();
      this.fallbackStorage = AsyncStorage; // 降级存储
    } else {
      // 移动端使用AsyncStorage
      this.storage = AsyncStorage;
      this.fallbackStorage = null;
    }
  }

  // 获取分类显示名称
  getCategoryDisplayName(categoryId) {
    const categoryMap = {
      screenshot: '手机截图',
      meeting: '会议场景',
      document: '工作照片',
      people: '社交活动',
      life: '生活记录',
      game: '运动娱乐',
      food: '美食记录',
      travel: '旅行风景',
      pet: '宠物照片',
      idcard: '身份证',
      other: '其他图片',
    };
    
    return categoryMap[categoryId] || categoryId;
  }

  // Initialize check
  async ensureInitialized() {
    if (this.isInitialized) return;
    
    try {
      if (Platform.OS === 'web') {
        // Web环境初始化IndexedDB
        await this.storage.init();
        
        // 检查是否需要从localStorage迁移数据
        await this.migrateFromLocalStorage();
      } else {
        // 移动端初始化AsyncStorage
        await this.storage.getItem('test');
      }
      this.isInitialized = true;
    } catch (error) {
      console.warn('Primary storage not ready, trying fallback:', error);
      
      // 如果IndexedDB失败且有降级存储，尝试降级
      if (Platform.OS === 'web' && this.fallbackStorage) {
        try {
          console.log('🔄 降级到localStorage存储');
          this.storage = this.fallbackStorage;
          await this.storage.getItem('test');
          this.isInitialized = true;
          return;
        } catch (fallbackError) {
          console.error('Fallback storage also failed:', fallbackError);
        }
      }
      
      // Wait for a while and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        if (Platform.OS === 'web') {
          await this.storage.init();
          await this.migrateFromLocalStorage();
        } else {
          await this.storage.getItem('test');
        }
        this.isInitialized = true;
      } catch (retryError) {
        console.error('Storage initialization failed:', retryError);
        throw new Error('Storage not available');
      }
    }
  }

  // 从localStorage迁移数据到IndexedDB
  async migrateFromLocalStorage() {
    if (Platform.OS !== 'web' || !this.fallbackStorage) return;
    
    try {
      // 检查IndexedDB中是否已有数据
      const existingImages = await this.storage.getItem(this.storageKeys.images);
      if (existingImages && existingImages.length > 0) {
        console.log('✅ IndexedDB中已有数据，跳过迁移');
        return;
      }
      
      // 检查localStorage中是否有数据
      const oldImages = await this.fallbackStorage.getItem('classified_images');
      const oldStats = await this.fallbackStorage.getItem('image_stats');
      const oldSettings = await this.fallbackStorage.getItem('app_settings');
      
      if (oldImages || oldStats || oldSettings) {
        console.log('🔄 开始从localStorage迁移数据到IndexedDB...');
        
        // 迁移图片数据
        if (oldImages) {
          const images = JSON.parse(oldImages);
          await this.storage.setItem(this.storageKeys.images, images);
          console.log(`✅ 迁移了 ${images.length} 张图片数据`);
        }
        
        // 迁移统计数据
        if (oldStats) {
          const stats = JSON.parse(oldStats);
          await this.storage.setItem(this.storageKeys.stats, stats);
          console.log('✅ 迁移了统计数据');
        }
        
        // 迁移设置数据
        if (oldSettings) {
          const settings = JSON.parse(oldSettings);
          await this.storage.setItem(this.storageKeys.settings, settings);
          console.log('✅ 迁移了设置数据');
        }
        
        console.log('🎉 数据迁移完成！');
      }
    } catch (error) {
      console.warn('数据迁移失败，继续使用现有存储:', error);
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
        // Detection results
        idCardDetections: imageData.idCardDetections || null,  // 身份证模型检测结果
        generalDetections: imageData.generalDetections || null,  // 通用模型检测结果
        smartClassifications: imageData.smartClassifications || null,  // MobileNetV3智能分类结果
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
    
    // 保存到存储
    await this.storage.setItem(this.storageKeys.images, existingImages);
    
    // 更新统计信息
    await this.updateStats();
    
    console.log(`Batch save completed: ${newImages.length} new, ${updatedImages.length} updated`);
    return { newCount: newImages.length, updatedCount: updatedImages.length };
  }

  // 获取完整图片数据（用于内部操作）
  async _getFullImages() {
    try {
      await this.ensureInitialized();
      
      const images = await this.storage.getItem(this.storageKeys.images);
      if (!images) {
        return [];
      }
      
      return images;
    } catch (error) {
      console.error('Failed to get full images:', error);
      throw error;
    }
  }

  // 更新图片分类ID（独立接口，只更新分类相关字段）
  async updateImageCategory(imageId, newCategory, newConfidence = 'manual') {
    try {
      await this.ensureInitialized();
      
      console.log(`🔄 更新图片分类: ${imageId} -> ${newCategory}`);
      
      // 获取完整图片数据（包含检测结果）
      const existingImages = await this._getFullImages();
      const imageIndex = existingImages.findIndex(img => img.id === imageId);
      
      // 只更新分类相关字段，保留所有其他数据
      existingImages[imageIndex].category = newCategory;
      existingImages[imageIndex].confidence = newConfidence;
      existingImages[imageIndex].updatedAt = new Date().toISOString();
      
      // 保存到数据库
      await this.storage.setItem(this.storageKeys.images, existingImages);
      
      // 更新统计信息
      await this.updateStats();
      
      console.log(`✅ 图片分类更新成功: ${imageId} -> ${newCategory}`);
      return existingImages[imageIndex];
      
    } catch (error) {
      console.error('❌ 更新图片分类失败:', error);
      throw error;
    }
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
        // Detection results
        idCardDetections: imageData.idCardDetections || null,  // 身份证模型检测结果
        generalDetections: imageData.generalDetections || null,  // 通用模型检测结果
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
      await this.storage.setItem(this.storageKeys.images, existingImages);
      
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
      
      const fullImages = await this.storage.getItem(this.storageKeys.images);
      if (!fullImages) {
        return [];
      }
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
      
      const fullImages = await this.storage.getItem(this.storageKeys.images);
      if (!fullImages) {
        return null;
      }
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
      const settingsData = await this.storage.getItem(this.storageKeys.settings);
      
      if (settingsData) {
        const parsed = settingsData;
        
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
      
      await this.storage.setItem(this.storageKeys.settings, settings);
      
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
      await this.storage.removeItem(this.storageKeys.images);
      await this.storage.removeItem(this.storageKeys.stats);
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
      await this.storage.setItem(this.storageKeys.images, allImages);
      
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
      await this.storage.setItem(this.storageKeys.images, allImages);
      
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
      await this.storage.setItem(this.storageKeys.stats, stats);
      
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
      const stats = await this.storage.getItem(this.storageKeys.stats);
      if (!stats) {
        return await this.updateStats();
      }
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
      await this.storage.removeItem(this.storageKeys.images);
      
      // Clear statistics
      await this.storage.removeItem(this.storageKeys.stats);
      
      // Clear settings
      await this.storage.removeItem(this.storageKeys.settings);
      
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
      await this.storage.setItem(this.storageKeys.images, importData.images);
      
      // Save statistics if available
      if (importData.stats) {
        await this.storage.setItem(this.storageKeys.stats, importData.stats);
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
      await this.storage.setItem(this.storageKeys.images, remainingImages);
      
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

  // 获取默认分类规则（带优先级）
  getDefaultClassificationRulesWithPriority() {
    return {
      // 分类优先级定义（数字越小优先级越高）
      categoryPriorities: {
        'idcard': 1,      // 身份证 - 最高优先级
        'people': 2,      // 社交活动
        'pet': 3,         // 宠物照片
        'life': 4,        // 生活记录
        'food': 5,        // 美食记录
        'document': 6,    // 工作照片
        'travel': 7,      // 旅行风景
        'game': 8,        // 运动娱乐
        'other': 9        // 其他图片 - 最低优先级
      },
      
      // 物体到分类的映射
      objectMappings: {
        // 身份证相关 -> idcard
        'id_card_front': 'idcard',
        'id_card_back': 'idcard',
        
        // 人物相关 -> people
        'person': 'people',
        
        // 宠物相关 -> pet
        'cat': 'pet',
        'dog': 'pet',
        'bird': 'pet',
        'horse': 'pet',
        'sheep': 'pet',
        'cow': 'pet',
        'elephant': 'pet',
        'bear': 'pet',
        'zebra': 'pet',
        'giraffe': 'pet',
        
        // 生活用品 -> life
        'bottle': 'life',
        'wine glass': 'life',
        'cup': 'life',
        'fork': 'life',
        'knife': 'life',
        'spoon': 'life',
        'bowl': 'life',
        'tv': 'life',
        'couch': 'life',
        'bed': 'life',
        'dining table': 'life',
        'toilet': 'life',
        'microwave': 'life',
        'oven': 'life',
        'toaster': 'life',
        'sink': 'life',
        'refrigerator': 'life',
        'clock': 'life',
        'vase': 'life',
        'scissors': 'life',
        'teddy bear': 'life',
        'hair drier': 'life',
        'toothbrush': 'life',
        
        // 食物相关 -> food
        'banana': 'food',
        'apple': 'food',
        'sandwich': 'food',
        'orange': 'food',
        'broccoli': 'food',
        'carrot': 'food',
        'hot dog': 'food',
        'pizza': 'food',
        'donut': 'food',
        'cake': 'food',
        
        // 工作文档 -> document
        'laptop': 'document',
        'mouse': 'document',
        'keyboard': 'document',
        'cell phone': 'document',
        'book': 'document',
        'remote': 'document',
        
        // 交通工具 -> travel
        'car': 'travel',
        'motorcycle': 'travel',
        'airplane': 'travel',
        'bus': 'travel',
        'train': 'travel',
        'truck': 'travel',
        'boat': 'travel',
        'bicycle': 'travel',
        
        // 游戏相关 -> game
        'sports ball': 'game',
        'frisbee': 'game',
        'skis': 'game',
        'snowboard': 'game',
        'kite': 'game',
        'baseball bat': 'game',
        'baseball glove': 'game',
        'skateboard': 'game',
        'surfboard': 'game',
        'tennis racket': 'game',
        
        // 其他 -> other
        'traffic light': 'other',
        'fire hydrant': 'other',
        'stop sign': 'other',
        'parking meter': 'other',
        'bench': 'other',
        'backpack': 'other',
        'umbrella': 'other',
        'handbag': 'other',
        'tie': 'other',
        'suitcase': 'other',
        'potted plant': 'other',
        'chair': 'other'
      }
    };
  }

  // 获取默认分类规则（兼容旧版本）
  getDefaultClassificationRules() {
    const rulesWithPriority = this.getDefaultClassificationRulesWithPriority();
    return rulesWithPriority.objectMappings;
  }

  // 获取分类规则（带优先级）
  async getClassificationRulesWithPriority() {
    try {
      await this.ensureInitialized();
      const rulesData = await this.storage.getItem(this.storageKeys.classificationRules);
      
      if (!rulesData || !rulesData.categoryPriorities) {
        // 如果没有优先级数据，初始化默认规则
        const defaultRules = this.getDefaultClassificationRulesWithPriority();
        await this.saveClassificationRulesWithPriority(defaultRules);
        return defaultRules;
      }
      
      return rulesData;
    } catch (error) {
      console.error('获取分类规则失败:', error);
      // 出错时返回默认规则
      return this.getDefaultClassificationRulesWithPriority();
    }
  }

  // 获取分类规则（兼容旧版本）
  async getClassificationRules() {
    try {
      const rulesWithPriority = await this.getClassificationRulesWithPriority();
      return rulesWithPriority.objectMappings;
    } catch (error) {
      console.error('获取分类规则失败:', error);
      return this.getDefaultClassificationRules();
    }
  }

  // 保存分类规则（带优先级）
  async saveClassificationRulesWithPriority(rulesWithPriority) {
    try {
      await this.ensureInitialized();
      const rulesData = {
        key: 'classificationRules',
        ...rulesWithPriority,
        updatedAt: new Date().toISOString()
      };
      await this.storage.setItem(this.storageKeys.classificationRules, rulesData);
      console.log('✅ 分类规则（带优先级）保存成功');
      return true;
    } catch (error) {
      console.error('保存分类规则失败:', error);
      throw error;
    }
  }

  // 保存分类规则（兼容旧版本）
  async saveClassificationRules(rules) {
    try {
      // 将旧格式转换为新格式
      const rulesWithPriority = this.getDefaultClassificationRulesWithPriority();
      rulesWithPriority.objectMappings = rules;
      await this.saveClassificationRulesWithPriority(rulesWithPriority);
      return true;
    } catch (error) {
      console.error('保存分类规则失败:', error);
      throw error;
    }
  }

  // 重置分类规则为默认值
  async resetClassificationRules() {
    try {
      const defaultRules = this.getDefaultClassificationRules();
      await this.saveClassificationRules(defaultRules);
      console.log('✅ 分类规则已重置为默认值');
      return defaultRules;
    } catch (error) {
      console.error('重置分类规则失败:', error);
      throw error;
    }
  }

  // 更新单个分类规则
  async updateClassificationRule(objectClass, newCategory) {
    try {
      const rules = await this.getClassificationRules();
      rules[objectClass] = newCategory;
      await this.saveClassificationRules(rules);
      console.log(`✅ 分类规则更新成功: ${objectClass} -> ${newCategory}`);
      return rules;
    } catch (error) {
      console.error('更新分类规则失败:', error);
      throw error;
    }
  }

  // 添加新的分类规则
  async addClassificationRule(objectClass, category) {
    try {
      const rules = await this.getClassificationRules();
      rules[objectClass] = category;
      await this.saveClassificationRules(rules);
      console.log(`✅ 新增分类规则: ${objectClass} -> ${category}`);
      return rules;
    } catch (error) {
      console.error('添加分类规则失败:', error);
      throw error;
    }
  }

  // 删除分类规则
  async removeClassificationRule(objectClass) {
    try {
      const rules = await this.getClassificationRules();
      delete rules[objectClass];
      await this.saveClassificationRules(rules);
      console.log(`✅ 删除分类规则: ${objectClass}`);
      return rules;
    } catch (error) {
      console.error('删除分类规则失败:', error);
      throw error;
    }
  }
}

export default ImageStorageService;