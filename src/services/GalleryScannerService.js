// 导入WebAdapters统一适配器
import { 
  logger, 
  readImageFileAsBlob, 
  normalizeFilePath, 
  readFileForExif, 
  getFileStats,
  RNFS,
  Platform  // 🆕 使用统一的Platform对象
} from '../adapters/WebAdapters';

import ImageClassifierService from './ImageClassifierService';

import cityLocationService from './CityLocationService';



// 默认位置信息结构

const createDefaultLocationInfo = (source = 'none') => ({

  latitude: null,

  longitude: null,

  altitude: null,

  accuracy: null,

  address: null,

  city: null,

  country: null,

  province: null,

  district: null,

  street: null,

  source

});



// 从exif-parser数据中提取GPS信息

const extractGPSFromExifParser = async (exifData, fileName = '', useRemoteApi = true) => {
  if (!exifData?.tags) {
    return null;
  }

  const { GPSLatitude, GPSLongitude, GPSAltitude, GPSHPositioningError } = exifData.tags;

  if (!GPSLatitude || !GPSLongitude) {
    return null;
  }

  // 查找最近的城市信息（根据远程服务状态决定是否使用远程API）
  const nearestCity = await cityLocationService.findNearestCityAsync(GPSLatitude, GPSLongitude, 200, useRemoteApi);

  // GPS处理完成，不输出正常日志

  

  return {

    latitude: GPSLatitude,

    longitude: GPSLongitude,

    altitude: GPSAltitude || null,

    accuracy: GPSHPositioningError || null,

    source: 'exif-parser',

    // 添加城市信息

    city: nearestCity?.name || null,

    province: nearestCity?.province || null,

    cityDistance: nearestCity?.distance || null

  };

};



// 从react-native-exif数据中提取GPS信息

const extractGPSFromNativeExif = async (exifData, fileName = '', useRemoteApi = true) => {

  if (!exifData?.GPSLatitude || !exifData?.GPSLongitude) return null;

  

  const latitude = parseFloat(exifData.GPSLatitude);

  const longitude = parseFloat(exifData.GPSLongitude);

  

  // 查找最近的城市信息（根据远程服务状态决定是否使用远程API）
  const nearestCity = await cityLocationService.findNearestCityAsync(latitude, longitude, 200, useRemoteApi);

  // GPS处理完成，不输出正常日志

  return {

    latitude,

    longitude,

    altitude: exifData.GPSAltitude ? parseFloat(exifData.GPSAltitude) : null,

    accuracy: exifData.GPSHPositioningError ? parseFloat(exifData.GPSHPositioningError) : null,

    source: 'react-native-exif',

    // 添加城市信息

    city: nearestCity?.name || null,

    province: nearestCity?.province || null,

    cityDistance: nearestCity?.distance || null

  };

};



// 使用exif-parser库提取GPS信息

const tryExifParser = async (filePath) => {

  try {

    const ExifParser = require('exif-parser');

    const arrayBuffer = await readFileForExif(filePath);

    const parser = ExifParser.create(arrayBuffer);

    const exifData = parser.parse();

    

    return await extractGPSFromExifParser(exifData, fileName, useRemoteApi);

  } catch (error) {

    // exif-parser failed

    return null;

  }

};



// 使用react-native-exif库提取GPS信息

const tryNativeExif = async (normalizedPath) => {

  try {

    const RNExif = eval('require("react-native-exif")');

    const exifData = await RNExif.getExif(normalizedPath);

    

    return await extractGPSFromNativeExif(exifData, fileName, useRemoteApi);

  } catch (error) {

    return null;

  }

};



// 合并函数：一次读取文件同时提取拍照时间和GPS信息

const extractExifData = async (filePath, useRemoteApi = true) => {

  try {
    // 提取文件名用于日志显示
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;

    // 1. 环境检测

    if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.require) {

      return {

        takenTime: null,

        locationInfo: createDefaultLocationInfo('web_unsupported')

      };

    }

    

    // 2. 路径标准化和文件验证

    const normalizedPath = normalizeFilePath(filePath);

    await getFileStats(normalizedPath); // 验证文件存在

    

    // 3. 尝试exif-parser库

    try {

      const ExifParser = require('exif-parser');

      const arrayBuffer = await readFileForExif(filePath);

      const parser = ExifParser.create(arrayBuffer);

      const exifData = parser.parse();

      

      // 提取拍照时间

      let takenTime = null;

      if (exifData && exifData.tags && exifData.tags.DateTimeOriginal) {

        takenTime = new Date(exifData.tags.DateTimeOriginal * 1000).getTime();

      } else if (exifData && exifData.tags && exifData.tags.DateTime) {

        takenTime = new Date(exifData.tags.DateTime * 1000).getTime();

      }

      

      // 提取GPS信息
      const gpsInfo = await extractGPSFromExifParser(exifData, fileName, useRemoteApi);

      const locationInfo = gpsInfo ? { ...createDefaultLocationInfo(), ...gpsInfo } : createDefaultLocationInfo('none');

      // 提取图片尺寸信息（优先使用 EXIF 中的尺寸）
      let imageDimensions = {
        width: exifData.imageSize?.width || null,
        height: exifData.imageSize?.height || null
      };

      // 如果 EXIF 中没有尺寸信息，使用 ImageProcessor 获取
      if (!imageDimensions.width || !imageDimensions.height) {
        try {
          const imageProcessor = require('../services/ImageProcessor').default || require('../services/ImageProcessor');
          // 确保使用 file:// 格式的 URI
          const imageUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          const dimensions = await imageProcessor.getImageDimensions(imageUri);
          if (dimensions) {
            imageDimensions = {
              width: dimensions.width,
              height: dimensions.height
            };
            logger.debug(`✅ 通过 ImageProcessor 获取图片尺寸: ${dimensions.width}×${dimensions.height}`);
          }
        } catch (error) {
          logger.warn(`⚠️ ImageProcessor 获取尺寸失败: ${error.message}`);
        }
      }

      return { takenTime, locationInfo, imageDimensions };

      

    } catch (parseError) {

      // 4. 尝试react-native-exif库

      try {

        const RNExif = eval('require("react-native-exif")');

        const exifData = await RNExif.getExif(normalizedPath);

        

        // 提取拍照时间

        let takenTime = null;

        if (exifData && exifData.DateTimeOriginal) {

          const dateTimeStr = exifData.DateTimeOriginal;

          const [datePart, timePart] = dateTimeStr.split(' ');

          const [year, month, day] = datePart.split(':');

          const [hour, minute, second] = timePart.split(':');

          

          takenTime = new Date(

            parseInt(year),

            parseInt(month) - 1, 

            parseInt(day),

            parseInt(hour),

            parseInt(minute),

            parseInt(second)

          ).getTime();

        } else if (exifData && exifData.DateTime) {

          const dateTimeStr = exifData.DateTime;

          const [datePart, timePart] = dateTimeStr.split(' ');

          const [year, month, day] = datePart.split(':');

          const [hour, minute, second] = timePart.split(':');

          

          takenTime = new Date(

            parseInt(year),

            parseInt(month) - 1, 

            parseInt(day),

            parseInt(hour),

            parseInt(minute),

            parseInt(second)

          ).getTime();

        }

        

        // 提取GPS信息
        const gpsInfo = await extractGPSFromNativeExif(exifData, fileName, useRemoteApi);

        const locationInfo = gpsInfo ? { ...createDefaultLocationInfo(), ...gpsInfo } : createDefaultLocationInfo('none');

        // 提取图片尺寸信息
        let imageDimensions = {
          width: exifData.PixelXDimension || exifData.ImageWidth || null,
          height: exifData.PixelYDimension || exifData.ImageLength || null
        };

        // 如果 EXIF 中没有尺寸信息，使用 ImageProcessor 获取
        if (!imageDimensions.width || !imageDimensions.height) {
          try {
            const imageProcessor = require('../services/ImageProcessor').default || require('../services/ImageProcessor');
            // 确保使用 file:// 格式的 URI
            const imageUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
            const dimensions = await imageProcessor.getImageDimensions(imageUri);
            if (dimensions) {
              imageDimensions = {
                width: dimensions.width,
                height: dimensions.height
              };
              logger.debug(`✅ 通过 ImageProcessor 获取图片尺寸: ${dimensions.width}×${dimensions.height}`);
            }
          } catch (error) {
            logger.warn(`⚠️ ImageProcessor 获取尺寸失败: ${error.message}`);
          }
        }

        return { takenTime, locationInfo, imageDimensions };

        

      } catch (nativeError) {

        // 即使 EXIF 读取失败，也尝试用 ImageProcessor 获取尺寸
        let imageDimensions = { width: null, height: null };
        try {
          const imageProcessor = require('../services/ImageProcessor').default || require('../services/ImageProcessor');
          // 确保使用 file:// 格式的 URI
          const imageUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
          const dimensions = await imageProcessor.getImageDimensions(imageUri);
          if (dimensions) {
            imageDimensions = {
              width: dimensions.width,
              height: dimensions.height
            };
            logger.debug(`✅ EXIF失败，通过 ImageProcessor 获取图片尺寸: ${dimensions.width}×${dimensions.height}`);
          }
        } catch (error) {
          logger.warn(`⚠️ ImageProcessor 获取尺寸失败: ${error.message}`);
        }

        return {

          takenTime: null,

          locationInfo: createDefaultLocationInfo('none'),

          imageDimensions

        };

      }

    }

    

  } catch (error) {

    logger.error(`EXIF extraction failed:`, error);

    return {

      takenTime: null,

      locationInfo: null

    };

  }

};



