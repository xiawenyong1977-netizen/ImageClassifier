// 位置数据库服务 - 跨平台实现
// 使用独立的数据库存储位置信息，与相册数据库分离
import { logger, Platform, SQLite } from '../adapters/WebAdapters';

/**
 * 生成位置ID（基于 country_code + admin1_en + admin2_en）
 * 三级行政区：国家、一级行政区（省/直辖市/州）、二级行政区（市/区/县）
 * @param {Object} cityData - 城市数据对象，需含 admin1_en、admin2_en
 * @returns {string} location_id，格式如 CN_guangdong_shenzhen、CN_beijing_dongcheng
 * @throws {Error} 如果必填字段缺失
 */
export function generateLocationId(cityData) {
  // 1. 验证 country_code
  if (!cityData.country_code || typeof cityData.country_code !== 'string' || cityData.country_code.trim() === '') {
    logger.error('❌ 生成location_id失败：country_code字段为空或无效', { cityData });
    throw new Error(`无法生成location_id：country_code字段为空。城市数据：${JSON.stringify(cityData)}`);
  }

  const countryCode = cityData.country_code.trim().toUpperCase();

  // 2. 获取 admin1_en（一级行政区英文名）
  const admin1En = (cityData.admin1_en && typeof cityData.admin1_en === 'string' && cityData.admin1_en.trim() !== '')
    ? normalizeString(cityData.admin1_en.trim())
    : 'unknown';

  // 3. 获取 admin2_en（二级行政区英文名）
  if (!cityData.admin2_en || typeof cityData.admin2_en !== 'string' || cityData.admin2_en.trim() === '') {
    logger.error('❌ 生成location_id失败：admin2_en 为空', { cityData });
    throw new Error(`无法生成location_id：缺少 admin2_en。城市数据：${JSON.stringify(cityData)}`);
  }
  const admin2En = normalizeString(cityData.admin2_en.trim());

  const locationId = `${countryCode}_${admin1En}_${admin2En}`;

  if (!locationId || locationId.length === 0) {
    logger.error('❌ 生成location_id失败：最终生成的ID为空', { countryCode, admin1En, admin2En, cityData });
    throw new Error(`无法生成location_id：最终生成的ID为空`);
  }

  return locationId;
}

/**
 * 标准化字符串：用于生成 location_id，保留原始名称不去除行政区划后缀
 * @param {string} str - 原始字符串
 * @returns {string} 标准化后的字符串
 */
function normalizeString(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }
  return str.trim().toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * 将 API 返回的城市数据映射为 location_details 表结构
 * API 需返回 admin1_zh/en、admin2_zh/en
 */
function mapApiDataToLocationDetail(apiData) {
  const admin1Zh = apiData.admin1_zh && String(apiData.admin1_zh).trim() ? String(apiData.admin1_zh).trim() : null;
  const admin1En = apiData.admin1_en && String(apiData.admin1_en).trim() ? String(apiData.admin1_en).trim() : 'unknown';
  const admin2Zh = apiData.admin2_zh && String(apiData.admin2_zh).trim() ? String(apiData.admin2_zh).trim() : null;
  const admin2En = apiData.admin2_en && String(apiData.admin2_en).trim() ? String(apiData.admin2_en).trim() : 'unknown';

  return {
    country_code: (apiData.country_code || 'UN').trim().toUpperCase(),
    admin1_zh: admin1Zh,
    admin1_en: admin1En,
    admin2_zh: admin2Zh,
    admin2_en: admin2En,
    latitude: Number(apiData.latitude),
    longitude: Number(apiData.longitude),
    data_source: apiData.data_source || 'unknown'
  };
}

/**
 * 标准化坐标精度（保留4位小数）
 * @param {number} coord - 坐标值
 * @returns {number} 标准化后的坐标
 */
function normalizeCoordinate(coord) {
  return Math.round(coord * 10000) / 10000;
}

