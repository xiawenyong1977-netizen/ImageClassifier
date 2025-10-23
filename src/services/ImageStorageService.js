import { AsyncStorage, RNFS, logger, Platform, SQLite } from '../adapters/WebAdapters';
import configService from './ConfigService.js';

// SQLite 适配器类（移动端）
class SQLiteAdapter {
  constructor() {
    this.dbName = 'ImageClassifier.db';
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized && this.db) {
      return this.db;
    }

    try {
      logger.debug('📱 开始初始化 SQLite 数据库...');
      


      // 打开数据库
      this.db = SQLite.openDatabase(this.dbName, '1.0', 'Image Classifier DB', 200000);
      
      // 创建表结构
      await this.createTables();
      
      // 数据库优化配置
      try {
        logger.debug('📋 设置 SQLite PRAGMA...');
        await this.db.executeSql('PRAGMA journal_mode = WAL;');  // 写前日志模式
        await this.db.executeSql('PRAGMA synchronous = NORMAL;');
        await this.db.executeSql('PRAGMA cache_size = 10000;');
        logger.debug('✅ SQLite PRAGMA 设置成功');
      } catch (pragmaError) {
        logger.warn('⚠️ SQLite PRAGMA 设置失败（非致命错误）:', pragmaError);
        // PRAGMA 失败不影响主要功能，继续初始化
      }
      
      this.isInitialized = true;
      logger.debug('✅ SQLite 数据库初始化成功');
      
      return this.db;
    } catch (error) {
      logger.error('❌ SQLite 初始化失败:', error);
      throw error;
    }
  }

  async createTables() {
    const createTablesSql = `
      -- 图片表
      CREATE TABLE IF NOT EXISTS images (
        id TEXT PRIMARY KEY,
        uri TEXT NOT NULL UNIQUE,
        fileName TEXT NOT NULL,
        category TEXT,
        confidence REAL,
        timestamp INTEGER,
        takenAt INTEGER,
        size INTEGER,
        mimeType TEXT,
        width INTEGER,
        height INTEGER,
        createdAt TEXT,
        updatedAt TEXT,
        -- GPS信息
        latitude REAL,
        longitude REAL,
        altitude REAL,
        accuracy REAL,
        -- 地址信息
        address TEXT,
        city TEXT,
        country TEXT,
        province TEXT,
        district TEXT,
        street TEXT,
        locationSource TEXT,
        cityDistance REAL,
        -- 检测结果（JSON字符串）
        idCardDetections TEXT,
        generalDetections TEXT,
        mobileNetV3Detections TEXT,
        imageDimensions TEXT,
        message TEXT
      );

      -- 索引优化
      CREATE INDEX IF NOT EXISTS idx_category ON images(category);
      CREATE INDEX IF NOT EXISTS idx_city ON images(city);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON images(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_takenAt ON images(takenAt DESC);

      -- 设置表
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      -- 相似度数据表
      CREATE TABLE IF NOT EXISTS similarity_data (
        imageId TEXT PRIMARY KEY,
        similarity_group_id TEXT,
        similarity_group_type TEXT,
        similarity_score REAL,
        is_similarity_processed INTEGER DEFAULT 0,
        updatedAt TEXT,
        FOREIGN KEY (imageId) REFERENCES images(id) ON DELETE CASCADE
      );

      -- 相似组索引表
      CREATE TABLE IF NOT EXISTS similarity_group_index (
        groupId TEXT PRIMARY KEY,
        imageIds TEXT,
        created_at TEXT
      );
    `;

    // 分割SQL语句并执行
    const statements = createTablesSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const sql of statements) {
      await this.db.executeSql(sql);
    }
    
    logger.debug('✅ SQLite 表结构创建完成');
  }

  async getItem(key) {
    await this.init();
    
    if (key === 'images') {
      // 查询所有图片
      const results = await this.db.executeSql(
        'SELECT * FROM images ORDER BY timestamp DESC'
      );
      
      const result = results && results.length > 0 ? results[0] : null;
      if (!result || !result.rows) {
        logger.warn('⚠️ SQLite: 没有查询到图片数据');
        return [];
      }
      
      const images = [];
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        // 解析JSON字段
        images.push({
          ...row,
          idCardDetections: row.idCardDetections ? JSON.parse(row.idCardDetections) : null,
          generalDetections: row.generalDetections ? JSON.parse(row.generalDetections) : null,
          mobileNetV3Detections: row.mobileNetV3Detections ? JSON.parse(row.mobileNetV3Detections) : null,
          imageDimensions: row.imageDimensions ? JSON.parse(row.imageDimensions) : null
        });
      }
      
      return images;
    } else if (key === 'settings') {
      // 查询所有设置
      const results = await this.db.executeSql(
        'SELECT * FROM settings'
      );
      
      // SQLite executeSql返回数组，第一个元素是结果集
      const result = results && results.length > 0 ? results[0] : null;
      if (!result || !result.rows) {
        return null;
      }
      
      const settings = {};
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        try {
          settings[row.key] = JSON.parse(row.value);
        } catch {
          settings[row.key] = row.value;
        }
      }
      
      return Object.keys(settings).length > 0 ? settings : null;
    } else if (key === 'similarityData') {
      // 查询相似度数据
      const results = await this.db.executeSql(
        'SELECT * FROM similarity_data'
      );
      const result = results && results.length > 0 ? results[0] : null;
      if (!result || !result.rows) {
        return null;
      }
      
      const data = {};
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        data[row.imageId] = {
          similarity_group_id: row.similarity_group_id,
          similarity_group_type: row.similarity_group_type,
          similarity_score: row.similarity_score,
          is_similarity_processed: row.is_similarity_processed === 1,
          updatedAt: row.updatedAt
        };
      }
      
      return data;
    } else if (key === 'similarityGroupIndex') {
      // 查询相似组索引
      const results = await this.db.executeSql(
        'SELECT * FROM similarity_group_index'
      );
      const result = results && results.length > 0 ? results[0] : null;
      if (!result || !result.rows) {
        return null;
      }
      
      const index = {};
      for (let i = 0; i < result.rows.length; i++) {
        const row = result.rows.item(i);
        index[row.groupId] = JSON.parse(row.imageIds);
      }
      
      return index;
    }
    
    return null;
  }

  async setItem(key, value) {
    await this.init();
    
    if (key === 'images') {
      // 批量插入/更新图片
      if (!Array.isArray(value)) {
        throw new Error('images value must be an array');
      }
      
      // 使用事务批量操作
      await this.db.transaction(async (tx) => {
        for (const image of value) {
          const sql = `
            INSERT OR REPLACE INTO images (
              id, uri, fileName, category, confidence, timestamp, takenAt,
              size, mimeType, width, height, createdAt, updatedAt,
              latitude, longitude, altitude, accuracy,
              address, city, country, province, district, street, locationSource, cityDistance,
              idCardDetections, generalDetections, mobileNetV3Detections, imageDimensions, message
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;
          
          await tx.executeSql(sql, [
            image.id,
            image.uri,
            image.fileName,
            image.category,
            image.confidence,
            image.timestamp,
            image.takenAt,
            image.size,
            image.mimeType,
            image.width,
            image.height,
            image.createdAt,
            image.updatedAt,
            image.latitude,
            image.longitude,
            image.altitude,
            image.accuracy,
            image.address,
            image.city,
            image.country,
            image.province,
            image.district,
            image.street,
            image.locationSource,
            image.cityDistance,
            image.idCardDetections ? JSON.stringify(image.idCardDetections) : null,
            image.generalDetections ? JSON.stringify(image.generalDetections) : null,
            image.mobileNetV3Detections ? JSON.stringify(image.mobileNetV3Detections) : null,
            image.imageDimensions ? JSON.stringify(image.imageDimensions) : null,
            image.message
          ]);
        }
      });
      
      logger.debug(`✅ SQLite批量保存${value.length}张图片`);
      return true;
    } else if (key === 'settings') {
      // 保存设置
      await this.db.transaction(async (tx) => {
        for (const [settingKey, settingValue] of Object.entries(value)) {
          await tx.executeSql(
            'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
            [settingKey, JSON.stringify(settingValue)]
          );
        }
      });
      
      return true;
    } else if (key === 'similarityData') {
      // 保存相似度数据
      await this.db.transaction(async (tx) => {
        for (const [imageId, data] of Object.entries(value)) {
          await tx.executeSql(
            `INSERT OR REPLACE INTO similarity_data 
             (imageId, similarity_group_id, similarity_group_type, similarity_score, is_similarity_processed, updatedAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              imageId,
              data.similarity_group_id,
              data.similarity_group_type,
              data.similarity_score,
              data.is_similarity_processed ? 1 : 0,
              data.updatedAt
            ]
          );
        }
      });
      
      return true;
    } else if (key === 'similarityGroupIndex') {
      // 保存相似组索引
      await this.db.transaction(async (tx) => {
        // 清空旧数据
        await tx.executeSql('DELETE FROM similarity_group_index');
        
        // 插入新数据
        for (const [groupId, imageIds] of Object.entries(value)) {
          await tx.executeSql(
            'INSERT INTO similarity_group_index (groupId, imageIds, created_at) VALUES (?, ?, ?)',
            [groupId, JSON.stringify(imageIds), new Date().toISOString()]
          );
        }
      });
      
      return true;
    }
    
    return false;
  }

  async addOrUpdateSingleImage(imageData) {
    await this.init();
    
    const sql = `
      INSERT OR REPLACE INTO images (
        id, uri, fileName, category, confidence, timestamp, takenAt,
        size, mimeType, width, height, createdAt, updatedAt,
        latitude, longitude, altitude, accuracy,
        address, city, country, province, district, street, locationSource, cityDistance,
        idCardDetections, generalDetections, mobileNetV3Detections, imageDimensions, message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await this.db.executeSql(sql, [
      imageData.id || this.generateStableId(imageData.uri),
      imageData.uri,
      imageData.fileName,
      imageData.category,
      imageData.confidence,
      imageData.timestamp,
      imageData.takenAt,
      imageData.size,
      imageData.mimeType,
      imageData.width,
      imageData.height,
      imageData.createdAt || new Date().toISOString(),
      imageData.updatedAt || new Date().toISOString(),
      imageData.latitude,
      imageData.longitude,
      imageData.altitude,
      imageData.accuracy,
      imageData.address,
      imageData.city,
      imageData.country,
      imageData.province,
      imageData.district,
      imageData.street,
      imageData.locationSource,
      imageData.cityDistance,
      imageData.idCardDetections ? JSON.stringify(imageData.idCardDetections) : null,
      imageData.generalDetections ? JSON.stringify(imageData.generalDetections) : null,
      imageData.mobileNetV3Detections ? JSON.stringify(imageData.mobileNetV3Detections) : null,
      imageData.imageDimensions ? JSON.stringify(imageData.imageDimensions) : null,
      imageData.message
    ]);
    
    return true;
  }

  async removeItem(key) {
    await this.init();
    
    if (key === 'images') {
      await this.db.executeSql('DELETE FROM images');
      logger.debug('✅ SQLite清空images表');
    } else if (key === 'settings') {
      await this.db.executeSql('DELETE FROM settings');
    } else if (key === 'similarityData') {
      await this.db.executeSql('DELETE FROM similarity_data');
    } else if (key === 'similarityGroupIndex') {
      await this.db.executeSql('DELETE FROM similarity_group_index');
    }
    
    return true;
  }

  async clear() {
    await this.init();
    
    await this.db.transaction(async (tx) => {
      await tx.executeSql('DELETE FROM images');
      await tx.executeSql('DELETE FROM settings');
      await tx.executeSql('DELETE FROM similarity_data');
      await tx.executeSql('DELETE FROM similarity_group_index');
    });
    
    logger.debug('✅ SQLite数据库已清空');
    return true;
  }

  generateStableId(uri) {
    // 与IndexedDB保持一致的ID生成逻辑
    let hash = 0;
    for (let i = 0; i < uri.length; i++) {
      const char = uri.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `img_${Math.abs(hash).toString(36)}_${Date.now()}_${randomSuffix}`;
  }

  // 🆕 专用方法：更新图片分类（单条记录）
  async updateImageCategory(imageId, newCategory, newConfidence) {
    await this.init();
    
    const sql = `
      UPDATE images 
      SET category = ?, confidence = ?, updatedAt = ?
      WHERE id = ?
    `;
    
    const [result] = await this.db.executeSql(sql, [
      newCategory,
      newConfidence,
      new Date().toISOString(),
      imageId
    ]);
    
    if (result.rowsAffected > 0) {
      logger.debug(`✅ SQLite更新分类: ${imageId} -> ${newCategory}`);
      return true;
  } else {
      logger.warn(`⚠️ SQLite未找到图片: ${imageId}`);
      return false;
    }
  }

  // 🆕 专用方法：删除单张图片（单条记录）
  async deleteImageById(imageId) {
    await this.init();
    
    // 先查询图片信息
    const [selectResult] = await this.db.executeSql(
      'SELECT * FROM images WHERE id = ?',
      [imageId]
    );
    
    if (selectResult.rows.length === 0) {
      return { success: false, message: 'Image not found', image: null };
    }
    
    const image = selectResult.rows.item(0);
    
    // 删除图片记录
    const [deleteResult] = await this.db.executeSql(
      'DELETE FROM images WHERE id = ?',
      [imageId]
    );
    
    if (deleteResult.rowsAffected > 0) {
      logger.debug(`✅ SQLite删除图片: ${image.fileName}`);
      return { success: true, message: 'Image deleted', image };
    } else {
      return { success: false, message: 'Delete failed', image };
    }
  }

  // 🆕 专用方法：批量删除图片（按ID列表）
  async deleteImagesByIds(imageIds) {
    await this.init();
    
    let removedCount = 0;
    let failedCount = 0;
    
    await this.db.transaction(async (tx) => {
      for (const imageId of imageIds) {
        try {
          const [result] = await tx.executeSql(
            'DELETE FROM images WHERE id = ?',
            [imageId]
          );
          
          if (result.rowsAffected > 0) {
            removedCount++;
          } else {
            failedCount++;
  }
} catch (error) {
          logger.error(`❌ SQLite删除失败: ${imageId}`, error);
          failedCount++;
        }
      }
    });
    
    logger.debug(`✅ SQLite批量删除: 成功${removedCount}, 失败${failedCount}`);
    return { removedCount, failedCount };
  }

  // 🆕 专用方法：按URI列表删除
  async deleteImagesByUris(uris) {
    await this.init();
    
    // 先查询要删除的图片ID
    const placeholders = uris.map(() => '?').join(',');
    const [result] = await this.db.executeSql(
      `SELECT id FROM images WHERE uri IN (${placeholders})`,
      uris
    );
    
    const imageIds = [];
    for (let i = 0; i < result.rows.length; i++) {
      imageIds.push(result.rows.item(i).id);
    }
    
    // 批量删除
    return await this.deleteImagesByIds(imageIds);
  }
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
      logger.error('IndexedDB 不可用');
      throw new Error('IndexedDB 不可用');
    }

    // 尝试关闭可能存在的旧连接
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }

    return new Promise((resolve, reject) => {
      // 添加超时机制，防止无限等待
      const timeout = setTimeout(() => {
        logger.error('IndexedDB 初始化超时');
        logger.error('可能的原因: 数据库被锁定或浏览器兼容性问题');
        reject(new Error('IndexedDB 初始化超时'));
      }, 5000); // 5秒超时

      
      // 添加请求状态监听
      let requestStarted = false;
      const request = indexedDB.open(this.dbName, this.version);
      
      // 监听请求开始
      request.addEventListener('success', () => {
      });
      
      request.addEventListener('error', () => {
      });
      
      request.addEventListener('upgradeneeded', () => {
      });
      
      // 检查请求是否立即被阻塞
      setTimeout(() => {
        if (!requestStarted) {
        }
      }, 100);
      
      request.onerror = () => {
        clearTimeout(timeout);
        logger.error('IndexedDB 初始化失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        this.isInitialized = true;
        logger.debug('IndexedDB 初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        logger.debug('IndexedDB 开始升级数据库...');
        logger.debug('升级事件详情:', {
          oldVersion: event.oldVersion,
          newVersion: event.newVersion,
          type: event.type
        });
        
        const db = event.target.result;
        logger.debug('数据库对象:', db);
        logger.debug('当前对象存储:', Array.from(db.objectStoreNames));
        
        try {
          // 创建图片存储表
          if (!db.objectStoreNames.contains('images')) {
            logger.debug('创建 images 对象存储...');
            const imageStore = db.createObjectStore('images', { keyPath: 'id' });
            imageStore.createIndex('category', 'category', { unique: false });
            imageStore.createIndex('createdAt', 'createdAt', { unique: false });
            logger.debug('images 对象存储创建完成');
          } else {
            logger.debug('images 对象存储已存在');
          }
          
          // 创建统计信息表
          if (!db.objectStoreNames.contains('stats')) {
            logger.debug('创建 stats 对象存储...');
            db.createObjectStore('stats', { keyPath: 'key' });
            logger.debug(' stats 对象存储创建完成');
          } else {
            logger.debug(' stats 对象存储已存在');
          }
          
          // 创建设置表
          if (!db.objectStoreNames.contains('settings')) {
            logger.debug(' 创建 settings 对象存储...');
            db.createObjectStore('settings', { keyPath: 'key' });
            logger.debug(' settings 对象存储创建完成');
          } else {
            logger.debug(' settings 对象存储已存在');
          }
          
          // 创建分类规则表
          if (!db.objectStoreNames.contains('classificationRules')) {
            logger.debug(' 创建 classificationRules 对象存储...');
            db.createObjectStore('classificationRules', { keyPath: 'key' });
            logger.debug(' classificationRules 对象存储创建完成');
          } else {
            logger.debug(' classificationRules 对象存储已存在');
          }
          
          // 创建相似度数据表
          if (!db.objectStoreNames.contains('similarityData')) {
            logger.debug(' 创建 similarityData 对象存储...');
            db.createObjectStore('similarityData', { keyPath: 'key' });
            logger.debug(' similarityData 对象存储创建完成');
          } else {
            logger.debug(' similarityData 对象存储已存在');
          }
          
          // 创建相似组索引表
          if (!db.objectStoreNames.contains('similarityGroupIndex')) {
            logger.debug(' 创建 similarityGroupIndex 对象存储...');
            db.createObjectStore('similarityGroupIndex', { keyPath: 'key' });
            logger.debug(' similarityGroupIndex 对象存储创建完成');
          } else {
            logger.debug(' similarityGroupIndex 对象存储已存在');
          }
          
          logger.debug(' IndexedDB 数据库结构创建完成');
          logger.debug('升级完成后的对象存储:', Array.from(db.objectStoreNames));
        } catch (upgradeError) {
          logger.error(' 数据库升级过程中出错:', upgradeError);
          logger.error(' 升级错误堆栈:', upgradeError.stack);
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
        logger.error(`❌ IndexedDB 读取失败 (${key}):`, request.error);
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
        resolve(true);
      };
      
      transaction.onerror = () => {
        logger.error(`❌ IndexedDB 保存失败 (${key}):`, transaction.error);
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
      
      // 🔧 修复：使用 id 作为主键查找（keyPath 是 'id'）
      const imageId = imageData.id || this.generateStableId(imageData.uri);
      const getRequest = store.get(imageId);
      
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
          logger.debug(`✅ 更新图片: ${imageData.fileName}`);
        } else {
          // 添加新记录，确保有ID字段
          const imageWithId = {
            ...imageData,
            id: imageId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          store.add(imageWithId);
          logger.debug(`✅ 新增图片: ${imageData.fileName}`);
        }
      };
      
      getRequest.onerror = () => {
        logger.error(`❌ IndexedDB 查找图片失败:`, getRequest.error);
        reject(getRequest.error);
      };
      
      // 🔧 修复：只在事务完成时 resolve，避免重复 resolve
      transaction.oncomplete = () => {
        resolve(true);
      };
      
      transaction.onerror = () => {
        logger.error(`❌ IndexedDB 单条记录操作失败:`, transaction.error);
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
        
        logger.debug(`✅ IndexedDB 批量增量更新成功，总图片数: ${allImages.length}`);
        resolve(true);
      };
      
      getAllRequest.onerror = () => {
        logger.error(`❌ IndexedDB 读取现有数据失败:`, getAllRequest.error);
        reject(getAllRequest.error);
      };
      
      transaction.onerror = () => {
        logger.error(`❌ IndexedDB 批量增量更新失败:`, transaction.error);
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
        logger.debug(`✅ IndexedDB 删除成功 (${key})`);
        resolve(true);
      };
      
      transaction.onerror = () => {
        logger.error(`❌ IndexedDB 删除失败 (${key}):`, transaction.error);
        reject(transaction.error);
      };
    });
  }

  async clear() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['images', 'stats', 'settings'], 'readwrite');
      
      transaction.oncomplete = () => {
        logger.debug(' IndexedDB 清空成功');
        resolve(true);
      };
      
      transaction.onerror = () => {
        logger.error(' IndexedDB 清空失败:', transaction.error);
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
    
    // 🆕 根据平台选择存储方式
    if (Platform.OS === 'web') {
      // PC端：使用IndexedDB，失败时降级到localStorage
      logger.debug('💻 PC端: 使用 IndexedDB 存储');
      this.storage = new IndexedDBAdapter();
      this.fallbackStorage = AsyncStorage;
    } else {
      // 移动端：使用SQLite，失败时降级到AsyncStorage
      logger.debug('📱 移动端: 使用 SQLite 存储');
      this.storage = new SQLiteAdapter();
      this.fallbackStorage = AsyncStorage;
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
        // PC端：初始化IndexedDB
        logger.debug('💻 开始初始化 IndexedDB...');
        await this.storage.init();
        logger.debug('✅ IndexedDB 初始化完成');
      } else {
        // 移动端：初始化SQLite
        logger.debug('📱 开始初始化 SQLite...');
        try {
          await this.storage.init();
          logger.debug('✅ SQLite 初始化完成');
        } catch (sqliteError) {
          logger.error('❌ SQLite 初始化失败，降级到 AsyncStorage:', sqliteError);
          // 降级到AsyncStorage
          this.storage = this.fallbackStorage;
        await this.storage.getItem('test');
          logger.debug('✅ AsyncStorage 初始化完成（降级模式）');
        }
      }
      this.isInitialized = true;
      logger.debug('✅ 存储服务初始化成功');
      
      // 初始化客户端唯一ID
      await this.initializeClientId();
    } catch (error) {
      logger.error('❌ 存储初始化失败:', error);
      
      // 如果IndexedDB失败且有降级存储，尝试降级
      if (Platform.OS === 'web' && this.fallbackStorage) {
        try {
          logger.debug(' 降级到localStorage存储');
          this.storage = this.fallbackStorage;
          await this.storage.getItem('test');
          this.isInitialized = true;
          logger.warn('⚠️ 当前使用localStorage存储，检测结果可能不会显示在IndexedDB中');
          return;
        } catch (fallbackError) {
          logger.error(' localStorage降级也失败:', fallbackError);
        }
      }
      
      // 最后尝试：强制清理数据库后重试
      logger.debug(' 尝试强制清理数据库...');
      try {
        // 尝试删除数据库
        const deleteRequest = indexedDB.deleteDatabase(this.dbName);
        deleteRequest.onsuccess = () => {
          logger.debug(' 数据库删除成功，准备重新创建');
        };
        deleteRequest.onerror = () => {
          logger.warn('⚠️ 数据库删除失败，继续尝试');
        };
        
        // 等待删除完成
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 重新创建IndexedDB适配器
        logger.debug(' 重新创建IndexedDB适配器...');
        this.storage = new IndexedDBAdapter();
        logger.debug(' 重试IndexedDB初始化...');
        await this.storage.init();
        logger.debug(' 重试IndexedDB初始化成功');
        this.isInitialized = true;
        logger.debug(' 重试成功，IndexedDB初始化完成');
      } catch (retryError) {
        logger.error(' 重试IndexedDB初始化失败:', retryError);
        logger.debug(' 最终降级到localStorage存储');
        // 最终降级到localStorage
        this.storage = this.fallbackStorage;
        await this.storage.getItem('test');
        this.isInitialized = true;
        logger.warn('⚠️ 当前使用localStorage存储，检测结果可能不会显示在IndexedDB中');
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
        logger.debug('⏳ 等待之前的保存操作完成...');
        await this.saveLock;
      }
      
      // 创建新的保存锁
      this.saveLock = this._performSaveOptimized(imageDataArray);
      const result = await this.saveLock;
      this.saveLock = null;
      
      return result;
      
    } catch (error) {
      logger.error('Batch save failed:', error);
      this.saveLock = null; // 确保锁被释放
      throw error;
    }
  }
  
  // 实际执行保存操作的方法
  async _performSaveOptimized(imageDataArray) {
    // 优化的保存方法：使用真正的批量插入
    if (imageDataArray.length === 0) {
      return { newCount: 0, updatedCount: 0 };
    }

    // 构建批量插入的SQL语句
    const batchSize = 100; // 每批处理100条记录，避免SQL语句过长
    let totalNewCount = 0;
    let totalUpdatedCount = 0;

    for (let i = 0; i < imageDataArray.length; i += batchSize) {
      const batch = imageDataArray.slice(i, i + batchSize);
      const { newCount, updatedCount } = await this._performBatchInsert(batch);
      totalNewCount += newCount;
      totalUpdatedCount += updatedCount;
    }
    
    // 更新统计信息
    await this.updateStats();
    
    return { newCount: totalNewCount, updatedCount: totalUpdatedCount };
  }

  // 执行批量插入的方法
  async _performBatchInsert(imageDataArray) {
    if (imageDataArray.length === 0) {
      return { newCount: 0, updatedCount: 0 };
    }

    // 构建批量SQL语句
    const placeholders = imageDataArray.map(() => 
      '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).join(', ');

    const sql = `
      INSERT OR REPLACE INTO images (
        id, uri, fileName, category, confidence, timestamp, takenAt,
        size, mimeType, width, height, createdAt, updatedAt,
        latitude, longitude, altitude, accuracy,
        address, city, country, province, district, street, locationSource, cityDistance,
        idCardDetections, generalDetections, mobileNetV3Detections, imageDimensions, message
      ) VALUES ${placeholders}
    `;

    // 构建参数数组
    const params = [];
    for (const imageData of imageDataArray) {
      const imageRecord = {
        id: imageData.id || this.storage.generateStableId(imageData.uri),
        uri: imageData.uri,
        category: imageData.category,
        confidence: imageData.confidence,
        timestamp: imageData.timestamp,
        fileName: imageData.fileName,
        size: imageData.size,
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
        idCardDetections: imageData.idCardDetections || null,
        generalDetections: imageData.generalDetections || null,
        mobileNetV3Detections: imageData.mobileNetV3Detections || null,
        imageDimensions: imageData.imageDimensions || null,
        message: imageData.message || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 按SQL字段顺序添加参数
      params.push(
        imageRecord.id,
        imageRecord.uri,
        imageRecord.fileName,
        imageRecord.category,
        imageRecord.confidence,
        imageRecord.timestamp,
        imageRecord.takenAt,
        imageRecord.size,
        imageRecord.mimeType,
        imageRecord.width,
        imageRecord.height,
        imageRecord.createdAt,
        imageRecord.updatedAt,
        imageRecord.latitude,
        imageRecord.longitude,
        imageRecord.altitude,
        imageRecord.accuracy,
        imageRecord.address,
        imageRecord.city,
        imageRecord.country,
        imageRecord.province,
        imageRecord.district,
        imageRecord.street,
        imageRecord.locationSource,
        imageRecord.cityDistance,
        // 修复：将对象转换为JSON字符串
        imageRecord.idCardDetections ? JSON.stringify(imageRecord.idCardDetections) : null,
        imageRecord.generalDetections ? JSON.stringify(imageRecord.generalDetections) : null,
        imageRecord.mobileNetV3Detections ? JSON.stringify(imageRecord.mobileNetV3Detections) : null,
        imageRecord.imageDimensions ? JSON.stringify(imageRecord.imageDimensions) : null,
        imageRecord.message
      );
    }

    // 执行批量插入
    await this.storage.db.executeSql(sql, params);

    // 由于使用了 INSERT OR REPLACE，我们无法准确区分新增和更新
    // 返回一个估算值
    return { newCount: imageDataArray.length, updatedCount: 0 };
  }

  async _performSave(imageDataArray) {
    // 获取现有图片数据
    const existingImages = await this.getImages();
    
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
        message: imageData.message || null,  // 大模型推理描述
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
    
    // 🆕 保存到存储 - 根据平台和数据量选择最优保存策略
    if (this.storage.addOrUpdateSingleImage) {
      // PC端和移动端SQLite：使用单条记录操作（性能最优）
      // 使用existingImages中已构建好的imageRecord
      const imagesToSave = existingImages.filter(img => 
        imageDataArray.some(data => data.uri === img.uri)
      );
      
      for (const imageRecord of imagesToSave) {
        await this.storage.addOrUpdateSingleImage(imageRecord);
      }
    } else {
      // 移动端AsyncStorage（降级模式）：使用批量保存
      await this.storage.setItem(this.storageKeys.images, existingImages);
    }
    
    // 更新统计信息
    await this.updateStats();
    
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
      logger.error('Failed to get full images:', error);
      throw error;
    }
  }

  // 更新图片分类ID（独立接口，只更新分类相关字段）
  async updateImageCategory(imageId, newCategory, newConfidence = 'manual') {
    try {
      await this.ensureInitialized();
      
      logger.debug(`🔄 更新图片分类: ${imageId} -> ${newCategory}`);
      
      // 🆕 移动端：使用SQLite专用方法
      if (Platform.OS !== 'web' && this.storage.updateImageCategory) {
        const updated = await this.storage.updateImageCategory(imageId, newCategory, newConfidence);
        
        if (!updated) {
          throw new Error(`图片不存在: ${imageId}`);
        }
        
        // 更新统计信息
        await this.updateStats();
        
        // 返回更新后的图片（需要重新查询）
        const images = await this._getFullImages();
        const updatedImage = images.find(img => img.id === imageId);
        return updatedImage;
      }
      
      // PC端：使用IndexedDB事务
      if (!this.storage || !this.storage.db) {
        logger.error('❌ IndexedDB未初始化');
        throw new Error('IndexedDB未初始化');
      }
      
      return new Promise((resolve, reject) => {
        const transaction = this.storage.db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        
        // 直接使用id主键查找图片（id是keyPath，不需要索引）
        const getRequest = store.get(imageId);
        
        getRequest.onsuccess = async () => {
          const existingImage = getRequest.result;
          
          if (!existingImage) {
            logger.error(`❌ 未找到图片: ${imageId}`);
            reject(new Error(`图片不存在: ${imageId}`));
            return;
          }
          
          logger.debug(`📋 原始图片有检测结果:`, {
            hasIdCardDetections: !!existingImage.idCardDetections,
            hasGeneralDetections: !!existingImage.generalDetections,
            hasMobileNetV3Detections: !!existingImage.mobileNetV3Detections
          });
          
          // 只更新分类相关字段，保留所有检测结果和其他数据
          const updatedImage = {
            ...existingImage,
            category: newCategory,
            confidence: newConfidence,
            updatedAt: new Date().toISOString()
          };
          
          // 使用put更新记录（基于URI主键）
          const putRequest = store.put(updatedImage);
          
          putRequest.onsuccess = async () => {
            logger.debug(`✅ 图片分类更新成功: ${imageId} -> ${newCategory}`);
            
            // 更新统计信息
            try {
              await this.updateStats();
            } catch (statsError) {
              logger.warn('统计信息更新失败:', statsError);
            }
            
            resolve(updatedImage);
          };
          
          putRequest.onerror = () => {
            logger.error(`❌ IndexedDB put失败:`, putRequest.error);
            reject(putRequest.error);
          };
        };
        
        getRequest.onerror = () => {
          logger.error(`❌ IndexedDB get失败:`, getRequest.error);
          reject(getRequest.error);
        };
        
        transaction.onerror = () => {
          logger.error(`❌ IndexedDB 事务失败:`, transaction.error);
          reject(transaction.error);
        };
      });
      
    } catch (error) {
      logger.error(' 更新图片分类失败:', error);
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
        message: imageData.message || null,  // 大模型推理描述
        // Additional metadata
        createdAt: existingIndex >= 0 ? existingImages[existingIndex].createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      if (existingIndex >= 0) {
        // Update existing record
        existingImages[existingIndex] = imageRecord;
        logger.debug(`Updated existing image record: ${fileName}`);
      } else {
        // Add new record
        existingImages.push(imageRecord);
        logger.debug(`Added new image record: ${fileName}`);
      }
      
      // Save to AsyncStorage
      await this.storage.setItem(this.storageKeys.images, existingImages);
      
      // Update statistics
      await this.updateStats();
      
      logger.debug(`Image classification saved successfully: ${fileName}`);
      return imageRecord;
      
    } catch (error) {
      logger.error('Failed to save image classification:', error);
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
      
      // 转换为精简数据结构 - 只包含界面显示必需字段
      const simplifiedImages = fullImages
        .filter(img => {
          // 🆕 过滤掉无效的图片对象
          if (!img || typeof img !== 'object') {
            logger.warn(`⚠️ 发现无效的图片对象，已过滤:`, img);
            return false;
          }
          return true;
        })
        .map(img => {
          // 调试：检查原始数据中的分类信息
          if (!img.category) {
            logger.warn(`⚠️ 图片 ${img.id} 在数据库中缺少分类信息:`, {
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
      logger.error('Failed to get images:', error);
      return [];
    }
  }

  /**
   * 批量获取图片详细信息（按ID列表）
   * @param {Array<string>} imageIds - 图片ID数组
   * @returns {Promise<Map<string, Object>>} ID到图片对象的映射
   */
  async getImagesByIds(imageIds) {
    try {
      await this.ensureInitialized();
      
      // 一次性读取所有图片
      const allImages = await this.storage.getItem(this.storageKeys.images);
      if (!allImages) {
        return new Map();
      }
      
      // 创建ID集合，提高查找效率
      const idSet = new Set(imageIds);
      
      // 过滤并创建Map
      const resultMap = new Map();
      allImages.forEach(img => {
        if (idSet.has(img.id)) {
          resultMap.set(img.id, img);
        }
      });
      
      logger.debug(`📥 批量查询图片: 请求${imageIds.length}张, 找到${resultMap.size}张`);
      
      return resultMap;
      
    } catch (error) {
      logger.error('批量获取图片失败:', error);
      return new Map();
    }
  }

  // Get image by ID (精简结构)
  async getImageById(imageId) {
    try {
      const allImages = await this.getImages();
      const image = allImages.find(img => img.id === imageId);
      return image || null;
    } catch (error) {
      logger.error('Failed to get image by ID:', error);
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
      // PC端：使用Electron API获取用户目录
      try {
        // 只在Electron环境中运行时动态加载os模块
        if (typeof window !== 'undefined' && window.require) {
          try {
            const os = window.require('os');
            const homeDir = os.homedir();
            return [
              `${homeDir}\\Pictures`,
              `${homeDir}\\Documents`,
              `${homeDir}\\Desktop`,
              `${homeDir}\\Downloads`
            ];
          } catch (requireError) {
            console.warn('Failed to require os module:', requireError);
            return ['C:\\Users\\Public\\Pictures'];
          }
        } else {
          // 如果Electron不可用，使用默认路径
          return ['C:\\Users\\Public\\Pictures'];
        }
      } catch (error) {
        console.warn('Failed to get user home directory:', error);
        return ['C:\\Users\\Public\\Pictures'];
      }
    } else {
      // 移动端：返回默认相册目录，避免全设备扫描
      return [
        '/storage/emulated/0/DCIM/Camera',
        '/storage/emulated/0/DCIM/Screenshots',
        '/storage/emulated/0/Pictures'
      ];
    }
  }

  /**
   * 生成UUID（通用唯一标识符）
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 初始化客户端唯一ID
   * 如果不存在则生成新ID，存在则不做任何操作
   */
  async initializeClientId() {
    try {
      const settings = await this.getSettings();
      
      // 如果没有客户端ID，生成一个新的
      if (!settings.clientId) {
        const clientId = this.generateUUID();
        settings.clientId = clientId;
        settings.clientIdCreatedAt = new Date().toISOString();
        
        await this.saveSettings(settings);
        
        logger.debug('🆔 客户端ID已生成:', clientId);
        logger.debug('🆔 新客户端ID:', clientId);
      } else {
        logger.debug('🆔 客户端ID已存在:', settings.clientId);
      }
      
      return settings.clientId;
    } catch (error) {
      logger.error('初始化客户端ID失败:', error);
      throw error;
    }
  }

  /**
   * 获取客户端唯一ID
   */
  async getClientId() {
    try {
      const settings = await this.getSettings();
      return settings.clientId || null;
    } catch (error) {
      logger.error('获取客户端ID失败:', error);
      return null;
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
        // 如果用户明确设置了空数组，保持空数组（移动端扫描整个设备）
        if (result.scanPaths && result.scanPaths.length === 0 && Platform.OS !== 'web') {
          // 移动端空数组是有效的，表示扫描整个设备
          result.scanPaths = [];
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
      
      // 根据平台进行不同的验证
      if (Platform.OS === 'web') {
        // PC端：必须至少有一个目录
        if (settings.scanPaths && settings.scanPaths.length === 0) {
          throw new Error('PC端必须至少设置一个扫描目录。');
        }
      } else {
        // 移动端：允许空数组，表示扫描整个设备（使用MediaStore）
        // 空数组是有效的，表示使用MediaStore扫描整个设备
      }
      
      await this.storage.setItem(this.storageKeys.settings, settings);
      
      logger.debug('Settings saved:', settings);
      
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
      // 清空相似度数据
      await this.storage.removeItem(this.storageKeys.similarityData);
      await this.storage.removeItem(this.storageKeys.similarityGroupIndex);
      logger.debug(' IndexedDB 数据已清空');
      
      // 同时清空 localStorage（防止数据重新迁移）
      if (Platform.OS === 'web' && this.fallbackStorage) {
        await this.fallbackStorage.removeItem('classified_images');
        await this.fallbackStorage.removeItem('image_stats');
        await this.fallbackStorage.removeItem('app_settings');
        logger.debug(' localStorage 数据已清空');
      }
      
      logger.debug(' 所有存储数据已清空（包括相似度数据）');
    } catch (error) {
      console.error('Failed to clear all images:', error);
      throw error;
    }
  }

  // Delete image
  async deleteImage(imageId) {
    try {
      await this.ensureInitialized();
      
      logger.debug(`🗑️ 删除图片: ${imageId}`);
      
      //移动端：使用SQLite专用方法
      if (Platform.OS !== 'web' && this.storage.deleteImageById) {
        const result = await this.storage.deleteImageById(imageId);
        
        if (!result.success) {
          throw new Error(result.message);
        }
        
        // 删除物理文件
        if (result.image && result.image.uri && result.image.uri.startsWith('file://')) {
          try {
            const filePath = result.image.uri.replace('file://', '');
            const exists = await RNFS.exists(filePath);
            if (exists) {
              await RNFS.unlink(filePath);
              logger.debug(`🗑️ 物理文件已删除: ${filePath}`);
            }
          } catch (fileError) {
            logger.warn('删除物理文件失败:', fileError);
          }
        }
        
        // 更新统计信息
        await this.updateStats();
        
        return { success: true, message: 'Image deleted successfully' };
      }
      
      // PC端：使用IndexedDB事务
      if (!this.storage || !this.storage.db) {
        logger.error('❌ IndexedDB未初始化');
        throw new Error('IndexedDB未初始化');
      }
      
      // 先删除数据库记录
      const result = await new Promise((resolve, reject) => {
        const transaction = this.storage.db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        
        // 直接使用id主键查找图片（id是keyPath，不需要索引）
        const getRequest = store.get(imageId);
        
        getRequest.onsuccess = () => {
          const existingImage = getRequest.result;
          
          if (!existingImage) {
            logger.error(`❌ 未找到图片: ${imageId}`);
            reject(new Error(`图片不存在: ${imageId}`));
            return;
          }
          
          logger.debug(`🗑️ 找到要删除的图片: ${existingImage.fileName}`);
          
          // 使用delete删除记录（基于id主键）
          const deleteRequest = store.delete(imageId);
          
          deleteRequest.onsuccess = () => {
            logger.debug(`✅ 图片删除成功: ${existingImage.fileName}`);
            resolve({
              success: true,
              message: 'Image deleted successfully',
              image: existingImage
            });
          };
          
          deleteRequest.onerror = () => {
            logger.error(`❌ 图片删除失败: ${deleteRequest.error}`);
            reject(deleteRequest.error);
          };
        };
        
        getRequest.onerror = () => {
          logger.error(`❌ 查找图片失败: ${getRequest.error}`);
          reject(getRequest.error);
        };
      });
      
      // 删除物理文件（在事务完成后）
      try {
        if (result.image && result.image.uri && result.image.uri.startsWith('file://')) {
          const filePath = result.image.uri.replace('file://', '');
          const exists = await RNFS.exists(filePath);
          if (exists) {
            await RNFS.unlink(filePath);
            logger.debug(`🗑️ 物理文件已删除: ${filePath}`);
          }
        }
      } catch (fileError) {
        console.warn('Failed to delete physical file:', fileError);
      }
      
      // 更新统计信息（在事务完成后）
      await this.updateStats();
      
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
      
      logger.debug(`Deleting ${imageIds.length} images...`);
      
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
          logger.debug(`Deleted image ${i + 1}/${imageIds.length}: ${imageIds[i]}`);
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
      
      logger.debug(`Batch delete completed: ${filesDeleted} deleted, ${filesFailed} failed`);
      return { success: true, filesDeleted, filesFailed };
      
    } catch (error) {
      console.error('Failed to delete images:', error);
      throw error;
    }
  }

  // Delete image with progress callback and result
  async deleteImageWithResult(imageId, onProgress) {
    try {
      logger.debug('🗑️ deleteImageWithResult 开始执行，图片ID:', imageId);
      await this.ensureInitialized();
      
      // 初始化进度
      if (onProgress) {
        onProgress({
          filesDeleted: 0,
          filesFailed: 0,
          total: 1
        });
      }
      
      // 🆕 移动端：使用SQLite专用方法
      if (Platform.OS !== 'web' && this.storage.deleteImageById) {
        const result = await this.storage.deleteImageById(imageId);
        
        if (!result.success) {
          return result;
        }
        
        // 删除物理文件
        let fileDeleted = false;
        if (result.image && result.image.uri && result.image.uri.startsWith('file://')) {
          try {
            const filePath = result.image.uri.replace('file://', '');
            const exists = await RNFS.exists(filePath);
            if (exists) {
              await RNFS.unlink(filePath);
              logger.debug(`🗑️ 物理文件已删除: ${filePath}`);
              fileDeleted = true;
            }
          } catch (fileError) {
            logger.warn('删除物理文件失败:', fileError);
          }
        }
        
        // 更新统计信息
        await this.updateStats();
        
        // 更新最终进度
        if (onProgress) {
          onProgress({
            filesDeleted: fileDeleted ? 1 : 0,
            filesFailed: fileDeleted ? 0 : 1,
            total: 1
          });
        }
        
        return { success: true, message: 'Image deleted successfully' };
      }
      
      // PC端：使用IndexedDB事务
      if (!this.storage || !this.storage.db) {
        logger.error('❌ IndexedDB未初始化');
        return {
          success: false,
          message: 'IndexedDB未初始化'
        };
      }
      
      // 先删除数据库记录
      const result = await new Promise((resolve, reject) => {
        const transaction = this.storage.db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        
        // 直接使用id主键查找图片（id是keyPath，不需要索引）
        const getRequest = store.get(imageId);
        
        getRequest.onsuccess = () => {
          const existingImage = getRequest.result;
          
          if (!existingImage) {
            logger.debug('🗑️ 图片未找到');
            resolve({
              success: false,
              message: 'Image not found'
            });
            return;
          }
          
          logger.debug(`🗑️ 找到要删除的图片: ${existingImage.fileName}`);
          
          // 使用delete删除记录（基于id主键）
          const deleteRequest = store.delete(imageId);
          
          deleteRequest.onsuccess = () => {
            logger.debug(`✅ 图片删除成功: ${existingImage.fileName}`);
            resolve({
              success: true,
              message: 'Image deleted successfully',
              image: existingImage
            });
          };
          
          deleteRequest.onerror = () => {
            logger.error(`❌ 图片删除失败: ${deleteRequest.error}`);
            resolve({
              success: false,
              message: `Failed to delete image: ${deleteRequest.error.message}`
            });
          };
        };
        
        getRequest.onerror = () => {
          logger.error(`❌ 查找图片失败: ${getRequest.error}`);
          resolve({
            success: false,
            message: `Failed to find image: ${getRequest.error.message}`
          });
        };
      });
      
      if (!result.success) {
        return result;
      }
      
      // 删除物理文件（在事务完成后）
      let fileDeleted = false;
      try {
        if (result.image && result.image.uri && result.image.uri.startsWith('file://')) {
          const filePath = result.image.uri.replace('file://', '');
          const exists = await RNFS.exists(filePath);
          if (exists) {
            await RNFS.unlink(filePath);
            logger.debug(`🗑️ 物理文件已删除: ${filePath}`);
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
      
      // 更新统计信息（在事务完成后）
      await this.updateStats();
      
      // 更新最终进度
      if (onProgress) {
        onProgress({
          filesDeleted: fileDeleted ? 1 : 0,
          filesFailed: fileDeleted ? 0 : 1,
          total: 1
        });
      }
      
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
      
      logger.debug('Clearing all image data...');
      
      // Clear images
      await this.storage.removeItem(this.storageKeys.images);
      
      // Clear statistics
      await this.storage.removeItem(this.storageKeys.stats);
      
      // Clear settings
      await this.storage.removeItem(this.storageKeys.settings);
      
      logger.debug('All data cleared successfully');
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
      
      logger.debug(`Exported ${images.length} images and statistics`);
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
      
      logger.debug(`Importing ${importData.images.length} images...`);
      
      // Save images
      await this.storage.setItem(this.storageKeys.images, importData.images);
      
      // Save statistics if available
      if (importData.stats) {
        await this.storage.setItem(this.storageKeys.stats, importData.stats);
      } else {
        // Update statistics
        await this.updateStats();
      }
      
      logger.debug('Data imported successfully');
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
      
      logger.debug(`Found ${filteredImages.length} images matching: ${query}`);
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
      
      logger.debug(`Found ${filteredImages.length} images in date range: ${startDate} to ${endDate}`);
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
      
      logger.debug(`Found ${sortedImages.length} images in location: ${city || 'any'}, ${country || 'any'}`);
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
      
      logger.debug(`Found ${duplicates.length} duplicate image pairs`);
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
      
      logger.debug(`Storage usage calculated: ${usage.totalImages} images, ${(usage.totalSize / 1024 / 1024).toFixed(2)} MB`);
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
        logger.debug('No images to remove');
        return { success: true, removedCount: 0 };
      }
      
      logger.debug(`Starting to remove ${urisToRemove.length} images by URIs...`);
      
      // 🆕 移动端：使用SQLite专用方法
      if (Platform.OS !== 'web' && this.storage.deleteImagesByUris) {
        const result = await this.storage.deleteImagesByUris(urisToRemove);
        
        // 更新统计信息
        await this.updateStats();
        
        logger.debug(`Successfully removed ${result.removedCount} images, ${result.failedCount} failed`);
        
        return {
          success: true,
          removedCount: result.removedCount,
          failedCount: result.failedCount,
          totalRequested: urisToRemove.length
        };
      }
      
      // PC端：使用IndexedDB事务
      if (!this.storage || !this.storage.db) {
        logger.error('❌ IndexedDB未初始化');
        throw new Error('IndexedDB未初始化');
      }
      
      const allImages = await this.getImages();
      const urisSet = new Set(urisToRemove);
      const imagesToRemove = allImages.filter(img => urisSet.has(img.uri));
      
      logger.debug(`Found ${imagesToRemove.length} images to remove out of ${allImages.length} total`);
      
      // 在一个事务中批量删除图片记录
      const result = await new Promise((resolve, reject) => {
        const transaction = this.storage.db.transaction(['images'], 'readwrite');
        const store = transaction.objectStore('images');
        
        let removedCount = 0;
        let failedCount = 0;
        let completedCount = 0;
        
        // 批量发起删除请求
        imagesToRemove.forEach((image) => {
          const deleteRequest = store.delete(image.id);
          
          deleteRequest.onsuccess = () => {
            logger.debug(`✅ 图片记录已删除: ${image.fileName}`);
            removedCount++;
            completedCount++;
            
            // 所有删除操作完成后 resolve
            if (completedCount === imagesToRemove.length) {
              resolve({ removedCount, failedCount });
            }
          };
          
          deleteRequest.onerror = () => {
            logger.error(`❌ 图片记录删除失败: ${deleteRequest.error}`);
            failedCount++;
            completedCount++;
            
            // 所有删除操作完成后 resolve
            if (completedCount === imagesToRemove.length) {
              resolve({ removedCount, failedCount });
            }
          };
        });
        
        // 如果没有要删除的图片
        if (imagesToRemove.length === 0) {
          resolve({ removedCount: 0, failedCount: 0 });
        }
        
        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
      
      // 更新统计信息（在事务完成后）
      await this.updateStats();
      
      logger.debug(`Successfully removed ${result.removedCount} images, ${result.failedCount} failed`);
      
      return { 
        success: true, 
        removedCount: result.removedCount,
        failedCount: result.failedCount,
        totalRequested: urisToRemove.length
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
    logger.debug(`🔍 getGroupedImages 被调用，当前图片数量: ${images.length}`);
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
      logger.debug(' 分类规则（带优先级）保存成功');
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
      logger.debug(' 分类规则已重置为默认值');
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
      logger.debug(`✅ 分类规则更新成功: ${objectClass} -> ${newCategory}`);
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
      logger.debug(`✅ 新增分类规则: ${objectClass} -> ${category}`);
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
      logger.debug(`✅ 删除分类规则: ${objectClass}`);
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
      logger.error(' 获取相似组索引失败:', error);
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
      logger.debug(`✅ 保存相似组索引成功，共${Object.keys(groupIndex).length}个组`);
      return true;
    } catch (error) {
      logger.error(' 保存相似组索引失败:', error);
      throw error;
    }
  }

  /**
   * 从相似组中移除图片
   * @param {string} imageId - 图片ID
   * @returns {Promise<boolean>} 是否移除成功
   */
  async removeImageFromSimilarityGroup(imageId) {
    try {
      const similarityData = await this.getSimilarityData();
      const groupIndex = await this.getSimilarityGroupIndex();
      
      // 从相似度数据中获取图片的组ID
      const imageData = similarityData[imageId];
      if (!imageData || !imageData.similarity_group_id) {
        logger.debug(`⚠️ 图片 ${imageId} 没有相似组信息`);
        return true;
      }
      
      const groupId = imageData.similarity_group_id;
      
      if (groupIndex[groupId]) {
        // 先检查删除后还剩多少张图片
        const remainingCount = groupIndex[groupId].length - 1;
        let remainingImageId = null;
        
        // 如果删除后只剩1张图片，获取剩余图片ID
        if (remainingCount === 1) {
          remainingImageId = groupIndex[groupId].find(id => id !== imageId);
          if (remainingImageId && similarityData[remainingImageId]) {
            delete similarityData[remainingImageId];
            logger.debug(`🗑️ 清除剩余图片的相似组数据: ${remainingImageId}`);
          }
        }
        
        // 删除目标图片的相似组数据
        if (similarityData[imageId]) {
          delete similarityData[imageId];
          logger.debug(`🗑️ 清除目标图片的相似组数据: ${imageId}`);
        }
        
        // 删除目标图片
        groupIndex[groupId] = groupIndex[groupId].filter(id => id !== imageId);
        
        // 如果删除后只剩1张图片，也要从组中移除剩余图片
        if (remainingCount === 1 && remainingImageId) {
          groupIndex[groupId] = groupIndex[groupId].filter(id => id !== remainingImageId);
        }
        
        // 如果组为空，删除该组
        if (groupIndex[groupId].length === 0) {
          delete groupIndex[groupId];
        }
      }
      
      // 保存更新后的数据
      await this.saveSimilarityGroupIndex(groupIndex);
      await this.saveSimilarityData(similarityData);
      logger.debug(`✅ 从相似组移除图片: ${imageId} 从 ${groupId}`);
      return true;
    } catch (error) {
      logger.error(' 从相似组移除图片失败:', error);
      throw error;
    }
  }

  /**
   * 添加图片到相似组
   * @param {string} imageId - 图片ID
   * @param {string} groupId - 组ID
   * @param {Object} similarityInfo - 相似度信息
   * @returns {Promise<boolean>} 是否添加成功
   */
  async addImageToSimilarityGroup(imageId, groupId, similarityInfo = {}) {
    try {
      // 先清理图片的现有相似度信息
      await this.removeImageFromSimilarityGroup(imageId);
      
      const groupIndex = await this.getSimilarityGroupIndex();
      const similarityData = await this.getSimilarityData();
      
      if (groupId) {
        // 更新相似组索引
        if (!groupIndex[groupId]) {
          groupIndex[groupId] = [];
        }
        if (!groupIndex[groupId].includes(imageId)) {
          groupIndex[groupId].push(imageId);
        }
        
        // 更新相似度数据，包含完整的相似度信息
        similarityData[imageId] = {
          ...similarityData[imageId],
          ...similarityInfo,
          similarity_group_id: groupId,
          updatedAt: new Date().toISOString()
        };
      }
      
      await this.saveSimilarityGroupIndex(groupIndex);
      await this.saveSimilarityData(similarityData);
      logger.debug(`✅ 添加图片到相似组: ${imageId} 到 ${groupId}`);
      return true;
    } catch (error) {
      logger.error(' 添加图片到相似组失败:', error);
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
      logger.debug(`✅ 重建相似组索引成功，共${Object.keys(groupIndex).length}个组`);
      return true;
    } catch (error) {
      logger.error(' 重建相似组索引失败:', error);
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
      logger.error(' 获取相似度数据失败:', error);
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
      logger.debug(`✅ 保存相似度数据成功，共${Object.keys(similarityData).length}条记录`);
      return true;
    } catch (error) {
      logger.error(' 保存相似度数据失败:', error);
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
      if (oldGroupId && oldGroupId !== newGroupId) {
        await this.removeImageFromSimilarityGroup(imageId);
      }
      if (newGroupId && newGroupId !== oldGroupId) {
        await this.addImageToSimilarityGroup(imageId, newGroupId, similarityInfo);
      }
      
      logger.debug(`✅ 更新图片相似度数据: ${imageId}`);
      return true;
    } catch (error) {
      logger.error(' 更新图片相似度数据失败:', error);
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
      
      logger.debug(`✅ 批量更新图片相似度数据: ${imageSimilarityArray.length}张图片`);
      logger.debug(`✅ 更新相似组索引: ${Object.keys(groupIndex).length}个组`);
      return true;
    } catch (error) {
      logger.error(' 批量更新图片相似度数据失败:', error);
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
      logger.error(' 获取图片相似度数据失败:', error);
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
      logger.error(' 获取相似度统计信息失败:', error);
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
        
        // 验证组中所有图片的数据是否都存在
        const validImageIds = imageIds.filter(imageId => similarityData[imageId]);
        if (validImageIds.length === 0) {
          logger.debug(`⚠️ 相似组 ${groupId} 没有有效数据，跳过`);
          return;
        }
        
        // 如果有效图片数量少于原始数量，说明有数据不一致
        if (validImageIds.length !== imageIds.length) {
          logger.debug(`⚠️ 相似组 ${groupId} 数据不一致，有效图片: ${validImageIds.length}/${imageIds.length}`);
        }
        
        // 获取组中第一张有效图片的数据来确定组类型
        const firstImageId = validImageIds[0];
        const firstImageData = similarityData[firstImageId];
        
        if (!firstImageData) return;
        
        groups[groupId] = {
          id: groupId,
          type: firstImageData.similarity_group_type || 'similar',
          images: [],
          confidence: 0,
          created_at: firstImageData.updatedAt
        };
        
        // 添加组中所有有效图片
        validImageIds.forEach(imageId => {
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
      logger.error(' 获取相似图片组失败:', error);
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
      logger.error(' 获取相似组信息失败:', error);
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
      logger.error(' 获取相似图片失败:', error);
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
        logger.debug(' 清除所有相似度数据成功');
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
                  logger.debug(`✅ 清除单图片组，移除图片 ${remainingImageId} 的相似组信息`);
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
        logger.debug(`✅ 清除${imageIds.length}张图片的相似度数据成功`);
      }
      return true;
    } catch (error) {
      logger.error(' 清除相似度检测数据失败:', error);
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
        logger.debug(`⚠️ 未找到相似组: ${groupId}`);
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
      
      logger.debug(`✅ 删除相似组${groupId}，影响${groupImageIds.length}张图片`);
      return true;
      
    } catch (error) {
      logger.error(' 删除相似组失败:', error);
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
      logger.error(' 获取时间窗口图片失败:', error);
      return [];
    }
  }

}

export default ImageStorageService;