// 保持向后兼容的单独函数

const extractLocationInfo = async (filePath, useRemoteApi = true) => {

  const result = await extractExifData(filePath, useRemoteApi);

  return result.locationInfo;

};



const extractTakenTime = async (filePath, useRemoteApi = true) => {

  const result = await extractExifData(filePath, useRemoteApi);

  return result.takenTime;

};



import UnifiedDataService from './UnifiedDataService';
import ParallelHashCalculator from './ParallelHashCalculator.js';
import configService from './ConfigService.js';
import ImageSimilarityService from './ImageSimilarityService.js';


class GalleryScannerService {

  constructor() {

    this.isInitialized = false;

    this.imageClassifier = new ImageClassifierService();
    
    // 初始化并行哈希计算器
    this.parallelHashCalculator = new ParallelHashCalculator(4); // 使用4个Worker

    // 初始化相似度检测服务
    this.similarityService = new ImageSimilarityService();

    this.galleryPaths = [];
    
    // 用于跟踪上次的进度消息，避免重复发送
    this.lastProgressMessage = null;
  }




  async initialize() {

    if (this.isInitialized) return;

    

    try {

      // 从UnifiedDataService获取配置
      const settings = await UnifiedDataService.readSettings();
      this.galleryPaths = settings.scanPaths || [];
      
      // 初始化相似度检测服务
      await this.similarityService.initialize();
      
      // 不再处理权限，假设权限已经在APP级别处理
      this.isInitialized = true;

      // Gallery scanner service initialized successfully

    } catch (error) {

      logger.error('Gallery scanner service initialization failed:', error);

      throw error;

    }

  }







  // 核心扫描接口 - 统一的扫描方法
  // 处理扫描进度数据，生成用户友好的提示信息
  processProgressData(rawProgress) {
    const { stage, current, total, message, filesFound, filesProcessed, filesFailed, stageProgress, scanStartTime } = rawProgress;
    
    let simpleMessage = '';
    
    // 根据阶段生成简单的提示信息
    switch (stage) {
      case 'initializing':
        simpleMessage = '初始化扫描: 准备扫描环境';
        break;
        
      case 'directory_scanning':
        // message 就是目录名（来自 sendProgressMessage 的 extraInfo 参数）
        const dirName = message || '扫描中';
        // 如果还没有发现照片，只显示目录名；否则显示发现数量
        if (filesFound && filesFound > 0) {
          simpleMessage = `扫描目录: ${dirName} | 发现: ${filesFound} 张照片`;
        } else {
          simpleMessage = `扫描目录: ${dirName}`;
        }
        break;
        
      case 'file_comparison':
        const totalFiles = filesFound || 0;
        simpleMessage = `照片比对: 正在分析 ${totalFiles} 张照片，查找新增和已删除的照片`;
        break;
        
      case 'screenshot_detection':
        if (message && message !== 'screenshot_detection') {
          simpleMessage = message;
        } else {
          simpleMessage = `开始检测手机截图: ${filesFound || 0} 张照片`;
        }
        break;
        
      case 'remote_inference':
        if (message && message !== 'remote_inference') {
          simpleMessage = message;
        } else {
          simpleMessage = `开始照片快速智能识别: ${filesFound || 0} 张照片`;
        }
        break;
        
      case 'local_inference':
        if (message && message !== 'local_inference') {
          simpleMessage = message;
        } else {
          simpleMessage = `开始本地智能识别照片: ${filesFound || 0} 张照片`;
        }
        break;
        
      case 'processing_images':
        // 从extraInfo中提取当前处理的文件名
        const currentFile = message.includes('正在处理:') ? message.split('正在处理: ')[1] : '';
        if (currentFile) {
          simpleMessage = `正在处理: ${currentFile}`;
        } else {
          simpleMessage = `处理新增照片: ${filesProcessed || 0}/${filesFound || 0} | 失败: ${filesFailed || 0}`;
        }
        break;
        
      case 'removing_files':
        simpleMessage = `移除已删除照片: ${filesProcessed || 0} 张`;
        break;
        
      case 'similarity_detection':
        // 从extraInfo中提取相似度检测信息
        const similarityInfo = message.includes(':') ? message.split(': ')[1] : message;
        simpleMessage = `相似度检测: ${similarityInfo}`;
        break;
        
      case 'cache_checking':
        if (message && message !== 'cache_checking') {
          simpleMessage = message;
        } else {
          const cacheHits = filesProcessed || 0;
          const totalCacheFiles = filesFound || 0;
          if (cacheHits > 0) {
            simpleMessage = `智能分类查询: 命中 ${cacheHits} 张，共 ${totalCacheFiles} 张照片`;
          } else {
            simpleMessage = `开始智能分类查询: ${totalCacheFiles} 张照片`;
          }
        }
        break;
        
      case 'completed':
        simpleMessage = `扫描完成: 处理了 ${filesProcessed || 0} 张照片`;
        break;
        
      default:
        simpleMessage = message || '处理中...';
    }
    
    return {
      stage,
      message: simpleMessage,
      isComplete: stage === 'completed'
    };
  }

  async scanGalleryWithProgress(onProgress = null) {
    try {
      logger.debug('Starting full scan of local gallery...');
      
      // 确保使用最新的配置
      const settings = await UnifiedDataService.readSettings();
      this.galleryPaths = settings.scanPaths || [];
      
      const scanStartTime = new Date().toLocaleTimeString();

      // 使用独立扫描线程方案，避免阻塞UI
      return await this.scanWithIndependentThread(this.galleryPaths, onProgress, scanStartTime);
    } catch (error) {
      logger.error('Full scan failed:', error);
      throw error;
    }
  }

      