// SQLite 适配器类（移动端）
class LocationSQLiteAdapter {
  constructor() {
    this.dbName = 'Location.db';
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    // 如果已经初始化，直接返回
    if (this.isInitialized && this.db) {
      return this.db;
    }

    logger.debug('📱 开始初始化位置数据库 SQLite...');
    
    // 打开数据库
    this.db = SQLite.openDatabase(this.dbName, '1.0', 'Location DB', 200000);
    
    // 为数据库对象添加executeSql方法（兼容性处理）
    if (!this.db.executeSql) {
      this.db.executeSql = (sql, params = []) => {
        return new Promise((resolve, reject) => {
          this.db.transaction((tx) => {
            tx.executeSql(sql, params, (tx, result) => {
              resolve([result]);
            }, (tx, error) => {
              reject(error);
            });
          });
        });
      };
    }
    
    // 创建表结构
    await this.createTables();
    
    this.isInitialized = true;
    logger.debug('✅ 位置数据库 SQLite 初始化成功');
    
    return this.db;
  }

  async createTables() {
    // 迁移：检测旧 schema（有 name_en 列）则删除并重建
    try {
      const [tableInfo] = await this.db.executeSql(
        "SELECT name FROM pragma_table_info('location_details') WHERE name='name_en'"
      );
      const hasOldSchema = tableInfo?.rows?.length > 0;
      if (hasOldSchema) {
        await this.db.executeSql('DROP TABLE IF EXISTS location_details');
        await this.db.executeSql('DROP TABLE IF EXISTS location_coordinates');
        logger.debug('📦 位置数据库已迁移至新 schema（三级行政区）');
      }
    } catch (e) {
      // 表不存在时 pragma 可能报错，忽略
    }

    const createTablesSql = `
      -- 坐标映射表：坐标 -> location_id
      CREATE TABLE IF NOT EXISTS location_coordinates (
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        location_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (latitude, longitude)
      );
      CREATE INDEX IF NOT EXISTS idx_location_coordinates_location_id ON location_coordinates(location_id);

      -- 位置详情表：三级行政区（国家、一级、二级）
      CREATE TABLE IF NOT EXISTS location_details (
        location_id TEXT PRIMARY KEY,
        country_code TEXT NOT NULL,
        admin1_zh TEXT,
        admin1_en TEXT NOT NULL,
        admin2_zh TEXT,
        admin2_en TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        data_source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_location_details_admin2_en ON location_details(admin2_en);
    `;

    const statements = createTablesSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    for (const sql of statements) {
      await this.db.executeSql(sql);
    }

    logger.debug('✅ 位置数据库 SQLite 表结构创建完成');
  }

  /**
   * 获取所有位置详情（用于初始化缓存）
   * @returns {Promise<Array<Object>>} 所有位置详情数组
   */
  async getAllLocationDetails() {
    await this.init();
    
    try {
      const [result] = await this.db.executeSql('SELECT * FROM location_details');
      
      if (!result || !result.rows) {
        return [];
      }
      
      const details = [];
      for (let i = 0; i < result.rows.length; i++) {
        details.push(this.rowToObject(result.rows.item(i)));
      }
      
      return details;
    } catch (error) {
      logger.error('获取所有位置详情失败（SQLite）:', error);
      throw error;
    }
  }

  /**
   * 获取坐标映射（坐标 -> location_id）
   * @param {Array<{latitude: number, longitude: number}>} coordinates - 坐标数组
   * @returns {Promise<Map<string, string>>} 坐标键到location_id的映射
   */
  async getCoordinateMappings(coordinates) {
    await this.init();
    
    if (!coordinates || coordinates.length === 0) {
      return new Map();
    }
    
    const normalizedCoords = coordinates.map(c => ({
      lat: normalizeCoordinate(c.latitude),
      lng: normalizeCoordinate(c.longitude),
      original: c
    }));
    
    // SQLite不支持多列IN查询，使用OR条件代替
    const conditions = normalizedCoords.map(() => '(latitude = ? AND longitude = ?)').join(' OR ');
    const values = normalizedCoords.flatMap(c => [c.lat, c.lng]);
    
    try {
      const [result] = await this.db.executeSql(
        `SELECT latitude, longitude, location_id FROM location_coordinates 
         WHERE ${conditions}`,
        values
      );
      
      const mappings = new Map();
      if (result && result.rows) {
        for (let i = 0; i < result.rows.length; i++) {
          const row = result.rows.item(i);
          const key = `${row.latitude}_${row.longitude}`;
          mappings.set(key, row.location_id);
        }
      }
      
      return mappings;
    } catch (error) {
      logger.error('获取坐标映射失败（SQLite）:', error);
      throw error;
    }
  }

