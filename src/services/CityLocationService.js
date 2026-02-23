// 城市坐标查找服务 - 重构版本
// 使用本地数据库和远程API批量查询位置信息
import { logger } from '../adapters/WebAdapters';
import locationStorageService from './LocationStorageService';

/**
 * 国家代码到中英文名称的映射表
 * 基于 ISO 3166-1 alpha-2 标准
 */
const COUNTRY_CODE_MAP = {
  'CN': { zh: '中国', en: 'China' },
  'US': { zh: '美国', en: 'United States' },
  'JP': { zh: '日本', en: 'Japan' },
  'KR': { zh: '韩国', en: 'South Korea' },
  'GB': { zh: '英国', en: 'United Kingdom' },
  'FR': { zh: '法国', en: 'France' },
  'DE': { zh: '德国', en: 'Germany' },
  'IT': { zh: '意大利', en: 'Italy' },
  'ES': { zh: '西班牙', en: 'Spain' },
  'RU': { zh: '俄罗斯', en: 'Russia' },
  'CA': { zh: '加拿大', en: 'Canada' },
  'AU': { zh: '澳大利亚', en: 'Australia' },
  'BR': { zh: '巴西', en: 'Brazil' },
  'IN': { zh: '印度', en: 'India' },
  'MX': { zh: '墨西哥', en: 'Mexico' },
  'AR': { zh: '阿根廷', en: 'Argentina' },
  'TH': { zh: '泰国', en: 'Thailand' },
  'VN': { zh: '越南', en: 'Vietnam' },
  'PH': { zh: '菲律宾', en: 'Philippines' },
  'ID': { zh: '印度尼西亚', en: 'Indonesia' },
  'MY': { zh: '马来西亚', en: 'Malaysia' },
  'SG': { zh: '新加坡', en: 'Singapore' },
  'TW': { zh: '台湾', en: 'Taiwan' },
  'HK': { zh: '香港', en: 'Hong Kong' },
  'MO': { zh: '澳门', en: 'Macau' },
  'NL': { zh: '荷兰', en: 'Netherlands' },
  'BE': { zh: '比利时', en: 'Belgium' },
  'CH': { zh: '瑞士', en: 'Switzerland' },
  'AT': { zh: '奥地利', en: 'Austria' },
  'SE': { zh: '瑞典', en: 'Sweden' },
  'NO': { zh: '挪威', en: 'Norway' },
  'DK': { zh: '丹麦', en: 'Denmark' },
  'FI': { zh: '芬兰', en: 'Finland' },
  'PL': { zh: '波兰', en: 'Poland' },
  'GR': { zh: '希腊', en: 'Greece' },
  'PT': { zh: '葡萄牙', en: 'Portugal' },
  'TR': { zh: '土耳其', en: 'Turkey' },
  'SA': { zh: '沙特阿拉伯', en: 'Saudi Arabia' },
  'AE': { zh: '阿联酋', en: 'United Arab Emirates' },
  'EG': { zh: '埃及', en: 'Egypt' },
  'ZA': { zh: '南非', en: 'South Africa' },
  'NZ': { zh: '新西兰', en: 'New Zealand' },
  'IE': { zh: '爱尔兰', en: 'Ireland' },
  'IL': { zh: '以色列', en: 'Israel' },
  'CL': { zh: '智利', en: 'Chile' },
  'CO': { zh: '哥伦比亚', en: 'Colombia' },
  'PE': { zh: '秘鲁', en: 'Peru' },
  'VE': { zh: '委内瑞拉', en: 'Venezuela' },
  'PK': { zh: '巴基斯坦', en: 'Pakistan' },
  'BD': { zh: '孟加拉国', en: 'Bangladesh' },
  'MM': { zh: '缅甸', en: 'Myanmar' },
  'KH': { zh: '柬埔寨', en: 'Cambodia' },
  'LA': { zh: '老挝', en: 'Laos' },
  'NP': { zh: '尼泊尔', en: 'Nepal' },
  'LK': { zh: '斯里兰卡', en: 'Sri Lanka' },
  'UZ': { zh: '乌兹别克斯坦', en: 'Uzbekistan' },
  'KZ': { zh: '哈萨克斯坦', en: 'Kazakhstan' },
  'MN': { zh: '蒙古', en: 'Mongolia' },
  'KP': { zh: '朝鲜', en: 'North Korea' },
};

