import { AsyncStorage, RNFS } from '../adapters/WebAdapters.js';
import MediaStoreService from './MediaStoreService.js';
import configService from './ConfigService.js';

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
    this.version = 3; // 增加版本号以支持相似度相关的对象存储
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) {
      return this.db;
    }

    // 检查 IndexedDB 是否可用
    if (!window.indexedDB) {
      console.error('❌ IndexedDB 不可用');
      throw new Error('IndexedDB 不可用');
    }

    // 尝试关闭可能存在的旧连接
    if (this.db) {
      console.log('🔄 关闭旧数据库连接...');
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }

    return new Promise((resolve, reject) => {
      // 添加超时机制，防止无限等待
      const timeout = setTimeout(() => {
        console.error('❌ IndexedDB 初始化超时');
        console.error('❌ 可能的原因: 数据库被锁定或浏览器兼容性问题');
        reject(new Error('IndexedDB 初始化超时'));
      }, 5000); // 5秒超时

      console.log(`🔄 尝试打开IndexedDB: ${this.dbName}, 版本: ${this.version}`);
      console.log('🔄 IndexedDB 支持情况:', {
        indexedDB: !!window.indexedDB,
        IDBKeyRange: !!window.IDBKeyRange,
        IDBTransaction: !!window.IDBTransaction
      });
      
      // 添加请求状态监听
      let requestStarted = false;
      const request = indexedDB.open(this.dbName, this.version);
      
      // 监听请求开始
      request.addEventListener('success', () => {
        console.log('🔄 IndexedDB 请求成功事件触发');
      });
      
      request.addEventListener('error', () => {
        console.log('🔄 IndexedDB 请求错误事件触发');
      });
      
      request.addEventListener('upgradeneeded', () => {
        console.log('🔄 IndexedDB 升级事件触发');
      });
      
      // 检查请求是否立即被阻塞
      setTimeout(() => {
        if (!requestStarted) {
          console.log('🔄 IndexedDB 请求状态检查: 请求可能被阻塞');
        }
      }, 100);
      
      request.onerror = () => {
        clearTimeout(timeout);
        console.error('❌ IndexedDB 初始化失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        this.isInitialized = true;
        console.log('✅ IndexedDB 初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        console.log('🔄 IndexedDB 开始升级数据库...');
        console.log('🔄 升级事件详情:', {
          oldVersion: event.oldVersion,
          newVersion: event.newVersion,
          type: event.type
        });
        
        const db = event.target.result;
        console.log('🔄 数据库对象:', db);
        console.log('🔄 当前对象存储:', Array.from(db.objectStoreNames));
        
        try {
          // 创建图片存储表
          if (!db.objectStoreNames.contains('images')) {
            console.log('📦 创建 images 对象存储...');
            const imageStore = db.createObjectStore('images', { keyPath: 'id' });
            imageStore.createIndex('category', 'category', { unique: false });
            imageStore.createIndex('createdAt', 'createdAt', { unique: false });
            console.log('✅ images 对象存储创建完成');
          } else {
            console.log('📦 images 对象存储已存在');
          }
          
          // 创建统计信息表
          if (!db.objectStoreNames.contains('stats')) {
            console.log('📦 创建 stats 对象存储...');
            db.createObjectStore('stats', { keyPath: 'key' });
            console.log('✅ stats 对象存储创建完成');
          } else {
            console.log('📦 stats 对象存储已存在');
          }
          
          // 创建设置表
          if (!db.objectStoreNames.contains('settings')) {
            console.log('📦 创建 settings 对象存储...');
            db.createObjectStore('settings', { keyPath: 'key' });
            console.log('✅ settings 对象存储创建完成');
          } else {
            console.log('📦 settings 对象存储已存在');
          }
          
          // 创建分类规则表
          if (!db.objectStoreNames.contains('classificationRules')) {
            console.log('📦 创建 classificationRules 对象存储...');
            db.createObjectStore('classificationRules', { keyPath: 'key' });
            console.log('✅ classificationRules 对象存储创建完成');
          } else {
            console.log('📦 classificationRules 对象存储已存在');
          }
          
          // 创建相似度数据表
          if (!db.objectStoreNames.contains('similarityData')) {
            console.log('📦 创建 similarityData 对象存储...');
            db.createObjectStore('similarityData', { keyPath: 'key' });
            console.log('✅ similarityData 对象存储创建完成');
          } else {
            console.log('📦 similarityData 对象存储已存在');
          }
          
          // 创建相似组索引表
          if (!db.objectStoreNames.contains('similarityGroupIndex')) {
            console.log('📦 创建 similarityGroupIndex 对象存储...');
            db.createObjectStore('similarityGroupIndex', { keyPath: 'key' });
            console.log('✅ similarityGroupIndex 对象存储创建完成');
          } else {
            console.log('📦 similarityGroupIndex 对象存储已存在');
          }
          
          console.log('✅ IndexedDB 数据库结构创建完成');
          console.log('🔄 升级完成后的对象存储:', Array.from(db.objectStoreNames));
        } catch (upgradeError) {
          console.error('❌ 数据库升级过程中出错:', upgradeError);
          console.error('❌ 升级错误堆栈:', upgradeError.stack);
          clearTimeout(timeout);
          reject(upgradeError);
        }
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

  // 新增：单条记录增量更新（性能最优）
  async addOrUpdateSingleImage(imageData) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      
      // 先尝试获取现有记录（基于URI查找）
      const getRequest = store.get(imageData.uri);
      
      getRequest.onsuccess = () => {
        const existingImage = getRequest.result;
        
        if (existingImage) {
          // 更新现有记录，保留原有ID和创建时间
          const updatedImage = {
            ...existingImage,
            ...imageData,
            id: existingImage.id, // 保持原有ID
            createdAt: existingImage.createdAt, // 保持原有创建时间
            updatedAt: new Date().toISOString()
          };
          
          store.put(updatedImage);
          console.log(`✅ 更新图片: ${imageData.fileName}`);
        } else {
          // 添加新记录，确保有ID字段
          const imageWithId = {
            ...imageData,
            id: imageData.id || this.generateStableId(imageData.uri)
          };
          store.add(imageWithId);
          console.log(`✅ 添加图片: ${imageData.fileName}`);
        }
        
        resolve(true);
      };
      
      getRequest.onerror = () => {
        console.error(`❌ IndexedDB 查找图片失败:`, getRequest.error);
        reject(getRequest.error);
      };
      
      transaction.oncomplete = () => {
        console.log(`✅ IndexedDB 单条记录操作成功`);
        resolve(true);
      };
      
      transaction.onerror = () => {
        console.error(`❌ IndexedDB 单条记录操作失败:`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  // 批量增量更新（用于批量操作）
  async updateImagesIncremental(newImages) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['images'], 'readwrite');
      const store = transaction.objectStore('images');
      
      // 获取现有数据
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const existingImages = getAllRequest.result || [];
        const existingMap = new Map(existingImages.map(img => [img.uri, img]));
        
        // 合并新数据
        newImages.forEach(newImg => {
          existingMap.set(newImg.uri, newImg);
        });
        
        // 清空并重新插入所有数据
        store.clear();
        const allImages = Array.from(existingMap.values());
        allImages.forEach(item => {
          store.add(item);
        });
        
        console.log(`✅ IndexedDB 批量增量更新成功，总图片数: ${allImages.length}`);
        resolve(true);
      };
      
      getAllRequest.onerror = () => {
        console.error(`❌ IndexedDB 读取现有数据失败:`, getAllRequest.error);
        reject(getAllRequest.error);
      };
      
      transaction.onerror = () => {
        console.error(`❌ IndexedDB 批量增量更新失败:`, transaction.error);
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

  // 生成稳定的ID
  generateStableId(uri) {
    // 使用URI的简单哈希作为ID基础，确保相同URI总是生成相同ID
    let hash = 0;
    for (let i = 0; i < uri.length; i++) {
      const char = uri.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    // 添加随机数确保唯一性，避免并发冲突
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `img_${Math.abs(hash).toString(36)}_${Date.now()}_${randomSuffix}`;
  }
}

class ImageStorageService {
  constructor() {
    this.storageKeys = {
      images: 'images',
      stats: 'stats',
      settings: 'settings',
      classificationRules: 'classificationRules',
      similarityData: 'similarityData', // 新增：相似度数据表
      similarityGroupIndex: 'similarityGroupIndex', // 新增：相似组索引
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
    // 确保配置服务已加载
    if (!configService || !configService.isConfigLoaded()) {
      throw new Error('ConfigService未初始化或配置未加载');
    }
    
    return configService.getCategoryDisplayName(categoryId, 'chinese');
  }

  // Initialize check
  async ensureInitialized() {
    if (this.isInitialized) return;
    
    try {
      if (Platform.OS === 'web') {
        // Web环境初始化IndexedDB
        console.log('🌐 开始初始化IndexedDB...');
        await this.storage.init();
        console.log('✅ IndexedDB初始化完成');
        
        // 检查是否需要从localStorage迁移数据
        console.log('🔄 开始检查localStorage迁移...');
        await this.migrateFromLocalStorage();
        console.log('✅ localStorage迁移检查完成');
      } else {
        // 移动端初始化AsyncStorage
        console.log('📱 开始初始化AsyncStorage...');
        await this.storage.getItem('test');
        console.log('✅ AsyncStorage初始化完成');
      }
      this.isInitialized = true;
      console.log('✅ 存储服务初始化成功，使用IndexedDB');
    } catch (error) {
      console.error('❌ IndexedDB初始化失败:', error);
      
      // 如果IndexedDB失败且有降级存储，尝试降级
      if (Platform.OS === 'web' && this.fallbackStorage) {
        try {
          console.log('🔄 降级到localStorage存储');
          this.storage = this.fallbackStorage;
          await this.storage.getItem('test');
          this.isInitialized = true;
          console.log('⚠️ 当前使用localStorage存储，检测结果可能不会显示在IndexedDB中');
          return;
        } catch (fallbackError) {
          console.error('❌ localStorage降级也失败:', fallbackError);
        }
      }
      
      // 最后尝试：强制清理数据库后重试
      console.log('🔄 尝试强制清理数据库...');
      try {
        // 尝试删除数据库
        const deleteRequest = indexedDB.deleteDatabase(this.dbName);
        deleteRequest.onsuccess = () => {
          console.log('✅ 数据库删除成功，准备重新创建');
        };
        deleteRequest.onerror = () => {
          console.log('⚠️ 数据库删除失败，继续尝试');
        };
        
        // 等待删除完成
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 重新创建IndexedDB适配器
        console.log('🔄 重新创建IndexedDB适配器...');
        this.storage = new IndexedDBAdapter();
        console.log('🔄 重试IndexedDB初始化...');
        await this.storage.init();
        console.log('✅ 重试IndexedDB初始化成功');
        console.log('🔄 重试localStorage迁移...');
        await this.migrateFromLocalStorage();
        console.log('✅ 重试localStorage迁移完成');
        this.isInitialized = true;
        console.log('✅ 重试成功，IndexedDB初始化完成');
      } catch (retryError) {
        console.error('❌ 重试IndexedDB初始化失败:', retryError);
        console.log('🔄 最终降级到localStorage存储');
        // 最终降级到localStorage
        this.storage = this.fallbackStorage;
        await this.storage.getItem('test');
        this.isInitialized = true;
        console.log('⚠️ 当前使用localStorage存储，检测结果可能不会显示在IndexedDB中');
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
      
      // 临时：自动清空localStorage中的旧数据（包含'people'分类）
      console.log('🧹 自动清理localStorage中的旧数据...');
      await this.fallbackStorage.removeItem('classified_images');
      await this.fallbackStorage.removeItem('image_stats');
      await this.fallbackStorage.removeItem('app_settings');
      console.log('✅ localStorage旧数据已清理');
      
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
        // 添加随机数确保唯一性，避免并发冲突
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        return `img_${Math.abs(hash).toString(36)}_${Date.now()}_${randomSuffix}`;
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
        mobileNetV3Detections: imageData.mobileNetV3Detections || null,  // MobileNetV3模型检测结果
        imageDimensions: imageData.imageDimensions || null,  // 图像尺寸信息
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
    console.log(`💾 开始保存到存储，检测结果字段:`, {
      idCardDetections: imageDataArray[0]?.idCardDetections?.length || 0,
      generalDetections: imageDataArray[0]?.generalDetections?.length || 0,
      mobileNetV3Detections: imageDataArray[0]?.mobileNetV3Detections ? '存在' : '不存在'
    });
    
    // 根据数据量选择最优保存策略
    if (Platform.OS === 'web') {
      if (imageDataArray.length === 1) {
        // 单张图片：使用单条记录操作（性能最优）
        await this.storage.addOrUpdateSingleImage(imageDataArray[0]);
        console.log(`✅ 单条记录保存成功`);
      } else {
        // 批量图片：也使用单条记录操作，避免数据丢失
        console.log(`🔄 开始批量保存 ${imageDataArray.length} 张图片`);
        for (const imageData of imageDataArray) {
          await this.storage.addOrUpdateSingleImage(imageData);
        }
        console.log(`✅ 批量保存成功，处理了 ${imageDataArray.length} 张图片`);
      }
    } else {
      // 移动端：使用原有逻辑
      await this.storage.setItem(this.storageKeys.images, existingImages);
      console.log(`✅ 数据已保存到存储`);
    }
    
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
        // 添加随机数确保唯一性，避免并发冲突
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        return `img_${Math.abs(hash).toString(36)}_${Date.now()}_${randomSuffix}`;
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
        mobileNetV3Detections: imageData.mobileNetV3Detections || null,  // MobileNetV3模型检测结果
        imageDimensions: imageData.imageDimensions || null,  // 图像尺寸信息
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
      
      // 清空 IndexedDB
      await this.storage.removeItem(this.storageKeys.images);
      await this.storage.removeItem(this.storageKeys.stats);
      console.log('✅ IndexedDB 数据已清空');
      
      // 同时清空 localStorage（防止数据重新迁移）
      if (Platform.OS === 'web' && this.fallbackStorage) {
        await this.fallbackStorage.removeItem('classified_images');
        await this.fallbackStorage.removeItem('image_stats');
        await this.fallbackStorage.removeItem('app_settings');
        console.log('✅ localStorage 数据已清空');
      }
      
      console.log('✅ 所有存储数据已清空');
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


      return {
        success: true,
        message: 'Image deleted successfully'
      };
      
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
    // 从ConfigService获取配置
    const objectMappings = configService.getObjectMappings();
    const fullConfig = configService.getFullConfig();
    
    // 从配置文件生成分类优先级（基于categoryDisplayOrder）
    const categoryPriorities = {};
    if (fullConfig?.categoryDisplayOrder) {
      fullConfig.categoryDisplayOrder.forEach((category, index) => {
        categoryPriorities[category] = index + 1;
      });
    }
    
    return {
      // 分类优先级定义（从categoryDisplayOrder自动生成）
      categoryPriorities: categoryPriorities,
      
      // 物体到分类的映射（从配置文件读取）
      objectMappings: objectMappings
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

  // ==================== 相似度数据表相关方法 ====================

  /**
   * 获取相似组索引
   * @returns {Promise<Object>} 相似组索引 {groupId: [imageId1, imageId2, ...]}
   */
  async getSimilarityGroupIndex() {
    try {
      await this.ensureInitialized();
      const index = await this.storage.getItem(this.storageKeys.similarityGroupIndex);
      return index || {};
    } catch (error) {
      console.error('❌ 获取相似组索引失败:', error);
      return {};
    }
  }

  /**
   * 保存相似组索引
   * @param {Object} groupIndex - 相似组索引
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveSimilarityGroupIndex(groupIndex) {
    try {
      await this.ensureInitialized();
      await this.storage.setItem(this.storageKeys.similarityGroupIndex, groupIndex);
      console.log(`✅ 保存相似组索引成功，共${Object.keys(groupIndex).length}个组`);
      return true;
    } catch (error) {
      console.error('❌ 保存相似组索引失败:', error);
      throw error;
    }
  }

  /**
   * 更新相似组索引（当图片的相似组信息发生变化时）
   * @param {string} imageId - 图片ID
   * @param {string} oldGroupId - 旧的组ID（如果存在）
   * @param {string} newGroupId - 新的组ID（如果存在）
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateSimilarityGroupIndex(imageId, oldGroupId, newGroupId) {
    try {
      const groupIndex = await this.getSimilarityGroupIndex();
      
      // 从旧组中移除图片
      if (oldGroupId && groupIndex[oldGroupId]) {
        groupIndex[oldGroupId] = groupIndex[oldGroupId].filter(id => id !== imageId);
        // 如果组为空，删除该组
        if (groupIndex[oldGroupId].length === 0) {
          delete groupIndex[oldGroupId];
        }
      }
      
      // 添加到新组
      if (newGroupId) {
        if (!groupIndex[newGroupId]) {
          groupIndex[newGroupId] = [];
        }
        if (!groupIndex[newGroupId].includes(imageId)) {
          groupIndex[newGroupId].push(imageId);
        }
      }
      
      await this.saveSimilarityGroupIndex(groupIndex);
      console.log(`✅ 更新相似组索引: ${imageId} ${oldGroupId ? `从${oldGroupId}` : ''} ${newGroupId ? `到${newGroupId}` : '移除'}`);
      return true;
    } catch (error) {
      console.error('❌ 更新相似组索引失败:', error);
      throw error;
    }
  }

  /**
   * 重建相似组索引（从相似度数据表重建）
   * @returns {Promise<boolean>} 是否重建成功
   */
  async rebuildSimilarityGroupIndex() {
    try {
      const similarityData = await this.getSimilarityData();
      const groupIndex = {};
      
      // 遍历相似度数据，按组ID分组
      Object.entries(similarityData).forEach(([imageId, data]) => {
        if (data.similarity_group_id) {
          const groupId = data.similarity_group_id;
          if (!groupIndex[groupId]) {
            groupIndex[groupId] = [];
          }
          groupIndex[groupId].push(imageId);
        }
      });
      
      await this.saveSimilarityGroupIndex(groupIndex);
      console.log(`✅ 重建相似组索引成功，共${Object.keys(groupIndex).length}个组`);
      return true;
    } catch (error) {
      console.error('❌ 重建相似组索引失败:', error);
      throw error;
    }
  }

  /**
   * 获取相似度数据表
   * @returns {Promise<Object>} 相似度数据映射表 {imageId: similarityData}
   */
  async getSimilarityData() {
    try {
      await this.ensureInitialized();
      const data = await this.storage.getItem(this.storageKeys.similarityData);
      return data || {};
    } catch (error) {
      console.error('❌ 获取相似度数据失败:', error);
      return {};
    }
  }

  /**
   * 保存相似度数据表
   * @param {Object} similarityData - 相似度数据映射表
   * @returns {Promise<boolean>} 是否保存成功
   */
  async saveSimilarityData(similarityData) {
    try {
      await this.ensureInitialized();
      await this.storage.setItem(this.storageKeys.similarityData, similarityData);
      console.log(`✅ 保存相似度数据成功，共${Object.keys(similarityData).length}条记录`);
      return true;
    } catch (error) {
      console.error('❌ 保存相似度数据失败:', error);
      throw error;
    }
  }

  /**
   * 更新单张图片的相似度数据
   * @param {string} imageId - 图片ID
   * @param {Object} similarityInfo - 相似度信息
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateImageSimilarity(imageId, similarityInfo) {
    try {
      const similarityData = await this.getSimilarityData();
      
      // 获取旧的组ID（用于索引更新）
      const oldGroupId = similarityData[imageId]?.similarity_group_id;
      const newGroupId = similarityInfo.similarity_group_id;
      
      // 更新或添加相似度数据
      similarityData[imageId] = {
        ...similarityData[imageId],
        ...similarityInfo,
        updatedAt: new Date().toISOString()
      };
      
      // 保存相似度数据
      await this.saveSimilarityData(similarityData);
      
      // 更新相似组索引
      await this.updateSimilarityGroupIndex(imageId, oldGroupId, newGroupId);
      
      console.log(`✅ 更新图片相似度数据: ${imageId}`);
      return true;
    } catch (error) {
      console.error('❌ 更新图片相似度数据失败:', error);
      throw error;
    }
  }

  /**
   * 批量更新图片相似度数据
   * @param {Array} imageSimilarityArray - 图片相似度数据数组
   * @returns {Promise<boolean>} 是否更新成功
   */
  async updateImagesSimilarity(imageSimilarityArray) {
    try {
      const similarityData = await this.getSimilarityData();
      const groupIndex = await this.getSimilarityGroupIndex();
      
      // 批量更新相似度数据
      imageSimilarityArray.forEach(item => {
        const oldGroupId = similarityData[item.imageId]?.similarity_group_id;
        const newGroupId = item.similarityInfo.similarity_group_id;
        
        // 更新相似度数据
        similarityData[item.imageId] = {
          ...similarityData[item.imageId],
          ...item.similarityInfo,
          updatedAt: new Date().toISOString()
        };
        
        // 更新相似组索引
        if (oldGroupId && oldGroupId !== newGroupId) {
          // 从旧组中移除
          if (groupIndex[oldGroupId]) {
            groupIndex[oldGroupId] = groupIndex[oldGroupId].filter(id => id !== item.imageId);
            if (groupIndex[oldGroupId].length === 0) {
              delete groupIndex[oldGroupId];
            }
          }
        }
        
        // 添加到新组
        if (newGroupId) {
          if (!groupIndex[newGroupId]) {
            groupIndex[newGroupId] = [];
          }
          if (!groupIndex[newGroupId].includes(item.imageId)) {
            groupIndex[newGroupId].push(item.imageId);
          }
        }
      });
      
      // 保存更新后的数据
      await this.saveSimilarityData(similarityData);
      await this.saveSimilarityGroupIndex(groupIndex);
      
      console.log(`✅ 批量更新图片相似度数据: ${imageSimilarityArray.length}张图片`);
      console.log(`✅ 更新相似组索引: ${Object.keys(groupIndex).length}个组`);
      return true;
    } catch (error) {
      console.error('❌ 批量更新图片相似度数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取单张图片的相似度数据
   * @param {string} imageId - 图片ID
   * @returns {Promise<Object|null>} 相似度数据
   */
  async getImageSimilarity(imageId) {
    try {
      const similarityData = await this.getSimilarityData();
      return similarityData[imageId] || null;
    } catch (error) {
      console.error('❌ 获取图片相似度数据失败:', error);
      return null;
    }
  }

  // ==================== 相似度检测相关方法 ====================

  /**
   * 获取相似度检测统计信息（使用独立相似度数据表）
   * @returns {Promise<Object>} 统计信息
   */
  async getSimilarityStats() {
    try {
      // 获取相似度数据
      const similarityData = await this.getSimilarityData();
      const similarityEntries = Object.values(similarityData);
      
      const stats = {
        processed: similarityEntries.filter(data => data.is_similarity_processed).length,
        grouped: similarityEntries.filter(data => data.similarity_group_id).length,
        groupTypes: {}
      };

      // 统计各类型组数量
      similarityEntries.forEach(data => {
        if (data.similarity_group_type) {
          stats.groupTypes[data.similarity_group_type] = 
            (stats.groupTypes[data.similarity_group_type] || 0) + 1;
        }
      });

      return stats;
    } catch (error) {
      console.error('❌ 获取相似度统计信息失败:', error);
      return {
        processed: 0,
        grouped: 0,
        groupTypes: {}
      };
    }
  }

  /**
   * 获取相似图片组
   * @param {string} groupType - 组类型过滤，'all'表示所有类型
   * @returns {Promise<Array>} 相似图片组列表
   */
  async getSimilarityGroups(groupType = 'all') {
    try {
      // 使用索引快速获取相似组
      const groupIndex = await this.getSimilarityGroupIndex();
      const similarityData = await this.getSimilarityData();
      const groups = {};

      // 遍历索引中的每个组
      Object.entries(groupIndex).forEach(([groupId, imageIds]) => {
        if (imageIds.length === 0) return; // 跳过空组
        
        // 获取组中第一张图片的数据来确定组类型
        const firstImageId = imageIds[0];
        const firstImageData = similarityData[firstImageId];
        
        if (!firstImageData) return;
        
        groups[groupId] = {
          id: groupId,
          type: firstImageData.similarity_group_type || 'similar',
          images: [],
          confidence: 0,
          created_at: firstImageData.updatedAt
        };
        
        // 添加组中所有图片
        imageIds.forEach(imageId => {
          const data = similarityData[imageId];
          if (data) {
            groups[groupId].images.push({
              id: imageId,
              similarity_score: data.similarity_score,
              similarity_group_type: data.similarity_group_type
            });
            
            // 更新组置信度（取平均值）
            if (data.similarity_score) {
              const currentConfidence = groups[groupId].confidence;
              const imageCount = groups[groupId].images.length;
              groups[groupId].confidence = 
                (currentConfidence * (imageCount - 1) + data.similarity_score) / imageCount;
            }
          }
        });
      });

      // 过滤组类型
      let filteredGroups = Object.values(groups);
      if (groupType !== 'all') {
        filteredGroups = filteredGroups.filter(group => group.type === groupType);
      }

      // 按组大小和置信度排序
      filteredGroups.sort((a, b) => {
        if (b.images.length !== a.images.length) {
          return b.images.length - a.images.length;
        }
        return b.confidence - a.confidence;
      });

      return filteredGroups;
    } catch (error) {
      console.error('❌ 获取相似图片组失败:', error);
      return [];
    }
  }

  /**
   * 根据组ID快速获取相似组信息
   * @param {string} groupId - 组ID
   * @returns {Promise<Object|null>} 相似组信息
   */
  async getSimilarityGroupById(groupId) {
    try {
      const groupIndex = await this.getSimilarityGroupIndex();
      const imageIds = groupIndex[groupId];
      
      if (!imageIds || imageIds.length === 0) {
        return null;
      }
      
      const similarityData = await this.getSimilarityData();
      const firstImageData = similarityData[imageIds[0]];
      
      if (!firstImageData) {
        return null;
      }
      
      const group = {
        id: groupId,
        type: firstImageData.similarity_group_type || 'similar',
        images: [],
        confidence: 0,
        created_at: firstImageData.updatedAt
      };
      
      // 添加组中所有图片
      imageIds.forEach(imageId => {
        const data = similarityData[imageId];
        if (data) {
          group.images.push({
            id: imageId,
            similarity_score: data.similarity_score,
            similarity_group_type: data.similarity_group_type
          });
          
          // 更新组置信度（取平均值）
          if (data.similarity_score) {
            const currentConfidence = group.confidence;
            const imageCount = group.images.length;
            group.confidence = 
              (currentConfidence * (imageCount - 1) + data.similarity_score) / imageCount;
          }
        }
      });
      
      return group;
    } catch (error) {
      console.error('❌ 获取相似组信息失败:', error);
      return null;
    }
  }

  /**
   * 获取特定图片的相似图片
   * @param {string} imageId - 图片ID
   * @param {number} limit - 返回数量限制，默认10
   * @returns {Promise<Array>} 相似图片列表
   */
  async getSimilarImages(imageId, limit = 10) {
    try {
      // 获取目标图片的相似度数据
      const targetSimilarity = await this.getImageSimilarity(imageId);
      
      if (!targetSimilarity || !targetSimilarity.similarity_group_id) {
        return [];
      }

      // 使用索引快速获取同组图片
      const groupIndex = await this.getSimilarityGroupIndex();
      const groupImageIds = groupIndex[targetSimilarity.similarity_group_id];
      
      if (!groupImageIds || groupImageIds.length <= 1) {
        return [];
      }

      // 获取相似度数据并按相似度分数排序
      const similarityData = await this.getSimilarityData();
      const similarImages = groupImageIds
        .filter(id => id !== imageId) // 排除目标图片
        .map(id => ({
          id: id,
          similarity_score: similarityData[id]?.similarity_score || 0
        }))
        .sort((a, b) => b.similarity_score - a.similarity_score)
        .slice(0, limit);

      return similarImages;
    } catch (error) {
      console.error('❌ 获取相似图片失败:', error);
      return [];
    }
  }

  /**
   * 清除相似度检测数据
   * @param {Array} imageIds - 要清除的图片ID数组，为空则清除所有
   * @returns {Promise<boolean>} 是否清除成功
   */
  async clearSimilarityData(imageIds = null) {
    try {
      if (imageIds === null) {
        // 清除所有相似度数据
        await this.storage.removeItem(this.storageKeys.similarityData);
        await this.storage.removeItem(this.storageKeys.similarityGroupIndex);
        console.log('✅ 清除所有相似度数据成功');
      } else {
        // 清除指定图片的相似度数据
        const similarityData = await this.getSimilarityData();
        const groupIndex = await this.getSimilarityGroupIndex();
        
        // 记录需要更新的组
        const groupsToUpdate = new Set();
        
        imageIds.forEach(imageId => {
          // 从相似度数据中移除
          const oldData = similarityData[imageId];
          if (oldData?.similarity_group_id) {
            groupsToUpdate.add(oldData.similarity_group_id);
          }
          delete similarityData[imageId];
          
          // 从组索引中移除
          if (oldData?.similarity_group_id && groupIndex[oldData.similarity_group_id]) {
            const groupId = oldData.similarity_group_id;
            groupIndex[groupId] = groupIndex[groupId].filter(id => id !== imageId);
            
            // 如果组为空或只剩一张图片，删除该组
            if (groupIndex[groupId].length <= 1) {
              // 如果组只剩一张图片，需要清除该图片的相似组信息
              if (groupIndex[groupId].length === 1) {
                const remainingImageId = groupIndex[groupId][0];
                if (similarityData[remainingImageId]) {
                  delete similarityData[remainingImageId].similarity_group_id;
                  delete similarityData[remainingImageId].similarity_group_type;
                  delete similarityData[remainingImageId].similarity_score;
                  console.log(`✅ 清除单图片组，移除图片 ${remainingImageId} 的相似组信息`);
                }
              }
              // 删除该组
              delete groupIndex[groupId];
            }
          }
        });
        
        // 保存更新后的数据
        await this.saveSimilarityData(similarityData);
        await this.saveSimilarityGroupIndex(groupIndex);
        console.log(`✅ 清除${imageIds.length}张图片的相似度数据成功`);
      }
      return true;
    } catch (error) {
      console.error('❌ 清除相似度检测数据失败:', error);
      throw error;
    }
  }

  /**
   * 删除相似组（优化版本）
   * @param {string} groupId - 相似组ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  async deleteSimilarityGroup(groupId) {
    try {
      // 获取组索引和相似度数据
      const groupIndex = await this.getSimilarityGroupIndex();
      const similarityData = await this.getSimilarityData();
      
      const groupImageIds = groupIndex[groupId];
      
      if (!groupImageIds || groupImageIds.length === 0) {
        console.log(`⚠️ 未找到相似组: ${groupId}`);
        return false;
      }

      // 直接从相似度数据中删除该组的所有图片
      groupImageIds.forEach(imageId => {
        delete similarityData[imageId];
      });
      
      // 从索引中删除该组
      delete groupIndex[groupId];
      
      // 保存更新后的数据
      await this.saveSimilarityData(similarityData);
      await this.saveSimilarityGroupIndex(groupIndex);
      
      console.log(`✅ 删除相似组${groupId}，影响${groupImageIds.length}张图片`);
      return true;
      
    } catch (error) {
      console.error('❌ 删除相似组失败:', error);
      return false;
    }
  }

  /**
   * 获取时间窗口内的图片
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<Array>} 时间窗口内的图片列表
   */
  async getImagesInTimeWindow(startTime, endTime) {
    try {
      const allImages = await this.getImages();
      
      const filteredImages = allImages.filter(image => {
        // 只使用拍摄时间，没有拍摄时间就不参与相似度检测
        if (!image.takenAt) {
          return false;
        }
        
        const imageTime = new Date(image.takenAt);
        return imageTime >= startTime && imageTime <= endTime;
      });

      // 按时间排序
      filteredImages.sort((a, b) => {
        const timeA = new Date(a.takenAt).getTime();
        const timeB = new Date(b.takenAt).getTime();
        return timeA - timeB;
      });

      return filteredImages;
    } catch (error) {
      console.error('❌ 获取时间窗口图片失败:', error);
      return [];
    }
  }

}

export default ImageStorageService;