  /**
   * 获取单个位置详情
   * @param {string} locationId - 位置ID
   * @returns {Promise<Object|null>} 位置详情或null
   */
  async getLocationDetail(locationId) {
    await this.init();
    
    try {
      const [result] = await this.db.executeSql(
        'SELECT * FROM location_details WHERE location_id = ?',
        [locationId]
      );
      
      if (result && result.rows && result.rows.length > 0) {
        return this.rowToObject(result.rows.item(0));
      }
      
      return null;
    } catch (error) {
      logger.error('获取位置详情失败（SQLite）:', error);
      throw error;
    }
  }

  /**
   * 批量查询位置信息
   * @param {Array<{latitude: number, longitude: number}>} coordinates - 坐标数组
   * @returns {Promise<Map<string, Object>>} 坐标到位置详情的映射
   */
  async getLocationsBatch(coordinates) {
    await this.init();
    
    if (!coordinates || coordinates.length === 0) {
      return new Map();
    }
    
    // 标准化坐标并构建查询
    const normalizedCoords = coordinates.map(c => ({
      lat: normalizeCoordinate(c.latitude),
      lng: normalizeCoordinate(c.longitude),
      original: c
    }));
    
    // SQLite不支持多列IN查询，使用OR条件代替
    const conditions = normalizedCoords.map(() => '(latitude = ? AND longitude = ?)').join(' OR ');
    const values = normalizedCoords.flatMap(c => [c.lat, c.lng]);
    
    try {
      // 1. 查询坐标映射表
      const [mappingResult] = await this.db.executeSql(
        `SELECT latitude, longitude, location_id FROM location_coordinates 
         WHERE ${conditions}`,
        values
      );
      
      if (!mappingResult || !mappingResult.rows || mappingResult.rows.length === 0) {
        return new Map();
      }
      
      // 2. 收集所有唯一的location_id
      const locationIds = [];
      const coordToLocationId = new Map();
      
      for (let i = 0; i < mappingResult.rows.length; i++) {
        const row = mappingResult.rows.item(i);
        const key = `${row.latitude}_${row.longitude}`;
        coordToLocationId.set(key, row.location_id);
        if (!locationIds.includes(row.location_id)) {
          locationIds.push(row.location_id);
        }
      }
      
      if (locationIds.length === 0) {
        return new Map();
      }
      
      // 3. 批量查询位置详情
      const detailPlaceholders = locationIds.map(() => '?').join(', ');
      const [detailResult] = await this.db.executeSql(
        `SELECT * FROM location_details WHERE location_id IN (${detailPlaceholders})`,
        locationIds
      );
      
      // 4. 构建位置详情映射
      const locationDetailsMap = new Map();
      if (detailResult && detailResult.rows) {
        for (let i = 0; i < detailResult.rows.length; i++) {
          const row = detailResult.rows.item(i);
          locationDetailsMap.set(row.location_id, this.rowToObject(row));
        }
      }
      
      // 5. 合并结果：坐标 -> 位置详情
      const results = new Map();
      for (const coord of normalizedCoords) {
        const key = `${coord.lat}_${coord.lng}`;
        const locationId = coordToLocationId.get(key);
        if (locationId && locationDetailsMap.has(locationId)) {
          results.set(key, locationDetailsMap.get(locationId));
        } else {
          // 调试日志：记录未找到的位置
          logger.debug(`⚠️ 位置查询未匹配: coord=[${coord.original.latitude}, ${coord.original.longitude}], normalized=[${coord.lat}, ${coord.lng}], key=${key}, hasLocationId=${!!locationId}, hasDetails=${locationId ? locationDetailsMap.has(locationId) : false}`);
        }
      }
      
      return results;
      
    } catch (error) {
      logger.error('批量查询位置信息失败（SQLite）:', error);
      throw error;
    }
  }

