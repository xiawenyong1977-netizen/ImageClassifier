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

import { normalizeFilePath, readFileForExif, getFileStats } from '../adapters/WebAdapters';
import { RNFS } from '../adapters/WebAdapters';

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

const extractGPSFromExifParser = (exifData) => {

  if (!exifData?.tags) return null;

  

  const { GPSLatitude, GPSLongitude, GPSAltitude, GPSHPositioningError } = exifData.tags;

  

  if (!GPSLatitude || !GPSLongitude) return null;

  

  // 查找最近的城市信息

  const nearestCity = cityLocationService.findNearestCity(GPSLatitude, GPSLongitude);

  

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

const extractGPSFromNativeExif = (exifData) => {

  if (!exifData?.GPSLatitude || !exifData?.GPSLongitude) return null;

  

  const latitude = parseFloat(exifData.GPSLatitude);

  const longitude = parseFloat(exifData.GPSLongitude);

  

  // 查找最近的城市信息

  const nearestCity = cityLocationService.findNearestCity(latitude, longitude);

  

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

    

    return extractGPSFromExifParser(exifData);

  } catch (error) {

    console.log(`⚠️ exif-parser failed:`, error.message);

    return null;

  }

};



// 使用react-native-exif库提取GPS信息

const tryNativeExif = async (normalizedPath) => {

  try {

    const RNExif = eval('require("react-native-exif")');

    const exifData = await RNExif.getExif(normalizedPath);

    

    return extractGPSFromNativeExif(exifData);

  } catch (error) {

    return null;

  }

};



// 合并函数：一次读取文件同时提取拍照时间和GPS信息

const extractExifData = async (filePath) => {

  try {

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

      const gpsInfo = extractGPSFromExifParser(exifData);

      const locationInfo = gpsInfo ? { ...createDefaultLocationInfo(), ...gpsInfo } : createDefaultLocationInfo('none');

      // 提取图片尺寸信息
      const imageDimensions = {
        width: exifData.imageSize?.width || null,
        height: exifData.imageSize?.height || null
      };

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

        const gpsInfo = extractGPSFromNativeExif(exifData);

        const locationInfo = gpsInfo ? { ...createDefaultLocationInfo(), ...gpsInfo } : createDefaultLocationInfo('none');

        

        return { takenTime, locationInfo };

        

      } catch (nativeError) {

        return {

          takenTime: null,

          locationInfo: createDefaultLocationInfo('none')

        };

      }

    }

    

  } catch (error) {

    console.error(`❌ EXIF extraction failed:`, error);

    return {

      takenTime: null,

      locationInfo: null

    };

  }

};



// 保持向后兼容的单独函数

const extractLocationInfo = async (filePath) => {

  const result = await extractExifData(filePath);

  return result.locationInfo;

};



const extractTakenTime = async (filePath) => {

  const result = await extractExifData(filePath);

  return result.takenTime;

};



import UnifiedDataService from './UnifiedDataService';


class GalleryScannerService {

  constructor() {

    this.isInitialized = false;

    this.imageClassifier = new ImageClassifierService();

    this.galleryPaths = [];
  }



  async initialize() {

    if (this.isInitialized) return;

    

    try {

      // 从UnifiedDataService获取配置
      const settings = await UnifiedDataService.readSettings();
      this.galleryPaths = settings.scanPaths || [];
      
      // 不再处理权限，假设权限已经在APP级别处理
      this.isInitialized = true;

      console.log('✅ Gallery scanner service initialized successfully');

    } catch (error) {

      console.error('❌ Gallery scanner service initialization failed:', error);

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
        const dirName = message.split(': ')[1] || '未知目录';
        simpleMessage = `扫描目录: ${dirName} | 发现: ${filesFound || 0} 张照片`;
        break;
        
      case 'file_comparison':
        const totalFiles = filesFound || 0;
        simpleMessage = `照片比对: 正在分析 ${totalFiles} 张照片，查找新增和已删除的照片`;
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
      console.log('Starting full scan of local gallery...');
      
      // 确保使用最新的配置
      const settings = await UnifiedDataService.readSettings();
      this.galleryPaths = settings.scanPaths || [];
      
      const scanStartTime = new Date().toLocaleTimeString();

      // 使用独立扫描线程方案，避免阻塞UI
      return await this.scanWithIndependentThread(this.galleryPaths, onProgress, scanStartTime);
    } catch (error) {
      console.error('Full scan failed:', error);
      throw error;
    }
  }

      