/**
 * 根据国家代码和语言获取国家名称
 * @param {string} countryCode - 国家代码（ISO 3166-1 alpha-2）
 * @param {string} language - 语言设置 ('zh' 或 'en')
 * @returns {string} 国家名称，如果未找到则返回原始代码
 */
function getCountryName(countryCode, language = 'zh') {
  if (!countryCode || typeof countryCode !== 'string') {
    return countryCode || '';
  }
  
  const code = countryCode.trim().toUpperCase();
  const countryInfo = COUNTRY_CODE_MAP[code];
  
  if (!countryInfo) {
    // 如果未找到映射，返回原始代码
    return code;
  }
  
  return language === 'en' ? countryInfo.en : countryInfo.zh;
}

class CityLocationService {
  constructor() {
    // API配置
    this.apiConfig = {
      baseURL: 'https://api.aifuture.net.cn',
      timeout: 30000, // 30秒超时（V3接口LLM查询可能需要更长时间）
      endpoints: {
        nearestCities: '/api/v3/location/nearest-cities' // 使用v3批量接口（支持最多1000个坐标，基于LLM）
      }
    };
  }

  /**
   * 批量查询多个坐标点的最近城市
   * @param {Array<{id?: string, latitude: number, longitude: number}>} coordinates - 坐标数组
   * @param {Object} options - 可选配置
   * @param {string} options.language - 语言设置 ('zh' | 'en')，默认 'zh'
   * @param {boolean} options.skipRemote - 是否跳过远程查询（仅查本地），默认 false
   * @returns {Promise<Array<LocationResult>>} 位置信息结果数组（与输入顺序一致）
   */
  async getLocationsBatch(coordinates, options = {}) {
    const { language = 'zh', skipRemote = false } = options;
    
    // 参数验证
    if (!coordinates || !Array.isArray(coordinates) || coordinates.length === 0) {
      logger.warn('坐标数组为空或无效');
      return [];
    }

    // 过滤有效坐标
    const validCoordinates = coordinates.filter(coord => {
      if (!this.isValidCoordinate(coord.latitude, coord.longitude)) {
        logger.warn('无效的坐标点:', coord);
        return false;
      }
      return true;
    });

    if (validCoordinates.length === 0) {
      logger.warn('没有有效的坐标点');
      return [];
    }

    // 1. 先在本地数据库查询
    let localResults = new Map();
    try {
      localResults = await locationStorageService.getLocationsBatch(validCoordinates);
    } catch (error) {
      logger.error('本地数据库查询失败:', error);
      // 继续执行，降级到远程查询
    }

    // 2. 找出本地未找到的坐标点
    const missingCoordinates = validCoordinates.filter(coord => {
      const normalizedLat = this.normalizeCoordinate(coord.latitude);
      const normalizedLng = this.normalizeCoordinate(coord.longitude);
      const key = `${normalizedLat}_${normalizedLng}`;
      return !localResults.has(key);
    });

    // 3. 如果所有坐标都在本地找到，直接返回
    if (missingCoordinates.length === 0) {
      return this.formatResults(validCoordinates, localResults, language);
    }

    // 4. 如果跳过远程查询，只返回本地结果
    if (skipRemote) {
      return this.formatResults(validCoordinates, localResults, language);
    }

    // 5. 批量请求服务器获取缺失的坐标
    let remoteResults = [];
    if (missingCoordinates.length > 0) {
      try {
        logger.debug(`📡 准备查询 ${missingCoordinates.length} 个缺失的坐标点`);
        remoteResults = await this._fetchAndSaveFromRemote(missingCoordinates);
        logger.debug(`✅ 远程API查询完成，返回 ${remoteResults.length} 个结果`);
      } catch (error) {
        logger.error('❌ 远程API查询失败:', {
          errorName: error.name,
          errorMessage: error.message,
          coordinatesCount: missingCoordinates.length,
          url: `${this.apiConfig.baseURL}${this.apiConfig.endpoints.nearestCities}`,
          suggestion: '请检查：1) 网络连接是否正常 2) API服务器是否可访问 3) 防火墙是否阻止了请求'
        });
        // 继续执行，只返回本地结果（不影响已有位置信息的图片）
      }
    }

    // 6. 合并本地和远程结果
    const allResults = new Map(localResults);
    
    // 添加远程查询结果
    if (remoteResults && remoteResults.length > 0) {
      // 重新查询本地数据库（因为远程结果已保存）
      try {
        const updatedLocalResults = await locationStorageService.getLocationsBatch(missingCoordinates);
        updatedLocalResults.forEach((value, key) => {
          allResults.set(key, value);
        });
      } catch (error) {
        logger.error('重新查询本地数据库失败:', error);
      }
    }

    return this.formatResults(validCoordinates, allResults, language);
  }