  /**
   * 批量保存位置信息
   * @param {Array<Object>} locations - 位置信息数组
   * @returns {Promise<Array<Object>>} 保存的位置详情数组
   */
  async saveLocationsBatch(locations) {
    await this.init();
    
    if (!locations || locations.length === 0) {
      return [];
    }
    
    try {
      // 为每个位置生成location_id
      const locationsWithId = [];
      const errors = [];
      
      for (const location of locations) {
        try {
          const locationId = generateLocationId(location);
          locationsWithId.push({
            ...location,
            locationId
          });
        } catch (error) {
          errors.push({
            location,
            error: error.message
          });
          logger.error('生成location_id失败:', error);
        }
      }
      
      if (locationsWithId.length === 0) {
        logger.warn('没有有效的位置数据需要保存');
        return [];
      }
      
      const savedDetails = [];
      
      // 使用事务批量保存
      await new Promise((resolve, reject) => {
        this.db.transaction((tx) => {
          let completed = 0;
          let hasError = false;
          const total = locationsWithId.length; // 只保存位置详情表
          
          // 保存位置详情（INSERT OR REPLACE）
          for (const location of locationsWithId) {
            const now = new Date().toISOString();
            const detail = mapApiDataToLocationDetail(location);
            tx.executeSql(
              `INSERT OR REPLACE INTO location_details (
                location_id, country_code, admin1_zh, admin1_en, admin2_zh, admin2_en,
                latitude, longitude, data_source, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 
                COALESCE((SELECT created_at FROM location_details WHERE location_id = ?), ?), ?)`,
              [
                location.locationId,
                detail.country_code,
                detail.admin1_zh,
                detail.admin1_en,
                detail.admin2_zh,
                detail.admin2_en,
                detail.latitude,
                detail.longitude,
                detail.data_source,
                location.locationId,
                now,
                now
              ],
              (tx, result) => {
                completed++;
                if (completed === total && !hasError) {
                  resolve();
                }
              },
              (tx, error) => {
                if (!hasError) {
                  hasError = true;
                  reject(error);
                }
              }
            );
          }
        }, (error) => {
          if (error) {
            reject(error);
          }
        });
      });
      
      // 查询保存后的位置详情（用于返回）
      // 确保返回顺序与输入顺序一致
      const savedLocationIds = locationsWithId.map(l => l.locationId);
      if (savedLocationIds.length > 0) {
        const placeholders = savedLocationIds.map(() => '?').join(', ');
        const [detailResult] = await this.db.executeSql(
          `SELECT * FROM location_details WHERE location_id IN (${placeholders})`,
          savedLocationIds
        );
        
        // 构建 location_id 到详情的映射
        const detailMap = new Map();
        if (detailResult && detailResult.rows) {
          for (let i = 0; i < detailResult.rows.length; i++) {
            const detail = this.rowToObject(detailResult.rows.item(i));
            detailMap.set(detail.location_id, detail);
          }
        }
        
        // 按照输入顺序返回
        for (const location of locationsWithId) {
          const detail = detailMap.get(location.locationId);
          if (detail) {
            savedDetails.push(detail);
          }
        }
      }
      
      logger.debug(`✅ 批量保存位置信息成功：${locationsWithId.length}个位置`);
      
      if (errors.length > 0) {
        logger.warn(`⚠️ 部分位置数据保存失败：${errors.length}个`);
      }
      
      return savedDetails;
      
    } catch (error) {
      logger.error('批量保存位置信息失败（SQLite）:', error);
      throw error;
    }
  }

