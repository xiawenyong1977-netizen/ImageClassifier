// 城市坐标查找服务 - 跨平台实现
import citiesData from '../data/china-cities.json';
import { logger } from '../adapters/WebAdapters.js';

class CityLocationService {
  constructor() {
    this.cities = citiesData;
    this.cache = new Map(); // 缓存最近查找结果
    this.maxCacheSize = 1000; // 最大缓存数量
    
    // API配置
    this.apiConfig = {
      baseURL: 'http://123.57.68.4:8000',
      timeout: 5000, // 5秒超时
      endpoints: {
        nearestCity: '/api/v1/location/nearest-city',
        nearbyCities: '/api/v1/location/nearby-cities'
      }
    };
  }

  /**
   * 调用远程API查找最近的城市（使用附近城市列表，按人口筛选真正的城市）
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @returns {Promise<Object|null>} 城市信息对象或null
   */
  async findNearestCityRemote(latitude, longitude) {
    // 使用附近城市列表API，查询50公里内的前10个城市
    const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.nearbyCities}?latitude=${latitude}&longitude=${longitude}&limit=10&max_distance_km=50`;
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.apiConfig.timeout);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const cities = await response.json();
      
      logger.debug('🔍 远程API返回附近城市数量:', cities.length);
      
      if (!cities || cities.length === 0) {
        logger.warn('⚠️ 未找到附近的城市');
        return null;
      }
      
      // 按人口排序，选择人口最多的城市（通常是真正的市级单位，而不是区）
      const sortedByPopulation = [...cities].sort((a, b) => b.population - a.population);
      
      const mainCity = sortedByPopulation[0];
      
      logger.debug('🔍 人口最多的城市:', {
        name: mainCity.name,
        name_zh: mainCity.name_zh,
        population: mainCity.population,
        distance: mainCity.distance_km
      });
      
      // 使用API返回的中文名称
      const chineseName = mainCity.name_zh || mainCity.name;
      
      // 转换API返回格式到本地格式
      const city = {
        name: chineseName,
        province: chineseName, // 使用中文名作为省份（暂时）
        lat: mainCity.latitude,
        lng: mainCity.longitude,
        distance: Math.round(mainCity.distance_km * 100) / 100,
        source: 'remote'
      };
      
      logger.debug(`✅ 远程API查询成功: ${mainCity.name} → ${chineseName}, 距离: ${city.distance}km`);
      return city;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.warn('⚠️ 远程API查询超时');
      } else {
        logger.warn('⚠️ 远程API查询失败:', error.message);
      }
      return null;
    }
  }

  /**
   * 根据坐标查找最近的城市（同步，仅本地查询）
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @param {number} maxDistance - 最大搜索距离(公里)，默认200公里
   * @returns {Object|null} 城市信息对象或null
   */
  findNearestCity(latitude, longitude, maxDistance = 200) {
    // 参数验证
    if (!this.isValidCoordinate(latitude, longitude)) {
      logger.warn('Invalid coordinates provided');
      return null;
    }

    // 检查缓存
    const cacheKey = this.getCacheKey(latitude, longitude);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    let nearestCity = null;
    let minDistance = Infinity;

    // 遍历所有城市查找最近的一个
    for (const city of this.cities) {
      const distance = this.calculateDistance(
        latitude, 
        longitude, 
        city.lat, 
        city.lng
      );

      if (distance < minDistance && distance <= maxDistance) {
        minDistance = distance;
        nearestCity = {
          ...city,
          distance: Math.round(distance * 100) / 100, // 保留两位小数
          source: 'local'
        };
      }
    }

    if (nearestCity) {
      logger.debug(`✅ 本地查询成功: ${nearestCity.name}, 距离: ${nearestCity.distance}km`);
    } else {
      logger.warn('⚠️ 本地未找到匹配的城市');
    }

    return nearestCity;
  }

  /**
   * 根据坐标查找最近的城市（混合模式：优先远程API，失败时回退到本地）
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @param {number} maxDistance - 最大搜索距离(公里)，默认200公里
   * @returns {Promise<Object|null>} 城市信息对象或null
   */
  async findNearestCityAsync(latitude, longitude, maxDistance = 200) {
    // 参数验证
    if (!this.isValidCoordinate(latitude, longitude)) {
      logger.warn('Invalid coordinates provided');
      return null;
    }

    // 检查缓存
    const cacheKey = this.getCacheKey(latitude, longitude);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    let nearestCity = null;

    try {
      // 1. 优先尝试远程API
      logger.debug('🌐 尝试远程API查询城市信息...');
      nearestCity = await this.findNearestCityRemote(latitude, longitude);
      
      // 如果远程API失败或未找到结果，回退到本地查询
      if (!nearestCity) {
        logger.debug('⚠️ 远程API查询失败，降级到本地查询...');
        nearestCity = this.findNearestCity(latitude, longitude, maxDistance);
      }
      
    } catch (error) {
      // 如果远程API调用异常，回退到本地查询
      logger.warn('⚠️ 远程API调用异常，降级到本地查询:', error.message);
      nearestCity = this.findNearestCity(latitude, longitude, maxDistance);
    }

    // 缓存结果
    if (nearestCity) {
      this.setCache(cacheKey, nearestCity);
    }

    return nearestCity;
  }

  /**
   * 根据坐标查找指定范围内的所有城市
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @param {number} radius - 搜索半径(公里)
   * @returns {Array} 城市信息数组
   */
  findCitiesInRadius(latitude, longitude, radius = 100) {
    if (!this.isValidCoordinate(latitude, longitude)) {
      return [];
    }

    const citiesInRadius = [];

    for (const city of this.cities) {
      const distance = this.calculateDistance(
        latitude, 
        longitude, 
        city.lat, 
        city.lng
      );

      if (distance <= radius) {
        citiesInRadius.push({
          ...city,
          distance: Math.round(distance * 100) / 100
        });
      }
    }

    // 按距离排序
    return citiesInRadius.sort((a, b) => a.distance - b.distance);
  }

  /**
   * 根据城市名称查找城市信息
   * @param {string} cityName - 城市名称
   * @returns {Object|null} 城市信息对象或null
   */
  findCityByName(cityName) {
    if (!cityName || typeof cityName !== 'string') {
      return null;
    }

    const normalizedName = cityName.trim();
    
    // 精确匹配
    let city = this.cities.find(c => c.name === normalizedName);
    if (city) return city;

    // 模糊匹配
    city = this.cities.find(c => 
      c.name.includes(normalizedName) || 
      normalizedName.includes(c.name)
    );
    
    return city || null;
  }

  /**
   * 根据省份查找该省的所有城市
   * @param {string} provinceName - 省份名称
   * @returns {Array} 城市信息数组
   */
  findCitiesByProvince(provinceName) {
    if (!provinceName || typeof provinceName !== 'string') {
      return [];
    }

    const normalizedProvince = provinceName.trim();
    return this.cities.filter(city => 
      city.province === normalizedProvince
    );
  }

  /**
   * 计算两点之间的距离（使用Haversine公式）
   * @param {number} lat1 - 点1纬度
   * @param {number} lon1 - 点1经度
   * @param {number} lat2 - 点2纬度
   * @param {number} lon2 - 点2经度
   * @returns {number} 距离(公里)
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // 地球半径(公里)
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度转弧度
   * @param {number} degrees - 角度
   * @returns {number} 弧度
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * 验证坐标是否有效
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @returns {boolean} 是否有效
   */
  isValidCoordinate(latitude, longitude) {
    return typeof latitude === 'number' && 
           typeof longitude === 'number' &&
           !isNaN(latitude) && 
           !isNaN(longitude) &&
           latitude >= -90 && latitude <= 90 &&
           longitude >= -180 && longitude <= 180;
  }

  /**
   * 生成缓存键
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @returns {string} 缓存键
   */
  getCacheKey(latitude, longitude) {
    // 将坐标四舍五入到小数点后2位，减少缓存键数量
    const lat = Math.round(latitude * 100) / 100;
    const lng = Math.round(longitude * 100) / 100;
    return `${lat}_${lng}`;
  }

  /**
   * 设置缓存
   * @param {string} key - 缓存键
   * @param {Object} value - 缓存值
   */
  setCache(key, value) {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  /**
   * 清空缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: this.cacheHits / (this.cacheHits + this.cacheMisses) || 0
    };
  }

  /**
   * 获取所有城市数量
   * @returns {number} 城市数量
   */
  getCityCount() {
    return this.cities.length;
  }

  /**
   * 获取所有省份列表
   * @returns {Array} 省份名称数组
   */
  getProvinces() {
    const provinces = [...new Set(this.cities.map(city => city.province))];
    return provinces.sort();
  }
}

// 创建单例实例
const cityLocationService = new CityLocationService();

export default cityLocationService;