  // 优化的扫描函数，只返回URI和基本信息，用于双Set比对

  async scanDirectoryForUris(dirPath, onProgress = null, totalFoundSoFar = 0) {
    try {

      console.log(`Starting optimized scan of directory: ${dirPath}`);

      

      const exists = await RNFS.exists(dirPath);

      if (!exists) {

        console.log(`Directory does not exist: ${dirPath}`);

        return [];

      }

      

      const items = await RNFS.readDir(dirPath);

      const images = [];

      let imageCount = 0;

      let dirCount = 0;

      const processedUris = new Set(); // 跟踪已处理的URI，避免重复

      

      console.log(`📁 目录 ${dirPath} 包含 ${items.length} 个项目`);
      console.log(`📁 目录内容:`, items.map(item => `${item.name} (${item.isDirectory() ? '目录' : '文件'})`));

      

      for (let i = 0; i < items.length; i++) {

        const item = items[i];
        
        // 调试：显示每个文件的处理过程
        if (!item.isDirectory()) {
          const isImage = this.isImageFile(item.name);
          console.log(`🔍 检查文件: ${item.name}, 是图片: ${isImage}`);
        }

        // 每处理200个文件就更新进度并让出主进程控制权
        if (i % 200 === 0) {
          // 更新进度信息
          if (onProgress) {
            onProgress({

              current: 0,

              total: 0,

              message: `扫描目录: ${dirPath.split('/').pop() || dirPath.split('\\').pop()}`,

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

          const fileUri = Platform.OS === 'web' 

            ? `file:///${item.path}` 

            : `file://${item.path}`;

          

          // 检查是否已经处理过这个URI

          if (processedUris.has(fileUri)) {

            console.log(`⚠️ 发现重复URI: ${fileUri}`);

            continue;

          }

          processedUris.add(fileUri);

          
          imageCount++;
          console.log(`🖼️ 发现图片文件: ${item.name}, 当前已发现图片数量: ${imageCount}`);
          

          // 调试信息：每1000个文件输出一次

          if (imageCount % 1000 === 0) {

            console.log(`🖼️ 已发现 ${imageCount} 个图片文件`);

          }

          

          try {

            const stats = await RNFS.stat(item.path);

            

            const mtime = stats.mtime ? new Date(stats.mtime).getTime() : null;

            const ctime = stats.ctime ? new Date(stats.ctime).getTime() : null;

            const currentTime = Date.now();

            const fileTime = ctime || mtime || currentTime;

            

            // 目录扫描阶段只收集基本信息，不提取EXIF数据

            const imageData = {

              uri: fileUri,

              fileName: item.name,

              size: stats.size,

              timestamp: fileTime,

              path: item.path

              // takenAt, locationInfo 等EXIF数据在后续阶段提取

            };

           

            images.push(imageData);

            

            // 每找到50个图片文件就更新一次进度
            if (images.length % 50 === 0 && onProgress) {
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

      

      console.log(`📊 目录扫描完成: ${dirPath}`);

      console.log(`📁 子目录数量: ${dirCount}`);

      console.log(`🖼️ 图片文件数量: ${imageCount}`);

      console.log(`📦 总返回图片数量: ${images.length}`);

      

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

      console.log('🔄 Starting to update existing images with city info...');

      

      const allImages = await UnifiedDataService.readAllImages();
      console.log(`📊 Found ${allImages.length} existing images`);

      

      let updatedCount = 0;

      let skippedCount = 0;

      

      for (const image of allImages) {

        // 只处理有GPS坐标但没有城市信息的图片

        if (image.latitude && image.longitude && !image.city) {

          try {

            console.log(`🔍 Processing image: ${image.fileName}`);

            

            // 查找最近的城市

            const nearestCity = cityLocationService.findNearestCity(image.latitude, image.longitude);

            

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
              

              console.log(`✅ Updated ${image.fileName} with city: ${nearestCity.name}`);

              updatedCount++;

            } else {

              console.log(`⚠️ No city found for ${image.fileName} at ${image.latitude}, ${image.longitude}`);

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

      

      console.log(`✅ City info update completed: ${updatedCount} updated, ${skippedCount} skipped`);

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
      // 构建基础消息，让processProgressData处理格式化
      const baseMessage = extraInfo ? `${stage}: ${extraInfo}` : stage;
      
      this.onProgress(this.processProgressData({
        stage,
        message: baseMessage,
        filesFound,
        filesProcessed,
        filesFailed,
        scanStartTime
      }));
    }
  }
  
  /**
   * 独立扫描线程方案 - 分阶段处理，避免UI阻塞
   */
  async scanWithIndependentThread(scanPaths, onProgress, scanStartTime) {
    try {
      console.log('🚀 启动独立扫描线程方案...');
      
      // 初始化图片分类器
      console.log('🔄 初始化图片分类器...');
      await this.imageClassifier.initialize();
      console.log('✅ 图片分类器初始化完成');
      
      // 保存onProgress为实例变量
      this.onProgress = onProgress;
      
      // 阶段1: 目录扫描
      const allImages = await this.scanDirectoriesPhase(scanPaths, scanStartTime);
      
      // 阶段2: 文件比对
      const { deletedUris, newImages } = await this.compareFilesPhase(allImages, scanStartTime);
      
      // 阶段3-4: 启动处理Workers并等待完成
      const { processedCount, failedCount } = await this.processImagesPhase(newImages, scanStartTime);
      
      // 阶段5: 移除文件处理
      await this.removeFilesPhase(deletedUris, scanStartTime);
      
      // 阶段6: 数据批量更新
      await this.updateDataPhase(processedCount, failedCount, scanStartTime);
      
      // 扫描完成
      this.sendProgressMessage('completed', allImages.length, processedCount, failedCount, scanStartTime);
      
      // 反初始化图片分类器，卸载模型释放内存
      console.log('🧹 扫描完成，开始反初始化图片分类器...');
      this.imageClassifier.unloadAllModels();
      console.log('✅ 图片分类器反初始化完成，内存已释放');
      
      return {
        success: true,
        deleted: deletedUris.length,
        newImages: newImages.length,
        processed: processedCount,
        failed: failedCount
      };
      
    } catch (error) {
      console.error('❌ 独立扫描线程方案失败:', error);
      
      // 即使出现错误也要反初始化图片分类器，释放内存
      try {
        console.log('🧹 扫描出错，开始反初始化图片分类器...');
        this.imageClassifier.unloadAllModels();
        console.log('✅ 图片分类器反初始化完成，内存已释放');
      } catch (unloadError) {
        console.error('❌ 反初始化图片分类器失败:', unloadError);
      }
      
      throw error;
    }
  }
  
  /**
   * 阶段1: 目录扫描
   * 异步扫描所有目录，收集文件列表
   */
  async scanDirectoriesPhase(scanPaths, scanStartTime) {
    console.log('📁 阶段1: 开始目录扫描...');
    
    this.sendProgressMessage('directory_scanning', 0, 0, 0, scanStartTime);
    
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
    
    console.log(`✅ 阶段1完成: 发现 ${allImages.length} 个文件`);
    return allImages;
  }
  
  /**
   * 阶段2: 文件比对
   * 对比现有数据库，找出新增和删除的文件
   */
  async compareFilesPhase(allImages, scanStartTime) {
    console.log('🔍 阶段2: 开始文件比对...');
    
    this.sendProgressMessage('file_comparison', allImages.length, 0, 0, scanStartTime);
    
    // 让出控制权，让UI有机会显示进度提示
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 获取现有图片URI集合
    this.sendProgressMessage('file_comparison', allImages.length, 0, 0, scanStartTime, '正在加载现有图片列表...');
    const existingUris = new Set(await UnifiedDataService.getImageUris());
    console.log(`Found ${existingUris.size} existing image URIs`);
    
    // 让出控制权，避免阻塞UI
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // 获取当前文件URI集合
    this.sendProgressMessage('file_comparison', allImages.length, 0, 0, scanStartTime, '正在比对文件...');
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
    
    console.log(`✅ 阶段2完成: ${deletedUris.length} 个文件被删除，${newImages.length} 个新文件需要处理`);
    
    return { deletedUris, newImages };
  }
  
  /**
   * 阶段3-4: 启动处理Workers并等待完成
   * 使用多线程处理新增文件的EXIF提取和分类
   */
  async processImagesPhase(newImages, scanStartTime) {
    if (newImages.length === 0) {
      console.log('📝 阶段3-4: 没有新文件需要处理');
      return { processedCount: 0, failedCount: 0 };
    }
    
    console.log(`🔄 阶段3-4: 开始处理 ${newImages.length} 个新文件...`);
    
    this.sendProgressMessage('processing_images', newImages.length, 0, 0, scanStartTime);
    
    // 简化的串行处理逻辑
    const SAVE_BATCH_SIZE = 100;
    let processedCount = 0;
    let failedCount = 0;
    const successfulData = [];
    
    console.log(`🚀 开始串行处理 ${newImages.length} 张图片`);
    
    // 串行处理每张图片
    for (let i = 0; i < newImages.length; i++) {
      const image = newImages[i];
      
      try {
        // 提取EXIF数据
        const exifData = await extractExifData(image.path);
        const takenTime = exifData.takenTime;
        const locationInfo = exifData.locationInfo;
        const imageDimensions = exifData.imageDimensions;
        
        // 图片分类
        const classificationStartTime = Date.now();
        const classification = await this.imageClassifier.classifyImage(image.uri, {
          timestamp: image.timestamp,
          fileSize: image.size,
          fileName: image.fileName,
          imageDimensions: imageDimensions
        });
        const classificationTime = Date.now() - classificationStartTime;
        
        // 统计分类耗时
        if (!this.classificationStats) {
          this.classificationStats = {
            totalTime: 0,
            count: 0,
            minTime: Infinity,
            maxTime: 0,
            avgTime: 0
          };
        }
        
        this.classificationStats.totalTime += classificationTime;
        this.classificationStats.count++;
        this.classificationStats.minTime = Math.min(this.classificationStats.minTime, classificationTime);
        this.classificationStats.maxTime = Math.max(this.classificationStats.maxTime, classificationTime);
        this.classificationStats.avgTime = this.classificationStats.totalTime / this.classificationStats.count;
        
        // 每处理10张图片输出一次统计信息
        if (this.classificationStats.count % 10 === 0) {
          console.log(`📊 分类性能统计 (${this.classificationStats.count}张图片):`);
          console.log(`   - 当前图片: ${image.fileName} (${classificationTime}ms)`);
          console.log(`   - 平均耗时: ${this.classificationStats.avgTime.toFixed(2)}ms`);
          console.log(`   - 最快: ${this.classificationStats.minTime}ms`);
          console.log(`   - 最慢: ${this.classificationStats.maxTime}ms`);
          console.log(`   - 总耗时: ${this.classificationStats.totalTime}ms`);
        }
        
        // 构建保存数据
        const saveData = {
          uri: image.uri,
          category: classification.category,
          confidence: classification.confidence,
          timestamp: image.timestamp,
          takenAt: takenTime,
          fileName: image.fileName,
          size: image.size,
          latitude: locationInfo.latitude,
          longitude: locationInfo.longitude,
          altitude: locationInfo.altitude,
          accuracy: locationInfo.accuracy,
          address: locationInfo.address,
          city: locationInfo.city,
          country: locationInfo.country,
          province: locationInfo.province,
          district: locationInfo.district,
          street: locationInfo.street,
          locationSource: locationInfo.source,
          cityDistance: locationInfo.cityDistance,
          // 检测结果
          idCardDetections: classification.idCardDetections || [],
          generalDetections: classification.generalDetections || [],
          smartClassifications: classification.smartClassifications || []
        };
        
        successfulData.push(saveData);
        processedCount++;
        
      } catch (error) {
        console.error(`处理图片失败 ${image.fileName}:`, error);
        failedCount++;
      }
      
      // 批量保存数据
      if (successfulData.length >= SAVE_BATCH_SIZE || i === newImages.length - 1) {
        if (successfulData.length > 0) {
          await UnifiedDataService.writeImageDetailedInfo(successfulData, false);
          successfulData.length = 0; // 清空数组
        }
        
        // 让出主进程控制权
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // 每处理1张图片就发送一次进度通知（实时更新）
      this.sendProgressMessage(
        'processing_images', 
        newImages.length, 
        processedCount, 
        failedCount, 
        scanStartTime,
        `正在处理: ${image.fileName} (${processedCount}/${newImages.length})`
      );
    }
    
    const totalProcessed = processedCount;
    const totalFailed = failedCount;
    
    // 输出最终分类性能统计
    if (this.classificationStats && this.classificationStats.count > 0) {
      console.log(`\n📊 最终分类性能统计 (${this.classificationStats.count}张图片):`);
      console.log(`   - 平均耗时: ${this.classificationStats.avgTime.toFixed(2)}ms`);
      console.log(`   - 最快: ${this.classificationStats.minTime}ms`);
      console.log(`   - 最慢: ${this.classificationStats.maxTime}ms`);
      console.log(`   - 总耗时: ${this.classificationStats.totalTime}ms`);
      console.log(`   - 处理速度: ${(this.classificationStats.count / (this.classificationStats.totalTime / 1000)).toFixed(2)} 张/秒`);
    }
    
    console.log(`✅ 阶段3-4完成: 处理了 ${totalProcessed} 个文件，失败 ${totalFailed} 个`);
    
    return { processedCount: totalProcessed, failedCount: totalFailed };
  }
  
  /**
   * 阶段5: 移除文件处理
   * 处理已删除的文件
   */
  async removeFilesPhase(deletedUris, scanStartTime) {
    if (deletedUris.length === 0) {
      console.log('📝 阶段5: 没有文件需要移除');
      return;
    }
    
    console.log(`🗑️ 阶段5: 开始移除 ${deletedUris.length} 个已删除文件...`);
    
    this.sendProgressMessage('removing_files', 0, 0, 0, scanStartTime);
    
    const deleteResult = await UnifiedDataService.removeImagesByUris(deletedUris, false);
    if (deleteResult.success) {
      console.log(`✅ 阶段5完成: 成功移除 ${deleteResult.removedCount} 个文件`);
    } else {
      console.error('❌ 阶段5失败: 移除文件失败:', deleteResult.error);
    }
  }
  
  /**
   * 阶段6: 数据批量更新
   * 更新缓存和保存扫描完成时间
   */
  async updateDataPhase(processedCount, failedCount, scanStartTime) {
    console.log('🔄 阶段6: 开始数据批量更新...');
    
    this.sendProgressMessage('updating_data', 0, processedCount, failedCount, scanStartTime);
    
    try {
      // 强制刷新缓存（重置状态后重新构建）
      console.log('🔄 强制刷新缓存...');
      await UnifiedDataService.imageCache.refreshCache();
      console.log('✅ 缓存更新完成');
      
      // 保存扫描完成时间
      const settings = await UnifiedDataService.readSettings();
      settings.lastScanTime = new Date().toISOString();
      await UnifiedDataService.writeSettings(settings);
      console.log('✅ 扫描完成时间已保存');
      
    } catch (error) {
      console.error('❌ 阶段6失败: 数据更新失败:', error);
    }
    
    // 发送最终进度通知（在数据更新完成后）
    this.sendProgressMessage(
      'processing_images', 
      0, 
      processedCount, 
      failedCount, 
      scanStartTime,
      `处理完成: ${processedCount} 个文件，失败 ${failedCount} 个`
    );
    
    console.log('✅ 阶段6完成: 数据更新完成');
  }

}

export default GalleryScannerService;