/**
 * MediaStoreService - Android MediaStore API 的 JavaScript 接口层
 * 
 * 功能：
 * 1. 获取相册中的照片清单（支持分页）
 * 2. 提取照片的EXIF信息（包括拍摄时间和GPS坐标）
 * 3. 批量提取EXIF信息（性能优化）
 * 
 * 优势：
 * - 比文件系统遍历更快（使用系统索引）
 * - 符合Android 10+ Scoped Storage规范
 * - 自动过滤无效的图片文件
 * - 支持增量更新
 */

import { NativeModules, Platform } from 'react-native';
import { logger } from '../adapters/WebAdapters';

const { MediaStoreModule } = NativeModules;

class MediaStoreService {
  constructor() {
    this.isAvailable = Platform.OS === 'android' && MediaStoreModule != null;
    
    if (!this.isAvailable) {
      // WEB 环境下不输出警告（这是正常的），只在 Android 环境下输出警告
      if (Platform.OS === 'android') {
        logger.warn('⚠️ MediaStoreModule 不可用，可能是在非Android平台或模块未正确注册');
      } else {
        logger.debug('MediaStoreModule 不可用（非Android平台，这是正常的）');
      }
    } else {
      logger.info('✅ MediaStoreService 初始化成功');
    }
  }

  /**
   * 检查MediaStore是否可用
   * @returns {boolean}
   */
  checkAvailability() {
    return this.isAvailable;
  }

