// 城市坐标查找服务 - 跨平台实现
import citiesData from '../data/china-cities.json';

class CityLocationService {
  constructor() {
    this.cities = citiesData;
    this.cache = new Map(); // 缓存最近查找结果
    this.maxCacheSize = 1000; // 最大缓存数量
  }

  /**
   * 根据坐标查找最近的城市
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @param {number} maxDistance - 最大搜索距离(公里)，默认200公里
   * @returns {Object|null} 城市信息对象或null
   */
  findNearestCity(latitude, longitude, maxDistance = 200) {
    // 参数验证
    if (!this.isValidCoordinate(latitude, longitude)) {
      console.warn('Invalid coordinates provided');
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
          distance: Math.round(distance * 100) / 100 // 保留两位小数
        };
      }
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