  // 优化的扫描函数，只返回URI和基本信息，用于双Set比对

  async scanDirectoryForUris(dirPath, onProgress = null, totalFoundSoFar = 0) {
    try {

      logger.debug(`Starting optimized scan of directory: ${dirPath}`);

      

      const exists = await RNFS.exists(dirPath);

      if (!exists) {

        logger.debug(`Directory does not exist: ${dirPath}`);

        return [];

      }

      

      const items = await RNFS.readDir(dirPath);

      const images = [];

      let imageCount = 0;

      let dirCount = 0;

      const processedUris = new Set(); // 跟踪已处理的URI，避免重复

      

      logger.debug(`📁 目录 ${dirPath} 包含 ${items.length} 个项目`);

      

      for (let i = 0; i < items.length; i++) {

        const item = items[i];
        
        // 调试：显示每个文件的处理过程
        if (!item.isDirectory()) {
          const isImage = this.isImageFile(item.name);
          // 检查文件是否为图片
        }

        // 每处理200个文件就更新进度并让出主进程控制权
        if (i % 200 === 0) {
          // 更新进度信息（只有在发现图片时才发送进度消息）
          if (onProgress && imageCount > 0) {
            onProgress({

              current: 0,

              total: 0,

              message: `directory_scanning: ${dirPath.split('/').pop() || dirPath.split('\\').pop()}`,

              filesFound: totalFoundSoFar + imageCount,
              filesProcessed: 0,

              filesFailed: 0

            });

          }

          

          // 在更新进度后让出主进程控制权

          await new Promise(resolve => setTimeout(resolve, 0));

        }

        

        if (item.isDirectory()) {

          dirCount++;

          const subImages = await this.scanDirectoryForUris(item.path, onProgress, totalFoundSoFar + imageCount);
          images.push(...subImages);

        } else if (this.isImageFile(item.name)) {

          // 规范化路径：将反斜杠转换为正斜杠（Windows路径兼容）
          const normalizedPath = item.path.replace(/\\/g, '/');

          const fileUri = Platform.OS === 'web' 

            ? `file:///${normalizedPath}` 

            : `file://${normalizedPath}`;

          

          // 检查是否已经处理过这个URI

          if (processedUris.has(fileUri)) {

            // 发现重复URI，跳过

            continue;

          }

          processedUris.add(fileUri);

          
          imageCount++;
          

          // 调试信息：每1000个文件输出一次

          if (imageCount % 1000 === 0) {

            // 已发现图片文件

          }

          

          try {

            const stats = await RNFS.stat(item.path);

            

            const mtime = stats.mtime ? new Date(stats.mtime).getTime() : null;

            const ctime = stats.ctime ? new Date(stats.ctime).getTime() : null;

            const currentTime = Date.now();

            const fileTime = ctime || mtime || currentTime;

            

            // 目录扫描阶段只收集基本信息，不提取EXIF数据
            
            // 验证必要字段
            if (!item.path) {
              // 使用静态计数器限制错误日志数量，避免大量输出
              if (!this.invalidPathCount) this.invalidPathCount = 0;
              this.invalidPathCount++;
              
              if (this.invalidPathCount <= 5) { // 只记录前5个错误
                logger.error('❌ 发现没有路径的文件项:', {
                  name: item.name,
                  dirPath: dirPath,
                  count: this.invalidPathCount
                });
              } else if (this.invalidPathCount === 6) {
                logger.error('❌ 发现更多没有路径的文件项，后续错误将不再记录...');
              }
              continue; // 跳过这个无效的文件项
            }

            const imageData = {

              uri: fileUri,

              fileName: item.name,

              size: stats.size,

              timestamp: fileTime,

              path: item.path

              // takenAt, locationInfo 等EXIF数据在后续阶段提取

            };

           

            images.push(imageData);

            

            // 每找到50个图片文件就更新一次进度（只有在发现图片时才发送进度消息）
            if (images.length % 50 === 0 && onProgress && images.length > 0) {
              onProgress({

                current: 0,

                total: 0,

                message: `扫描目录: ${dirPath.split('/').pop() || dirPath.split('\\').pop()}`,

                filesFound: images.length,

                filesProcessed: 0,

                filesFailed: 0

              });

            }

          } catch (error) {

            console.error(`Failed to get file ${item.name} info:`, error);

          }

        }

      }

      

      // 确保所有异步操作都完成

      await new Promise(resolve => setTimeout(resolve, 0));

      

      // 目录扫描完成
      logger.debug(`📁 目录扫描完成: ${dirPath}, 发现 ${imageCount} 张图片, 总项目数: ${items.length}`);
      
      // 如果有无效路径的文件，记录总结信息
      if (this.invalidPathCount > 0) {
        logger.warn(`⚠️ 目录 ${dirPath} 中发现 ${this.invalidPathCount} 个没有路径的文件项，已跳过处理`);
      }

      return images;

    } catch (error) {

      console.error(`Optimized scan directory ${dirPath} failed:`, error);

      return [];

    }

  }



  isImageFile(fileName) {

    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];

    const lowerFileName = fileName.toLowerCase();