  /**
   * 获取外部存储根目录路径
   * @returns {Promise<string>} 外部存储根目录路径
   */
  async getExternalStoragePath() {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }
    return await MediaStoreModule.getExternalStoragePath();
  }

  /**
   * 获取所有图片清单
   * @param {Object} options - 选项
   * @param {number} options.limit - 限制返回数量，0表示不限制（默认：0）
   * @param {number} options.offset - 偏移量，用于分页（默认：0）
   * @returns {Promise<{images: Array, count: number, offset: number, hasMore: boolean}>}
   */
  async getAllImages(options = {}) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    const { limit = 0, offset = 0 } = options;

    try {
      logger.debug(`📱 MediaStore: 开始获取图片清单 (limit=${limit}, offset=${offset})`);
      const startTime = Date.now();

      const result = await MediaStoreModule.getAllImages(limit, offset);

      const duration = Date.now() - startTime;
      logger.info(`✅ MediaStore: 获取了 ${result.count} 张图片，耗时 ${duration}ms`);

      return result;
    } catch (error) {
      logger.error('❌ MediaStore: 获取图片清单失败', error);
      throw error;
    }
  }

  /**
   * 获取指定时间之后的图片清单（用于查询新发现的照片）
   * @param {Object} options - 选项
   * @param {number} options.sinceTime - 起始时间戳（毫秒），查询 DATE_TAKEN >= sinceTime 的图片
   * @param {number} options.limit - 限制返回数量，0表示不限制（默认：0）
   * @param {number} options.offset - 偏移量，用于分页（默认：0）
   * @returns {Promise<{images: Array, count: number, offset: number, hasMore: boolean}>}
   */
  async getImagesSinceTime(options = {}) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    const { sinceTime, limit = 0, offset = 0 } = options;

    if (!sinceTime || typeof sinceTime !== 'number') {
      throw new Error('sinceTime 参数必须是一个有效的时间戳（毫秒）');
    }

    try {
      logger.debug(`📱 MediaStore: 开始获取指定时间之后的图片清单 (sinceTime=${new Date(sinceTime).toISOString()}, limit=${limit}, offset=${offset})`);
      const startTime = Date.now();

      const result = await MediaStoreModule.getImagesSinceTime(sinceTime, limit, offset);

      const duration = Date.now() - startTime;
      logger.info(`✅ MediaStore: 获取了 ${result.count} 张新照片，耗时 ${duration}ms`);

      return result;
    } catch (error) {
      logger.error('❌ MediaStore: 获取指定时间之后的图片清单失败', error);
      throw error;
    }
  }

  /**
   * 分批获取所有图片（避免一次性加载过多数据）
   * @param {number} batchSize - 每批大小（默认：500）
   * @param {Function} onBatch - 每批数据回调 (images, batchNumber, totalCount) => void
   * @returns {Promise<Array>} 所有图片数组
   */
  async getAllImagesInBatches(batchSize = 500, onBatch = null) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    const allImages = [];
    let offset = 0;
    let batchNumber = 1;
    let hasMore = true;

    logger.info(`📱 MediaStore: 开始分批获取图片，批次大小=${batchSize}`);

    while (hasMore) {
      try {
        const result = await this.getAllImages({ limit: batchSize, offset });

        if (result.images && result.images.length > 0) {
          allImages.push(...result.images);

          if (onBatch) {
            onBatch(result.images, batchNumber, allImages.length);
          }

          logger.debug(`📦 批次 ${batchNumber}: 获取 ${result.images.length} 张图片，累计 ${allImages.length} 张`);
        }

        hasMore = result.hasMore;
        offset += batchSize;
        batchNumber++;

        // 避免过快请求，给系统一些喘息时间
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }

      } catch (error) {
        logger.error(`❌ 批次 ${batchNumber} 获取失败:`, error);
        break;
      }
    }

    logger.info(`✅ MediaStore: 分批获取完成，共 ${allImages.length} 张图片`);
    return allImages;
  }

  /**
   * 提取单张图片的EXIF信息
   * @param {string} uri - 图片URI (content://media/... 格式)
   * @returns {Promise<Object>} EXIF数据
   * 返回格式：
   * {
   *   takenTime: number,        // 拍摄时间戳（毫秒）
   *   hasGPS: boolean,          // 是否有GPS信息
   *   gps: {                    // GPS信息（如果有）
   *     latitude: number,
   *     longitude: number,
   *     altitude: number
   *   },
   *   width: number,            // 图片宽度
   *   height: number,           // 图片高度
   *   make: string,             // 相机厂商
   *   model: string             // 相机型号
   * }
   */
  async getImageExif(uri) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    try {
      const exifData = await MediaStoreModule.getImageExif(uri);
      return exifData;
    } catch (error) {
      logger.error(`❌ MediaStore: 提取EXIF失败 (uri=${uri})`, error);
      throw error;
    }
  }

  /**
   * 批量提取EXIF信息（性能优化版本）
   * @param {Array<string>} uris - 图片URI数组
   * @returns {Promise<{results: Array, successCount: number, failCount: number, total: number}>}
   */
  async batchGetImageExif(uris) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    if (!Array.isArray(uris) || uris.length === 0) {
      return {
        results: [],
        successCount: 0,
        failCount: 0,
        total: 0
      };
    }

    try {
      logger.debug(`📱 MediaStore: 开始批量提取 ${uris.length} 张图片的EXIF`);
      const startTime = Date.now();

      // 将数组转换为JSON字符串传递给原生模块
      const uriArrayString = JSON.stringify(uris);
      const result = await MediaStoreModule.batchGetImageExif(uriArrayString);

      const duration = Date.now() - startTime;
      logger.info(`✅ MediaStore: 批量EXIF提取完成，成功=${result.successCount}, 失败=${result.failCount}, 耗时=${duration}ms`);

      return result;
    } catch (error) {
      logger.error('❌ MediaStore: 批量提取EXIF失败', error);
      throw error;
    }
  }

  /**
   * 根据文件路径查询MediaStore URI
   * @param {string} filePath - 文件路径
   * @returns {Promise<string|null>} MediaStore URI 或 null
   */
  async getUriByPath(filePath) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    try {
      const uri = await MediaStoreModule.getUriByPath(filePath);
      return uri;
    } catch (error) {
      logger.error(`❌ MediaStore: 根据路径查询URI失败 (path=${filePath})`, error);
      throw error;
    }
  }

  /**
   * 删除文件（通过MediaStore）
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 是否成功删除
   */
  async deleteFile(filePath) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    try {
      const result = await MediaStoreModule.deleteFile(filePath);
      return result;
    } catch (error) {
      logger.debug(`🔍 MediaStore: 删除文件失败 (path=${filePath})`, error);
      // 抛出错误而不是静默返回false
      throw new Error(`删除文件失败: ${error.message}`);
    }
  }

  /**
   * 获取文件信息
   * @param {string} filePath - 文件路径
   * @returns {Promise<Object>} 文件信息
   */
  async getFileInfo(filePath) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    try {
      const fileInfo = await MediaStoreModule.getFileInfo(filePath);
      return fileInfo;
    } catch (error) {
      logger.error(`❌ MediaStore: 获取文件信息失败 (path=${filePath})`, error);
      throw error;
    }
  }

  /**
   * 转换MediaStore时间戳（处理微秒时间戳问题）
   * @param {number} timestamp - MediaStore返回的时间戳
   * @returns {number} 转换后的毫秒时间戳
   */
  convertMediaStoreTimestamp(timestamp) {
    if (!timestamp || typeof timestamp !== 'number') {
      return null;
    }
    
    // 调试日志：检查MediaStore时间戳
    if (timestamp > 9999999999999) {
      logger.debug(`🔍 MediaStore时间戳检测: 原始值=${timestamp}, 可能是微秒时间戳`);
    }
    
    // 检查是否是微秒级时间戳（大于13位数字）
    if (timestamp > 9999999999999) {
      const convertedTimestamp = Math.floor(timestamp / 1000); // 转换为毫秒级
      logger.debug(`🔍 MediaStore时间戳转换: ${timestamp} -> ${convertedTimestamp}, 日期: ${new Date(convertedTimestamp).toISOString()}`);
      return convertedTimestamp;
    }

    // 兼容秒级时间戳（10位左右）
    if (timestamp > 0 && timestamp < 100000000000) {
      return timestamp * 1000;
    }
    
    return timestamp;
  }

  /**
   * 将MediaStore图片数据转换为兼容格式（与RNFS扫描格式一致）
   * @param {Object} mediaStoreImage - MediaStore返回的图片对象
   * @returns {Object} 兼容格式的图片对象
   */
  convertToCompatibleFormat(mediaStoreImage) {
    const contentUri = mediaStoreImage.uri; // content://media/external/images/media/67129
    
    // 原生模块已经处理了优先级逻辑：优先使用绝对路径（DATA），如果为空则使用相对路径（RELATIVE_PATH）
    // 所以这里直接使用path字段即可，不需要再判断relativePath
    const path = (mediaStoreImage.path && mediaStoreImage.path.trim()) ? mediaStoreImage.path : null;
    
    // 拼装URI：如果有path，拼装成contentUri||path格式
    // 如果没有path，只存储contentUri
    let uri;
    if (path && path.trim()) {
      uri = `${contentUri}||${path}`;
    } else {
      uri = contentUri;
    }
    
    const result = {
      uri: uri,  // contentUri||path 或 contentUri
      fileName: mediaStoreImage.fileName,
      size: mediaStoreImage.size,
      timestamp: this.convertMediaStoreTimestamp(mediaStoreImage.dateTaken || mediaStoreImage.dateModified || mediaStoreImage.dateAdded),
      width: mediaStoreImage.width,
      height: mediaStoreImage.height,
      mimeType: mediaStoreImage.mimeType,
      // 元数据标记
      source: 'mediastore'
    };
    
    return result;
  }

  /**
   * 批量转换为兼容格式
   * @param {Array} mediaStoreImages - MediaStore图片数组
   * @returns {Array} 兼容格式的图片数组
   */
  convertBatchToCompatibleFormat(mediaStoreImages) {
    return mediaStoreImages.map(img => this.convertToCompatibleFormat(img));
  }

  /**
   * 批量计算文件哈希（原生多线程）
   * @param {Array<string>} filePaths - 文件路径数组
   * @returns {Promise<{results: Array, successCount: number, failCount: number, total: number, duration: number}>}
   */
  async batchCalculateFileHash(filePaths) {
    if (!this.isAvailable) {
      throw new Error('MediaStore 不可用');
    }

    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      return {
        results: [],
        successCount: 0,
        failCount: 0,
        total: 0,
        duration: 0
      };
    }

    try {
      logger.debug(`📱 MediaStore: 开始原生多线程哈希计算 ${filePaths.length} 个文件`);
      const startTime = Date.now();

      // 将JS数组转换为ReadableArray格式
      const result = await MediaStoreModule.batchCalculateFileHash(filePaths);

      const duration = Date.now() - startTime;
      logger.info(`✅ MediaStore: 原生多线程哈希计算完成，成功=${result.successCount}, 失败=${result.failCount}, 耗时=${result.duration}ms (总耗时=${duration}ms)`);

      return result;
    } catch (error) {
      logger.error('❌ MediaStore: 批量哈希计算失败', error);
      throw error;
    }
  }
}

// 导出单例
const mediaStoreService = new MediaStoreService();
export default mediaStoreService;