  /**
   * 批量保存坐标映射（查询坐标 -> location_id）
   * @param {Array<{latitude: number, longitude: number, location_id: string}>} mappings - 坐标映射数组
   */
  async saveCoordinateMappings(mappings) {
    await this.init();
    
    if (!mappings || mappings.length === 0) {
      return;
    }
    
    try {
      await new Promise((resolve, reject) => {
        this.db.transaction((tx) => {
          let completed = 0;
          let hasError = false;
          const total = mappings.length;
          
          for (const mapping of mappings) {
            const normalizedLat = normalizeCoordinate(mapping.latitude);
            const normalizedLng = normalizeCoordinate(mapping.longitude);
            const now = new Date().toISOString();
            
            tx.executeSql(
              `INSERT OR REPLACE INTO location_coordinates (latitude, longitude, location_id, created_at)
               VALUES (?, ?, ?, COALESCE((SELECT created_at FROM location_coordinates WHERE latitude = ? AND longitude = ?), ?))`,
              [
                normalizedLat,
                normalizedLng,
                mapping.location_id,
                normalizedLat,
                normalizedLng,
                now
              ],
              () => {
                completed++;
                if (completed === total && !hasError) {
                  resolve();
                }
              },
              (tx, error) => {
                if (!hasError) {
                  hasError = true;
                  reject(error);
                }
              }
            );
          }
        }, (error) => {
          if (error) {
            reject(error);
          }
        });
      });
      
      logger.debug(`✅ 批量保存坐标映射成功：${mappings.length}个映射`);
    } catch (error) {
      logger.error('批量保存坐标映射失败（SQLite）:', error);
      throw error;
    }
  }

  /**
   * 清空位置库全部数据（坐标映射 + 位置详情）
   */
  async clearAllData() {
    await this.init();
    await this.db.executeSql('DELETE FROM location_coordinates');
    await this.db.executeSql('DELETE FROM location_details');
    logger.info('🧹 SQLite 位置数据库已清空');
  }