  /**
   * 从服务器批量获取最近城市并自动保存
   * @param {Array<{id?: string, latitude: number, longitude: number}>} coordinates - 坐标数组
   * @returns {Promise<Array<Object>>} 服务器返回的结果数组
   * @private
   */
  async _fetchAndSaveFromRemote(coordinates) {
    if (!coordinates || coordinates.length === 0) {
      return [];
    }

    const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.nearestCities}`;
    const requestBody = {
      coordinates: coordinates.map(coord => ({
        id: coord.id,
        latitude: coord.latitude,
        longitude: coord.longitude
      }))
    };
    
    // 记录请求详情
    logger.debug('📤 发送位置信息批量查询请求:', {
      url: url,
      method: 'POST',
      coordinatesCount: coordinates.length,
      timeout: this.apiConfig.timeout,
      requestBodySize: JSON.stringify(requestBody).length
    });
    
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.apiConfig.timeout);
      
      // 添加更详细的请求日志
      logger.debug('📤 准备发送位置信息批量查询请求:', {
        url: url,
        method: 'POST',
        coordinatesCount: coordinates.length,
        timeout: this.apiConfig.timeout,
        requestBodySize: JSON.stringify(requestBody).length
      });
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeout);

      // 记录响应详情
      logger.debug('📥 收到服务器响应:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        // 尝试读取错误响应体
        let errorBody = null;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorBody = await response.json();
          } else {
            errorBody = await response.text();
          }
        } catch (e) {
          logger.warn('⚠️ 无法读取错误响应体:', e.message);
        }
        
        logger.error('❌ 服务器返回错误响应:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorBody
        });
        
        throw new Error(`HTTP ${response.status}: ${response.statusText}${errorBody ? ` - ${JSON.stringify(errorBody)}` : ''}`);
      }

      const data = await response.json();
      
      logger.debug('📥 服务器返回数据:', {
        success: data.success,
        resultsCount: data.results?.length || 0,
        totalCount: data.total_count,
        successCount: data.success_count,
        failedCount: data.failed_count
      });
      
      if (!data.success || !data.results) {
        logger.warn('服务器返回格式异常:', data);
        return [];
      }

      // 提取成功查询的城市数据并保存到本地数据库
      const locationsToSave = [];
      const coordinateToIndexMap = new Map(); // 记录查询坐标到 locationsToSave 索引的映射
      const errors = [];
      
      for (const result of data.results) {
        if (result.success && result.city) {
          try {
            // 验证必填字段：需有二级行政区信息（admin2_en）
            const c = result.city;
            const hasAdmin2 = c.admin2_en && typeof c.admin2_en === 'string' && c.admin2_en.trim() !== '';
            if (!hasAdmin2) {
              throw new Error(`API返回的城市数据缺少二级行政区信息：${JSON.stringify(result.city)}`);
            }
            if (!c.country_code || !c.country_code.trim()) {
              throw new Error(`API返回的城市数据缺少country_code：${JSON.stringify(result.city)}`);
            }

            const index = locationsToSave.length;
            locationsToSave.push(result.city);
            
            // 记录查询坐标到索引的映射（用于后续保存坐标映射）
            if (result.coordinate && result.coordinate.latitude && result.coordinate.longitude) {
              coordinateToIndexMap.set(index, {
                latitude: result.coordinate.latitude,
                longitude: result.coordinate.longitude
              });
            }
          } catch (error) {
            errors.push({
              coordinate: result.coordinate,
              cityData: result.city,
              error: error.message
            });
            
            logger.error('❌ 处理API返回的城市数据失败', {
              coordinate: result.coordinate,
              cityData: result.city,
              error: error.message
            });
          }
        }
      }
      
      // 批量保存到本地数据库
      if (locationsToSave.length > 0) {
        try {
          // 保存位置信息（只保存位置详情，不保存坐标映射）
          const savedDetails = await locationStorageService.saveLocationsBatch(locationsToSave);
          logger.debug(`✅ 已保存 ${locationsToSave.length} 个位置信息到本地数据库`);
          
          // 保存查询坐标映射（使用查询时的坐标，即图片的GPS坐标）
          // 通过索引对应关系匹配：locationsToSave[index] 对应 savedDetails[index]
          // savedDetails 中已经包含了 location_id（由 LocationStorageService 内部生成）
          // 注意：savedDetails 的顺序应该和 locationsToSave 一致
          const coordinateMappings = [];
          if (savedDetails && Array.isArray(savedDetails)) {
            for (const [index, coordinate] of coordinateToIndexMap.entries()) {
              // 直接通过索引匹配（假设顺序一致）
              const detail = savedDetails[index];
              
              if (detail && detail.location_id && coordinate) {
                coordinateMappings.push({
                  latitude: coordinate.latitude,
                  longitude: coordinate.longitude,
                  location_id: detail.location_id
                });
              } else {
                logger.debug(`⚠️ 未找到对应的location_id: index=${index}, coordinate=${JSON.stringify(coordinate)}, hasDetail=${!!detail}, locationId=${detail?.location_id}`);
              }
            }
          }
          
          // 保存查询坐标映射（直接调用适配器方法）
          if (coordinateMappings.length > 0) {
            try {
              // 直接调用适配器方法（服务已在应用启动时初始化）
              await locationStorageService.storage.saveCoordinateMappings(coordinateMappings);
              logger.debug(`✅ 已保存 ${coordinateMappings.length} 个查询坐标映射到本地数据库`);
            } catch (error) {
              logger.error('保存查询坐标映射失败:', error);
              // 不抛出错误，继续返回结果
            }
          }
        } catch (error) {
          logger.error('保存位置信息到本地数据库失败:', error);
          // 不抛出错误，继续返回结果
        }
      }
      
      if (errors.length > 0) {
        logger.warn(`⚠️ ${errors.length} 个位置数据保存失败`);
      }
      
      return data.results;
      
    } catch (error) {
      // 详细错误诊断
      if (error.name === 'AbortError') {
        logger.error('❌ 远程API查询超时:', {
          url: url,
          timeout: this.apiConfig.timeout,
          coordinatesCount: coordinates.length,
          errorName: error.name,
          errorMessage: error.message
        });
      } else if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        // 网络错误：可能是CORS、网络连接、DNS等问题
        logger.error('❌ 远程API查询失败 (网络错误)');
        logger.error('📍 请求URL:', url);
        logger.error('📍 错误类型:', error.name);
        logger.error('📍 错误消息:', error.message);
        logger.error('📍 坐标数量:', coordinates.length);
        logger.error('📍 请求方法:', 'POST');
        logger.error('📍 请求体大小:', JSON.stringify(requestBody).length, 'bytes');
        logger.error('📍 可能的原因:', [
          '1. CORS策略阻止了请求 - 检查服务器CORS配置',
          '2. 网络连接失败 - 检查网络连接',
          '3. DNS解析失败 - 检查域名是否正确',
          '4. 服务器不可达 - 检查服务器是否运行',
          '5. SSL证书问题 - 检查HTTPS配置'
        ]);
        if (error.stack) {
          logger.error('📍 错误堆栈:', error.stack);
        }
        
        // 自动诊断：尝试简单的 GET 请求测试连接
        logger.info('🔍 开始自动诊断...');
        try {
          const healthUrl = `${this.apiConfig.baseURL}/api/v2/health`;
          logger.info(`   尝试 GET 请求: ${healthUrl}`);
          
          const healthResponse = await fetch(healthUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          logger.info(`   ✅ GET 请求成功: 状态码 ${healthResponse.status}`);
          logger.warn('   ⚠️ GET 请求成功但 POST 请求失败，很可能是 CORS 配置问题');
          logger.warn('   ⚠️ 服务器可能只允许 GET 请求，或者 CORS 配置不完整');
          
          if (healthResponse.ok) {
            const healthData = await healthResponse.json();
            logger.info('   📥 健康检查响应:', healthData);
          }
        } catch (healthError) {
          logger.error(`   ❌ GET 请求也失败: ${healthError.message}`);
          logger.error('   💡 这表明可能是网络连接问题，而不是 CORS 问题');
        }
        
        logger.info('🔍 诊断建议:');
        logger.info('   1. 打开浏览器开发者工具 -> Network 标签页');
        logger.info('   2. 查看是否有对 /api/v3/location/nearest-cities 的请求');
        logger.info('   3. 如果有请求，查看状态码和响应头（特别是 CORS 相关头）');
        logger.info('   4. 如果没有请求，可能是请求被浏览器阻止（CORS preflight 失败）');
        logger.info(`   5. 手动测试: 在浏览器中访问 ${this.apiConfig.baseURL}/api/v2/health`);
        logger.info('   6. 或在控制台运行: await testLocationAPI()');
      } else {
        logger.error('❌ 远程API查询失败:', {
          url: url,
          errorName: error.name,
          errorMessage: error.message,
          errorStack: error.stack,
          coordinatesCount: coordinates.length
        });
      }
      return [];
    }
  }

  /**
   * 格式化结果
   * @param {Array<Object>} coordinates - 原始坐标数组
   * @param {Map<string, Object>} results - 位置信息映射
   * @param {string} language - 语言设置
   * @returns {Array<LocationResult>} 格式化后的结果数组
   */
  formatResults(coordinates, results, language) {
    return coordinates.map(coord => {
      const normalizedLat = this.normalizeCoordinate(coord.latitude);
      const normalizedLng = this.normalizeCoordinate(coord.longitude);
      const key = `${normalizedLat}_${normalizedLng}`;
      const location = results.get(key);

      if (!location) {
        return {
          id: coord.id,
          latitude: coord.latitude,
          longitude: coord.longitude,
          success: false,
          city: null,
          error: '未找到位置信息',
          fromCache: false
        };
      }

      // 根据语言选择显示名称（二级行政区 admin2 最具体）
      const displayName = language === 'en'
        ? (location.admin2_en || location.admin1_en || '')
        : (location.admin2_zh || location.admin1_zh || location.admin2_en || location.admin1_en || '');
      const normalizedCityName = language === 'zh' ? this.normalizeCityName(displayName) : displayName;

      // 计算距离（如果查询坐标与城市坐标不同）
      const distance = this.calculateDistance(
        coord.latitude,
        coord.longitude,
        location.latitude,
        location.longitude
      );

      return {
        id: coord.id,
        latitude: coord.latitude,
        longitude: coord.longitude,
        success: true,
        location_id: location.location_id,
        city: {
          name: normalizedCityName,
          admin1_zh: location.admin1_zh,
          admin1_en: location.admin1_en,
          admin2_zh: location.admin2_zh,
          admin2_en: location.admin2_en,
          lat: location.latitude,
          lng: location.longitude,
          country_code: location.country_code,
          country: getCountryName(location.country_code, language),
          data_source: location.data_source,
          distance: Math.round(distance * 100) / 100,
          source: 'local',
          location_id: location.location_id
        },
        fromCache: true
      };
    });
  }

  /**
   * 根据 location_id 和语言设置获取位置名称
   * @param {string} locationId - 位置ID
   * @param {string} language - 语言设置 ('zh' 或 'en')，默认为 'zh'
   * @returns {Promise<string|null>} 位置名称，如果未找到则返回 null
   */
  async getLocationName(locationId, language = 'zh') {
    if (!locationId || typeof locationId !== 'string') {
      logger.warn('getLocationName: locationId 无效', { locationId });
      return null;
    }

    try {
      // 先从缓存中查找（服务已在应用启动时初始化）
      let locationDetail = null;
      if (locationStorageService.locationDetailsCache && locationStorageService.locationDetailsCache.has(locationId)) {
        locationDetail = locationStorageService.locationDetailsCache.get(locationId);
      } else {
        // 缓存未命中，从数据库查询
        locationDetail = await locationStorageService.storage.getLocationDetail(locationId);
        
        // 如果找到，更新缓存
        if (locationDetail && locationDetail.location_id) {
          locationStorageService.locationDetailsCache.set(locationDetail.location_id, locationDetail);
        }
      }

      if (!locationDetail) {
        logger.debug(`getLocationName: 未找到位置信息，locationId=${locationId}`);
        return null;
      }

      // 根据语言返回二级行政区名称（admin2 最具体），展示时去除省/市/区等后缀
      const nameEn = locationDetail.admin2_en || locationDetail.admin1_en;
      const nameZh = locationDetail.admin2_zh || locationDetail.admin1_zh;
      const raw = language === 'en' ? (nameEn || nameZh) : (nameZh || nameEn);
      return raw ? this.normalizeCityName(raw) : null;
    } catch (error) {
      logger.error('getLocationName: 获取位置名称失败', { locationId, language, error });
      return null;
    }
  }

  /**
   * 根据 location_id 获取详细的位置信息
   * @param {string} locationId - 位置ID
   * @param {string} language - 语言设置 ('zh' 或 'en')，默认为 'zh'，用于返回对应语言的名称字段
   * @returns {Promise<Object|null>} 位置详细信息对象，如果未找到则返回 null
   * 
   * 返回对象包含以下字段：
   * - location_id: 位置ID
   * - name: 根据语言设置返回的显示名称（admin2 或 admin1）
   * - admin1_zh/en: 一级行政区中英文
   * - admin2_zh/en: 二级行政区中英文
   * - country_code: 国家代码
   * - latitude, longitude: 坐标
   * - data_source: 数据来源
   */
  async getLocationDetail(locationId, language = 'zh') {
    if (!locationId || typeof locationId !== 'string') {
      logger.warn('getLocationDetail: locationId 无效', { locationId });
      return null;
    }

    try {
      // 先从缓存中查找（服务已在应用启动时初始化）
      let locationDetail = null;
      if (locationStorageService.locationDetailsCache && locationStorageService.locationDetailsCache.has(locationId)) {
        locationDetail = locationStorageService.locationDetailsCache.get(locationId);
      } else {
        // 缓存未命中，从数据库查询
        locationDetail = await locationStorageService.storage.getLocationDetail(locationId);
        
        // 如果找到，更新缓存
        if (locationDetail && locationDetail.location_id) {
          locationStorageService.locationDetailsCache.set(locationDetail.location_id, locationDetail);
        }
      }

      if (!locationDetail) {
        logger.debug(`getLocationDetail: 未找到位置信息，locationId=${locationId}`);
        return null;
      }

      const nameZh = locationDetail.admin2_zh || locationDetail.admin1_zh;
      const nameEn = locationDetail.admin2_en || locationDetail.admin1_en;
      const displayName = language === 'en' ? (nameEn || nameZh || '') : (nameZh || nameEn || '');

      return {
        location_id: locationDetail.location_id,
        name: displayName,
        admin1_zh: locationDetail.admin1_zh || null,
        admin1_en: locationDetail.admin1_en || null,
        admin2_zh: locationDetail.admin2_zh || null,
        admin2_en: locationDetail.admin2_en || null,
        country_code: locationDetail.country_code || null,
        latitude: locationDetail.latitude || null,
        longitude: locationDetail.longitude || null,
        data_source: locationDetail.data_source || null,
        created_at: locationDetail.created_at || null,
        updated_at: locationDetail.updated_at || null
      };
    } catch (error) {
      logger.error('getLocationDetail: 获取位置详情失败', { locationId, language, error });
      return null;
    }
  }

  /**
   * 根据 location_id 获取格式化的位置信息字符串
   * @param {string} locationId - 位置ID
   * @param {string} language - 语言设置 ('zh' 或 'en')，默认为 'zh'
   * @returns {Promise<string|null>} 格式化的位置信息字符串，如果未找到则返回 null
   * 
   * 返回格式示例：
   * - 中文：济南市, 历城区, 山东省, CN
   * - 英文：Jinan, Licheng District, Shandong Province, CN
   */
  /**
   * 根据 location_id 获取格式化的位置信息字符串
   * @param {string} locationId - 位置ID
   * @param {string} language - 语言设置 ('zh' 或 'en')，默认为 'zh'
   * @returns {Promise<string|null>} 格式化的位置信息字符串，如果未找到则返回 null
   * 
   * 返回格式示例：
   * - 中文：济南, 历城区, 山东省, 中国
   * - 英文：Jinan, Licheng District, Shandong Province, China
   */
  async getLocationDetailString(locationId, language = 'zh') {
    const detail = await this.getLocationDetail(locationId, language);
    if (!detail) {
      return null;
    }

    const parts = [];
    const admin2 = detail.admin2_zh || detail.admin2_en;
    const admin1 = detail.admin1_zh || detail.admin1_en;

    if (admin2 && admin2.trim() !== '') {
      parts.push(admin2);
    }
    if (admin1 && admin1.trim() !== '' && admin1 !== 'unknown' && admin1 !== admin2) {
      parts.push(admin1);
    }

    // 国家名称（翻译后的）
    if (detail.country_code && detail.country_code.trim() !== '') {
      const countryName = getCountryName(detail.country_code, language);
      parts.push(countryName);
    }
    
    return parts.length > 0 ? parts.join(', ') : null;
  }

  /**
   * 根据坐标查找最近的城市（单个，兼容旧接口）
   * @param {number} latitude - 纬度
   * @param {number} longitude - 经度
   * @param {number} maxDistance - 最大搜索距离(公里)，已废弃，保留兼容性
   * @param {boolean} useRemoteApi - 是否使用远程API，已废弃，保留兼容性
   * @param {string} language - 语言设置 ('zh' 或 'en')，默认为 'zh'
   * @returns {Promise<Object|null>} 城市信息对象或null
   */
  async findNearestCityAsync(latitude, longitude, maxDistance = 200, useRemoteApi = true, language = 'zh') {
    const results = await this.getLocationsBatch([{
      latitude,
      longitude
    }], { language, skipRemote: !useRemoteApi });

    if (results.length > 0 && results[0].success) {
      return results[0].city;
    }

    return null;
  }

  /**
   * 标准化城市名称（去除行政区划后缀，用于展示）
   * 与后端 _normalize_place_name 一致
   * @param {string} cityName - 原始城市名称
   * @returns {string} 标准化后的城市名称
   */
  normalizeCityName(cityName) {
    if (!cityName || typeof cityName !== 'string') return cityName;
    let s = cityName.trim();
    if (!s) return cityName;
    // 中文 ≤2 字不处理（如 北区、东区）
    const hasChinese = /[\u4e00-\u9fff]/.test(s);
    if (hasChinese && s.length <= 2) return s;
    const suffixesZh = ['特别行政区', '自治区', '直辖市', '地区', '市', '省', '县', '区', '州', '盟'];
    const suffixesEn = [' Special Administrative Region', ' Autonomous Region', ' Province', ' City', ' District', ' County', ' Prefecture', ' Region'];
    if (hasChinese) {
      for (const suffix of suffixesZh) {
        if (s.endsWith(suffix) && s.length > suffix.length) {
          return s.slice(0, -suffix.length).trim();
        }
      }
    } else {
      for (const suffix of suffixesEn) {
        if (s.length > suffix.length && s.toLowerCase().endsWith(suffix.toLowerCase())) {
          return s.slice(0, -suffix.length).trim();
        }
      }
    }
    return s;
  }

  /**
   * 标准化坐标精度（保留4位小数）
   * @param {number} coord - 坐标值
   * @returns {number} 标准化后的坐标
   */
  normalizeCoordinate(coord) {
    return Math.round(coord * 10000) / 10000;
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
   * 测试API连接（用于诊断问题）
   * 在浏览器控制台中调用：cityLocationService.testAPIConnection()
   */
  async testAPIConnection() {
    const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.nearestCities}`;
    const testCoordinates = [{
      id: 'test_001',
      latitude: 39.9042,
      longitude: 116.4074
    }];
    