    return imageExtensions.some(ext => lowerFileName.endsWith(ext));

  }



 




  async ensureInitialized() {

    if (!this.isInitialized) {

      await this.initialize();

    }

  }



 


  // 为现有图片补充城市信息

  async updateExistingImagesWithCityInfo() {

    try {

      // Starting to update existing images with city info

      

      const allImages = await UnifiedDataService.readAllImages();
      // Found existing images

      

      let updatedCount = 0;

      let skippedCount = 0;

      

      for (const image of allImages) {

        // 只处理有GPS坐标但没有城市信息的图片

        if (image.latitude && image.longitude && !image.city) {

          try {

            // Processing image for city info

            

            // 查找最近的城市（根据远程服务状态决定是否使用远程API）

            const nearestCity = await cityLocationService.findNearestCityAsync(image.latitude, image.longitude, 200, this.useRemoteInference);

            

            if (nearestCity) {

              // 更新图片的城市信息

              const updatedImage = {

                ...image,

                city: nearestCity.name,

                province: nearestCity.province,

                cityDistance: nearestCity.distance

              };

              

              // 保存更新后的图片信息

              await UnifiedDataService.writeImageClassification(updatedImage);
              

              // Updated image with city info

              updatedCount++;

            } else {

              // No city found for coordinates

              skippedCount++;

            }

          } catch (error) {

            console.error(`❌ Failed to update ${image.fileName}:`, error);

            skippedCount++;

          }

        } else {

          skippedCount++;

        }

      }

      

      // City info update completed

      return { updated: updatedCount, skipped: skippedCount };

      

    } catch (error) {

      console.error('❌ Failed to update existing images with city info:', error);

      throw error;

    }

  }





  // ==================== 独立扫描线程方案 ====================
  
  /**
   * 发送进度消息的通用函数
   */
  sendProgressMessage(stage, filesFound = 0, filesProcessed = 0, filesFailed = 0, scanStartTime = null, extraInfo = '') {
    if (this.onProgress) {
      const progressData = this.processProgressData({
        stage,
        message: extraInfo || stage,
        filesFound,
        filesProcessed,
        filesFailed,
        scanStartTime
      });
      
      // 检查消息是否与上次相同，避免重复发送
      const messageKey = `${stage}_${filesFound}_${filesProcessed}_${filesFailed}_${extraInfo}`;
      if (this.lastProgressMessage === messageKey) {
        return; // 消息没有变化，直接返回
      }
      
      this.lastProgressMessage = messageKey;
      this.onProgress(progressData);
    }
  }
  
  /**
   * 独立扫描线程方案 - 分阶段处理，避免UI阻塞
   */
  async scanWithIndependentThread(scanPaths, onProgress, scanStartTime) {
    try {
      // 保存onProgress为实例变量
      this.onProgress = onProgress;
      
      // 记录扫描开始时间（用于计算总耗时）
      const scanStartTimestamp = Date.now();
      
      // 健康检查（内部操作，不发送进度消息）
      try {
        const health = await this.imageClassifier.checkHealth();
        this.useRemoteInference = health.status === 'healthy' && health.modelApi === 'available';
        
        if (this.useRemoteInference) {
          logger.info('✅ 远程服务可用，将使用远程推理');
        } else {
          logger.warn('⚠️ 远程服务不可用，将在需要时使用本地推理');
        }
      } catch (error) {
        logger.warn('⚠️ 健康检查失败，将在需要时使用本地推理:', error.message);
        this.useRemoteInference = false;
      }
      
      // 延迟加载：仅在第4层本地推理降级时才加载模型
      // 不再提前加载模型，节省启动时间和内存
      
      // 阶段1: 目录扫描
      const allImages = await this.scanDirectoriesPhase(scanPaths, scanStartTime);
      
      // 阶段2: 文件比对
      const { deletedUris, newImages } = await this.compareFilesPhase(allImages, scanStartTime);
      
      // 阶段3-4: 漏斗式处理（内部会按需加载模型）
      const { processedCount, failedCount } = await this.processImagesPhase(newImages, scanStartTime);
      
      // 阶段5: 移除文件处理
      await this.removeFilesPhase(deletedUris, scanStartTime);
      
      // 阶段6: 数据批量更新
      await this.updateDataPhase(processedCount, failedCount, scanStartTime);
      
      // 阶段7: 相似度检测（在数据更新后执行，确保能获取到所有图片数据）
      const { processedCount: similarityCount, failedCount: similarityFailed } = 
        await this.similarityDetectionPhase(scanStartTime);
      
      // 扫描完成
      const totalProcessed = processedCount + similarityCount;
      const totalFailed = failedCount + similarityFailed;
      
      // 计算总耗时
      const scanEndTimestamp = Date.now();
      const totalScanDuration = scanEndTimestamp - scanStartTimestamp;
      const totalScanDurationSeconds = Math.round(totalScanDuration / 1000);
      
      logger.info(`⏱️ 扫描完成，总耗时: ${totalScanDurationSeconds}秒 (${Math.round(totalScanDuration / 1000 / 60)}分钟)`);
      
      // 保存扫描完成时间和耗时信息
      await this.saveScanCompletionInfo(totalScanDuration);
      
      this.sendProgressMessage('completed', allImages.length, totalProcessed, totalFailed, scanStartTime);
      
      // 如果加载了模型，才需要卸载
      if (this.imageClassifier.isInitialized) {
        logger.debug('🔄 卸载本地模型，释放内存...');
      this.imageClassifier.unloadAllModels();
      }
      
      return {
        success: true,
        deleted: deletedUris.length,
        newImages: newImages.length,
        processed: processedCount,
        failed: failedCount
      };
      
    } catch (error) {
      console.error('❌ 独立扫描线程方案失败:', error);
      
      // 如果加载了模型，即使出现错误也要卸载
      if (this.imageClassifier.isInitialized) {
      try {
          logger.debug('🔄 卸载本地模型，释放内存...');
        this.imageClassifier.unloadAllModels();
      } catch (unloadError) {
          logger.error('❌ 卸载模型失败:', unloadError);
        }
      }
      
      throw error;
    }
  }
  
  
  /**
   * 阶段1: 目录扫描
   * 异步扫描所有目录，收集文件列表
   */
  async scanDirectoriesPhase(scanPaths, scanStartTime) {
    logger.debug('📁 阶段1: 开始目录扫描...');
    
    // 只显示目录数量，不显示具体路径
    this.sendProgressMessage('directory_scanning', 0, 0, 0, scanStartTime, `开始扫描 ${scanPaths.length} 个目录`);
    
    const allImages = [];
    
    // 直接使用 scanDirectoryForUris 扫描每个目录
    for (const path of scanPaths) {
      try {
        const images = await this.scanDirectoryForUris(path, (progress) => {
          this.sendProgressMessage('directory_scanning', allImages.length + progress.filesFound, 0, 0, scanStartTime, path.split('/').pop() || path.split('\\').pop());
        }, allImages.length);
        
        allImages.push(...images);
        
        // 让出控制权，避免阻塞UI
        await new Promise(resolve => setTimeout(resolve, 0));
        
      } catch (error) {
        console.error(`Scan path ${path} failed:`, error);
      }
    }
    
    // 阶段1完成
    return allImages;
  }
  
  /**
   * 阶段2: 文件比对
   * 对比现有数据库，找出新增和删除的文件
   */
  async compareFilesPhase(allImages, scanStartTime) {
    // 阶段2: 文件比对
    this.sendProgressMessage('file_comparison', allImages.length, 0, 0, scanStartTime);
    
    // 让出控制权，让UI有机会显示进度提示
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 获取现有图片URI集合
    const existingUris = new Set(await UnifiedDataService.getImageUris());
    logger.debug(`Found ${existingUris.size} existing image URIs`);
    
    // 让出控制权，避免阻塞UI
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 获取当前文件URI集合
    const currentFileUris = new Set();
    allImages.forEach(img => {
      currentFileUris.add(img.uri);
    });
    
    // 让出控制权，避免阻塞UI
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 找出差异
    const deletedUris = []; // 数据库中有，但文件系统中没有
    const newUris = []; // 文件系统中有，但数据库中没有
    
    // 找出被删除的文件
    for (const uri of existingUris) {
      if (!currentFileUris.has(uri)) {
        deletedUris.push(uri);
      }
    }
    
    // 找出需要处理的文件
    for (const uri of currentFileUris) {
      if (!existingUris.has(uri)) {
        newUris.push(uri);
      }
    }
    
    // 过滤出需要处理的新图片
    const newImages = allImages.filter(img => newUris.includes(img.uri));
    
    // 阶段2完成
    
    return { deletedUris, newImages };
  }
  
  /**
   * 工具函数：保存单张图片结果到数据库
   * @param {Object} imageData - 图片基本信息
   * @param {Object} classification - 分类结果
   * @param {Object} exifData - EXIF数据
   * @returns {Promise<{success: boolean, error?: Error}>}
   */
  async saveImageResult(imageData, classification, exifData) {
    try {
      const saveData = {
        uri: imageData.uri,
        category: classification.categoryId || classification.category,
        confidence: classification.confidence || 1.0,
        timestamp: imageData.timestamp,
        takenAt: exifData.takenTime,
        fileName: imageData.fileName,
        size: imageData.size,
        latitude: exifData.locationInfo?.latitude,
        longitude: exifData.locationInfo?.longitude,
        altitude: exifData.locationInfo?.altitude,
        accuracy: exifData.locationInfo?.accuracy,
        address: exifData.locationInfo?.address,
        city: exifData.locationInfo?.city,
        country: exifData.locationInfo?.country,
        province: exifData.locationInfo?.province,
        district: exifData.locationInfo?.district,
        street: exifData.locationInfo?.street,
        width: exifData.imageDimensions?.width,
        height: exifData.imageDimensions?.height,
        // 保存检测结果字段
        idCardDetections: classification.idCardDetections || [],
        generalDetections: classification.generalDetections || [],
        mobileNetV3Detections: classification.mobileNetV3Detections || null,
        // 保存图像尺寸信息
        imageDimensions: exifData.imageDimensions || null,
        // 保存大模型推理描述
        message: classification.message || null
      };
      
      // 使用 writeImageDetailedInfo，传入单元素数组
      // updateCache = false：不立即更新缓存，避免频繁重建缓存，扫描结束后统一更新
      await UnifiedDataService.writeImageDetailedInfo([saveData], false);
      return { success: true };
    } catch (error) {
      logger.error('❌ 保存图片失败:', error);
      return { success: false, error };
    }
  }

  /**
   * 阶段3a: 批量截图检测
   * 检测手机截图并立即保存
   */
  async screenshotDetectionPhase(newImages, scanStartTime) {
    if (newImages.length === 0) {
      return { remainingImages: [], processedCount: 0, failedCount: 0 };
    }
    
    logger.info(`📱 第1层：批量截图检测，检查 ${newImages.length} 张图片`);
    this.sendProgressMessage('screenshot_detection', newImages.length, 0, 0, scanStartTime, '开始检测手机截图');
    
    let processedCount = 0;
    let failedCount = 0;
    const remainingImages = [];
    
    // 并行检测截图
    const batchSize = 4; // 并行处理4张图片
    logger.info(`🚀 开始并行截图检测: ${newImages.length} 张图片，批次大小: ${batchSize}`);
    
    for (let i = 0; i < newImages.length; i += batchSize) {
      const batch = newImages.slice(i, i + batchSize);
      
      // 并行处理当前批次
      const batchPromises = batch.map(async (image, batchIndex) => {
        try {
          // 提取图片尺寸
          const exifData = await extractExifData(image.path, this.useRemoteInference);
          const width = exifData.imageDimensions?.width || 0;
          const height = exifData.imageDimensions?.height || 0;
          
          // 检测是否为截图
          const isScreenshot = await this.imageClassifier.identifyMobileScreenshot(
            image.uri,
            image.fileName,
            width,
            height
          );
          
          if (isScreenshot) {
            // 构建分类结果
            const classification = {
              categoryId: 'screenshot',
              confidence: 1.0
            };
            
            // 立即保存
            const saved = await this.saveImageResult(image, classification, exifData);
            return {
              success: saved.success,
              isScreenshot: true,
              image: image,
              exifData: exifData
            };
          } else {
            // 保存EXIF数据，供后续使用
            return {
              success: true,
              isScreenshot: false,
              image: {
                ...image,
                exifData
              },
              exifData: exifData
            };
          }
        } catch (error) {
          logger.error(`❌ 截图检测失败:`, error);
          return {
            success: false,
            isScreenshot: false,
            image: image,
            error: error
          };
        }
      });

      // 等待当前批次完成
      const batchResults = await Promise.all(batchPromises);
      
      // 处理批次结果
      for (const result of batchResults) {
        if (result.success) {
          if (result.isScreenshot) {
            processedCount++;
          } else {
            remainingImages.push(result.image);
          }
        } else {
          failedCount++;
          remainingImages.push(result.image);
        }
      }
      
      // 发送进度更新（sendProgressMessage会自动处理重复消息）
      if (processedCount > 0) {
        this.sendProgressMessage(
          'screenshot_detection',
          newImages.length,
          processedCount,
          failedCount,
          scanStartTime,
          `成功检测到了${processedCount}张手机截图`
        );
      }
    }
    
    logger.info(`✅ 第1层完成：检测到 ${processedCount} 张截图，${remainingImages.length} 张继续处理`);
    
    return { remainingImages, processedCount, failedCount };
  }

  /**
   * 阶段3b: 批量缓存查询
   * 查询缓存并立即保存命中的结果
   */
  async batchCacheCheckPhase(remainingImages, scanStartTime) {
    if (remainingImages.length === 0) {
      return { remainingImages: [], processedCount: 0, failedCount: 0 };
    }
    
    logger.info(`🔍 第2层：智能分类查询，处理 ${remainingImages.length} 张图片`);
    this.sendProgressMessage('cache_checking', remainingImages.length, 0, 0, scanStartTime);
    
    let processedCount = 0;
    const uncachedImages = [];
    
    try {
      // 使用并行哈希计算器计算所有图片哈希
      logger.info(`🚀 开始并行计算 ${remainingImages.length} 张图片的哈希值...`);
      
      const hashResults = await this.parallelHashCalculator.calculateHashesParallel(
        remainingImages,
        (processed, total) => {
          // 每100个更新一次进度，避免更新太频繁
          if (processed % 100 === 0 || processed === total) {
            this.sendProgressMessage(
              'cache_checking',
              remainingImages.length,
              0,
              0,
              scanStartTime,
              `智能分类查询: 正在计算哈希值 ${processed}/${total}`
            );
          }
        }
      );
      
      // 处理哈希计算结果
      const imageHashMap = new Map();
      let hashCalculationFailures = 0;
      const duplicateHashes = new Set();
      
      for (const result of hashResults) {
        if (result.hash) {
          // 检查是否已有相同哈希
          if (imageHashMap.has(result.hash)) {
            duplicateHashes.add(result.hash);
          }
          
          // 为每个文件生成唯一键，即使哈希相同也保留
          const uniqueKey = `${result.hash}_${result.uri}`;
          imageHashMap.set(uniqueKey, result);
        } else {
          // 哈希计算失败
          hashCalculationFailures++;
          if (hashCalculationFailures <= 10) {
            logger.warn(`❌ 计算哈希失败 (${hashCalculationFailures}/${remainingImages.length}):`, {
              fileName: result.fileName,
              uri: result.uri,
              error: result.hashError || '未知错误'
            });
          } else if (hashCalculationFailures === 11) {
            logger.warn(`❌ 更多哈希计算失败，后续错误将不再详细记录...`);
          }
          uncachedImages.push(result);
        }
      }
      
      const imageEntries = Array.from(imageHashMap.entries());
      const hashes = imageEntries.map(([key, data]) => data.hash);
      
      if (hashCalculationFailures > 0) {
        logger.warn(`⚠️ 哈希计算失败统计: ${hashCalculationFailures}/${remainingImages.length} 张图片哈希计算失败，将直接进入远程推理`);
      }
      
      if (duplicateHashes.size > 0) {
        logger.info(`📊 发现 ${duplicateHashes.size} 组重复文件（相同哈希值），已保留所有文件`);
      }
      
      if (hashes.length === 0) {
        return { remainingImages: uncachedImages, processedCount: 0, failedCount: 0 };
      }
      
      // 批量查询缓存（内部自动分批）
      const clientId = await UnifiedDataService.getClientId();
      const cacheResult = await this.imageClassifier.batchCheckCache(hashes, clientId);
      
      // 调试：检查缓存查询结果
      logger.debug(`🔍 缓存查询结果统计: 请求 ${hashes.length} 个哈希，返回 ${cacheResult.items.length} 个结果`);
      
      // 处理缓存结果
      let processedInBatch = 0;
      const processedHashes = new Set(); // 跟踪已处理的哈希值
      
      for (let i = 0; i < cacheResult.items.length; i++) {
        const item = cacheResult.items[i];
        // 查找所有具有相同哈希的图片
        const matchingImages = imageEntries
          .filter(([key, data]) => data.hash === item.image_hash)
          .map(([key, data]) => data);
        
        for (const image of matchingImages) {
          if (item.cached && item.data) {
            // 缓存命中，立即保存
            const classification = {
              categoryId: item.data.category,
              confidence: item.data.confidence || 0.9,
              // 缓存命中时没有小模型检测结果，设置为空
              idCardDetections: [],
              generalDetections: [],
              mobileNetV3Detections: null,
              // 保存大模型推理的描述信息
              message: item.data.description || item.data.message || null
            };
            
            const exifData = image.exifData || await extractExifData(image.path, this.useRemoteInference);
            const saved = await this.saveImageResult(image, classification, exifData);
            
            if (saved.success) {
              processedCount++;
              processedInBatch++;
            }
          } else {
            // 缓存未命中，保存哈希供后续使用
            uncachedImages.push({
              ...image,
              hash: item.image_hash
            });
          }
          processedHashes.add(item.image_hash);
        }
        
        // 每处理50个缓存项就更新一次进度
        if ((i + 1) % 50 === 0 || i === cacheResult.items.length - 1) {
          this.sendProgressMessage(
            'cache_checking',
            remainingImages.length,
            processedCount,
            0,
            scanStartTime,
            `智能分类查询: 已处理 ${processedCount} 张，${uncachedImages.length} 张待处理`
          );
        }
      }
      
      // 处理缓存查询结果中缺失的哈希值
      const missingHashes = hashes.filter(hash => !processedHashes.has(hash));
      if (missingHashes.length > 0) {
        logger.warn(`⚠️ 缓存查询结果不完整: ${missingHashes.length} 个哈希值在结果中未找到，将进入远程推理`);
        // 将这些图片添加到待处理列表
        for (const hash of missingHashes) {
          const matchingImages = imageEntries
            .filter(([key, data]) => data.hash === hash)
            .map(([key, data]) => data);
          for (const image of matchingImages) {
            uncachedImages.push({
              ...image,
              hash: hash
            });
          }
        }
      }
      
      // 更新进度
      this.sendProgressMessage(
        'cache_checking',
        remainingImages.length,
        processedCount,
        0,
        scanStartTime
      );
      
    } catch (error) {
      logger.error('❌ 智能分类查询失败:', error);
      // 失败时，所有图片都需要继续处理
      return { remainingImages, processedCount: 0, failedCount: 0 };
    }
    
    logger.info(`✅ 第2层完成：缓存命中 ${processedCount} 张，${uncachedImages.length} 张继续处理`);
    
    return { remainingImages: uncachedImages, processedCount, failedCount: 0 };
  }

  /**
   * 阶段3c: 批量远程推理
   * 远程分类并立即保存成功的结果
   */
  async batchRemoteInferencePhase(remainingImages, scanStartTime) {
    if (remainingImages.length === 0) {
      return { remainingImages: [], processedCount: 0, failedCount: 0 };
    }
    
    logger.info(`☁️ 第3层：批量远程推理，处理 ${remainingImages.length} 张图片`);
    this.sendProgressMessage('remote_inference', remainingImages.length, 0, 0, scanStartTime, '开始照片快速智能识别');
    
    let processedCount = 0;
    let failedCount = 0;
    const failedImages = [];
    
    try {
      const clientId = await UnifiedDataService.getClientId();
      
      // 准备上传数据 - 并行处理
      const uploadData = [];
      const batchSize = 20; // 每批处理20张图片
      
      for (let i = 0; i < remainingImages.length; i += batchSize) {
        const batch = remainingImages.slice(i, i + batchSize);
        
        // 并行处理当前批次
        const batchPromises = batch.map(async (image) => {
          try {
            // 安全地读取本地图片文件
            const blob = await readImageFileAsBlob(image.path);
            
            // 缩放图片到1024x1024（保持长宽比）
            const resizedBlob = await this.resizeImageTo1024(blob, image.fileName);
            
            return {
              uri: image.uri,
              hash: image.hash,
              blob: resizedBlob,
              fileName: image.fileName,
              imageData: image
            };
          } catch (error) {
            logger.error('❌ 准备上传数据失败:', error);
            failedImages.push(image);
            failedCount++;
            return null;
          }
        });
        
        // 等待当前批次完成
        const batchResults = await Promise.all(batchPromises);
        
        // 收集成功的结果
        for (const result of batchResults) {
          if (result) {
            uploadData.push(result);
          }
        }
        
        // 更新进度
        const processed = Math.min(i + batchSize, remainingImages.length);
        this.sendProgressMessage(
          'remote_inference',
          remainingImages.length,
          processed,
          0,
          scanStartTime,
          `照片数据预处理: ${processed}/${remainingImages.length}`
        );
      }
      
      if (uploadData.length === 0) {
        return { remainingImages: failedImages, processedCount: 0, failedCount };
      }
      
      // 手动分批处理，以便控制进度更新
      const remoteBatchSize = 20; // 每批20张图片
      const allItems = [];
      let totalSuccess = 0;
      let totalFail = 0;
      
      for (let i = 0; i < uploadData.length; i += remoteBatchSize) {
        const batch = uploadData.slice(i, i + remoteBatchSize);
        const batchNumber = Math.floor(i / remoteBatchSize) + 1;
        const totalBatches = Math.ceil(uploadData.length / remoteBatchSize);
        
        // 更新进度
        this.sendProgressMessage(
          'remote_inference',
          remainingImages.length,
          i + batch.length,
          0,
          scanStartTime,
          `快速智能识别: 批次 ${batchNumber}/${totalBatches} (${i + batch.length}/${uploadData.length} 张)`
        );
        
        // 处理当前批次
        const batchResult = await this.imageClassifier.batchClassifyRemote(batch, { userId: clientId });
        
        // 合并结果
        allItems.push(...batchResult.items);
        totalSuccess += batchResult.success_count;
        totalFail += batchResult.fail_count;
      }
      
      // 构造最终结果
      const result = {
        success: true,
        total: uploadData.length,
        success_count: totalSuccess,
        fail_count: totalFail,
        items: allItems
      };
      
      logger.debug('🔍 远程推理结果详情:', {
        success: result.success,
        total: result.total,
        success_count: result.success_count,
        fail_count: result.fail_count,
        itemsLength: result.items?.length,
        firstItem: result.items?.[0]
      });
      
      // 处理结果
      for (const item of result.items) {
        const imageData = item.imageData; // 已在 batchClassifyRemote 中保留
        
        
        if (item.success && item.data) {
          // 判断是大模型还是小模型推理
          let classification;
          
          if (item.data.category && item.data.category !== '') {
            // 大模型推理
            classification = {
              categoryId: item.data.category,
              confidence: item.data.confidence || 0.9,
              // 大模型推理时没有小模型检测结果
              idCardDetections: [],
              generalDetections: [],
              mobileNetV3Detections: null,
              // 保存大模型推理的描述信息
              message: item.data.description || item.data.message || null
            };
          } else if (item.data.local_inference_result) {
            // 小模型推理，需要映射
            const localResult = item.data.local_inference_result;
            
            // 翻译mobileNetV3Detections中的imagenet_class_xxx
            let translatedMobileNetV3Detections = localResult.mobileNetV3Detections;
            if (translatedMobileNetV3Detections && translatedMobileNetV3Detections.predictions && Array.isArray(translatedMobileNetV3Detections.predictions)) {
              translatedMobileNetV3Detections = {
                ...translatedMobileNetV3Detections,
                predictions: translatedMobileNetV3Detections.predictions.map(prediction => {
                  if (prediction.class && prediction.class.startsWith('imagenet_class_')) {
                    const classId = prediction.class;
                    const translatedName = this.translateImageNetClass(classId);
                    return {
                      ...prediction,
                      class: translatedName || classId // 如果翻译失败，保持原名称
                    };
                  }
                  return prediction;
                })
              };
            }
            
            classification = {
              categoryId: this.mapDetectionsToCategory(localResult),
              confidence: 0.8,
              // 保存小模型检测结果
              idCardDetections: localResult.idCardDetections || [],
              generalDetections: localResult.generalDetections || [],
              mobileNetV3Detections: translatedMobileNetV3Detections,
              // 小模型推理没有大模型描述信息
              message: null
            };
          } else {
            failedImages.push(imageData);
            failedCount++;
            continue;
          }
          
          // 立即保存
          const exifData = imageData.exifData || (imageData.path ? await extractExifData(imageData.path, this.useRemoteInference) : null);
          const saved = await this.saveImageResult(imageData, classification, exifData);
          
          if (saved.success) {
          processedCount++;
          } else {
            failedCount++;
          }
        } else {
          logger.warn('❌ 远程推理失败，原因:', {
            success: item.success,
            hasData: !!item.data,
            data: item.data,
            error: item.error,
            fileName: imageData.fileName,
            uri: imageData.uri
          });
          failedImages.push(imageData);
          failedCount++;
        }
      }
      
      // 更新进度
      this.sendProgressMessage(
        'remote_inference',
        remainingImages.length,
        processedCount,
        failedCount,
        scanStartTime,
        `照片快速智能识别: ${processedCount}/${remainingImages.length}`
      );
      
      } catch (error) {
      // 处理超时和取消请求的情况
      if (error.name === 'AbortError' || error.message === 'The user aborted a request.') {
        logger.warn('⚠️ 远程推理超时或被取消，将降级到本地推理');
        return { remainingImages: remainingImages, processedCount: 0, failedCount: 0 };
      }
      
      logger.error('❌ 批量远程推理失败:', error);
      // 失败时，剩余图片都需要本地推理
      return { remainingImages: failedImages, processedCount: 0, failedCount: remainingImages.length };
    }
    
    logger.info(`✅ 第3层完成：远程推理成功 ${processedCount} 张，失败 ${failedImages.length} 张`);
    
    return { remainingImages: failedImages, processedCount, failedCount };
  }

  /**
   * 阶段3d: 本地推理降级
   * 对远程推理失败的图片进行本地推理
   */
  async localInferenceFallbackPhase(remainingImages, scanStartTime) {
    if (remainingImages.length === 0) {
      logger.debug('📊 第4层：无需本地推理降级');
      return { processedCount: 0, failedCount: 0 };
    }
    
    logger.info(`🖥️ 第4层：本地推理降级，处理 ${remainingImages.length} 张图片`);
    this.sendProgressMessage('local_inference', remainingImages.length, 0, 0, scanStartTime, '开始本地智能识别照片');
    
    // 仅在此时加载本地模型
    if (!this.imageClassifier.isInitialized) {
      logger.info('🔧 初始化本地推理模型...');
      this.sendProgressMessage('local_inference', remainingImages.length, 0, 0, scanStartTime, '正在加载本地AI模型');
      await this.imageClassifier.initialize();
      logger.info('✅ 本地模型加载完成');
    }
    
    let processedCount = 0;
    let failedCount = 0;
    
    // 逐个进行本地推理
    for (let i = 0; i < remainingImages.length; i++) {
      const imageData = remainingImages[i];
      
      try {
        // 提取EXIF（如果还没提取）
        const exifData = imageData.exifData || (imageData.path ? await extractExifData(imageData.path, this.useRemoteInference) : null);
        
        // 本地推理（纯本地推理，前3层已完成截图检测、缓存查询、远程推理）
        const classification = await this.imageClassifier.classifyImage(imageData.uri);
        
        if (classification.success) {
          // 立即保存
          const saved = await this.saveImageResult(imageData, classification, exifData);
          if (saved.success) {
            processedCount++;
          } else {
            failedCount++;
          }
        } else {
          failedCount++;
        }
        
        // 更新进度（每张图片都更新，因为本地推理很慢）
      this.sendProgressMessage(
          'local_inference',
          remainingImages.length,
        processedCount, 
        failedCount, 
        scanStartTime,
          `本地智能识别照片: ${processedCount}/${remainingImages.length}`
        );
        
        // 每处理5个文件就让出控制权，避免UI卡顿（本地推理比较耗时）
        if ((i + 1) % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        
      } catch (error) {
        logger.error(`❌ 本地推理失败:`, error);
        failedCount++;
      }
    }
    
    logger.info(`✅ 第4层完成：本地推理成功 ${processedCount} 张，失败 ${failedCount} 张`);
    
    return { processedCount, failedCount };
  }

  /**
   * 阶段3e: 相似度检测
   * 对所有已分类的图片进行相似度检测
   */
  async similarityDetectionPhase(scanStartTime) {
    logger.info(`🔍 第5层：相似度检测`);
    this.sendProgressMessage('similarity_detection', 0, 0, 0, scanStartTime, '开始相似度检测');
    
    try {
      // 获取所有图片进行相似度检测
      const allImages = await UnifiedDataService.readAllImages();
      
      if (allImages.length === 0) {
        logger.info('📊 第5层：没有图片，跳过相似度检测');
        return { processedCount: 0, failedCount: 0 };
      }
      
      logger.info(`🔍 第5层：开始相似度检测，处理 ${allImages.length} 张图片`);
      this.sendProgressMessage('similarity_detection', allImages.length, 0, 0, scanStartTime, `相似度检测: 处理 ${allImages.length} 张图片`);
      
      // 批量进行相似度检测
      logger.info(`🔍 开始调用相似度检测服务，参数: timeWindow=300, similarityThreshold=0.8`);
      const result = await this.similarityService.detectSimilarImages({
        timeWindow: 300, // 5分钟时间窗口
        similarityThreshold: 0.8,
        groupType: 'similar'
      });
      
      logger.info(`🔍 相似度检测服务返回结果:`, {
        success: result.success,
        groupsLength: result.groups ? result.groups.length : 0,
        processed: result.processed,
        total: result.total,
        error: result.error
      });
      
      if (result.success) {
        logger.info(`✅ 第5层完成：相似度检测成功，发现 ${result.groups.length} 个相似组`);
        this.sendProgressMessage('similarity_detection', allImages.length, allImages.length, 0, scanStartTime, `相似度检测完成: 发现 ${result.groups.length} 个相似组`);
        return { processedCount: allImages.length, failedCount: 0 };
      } else {
        logger.error(`❌ 第5层失败：相似度检测失败: ${result.error}`);
        this.sendProgressMessage('similarity_detection', allImages.length, 0, allImages.length, scanStartTime, `相似度检测失败: ${result.error}`);
        return { processedCount: 0, failedCount: allImages.length };
      }
      
    } catch (error) {
      logger.error('❌ 相似度检测阶段失败:', error);
      this.sendProgressMessage('similarity_detection', 0, 0, 0, scanStartTime, `相似度检测失败: ${error.message}`);
      return { processedCount: 0, failedCount: 1 };
    }
  }

  /**
   * 映射检测结果到分类（小模型推理用）
   */
  mapDetectionsToCategory(localResult) {
    const { idCardDetections, generalDetections } = localResult;
    
    // 1. 检测到身份证
    if (idCardDetections && idCardDetections.length > 0) {
      return 'idcard';
    }
    
    // 2. 统计人数
    const personCount = generalDetections ? generalDetections.filter(d => d.className === 'person').length : 0;
    if (personCount === 1) return 'single_person';
    if (personCount > 1) return 'social_activities';
    
    // 3. 检测宠物
    const petClasses = ['cat', 'dog', 'bird'];
    if (generalDetections && generalDetections.some(d => petClasses.includes(d.className))) {
      return 'pets';
    }
    
    // 4. 检测食物
    const foodClasses = ['pizza', 'donut', 'cake', 'sandwich', 'banana', 'apple', 'orange'];
    if (generalDetections && generalDetections.some(d => foodClasses.includes(d.className))) {
      return 'foods';
    }
    
    // 5. 检测物体少 → 风景
    if (!generalDetections || generalDetections.length <= 3) {
      return 'travel_scenery';
    }
    
    // 6. 默认分类
    return 'other';
  }

  /**
   * 阶段3-4: 启动处理Workers并等待完成
   * 使用多线程处理新增文件的EXIF提取和分类
   */
  async processImagesPhase(newImages, scanStartTime) {
    if (newImages.length === 0) {
      return { processedCount: 0, failedCount: 0 };
    }
    
    let totalProcessed = 0;
    let totalFailed = 0;
    
    // 第1层：截图检测
    logger.info(`🔄 开始漏斗式处理：共 ${newImages.length} 张图片`);
    const { remainingImages: afterScreenshot, processedCount: screenshotCount, failedCount: screenshotFailed } = 
      await this.screenshotDetectionPhase(newImages, scanStartTime);
    totalProcessed += screenshotCount;
    totalFailed += screenshotFailed;
    
    if (afterScreenshot.length === 0) {
      logger.info(`✅ 漏斗处理完成：全部为截图，已处理 ${totalProcessed} 张`);
      return { processedCount: totalProcessed, failedCount: totalFailed };
    }
    
    // 如果远程服务可用，执行缓存查询和远程推理
    if (this.useRemoteInference) {
      // 第2层：智能分类查询
      const { remainingImages: afterCache, processedCount: cacheCount, failedCount: cacheFailed } = 
        await this.batchCacheCheckPhase(afterScreenshot, scanStartTime);
      totalProcessed += cacheCount;
      totalFailed += cacheFailed;
      
      if (afterCache.length === 0) {
        logger.info(`✅ 漏斗处理完成：缓存已覆盖，已处理 ${totalProcessed} 张`);
        return { processedCount: totalProcessed, failedCount: totalFailed };
      }
      
      // 第3层：批量远程推理
      const { remainingImages: afterRemote, processedCount: remoteCount, failedCount: remoteFailed } = 
        await this.batchRemoteInferencePhase(afterCache, scanStartTime);
      totalProcessed += remoteCount;
      totalFailed += remoteFailed;
      
      if (afterRemote.length === 0) {
        logger.info(`✅ 漏斗处理完成：远程推理已覆盖，已处理 ${totalProcessed} 张`);
        return { processedCount: totalProcessed, failedCount: totalFailed };
      }
      
      // 第4层：本地推理降级
      const { processedCount: localCount, failedCount: localFailed } = 
        await this.localInferenceFallbackPhase(afterRemote, scanStartTime);
      totalProcessed += localCount;
      totalFailed += localFailed;
    } else {
      // 远程服务不可用，直接使用本地推理
      logger.info('⚠️ 远程服务不可用，跳过缓存查询和远程推理，直接使用本地推理处理所有剩余图片');
      const { processedCount: localCount, failedCount: localFailed } = 
        await this.localInferenceFallbackPhase(afterScreenshot, scanStartTime);
      totalProcessed += localCount;
      totalFailed += localFailed;
    }
    
    logger.info(`✅ 漏斗处理完成：总共处理 ${totalProcessed} 张，失败 ${totalFailed} 张`);
    
    
    // 阶段3-4完成
    return { processedCount: totalProcessed, failedCount: totalFailed };
  }
  
  /**
   * 阶段6: 移除文件处理
   * 处理已删除的文件
   */
  async removeFilesPhase(deletedUris, scanStartTime) {
    if (deletedUris.length === 0) {
      // 阶段6: 没有文件需要移除
      return;
    }
    
    // 阶段6: 开始移除已删除文件
    
    this.sendProgressMessage('removing_files', 0, 0, 0, scanStartTime);
    
    const deleteResult = await UnifiedDataService.removeImagesByUris(deletedUris, false);
    if (deleteResult.success) {
      // 阶段6完成
    } else {
      console.error('❌ 阶段6失败: 移除文件失败:', deleteResult.error);
    }
  }
  
  /**
   * 保存扫描完成信息（时间和耗时）
   */
  async saveScanCompletionInfo(totalScanDuration) {
    try {
      const settings = await UnifiedDataService.readSettings();
      settings.lastScanTime = new Date().toISOString();
      settings.lastScanDuration = totalScanDuration; // 毫秒
      settings.lastScanDurationSeconds = Math.round(totalScanDuration / 1000); // 秒
      settings.lastScanDurationMinutes = Math.round(totalScanDuration / 1000 / 60); // 分钟
      
      await UnifiedDataService.writeSettings(settings);
      logger.info(`💾 已保存扫描完成信息: 耗时 ${settings.lastScanDurationSeconds}秒`);
    } catch (error) {
      logger.error('❌ 保存扫描完成信息失败:', error);
    }
  }

  /**
   * 阶段7: 扫描完成处理
   * 刷新缓存和保存扫描完成时间
   */
  async updateDataPhase(processedCount, failedCount, scanStartTime) {
    // 阶段7: 开始扫描完成处理
    
    this.sendProgressMessage('updating_data', 0, processedCount, failedCount, scanStartTime, '正在完成扫描处理');
    
    try {
      // 刷新缓存，确保UI显示最新数据
      await UnifiedDataService.imageCache.refreshCache();
      
    } catch (error) {
      console.error('❌ 阶段7失败: 扫描完成处理失败:', error);
    }
    
    // 发送最终进度通知
    this.sendProgressMessage(
      'processing_images', 
      0, 
      processedCount, 
      failedCount, 
      scanStartTime,
      `处理完成: ${processedCount} 个文件，失败 ${failedCount} 个`
    );
    
    // 阶段7完成
  }


  /**
   * 将图像缩放到1024x1024，保持宽高比
   * @param {Blob} imageBlob - 原始图像blob
   * @param {string} fileName - 文件名
   * @returns {Promise<Blob>} - 缩放后的图像blob
   */
  async resizeImageTo1024(imageBlob, fileName = 'image.jpg') {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // 计算缩放比例，保持宽高比
        const maxSize = 1024;
        let { width, height } = img;
        
        if (width > height) {
          if (width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }
        }
        
        // 设置canvas尺寸
        canvas.width = width;
        canvas.height = height;
        
        // 绘制缩放后的图像
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为Blob
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('图像缩放失败'));
          }
        }, 'image/jpeg', 0.9); // 使用90%质量
        
        // 清理对象URL
        URL.revokeObjectURL(imageUrl);
      };
      
      img.onerror = () => {
        reject(new Error('图像加载失败'));
      };
      
      // 创建对象URL并加载图像
      const imageUrl = URL.createObjectURL(imageBlob);
      img.src = imageUrl;
    });
  }

  /**
   * 翻译ImageNet类别ID为中文名称
   * @param {string} classId - 如 "imagenet_class_651"
   * @returns {string} 中文名称或原ID
   */
  translateImageNetClass(classId) {
    try {
      // 提取数字部分
      const match = classId.match(/imagenet_class_(\d+)/);
      if (!match) {
        return classId; // 如果不是标准格式，返回原ID
      }
      
      const classNumber = parseInt(match[1]);
      const mobileNetV3Classes = configService.getMobileNetV3Classes();
      
      // 根据ID查找对应的英文名称（与本地推理逻辑一致）
      const classInfo = Object.values(mobileNetV3Classes).find(cls => cls.id === classNumber);
      if (classInfo && classInfo.english) {
        return classInfo.english; // 返回英文名称，与本地推理保持一致
      }
      
      // 如果找不到，返回去掉前缀的数字ID
      return classNumber.toString();
    } catch (error) {
      logger.warn(`翻译ImageNet类别失败: ${classId}`, error);
      return classId;
    }
  }

}

export default GalleryScannerService;