  rowToObject(row) {
    return {
      location_id: row.location_id,
      country_code: row.country_code,
      admin1_zh: row.admin1_zh,
      admin1_en: row.admin1_en,
      admin2_zh: row.admin2_zh,
      admin2_en: row.admin2_en,
      latitude: row.latitude,
      longitude: row.longitude,
      data_source: row.data_source,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}

// IndexedDB 适配器类（Web端）
class LocationIndexedDBAdapter {
  constructor() {
    this.dbName = 'LocationDB';
    this.version = 2; // 升级以迁移至新 schema（三级行政区）
    this.db = null;
    this.isInitialized = false;
  }

  async init() {
    // 如果已经初始化，直接返回
    if (this.isInitialized && this.db) {
      return this.db;
    }

    if (!window.indexedDB) {
      logger.error('IndexedDB 不可用');
      throw new Error('IndexedDB 不可用');
    }

    logger.debug('📱 开始初始化位置数据库 IndexedDB...');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.error('位置数据库 IndexedDB 初始化超时');
        reject(new Error('IndexedDB 初始化超时'));
      }, 5000);

      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        clearTimeout(timeout);
        logger.error('位置数据库 IndexedDB 初始化失败:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        clearTimeout(timeout);
        this.db = request.result;
        this.isInitialized = true;
        logger.debug('✅ 位置数据库 IndexedDB 初始化成功');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const oldVersion = event.oldVersion;

        // 从 v1 升级：删除旧 store 并重建（schema 已变更）
        if (oldVersion > 0 && oldVersion < 2) {
          if (db.objectStoreNames.contains('location_details')) {
            db.deleteObjectStore('location_details');
          }
          if (db.objectStoreNames.contains('location_coordinates')) {
            db.deleteObjectStore('location_coordinates');
          }
          logger.debug('📦 IndexedDB 位置数据库已迁移至新 schema（三级行政区）');
        }

        if (!db.objectStoreNames.contains('location_coordinates')) {
          const coordStore = db.createObjectStore('location_coordinates', {
            keyPath: ['latitude', 'longitude']
          });
          coordStore.createIndex('location_id', 'location_id', { unique: false });
        }

        if (!db.objectStoreNames.contains('location_details')) {
          const detailStore = db.createObjectStore('location_details', {
            keyPath: 'location_id'
          });
          detailStore.createIndex('admin2_en', 'admin2_en', { unique: false });
        }
      };
    });
  }

  /**
   * 获取所有位置详情（用于初始化缓存）
   * @returns {Promise<Array<Object>>} 所有位置详情数组
   */
  async getAllLocationDetails() {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_details'], 'readonly');
      const store = transaction.objectStore('location_details');
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 获取坐标映射（坐标 -> location_id）
   * @param {Array<{latitude: number, longitude: number}>} coordinates - 坐标数组
   * @returns {Promise<Map<string, string>>} 坐标键到location_id的映射
   */
  async getCoordinateMappings(coordinates) {
    await this.init();
    
    if (!coordinates || coordinates.length === 0) {
      return new Map();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_coordinates'], 'readonly');
      const store = transaction.objectStore('location_coordinates');
      
      const mappings = new Map();
      let completed = 0;
      
      for (const coord of coordinates) {
        const normalizedLat = normalizeCoordinate(coord.latitude);
        const normalizedLng = normalizeCoordinate(coord.longitude);
        const key = `${normalizedLat}_${normalizedLng}`;
        
        const request = store.get([normalizedLat, normalizedLng]);
        
        request.onsuccess = () => {
          if (request.result) {
            mappings.set(key, request.result.location_id);
          }
          completed++;
          
          if (completed === coordinates.length) {
            resolve(mappings);
          }
        };
        
        request.onerror = () => {
          completed++;
          if (completed === coordinates.length) {
            resolve(mappings);
          }
        };
      }
      
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * 获取单个位置详情
   * @param {string} locationId - 位置ID
   * @returns {Promise<Object|null>} 位置详情或null
   */
  async getLocationDetail(locationId) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_details'], 'readonly');
      const store = transaction.objectStore('location_details');
      const request = store.get(locationId);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  /**
   * 批量查询位置信息
   * @param {Array<{latitude: number, longitude: number}>} coordinates - 坐标数组
   * @returns {Promise<Map<string, Object>>} 坐标到位置详情的映射
   */
  async getLocationsBatch(coordinates) {
    await this.init();
    
    if (!coordinates || coordinates.length === 0) {
      return new Map();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_coordinates', 'location_details'], 'readonly');
      const coordStore = transaction.objectStore('location_coordinates');
      const detailStore = transaction.objectStore('location_details');
      
      const results = new Map();
      const locationIds = new Set();
      const coordToLocationId = new Map();
      let completed = 0;
      
      // 1. 查询坐标映射
      for (const coord of coordinates) {
        const normalizedLat = normalizeCoordinate(coord.latitude);
        const normalizedLng = normalizeCoordinate(coord.longitude);
        const key = `${normalizedLat}_${normalizedLng}`;
        
        const request = coordStore.get([normalizedLat, normalizedLng]);
        
        request.onsuccess = () => {
          if (request.result) {
            const locationId = request.result.location_id;
            coordToLocationId.set(key, locationId);
            locationIds.add(locationId);
          }
          
          completed++;
          if (completed === coordinates.length) {
            // 2. 批量查询位置详情
            if (locationIds.size === 0) {
              resolve(new Map());
              return;
            }
            
            const detailRequests = [];
            for (const locationId of locationIds) {
              detailRequests.push(detailStore.get(locationId));
            }
            
            const detailMap = new Map();
            let detailCompleted = 0;
            
            for (const detailRequest of detailRequests) {
              detailRequest.onsuccess = () => {
                if (detailRequest.result) {
                  detailMap.set(detailRequest.result.location_id, detailRequest.result);
                }
                detailCompleted++;
                
                if (detailCompleted === detailRequests.length) {
                  // 3. 合并结果
                  for (const coord of coordinates) {
                    const normalizedLat = normalizeCoordinate(coord.latitude);
                    const normalizedLng = normalizeCoordinate(coord.longitude);
                    const key = `${normalizedLat}_${normalizedLng}`;
                    const locationId = coordToLocationId.get(key);
                    
                    if (locationId && detailMap.has(locationId)) {
                      results.set(key, detailMap.get(locationId));
                    }
                  }
                  
                  resolve(results);
                }
              };
              
              detailRequest.onerror = () => {
                detailCompleted++;
                if (detailCompleted === detailRequests.length) {
                  resolve(results);
                }
              };
            }
          }
        };
        
        request.onerror = () => {
          completed++;
          if (completed === coordinates.length) {
            resolve(results);
          }
        };
      }
      
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * 批量保存位置信息
   * @param {Array<Object>} locations - 位置信息数组
   * @returns {Promise<Array<Object>>} 保存的位置详情数组
   */
  async saveLocationsBatch(locations) {
    await this.init();
    
    if (!locations || locations.length === 0) {
      return [];
    }
    
    // 为每个位置生成location_id
    const locationsWithId = [];
    const errors = [];
    
    for (const location of locations) {
      try {
        const locationId = generateLocationId(location);
        locationsWithId.push({
          ...location,
          locationId
        });
      } catch (error) {
        errors.push({
          location,
          error: error.message
        });
        logger.error('生成location_id失败:', error);
      }
    }
    
    if (locationsWithId.length === 0) {
      logger.warn('没有有效的位置数据需要保存');
      return [];
    }
    
    const savedDetails = [];
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_details'], 'readwrite');
      const detailStore = transaction.objectStore('location_details');
      
      let completed = 0;
      let hasError = false;
      const total = locationsWithId.length; // 只保存位置详情表
      
      // 1. 保存位置详情
      for (const location of locationsWithId) {
        const now = new Date().toISOString();
        
        // 先查询是否存在，以保留created_at
        const getRequest = detailStore.get(location.locationId);
        
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          const detail = mapApiDataToLocationDetail(location);
          const detailData = {
            location_id: location.locationId,
            country_code: detail.country_code,
            admin1_zh: detail.admin1_zh,
            admin1_en: detail.admin1_en,
            admin2_zh: detail.admin2_zh,
            admin2_en: detail.admin2_en,
            latitude: detail.latitude,
            longitude: detail.longitude,
            data_source: detail.data_source,
            created_at: existing ? existing.created_at : now,
            updated_at: now
          };
          
          // 保存到数组用于返回
          savedDetails.push(detailData);
          
          const putRequest = detailStore.put(detailData);
          
          putRequest.onsuccess = () => {
            completed++;
            if (completed === total && !hasError) {
              resolve(savedDetails);
            }
          };
          
          putRequest.onerror = () => {
            if (!hasError) {
              hasError = true;
              reject(putRequest.error);
            }
          };
        };
        
        getRequest.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(getRequest.error);
          }
        };
      }
      
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * 批量保存坐标映射（查询坐标 -> location_id）
   * @param {Array<{latitude: number, longitude: number, location_id: string}>} mappings - 坐标映射数组
   */
  async saveCoordinateMappings(mappings) {
    await this.init();
    
    if (!mappings || mappings.length === 0) {
      return;
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_coordinates'], 'readwrite');
      const coordStore = transaction.objectStore('location_coordinates');
      
      let completed = 0;
      let hasError = false;
      const total = mappings.length;
      
      for (const mapping of mappings) {
        const normalizedLat = normalizeCoordinate(mapping.latitude);
        const normalizedLng = normalizeCoordinate(mapping.longitude);
        
        // 先查询是否存在，以保留created_at
        const getRequest = coordStore.get([normalizedLat, normalizedLng]);
        
        getRequest.onsuccess = () => {
          const existing = getRequest.result;
          const coordData = {
            latitude: normalizedLat,
            longitude: normalizedLng,
            location_id: mapping.location_id,
            created_at: existing ? existing.created_at : new Date().toISOString()
          };
          
          const putRequest = coordStore.put(coordData);
          
          putRequest.onsuccess = () => {
            completed++;
            if (completed === total && !hasError) {
              resolve();
            }
          };
          
          putRequest.onerror = () => {
            if (!hasError) {
              hasError = true;
              reject(putRequest.error);
            }
          };
        };
        
        getRequest.onerror = () => {
          if (!hasError) {
            hasError = true;
            reject(getRequest.error);
          }
        };
      }
      
      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  }

  /**
   * 清空位置库全部数据（坐标映射 + 位置详情）
   */
  async clearAllData() {
    await this.init();
    await new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['location_coordinates', 'location_details'], 'readwrite');
      transaction.objectStore('location_coordinates').clear();
      transaction.objectStore('location_details').clear();
      transaction.oncomplete = () => {
        logger.info('🧹 IndexedDB 位置数据库已清空');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// LocationStorageService 主类
class LocationStorageService {
  constructor() {
    this.isInitialized = false;
    this.locationDetailsCache = new Map(); // 内存缓存：location_id -> location_details
    
    // 根据平台选择存储方式
    if (Platform.OS === 'web') {
      logger.debug('💻 PC端: 使用 IndexedDB 存储位置数据');
      this.storage = new LocationIndexedDBAdapter();
    } else {
      logger.debug('📱 移动端: 使用 SQLite 存储位置数据');
      this.storage = new LocationSQLiteAdapter();
    }
  }

  /**
   * 确保服务已初始化（应在应用启动时完成）
   * 如果未初始化，抛出错误
   */
  async ensureInitialized() {
    if (this.isInitialized) {
      return;
    }
    
    // 如果未初始化，说明应用启动时没有正确初始化，抛出错误
    throw new Error('LocationStorageService 未初始化。请在应用启动时（UnifiedDataService.initialize）调用 initialize()');
  }

  /**
   * 初始化服务（仅在应用启动时调用一次）
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.storage.init();
      
      // 加载所有 location_details 到内存缓存
      await this._loadLocationDetailsCache();
      
      this.isInitialized = true;
      logger.debug(`✅ 位置数据库服务初始化成功，缓存了 ${this.locationDetailsCache.size} 个位置详情`);
    } catch (error) {
      logger.error('❌ 位置数据库服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载所有 location_details 到内存缓存
   * @private
   */
  async _loadLocationDetailsCache() {
    try {
      const allDetails = await this.storage.getAllLocationDetails();
      this.locationDetailsCache.clear();
      
      for (const detail of allDetails) {
        this.locationDetailsCache.set(detail.location_id, detail);
      }
      
      logger.debug(`✅ 已加载 ${allDetails.length} 个位置详情到内存缓存`);
    } catch (error) {
      logger.error('❌ 加载位置详情缓存失败:', error);
      // 不抛出错误，继续初始化
    }
  }

  /**
   * 批量查询位置信息（仅从缓存读取）
   * 如果缓存未命中，说明本地数据库没有该位置信息，应该去服务器请求
   * @param {Array<{latitude: number, longitude: number}>} coordinates - 坐标数组
   * @returns {Promise<Map<string, Object>>} 坐标到位置详情的映射
   */
  async getLocationsBatch(coordinates) {
    if (!this.isInitialized) {
      throw new Error('LocationStorageService 未初始化');
    }
    
    // 1. 查询坐标映射表（从数据库）
    const coordinateMappings = await this.storage.getCoordinateMappings(coordinates);
    
    // 2. 从缓存中获取位置详情（仅从缓存读取，不查询数据库）
    const results = new Map();
    for (const [coordKey, locationId] of coordinateMappings.entries()) {
      if (this.locationDetailsCache.has(locationId)) {
        results.set(coordKey, this.locationDetailsCache.get(locationId));
      }
      // 如果缓存未命中，不查询数据库，返回空结果
      // 由 CityLocationService 检测到缺失后去服务器请求
    }
    
    return results;
  }

  /**
   * 批量保存位置信息（自动生成location_id，并同步更新缓存）
   * @param {Array<Object>} locations - 位置信息数组
   * @returns {Promise<Array<Object>>} 保存的位置详情数组
   */
  async saveLocationsBatch(locations) {
    if (!this.isInitialized) {
      throw new Error('LocationStorageService 未初始化');
    }
    
    // 保存到数据库
    const savedDetails = await this.storage.saveLocationsBatch(locations);
    
    // 同步更新内存缓存（保证缓存与数据库一致）
    if (savedDetails && Array.isArray(savedDetails)) {
      for (const detail of savedDetails) {
        if (detail && detail.location_id) {
          this.locationDetailsCache.set(detail.location_id, detail);
        }
      }
      
      if (savedDetails.length > 0) {
        logger.debug(`✅ 已保存 ${savedDetails.length} 个位置信息并更新缓存，当前缓存大小: ${this.locationDetailsCache.size}`);
      }
    }
    
    return savedDetails || [];
  }

  /**
   * 清空本地位置数据库（坐标→location_id 映射与 location 详情），并清空内存缓存
   */
  async clearAllLocationData() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    await this.storage.clearAllData();
    this.locationDetailsCache.clear();
    logger.info('🧹 本地位置库与内存缓存已清空');
  }

}

// 创建单例实例
const locationStorageService = new LocationStorageService();

export default locationStorageService;