    logger.info('🧪 开始测试API连接...', {
      url: url,
      testCoordinates: testCoordinates
    });
    
    try {
      // 测试1: 简单GET请求（健康检查）
      try {
        const healthUrl = `${this.apiConfig.baseURL}/api/v2/health`;
        logger.info('🧪 测试1: 健康检查端点...', { url: healthUrl });
        const healthResponse = await fetch(healthUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        logger.info('✅ 健康检查成功:', {
          status: healthResponse.status,
          statusText: healthResponse.statusText,
          ok: healthResponse.ok
        });
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          logger.info('📥 健康检查响应数据:', healthData);
        }
      } catch (healthError) {
        logger.error('❌ 健康检查失败:', {
          errorName: healthError.name,
          errorMessage: healthError.message,
          errorStack: healthError.stack
        });
      }
      
      // 测试2: POST请求（位置查询）
      logger.info('🧪 测试2: 位置查询端点...', { url: url });
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          coordinates: testCoordinates
        })
      });
      
      logger.info('📥 收到响应:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries())
      });
      
      if (!response.ok) {
        let errorBody = null;
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorBody = await response.json();
          } else {
            errorBody = await response.text();
          }
        } catch (e) {
          logger.warn('⚠️ 无法读取错误响应体:', e.message);
        }
        
        logger.error('❌ 服务器返回错误:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorBody
        });
        return { success: false, error: `HTTP ${response.status}: ${response.statusText}`, errorBody };
      }
      
      const data = await response.json();
      logger.info('✅ API连接测试成功:', {
        success: data.success,
        resultsCount: data.results?.length || 0
      });
      
      return { success: true, data };
      
    } catch (error) {
      logger.error('❌ API连接测试失败:', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack,
        url: url,
        possibleCauses: [
          'CORS策略阻止了请求（检查服务器CORS配置）',
          '网络连接失败（检查网络连接）',
          'DNS解析失败（检查域名是否正确）',
          '服务器不可达（检查服务器是否运行）',
          'SSL证书问题（检查HTTPS配置）'
        ]
      });
      return { success: false, error: error.message, errorName: error.name };
    }
  }
}

// 创建单例实例
const cityLocationService = new CityLocationService();

// 导出测试方法到全局（方便在浏览器控制台中调用）
if (typeof window !== 'undefined') {
  window.testLocationAPI = () => cityLocationService.testAPIConnection();
}

export default cityLocationService;
