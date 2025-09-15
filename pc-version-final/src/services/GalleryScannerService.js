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
      
      return { takenTime, locationInfo };
      
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
        simpleMessage = `扫描目录: ${dirName} | 发现: ${filesFound || 0} 个文件`;
        break;
        
      case 'file_comparison':
        simpleMessage = '文件比对: 分析文件差异';
        break;
        
      case 'processing_new_images':
        simpleMessage = `处理新增照片: ${filesProcessed || 0}/${filesFound || 0} | 失败: ${filesFailed || 0}`;
        break;
        
      case 'removing_files':
        simpleMessage = `移除已删除照片: ${filesProcessed || 0} 个文件`;
        break;
        
      case 'completed':
        simpleMessage = `扫描完成: 处理了 ${filesProcessed || 0} 个文件`;
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
      console.log('Starting optimized incremental scan of local gallery...');
      
      // 确保使用最新的配置
      const settings = await UnifiedDataService.readSettings();
      this.galleryPaths = settings.scanPaths || [];
      
      const scanStartTime = new Date().toLocaleTimeString();
      
      // 1. 获取现有图片URI集合 - O(n)
      const existingUris = new Set(await UnifiedDataService.getImageUris());
      console.log(`Found ${existingUris.size} existing image URIs`);
      
      if (onProgress) {
        const rawProgress = {
          current: 0,
          total: 0,
          message: '开始扫描...',
          filesFound: 0,
          filesProcessed: 0,
          filesFailed: 0,
          stage: 'initializing',
          stageProgress: '正在初始化扫描...',
          scanStartTime: scanStartTime
        };
        onProgress(this.processProgressData(rawProgress));
      }
      
      // 2. 确定需要扫描的目录
      let pathsToScan = this.galleryPaths;
      let scanMode = 'full'; // full, incremental
      
      // 2. 扫描文件系统，获取当前存在的文件URI - O(m)
      const currentFileUris = new Set();
      const allImages = [];
      let totalDirectories = 0;
      let currentDirectory = 0;
      let finalFilesFound = 0; // 跟踪最终发现的文件数量
      
      // 计算总目录数
      for (const path of pathsToScan) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            totalDirectories++;
          }
        } catch (error) {
          console.error(`Check path ${path} failed:`, error);
        }
      }
      
      // 扫描指定目录
      for (const path of pathsToScan) {
        try {
          const exists = await RNFS.exists(path);
          if (!exists) continue;
          
          currentDirectory++;
          
          if (onProgress) {
            const rawProgress = {
              current: currentDirectory,
              total: totalDirectories,
              message: `正在扫描目录: ${path.split('/').pop() || path.split('\\').pop()}`,
              filesFound: allImages.length,
              filesProcessed: 0,
              filesFailed: 0,
              stage: 'directory_scanning',
              stageProgress: `扫描目录 ${currentDirectory}/${totalDirectories}: ${path.split('/').pop() || path.split('\\').pop()}`,
              scanStartTime: scanStartTime
            };
            onProgress(this.processProgressData(rawProgress));
          }
          
          // 使用 setTimeout 让出主进程控制权，避免阻塞
          await new Promise(resolve => setTimeout(resolve, 0));
          
          const images = await this.scanDirectoryForUris(path, (progress) => {
            if (onProgress) {
              const rawProgress = {
                current: currentDirectory,
                total: totalDirectories,
                message: `正在扫描目录: ${path.split('/').pop() || path.split('\\').pop()}`,
                filesFound: progress.filesFound,
                filesProcessed: 0,
                filesFailed: 0,
                stage: 'directory_scanning',
                stageProgress: `扫描目录 ${currentDirectory}/${totalDirectories}: ${path.split('/').pop() || path.split('\\').pop()} | 已发现: ${progress.filesFound} 个文件`,
                scanStartTime: scanStartTime
              };
              onProgress(this.processProgressData(rawProgress));
            }
          }, allImages.length);
          console.log(`📊 目录 ${path} 扫描结果: ${images.length} 张图片`);
          
          images.forEach(img => {
            currentFileUris.add(img.uri);
            allImages.push(img);
          });
          
          console.log(`📊 累计扫描图片总数: ${allImages.length}`);
          
          if (onProgress) {
            const rawProgress = {
              current: currentDirectory,
              total: totalDirectories,
              message: `目录扫描完成: ${path.split('/').pop() || path.split('\\').pop()}`,
              filesFound: allImages.length,
              filesProcessed: 0,
              filesFailed: 0,
              stage: 'directory_scanning',
              stageProgress: `扫描目录 ${currentDirectory}/${totalDirectories}: ${path.split('/').pop() || path.split('\\').pop()} | 发现: ${images.length} 个文件`,
              scanStartTime: scanStartTime
            };
            onProgress(this.processProgressData(rawProgress));
          }
          
        } catch (error) {
          console.error(`Scan path ${path} failed:`, error);
        }
      }
      
      // 等待所有递归扫描完成，然后设置最终发现的文件数量
      await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms确保所有递归调用完成
      finalFilesFound = allImages.length;
      console.log(`📊 目录扫描完成，最终发现文件数量: ${finalFilesFound}`);
      
      // 立即更新进度提示：目录扫描完成，准备进入新增照片处理阶段
      if (onProgress) {
        const rawProgress = {
          current: 0,
          total: 0,
          message: '目录扫描完成，准备处理新增照片...',
          filesFound: finalFilesFound,
          filesProcessed: 0,
          filesFailed: 0,
          stage: 'processing_new_images',
          stageProgress: `目录扫描完成，发现 ${finalFilesFound} 个文件，准备处理新增照片`,
          scanStartTime: scanStartTime
        };
        onProgress(this.processProgressData(rawProgress));
      }
      
      // 3. 找出差异 - O(n + m)
      const deletedUris = []; // AsyncStorage中有，但文件系统中没有
      const newUris = []; // 文件系统中有，但AsyncStorage中没有
      
      if (scanMode === 'incremental') {
        // 增量模式：只处理新增目录的文件
        console.log('📁 增量模式：只处理新增目录的文件');
        for (const uri of currentFileUris) {
          if (!existingUris.has(uri)) {
            newUris.push(uri);
          }
        }
      } else {
        // 全量模式：处理所有差异
        // 找出被删除的文件
        for (const uri of existingUris) {
          if (!currentFileUris.has(uri)) {
            deletedUris.push(uri);
          }
        }
        
        // 找出新增的文件
        for (const uri of currentFileUris) {
          if (!existingUris.has(uri)) {
            newUris.push(uri);
          }
        }
      }
      
      
      console.log(`Incremental scan analysis: ${deletedUris.length} deleted, ${newUris.length} new files`);
      
      // 4. 处理删除的文件 - O(k) k为删除数量
      if (deletedUris.length > 0) {
        console.log(`Removing ${deletedUris.length} deleted files from database...`);
        if (onProgress) {
          const rawProgress = {
            current: 0,
            total: newUris.length + deletedUris.length,
            message: `正在移除已删除的照片...`,
            filesFound: finalFilesFound, // 使用固定的最终文件数量
            filesProcessed: 0,
            filesFailed: 0,
            stage: 'removing_files',
            stageProgress: `待移除: ${deletedUris.length} 个文件 | 已移除: 0 个`,
            scanStartTime: scanStartTime
          };
          onProgress(this.processProgressData(rawProgress));
        }
        
        const deleteResult = await UnifiedDataService.removeImagesByUris(deletedUris, false); // 扫描过程中不更新缓存
        if (deleteResult.success) {
          console.log(`Successfully removed ${deleteResult.removedCount} deleted files`);
          if (onProgress) {
            const rawProgress = {
              current: 0,
              total: newUris.length + deletedUris.length,
              message: `移除照片完成`,
              filesFound: finalFilesFound,
              filesProcessed: 0,
              filesFailed: 0,
              stage: 'removing_files',
              stageProgress: `已移除: ${deleteResult.removedCount} 个文件`,
              scanStartTime: scanStartTime
            };
            onProgress(this.processProgressData(rawProgress));
          }
        } else {
          console.error('Failed to remove deleted files:', deleteResult.error);
        }
      }
      
      // 5. 处理新增的文件 - O(l) l为新增数量
      const newImages = allImages.filter(img => newUris.includes(img.uri));
      
      // 初始化计数器
      let processedCount = 0;
      let failedCount = 0;
      
      if (newImages.length > 0) {
        console.log(`Processing ${newImages.length} new images...`);
        
        if (onProgress) {
          const rawProgress = {
            current: 0,
            total: newImages.length,
            message: '正在处理新增照片...',
            filesFound: finalFilesFound, // 使用固定的最终文件数量
            filesProcessed: 0,
            filesFailed: 0,
            stage: 'processing_new_images',
            stageProgress: `新增照片: ${newImages.length} 个 | 已处理: 0 个`,
            scanStartTime: scanStartTime
          };
          onProgress(this.processProgressData(rawProgress));
        }
        
        // 多线程并行处理大量图片
        const THREAD_COUNT = 5; // 10个并行线程
        const SAVE_BATCH_SIZE = 100; // 每10张图片批量保存一次
        
        // 计算每个线程应该处理的图片数量
        const imagesPerThread = Math.ceil(newImages.length / THREAD_COUNT);
        
        // 将图片分配给不同线程
        const threadGroups = [];
        for (let i = 0; i < THREAD_COUNT; i++) {
          const startIndex = i * imagesPerThread;
          const endIndex = Math.min(startIndex + imagesPerThread, newImages.length);
          if (startIndex < newImages.length) {
            threadGroups.push(newImages.slice(startIndex, endIndex));
          }
        }
        
        // 线程状态跟踪
        const threadStatus = new Array(threadGroups.length).fill(0); // 每个线程已处理的图片数
        
        console.log(`🚀 启动 ${THREAD_COUNT} 个并行线程，处理 ${newImages.length} 张图片`);
        console.log(`📦 每个线程处理约 ${imagesPerThread} 张图片，每 ${SAVE_BATCH_SIZE} 张批量保存`);
        console.log(`📊 线程分配: ${threadGroups.map((group, i) => `线程${i+1}:${group.length}张`).join(', ')}`);
        
        // 创建线程处理函数
        const processThread = async (threadIndex, images) => {
          const threadProcessedCount = { value: 0 };
          const threadFailedCount = { value: 0 };
          
          // 线程内分批串行处理
          for (let i = 0; i < images.length; i += SAVE_BATCH_SIZE) {
            const batch = images.slice(i, i + SAVE_BATCH_SIZE);
            
            // 并行处理批次内的图片
            const batchPromises = batch.map(async (image) => {
              try {
                // 在新增照片信息提取阶段提取EXIF数据（一次读取同时获取时间和位置信息）
                const exifData = await extractExifData(image.path);
                const takenTime = exifData.takenTime;
                const locationInfo = exifData.locationInfo;
                  
                const classification = await this.imageClassifier.classifyImage(image.uri, {
                  timestamp: image.timestamp,
                  fileSize: image.size,
                  fileName: image.fileName
                });
                
                // 构建保存数据，包含城市信息
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
                  cityDistance: locationInfo.cityDistance
                };

                return { success: true, data: saveData };
                
              } catch (error) {
                console.error(`Thread ${threadIndex} failed to process ${image.fileName}:`, error);
                return { success: false, error: error.message };
              }
            });
            
            // 等待批次内所有图片处理完成
            const batchResults = await Promise.all(batchPromises);
            
            // 统计批次结果
            const successfulData = [];
            for (const result of batchResults) {
              if (result.success) {
                successfulData.push(result.data);
                threadProcessedCount.value++;
              } else {
                threadFailedCount.value++;
              }
            }
            
            // 批量保存成功的数据
            if (successfulData.length > 0) {
              await UnifiedDataService.writeImageDetailedInfo(successfulData, false); // 扫描过程中不更新缓存
              
              // 批量保存后暂停10ms，让出主进程控制权，减少卡顿
              await new Promise(resolve => setTimeout(resolve, 10));
            }
            
            // 更新全局进度（线程安全）
            processedCount += successfulData.length;
            failedCount += (batchResults.length - successfulData.length);
            
            // 更新线程状态
            threadStatus[threadIndex] += successfulData.length;
            
            // 每500个文件更新一次进度 - 显示所有线程的详细状态
            if (onProgress && processedCount % 500 === 0) {
              const threadDetails = threadStatus.map((count, i) => {
                const threadTotal = threadGroups[i] ? threadGroups[i].length : 0;
                const remaining = Math.max(0, threadTotal - count);
                return `线程${i+1}:${count}/${threadTotal} (剩余:${remaining})`;
              });
              
              const rawProgress = {
                current: processedCount,
                total: newImages.length,
                message: `正在处理新增照片...`,
                filesFound: finalFilesFound,
                filesProcessed: processedCount,
                filesFailed: failedCount,
                stage: 'processing_new_images',
                stageProgress: `多线程处理: ${threadDetails.join(', ')} | 总计: ${processedCount}/${newImages.length}`,
                scanStartTime: scanStartTime
              };
              onProgress(this.processProgressData(rawProgress));
            }
            
            // 让出主进程控制权
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          
          return { processed: threadProcessedCount.value, failed: threadFailedCount.value };
        };
        
        // 启动并行线程
        const threadPromises = [];
        for (let i = 0; i < Math.min(THREAD_COUNT, threadGroups.length); i++) {
          if (threadGroups[i] && threadGroups[i].length > 0) {
            threadPromises.push(processThread(i, threadGroups[i]));
          }
        }
        
        // 等待所有线程完成
        const threadResults = await Promise.all(threadPromises);
        
        // 最终进度更新
        if (onProgress) {
          const rawProgress = {
            current: processedCount,
            total: newImages.length,
            message: `新增照片处理完成`,
            filesFound: finalFilesFound,
            filesProcessed: processedCount,
            filesFailed: failedCount,
            stage: 'processing_new_images',
            stageProgress: `多线程处理完成: ${processedCount} 个成功, ${failedCount} 个失败`,
            scanStartTime: scanStartTime
          };
          onProgress(this.processProgressData(rawProgress));
        }
        
        console.log(`New images processing completed: ${processedCount} processed, ${failedCount} failed`);
        
        if (onProgress) {
          const rawProgress = {
            current: processedCount,
            total: newImages.length,
            message: `新增照片处理完成`,
            filesFound: finalFilesFound,
            filesProcessed: processedCount,
            filesFailed: failedCount,
            stage: 'processing_new_images',
            stageProgress: `新增照片处理完成: 已处理 ${processedCount} 个，失败 ${failedCount} 个`,
            scanStartTime: scanStartTime
          };
          onProgress(this.processProgressData(rawProgress));
        }
      }
      
      // 扫描完成 - 更新缓存
      console.log('🔄 扫描完成，开始更新缓存...');
      try {
        await UnifiedDataService.imageCache.buildCache();
        console.log('✅ 缓存更新完成');
      } catch (error) {
        console.error('❌ 缓存更新失败:', error);
      }
      
      if (onProgress) {
        const rawProgress = {
          current: 100,
          total: 100,
          message: `扫描完成`,
          filesFound: finalFilesFound,
          filesProcessed: processedCount,
          filesFailed: failedCount,
          stage: 'completed',
          stageProgress: `扫描完成: 发现 ${finalFilesFound} 个文件，处理 ${processedCount} 个新增照片，移除 ${deletedUris.length} 个文件`,
          scanStartTime: scanStartTime,
          newImages: processedCount,
          deleted: deletedUris.length
        };
        onProgress(this.processProgressData(rawProgress));
      }
      
      return {
        success: true,
        deleted: deletedUris.length,
        newImages: newImages.length,
        processed: newImages.length - (failedCount || 0),
        failed: failedCount || 0
      };
      
    } catch (error) {
      console.error('Optimized incremental scan failed:', error);
      throw error;
    }
  }


  async scanDirectory(dirPath, existingUris = new Set()) {
    try {
      console.log(`Starting to scan directory: ${dirPath}`);
      
      if (!existingUris || !(existingUris instanceof Set)) {
        console.warn('existingUris is not a valid Set, creating new empty Set');
        existingUris = new Set();
      }
      
      const exists = await RNFS.exists(dirPath);
      if (!exists) {
        console.log(`Directory does not exist: ${dirPath}`);
        return [];
      }
      
      console.log(`Directory exists, starting to read contents...`);
      const items = await RNFS.readDir(dirPath);
      console.log(`Directory ${dirPath} contains ${items.length} items`);
      
      const images = [];
      
      for (const item of items) {
        if (item.isDirectory()) {
          console.log(`Found subdirectory: ${item.name}`);
          const subImages = await this.scanDirectory(item.path, existingUris);
          images.push(...subImages);
        } else if (this.isImageFile(item.name)) {
          // 在 Windows 系统中，文件路径需要正确的格式
          const fileUri = Platform.OS === 'web' 
            ? `file:///${item.path}` 
            : `file://${item.path}`;
          if (existingUris.has(fileUri)) {
            continue;
          }
          
          console.log(`🔍 Found new image file: ${item.name}`);
          console.log(`📁 File path: ${item.path}`);
          console.log(`🔗 Generated URI: ${fileUri}`);
          console.log(`✅ This should be visible in console`);
           
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
          } catch (error) {
            console.error(`Failed to get file ${item.name} info:`, error);
          }
        }
      }
      
      console.log(`Directory ${dirPath} scan completed, found ${images.length} images`);
      return images;
    } catch (error) {
      console.error(`Scan directory ${dirPath} failed:`, error);
      console.error('Error stack:', error.stack);
      return [];
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
      
      // console.log(`📁 目录 ${dirPath} 包含 ${items.length} 个项目`);
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        
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

  async testFileSystemAccess() {
    try {
      console.log('=== Starting file system access test ===');
      
      console.log('RNFS constants:');
      console.log(`ExternalDirectoryPath: ${RNFS.ExternalDirectoryPath}`);
      console.log(`PicturesDirectoryPath: ${RNFS.PicturesDirectoryPath}`);
      console.log(`DCIMDirectoryPath: ${RNFS.DCIMDirectoryPath}`);
      console.log(`DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
      console.log(`MainBundlePath: ${RNFS.MainBundlePath}`);
      
      const testPaths = [
        '/storage/emulated/0',
        '/sdcard',
        '/mnt/sdcard',
        RNFS.ExternalDirectoryPath,
        RNFS.PicturesDirectoryPath,
        RNFS.DCIMDirectoryPath,
        '/storage/emulated/0/Pictures',
        '/storage/emulated/0/Pictures/Pictures',
        '/sdcard/Pictures',
        '/sdcard/Pictures/Pictures',
      ];
      
      for (const path of testPaths) {
        if (path) {
          try {
            const exists = await RNFS.exists(path);
            console.log(`Path ${path} exists: ${exists}`);
            
            if (exists) {
              try {
                const items = await RNFS.readDir(path);
                console.log(`Path ${path} contains ${items.length} items`);
                
                const firstItems = items.slice(0, 5);
                firstItems.forEach(item => {
                  console.log(`  - ${item.name} (${item.isDirectory() ? 'Directory' : 'File'})`);
                });
                
                if (items.length > 5) {
                  console.log(`  ... and ${items.length - 5} more items`);
                }
              } catch (error) {
                console.log(`Read path ${path} failed:`, error.message);
              }
            }
          } catch (error) {
            console.log(`Check path ${path} failed:`, error.message);
          }
        }
      }
      
      console.log('=== File system access test completed ===');
    } catch (error) {
      console.error('File system access test failed:', error);
    }
  }

  async testKnownFile() {
    try {
      console.log('=== Starting known file test ===');
      
      const knownFile = '/storage/emulated/0/Pictures/Pictures/test2.jpg';
      
      console.log(`Test file: ${knownFile}`);
      
      const exists = await RNFS.exists(knownFile);
      console.log(`File exists: ${exists}`);
      
      if (exists) {
        try {
          const stats = await RNFS.stat(knownFile);
          console.log(`File info:`);
          console.log(`  Size: ${stats.size} bytes`);
          console.log(`  Modified time: ${stats.mtime}`);
          console.log(`  Created time: ${stats.ctime}`);
          console.log(`  Permissions: ${stats.mode}`);
          
          const fileContent = await RNFS.read(knownFile, 100, 0, 'ascii');
          console.log(`File header content: ${fileContent}`);
          
        } catch (error) {
          console.log(`Read file info failed:`, error.message);
        }
      }
      
      const alternativePaths = [
        '/sdcard/Pictures/Pictures/test2.jpg',
        '/mnt/sdcard/Pictures/Pictures/test2.jpg',
        '/storage/emulated/0/Pictures/test2.jpg',
        '/sdcard/Pictures/test2.jpg',
      ];
      
      for (const path of alternativePaths) {
        try {
          const altExists = await RNFS.exists(path);
          console.log(`Alternative path ${path} exists: ${altExists}`);
        } catch (error) {
          console.log(`Check alternative path ${path} failed:`, error.message);
        }
      }
      
      console.log('=== Known file test completed ===');
    } catch (error) {
      console.error('Known file test failed:', error);
    }
  }


  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  async getGalleryStats() {
    try {
      const images = await this.scanGallery();
      
      const stats = {
        totalImages: images.length,
        byCategory: {},
        byDate: {},
        totalSize: 0,
        averageSize: 0,
      };
      
      images.forEach(img => {
        if (!stats.byCategory[img.category]) {
          stats.byCategory[img.category] = 0;
        }
        stats.byCategory[img.category]++;
        stats.totalSize += img.size || 0;
      });
      
      images.forEach(img => {
        const date = new Date(img.timestamp).toDateString();
        if (!stats.byDate[date]) {
          stats.byDate[date] = 0;
        }
        stats.byDate[date]++;
      });
      
      stats.averageSize = stats.totalImages > 0 ? stats.totalSize / stats.totalImages : 0;
      
      return stats;
    } catch (error) {
      console.error('Get gallery stats failed:', error);
      throw error;
    }
  }

  async testLocationExtraction() {
    try {
      console.log('🧪 Starting location info extraction test...');
      
      const allImages = await UnifiedDataService.readAllImages();
      console.log(`📊 Database contains ${allImages.length} images total`);
      
      let imagesWithLocation = 0;
      let imagesWithGPS = 0;
      let imagesWithAddress = 0;
      const locationStats = {
        bySource: {},
        byCity: {},
        byCountry: {},
        gpsCoordinates: [],
        recentWithLocation: []
      };
      
      allImages.forEach((img, index) => {
        if (img.location) {
          imagesWithLocation++;
          
          if (img.location.latitude && img.location.longitude) {
            imagesWithGPS++;
            locationStats.gpsCoordinates.push({
              fileName: img.fileName,
              latitude: img.location.latitude,
              longitude: img.location.longitude,
              accuracy: img.location.accuracy
            });
          }
          
          if (img.location.address || img.location.city) {
            imagesWithAddress++;
          }
          
          const source = img.location.source || 'unknown';
          locationStats.bySource[source] = (locationStats.bySource[source] || 0) + 1;
          
          if (img.location.city) {
            locationStats.byCity[img.location.city] = (locationStats.byCity[img.location.city] || 0) + 1;
          }
          
          if (img.location.country) {
            locationStats.byCountry[img.location.country] = (locationStats.byCountry[img.location.country] || 0) + 1;
          }
          
          if (locationStats.recentWithLocation.length < 5) {
            locationStats.recentWithLocation.push({
              fileName: img.fileName,
              category: img.category,
              location: img.location,
              takenAt: img.takenAt ? new Date(img.takenAt).toLocaleString('zh-CN') : 'Unknown'
            });
          }
        }
      });
      
      console.log('\n📋 Location info extraction test results:');
      console.log('================================');
      console.log(`📊 Total images: ${allImages.length}`);
      console.log(`📍 Images with location info: ${imagesWithLocation}`);
      console.log(`🌍 Images with GPS coordinates: ${imagesWithGPS}`);
      console.log(`🏠 Images with address info: ${imagesWithAddress}`);
      console.log(`📈 Location info coverage: ${((imagesWithLocation / allImages.length) * 100).toFixed(1)}%`);
      
      console.log('\n📊 By source:');
      Object.entries(locationStats.bySource).forEach(([source, count]) => {
        console.log(`   ${source}: ${count} images`);
      });
      
      if (Object.keys(locationStats.byCity).length > 0) {
        console.log('\n🏙️ By city:');
        Object.entries(locationStats.byCity).forEach(([city, count]) => {
          console.log(`   ${city}: ${count} images`);
        });
      }
      
      if (Object.keys(locationStats.byCountry).length > 0) {
        console.log('\n🌍 By country:');
        Object.entries(locationStats.byCountry).forEach(([country, count]) => {
          console.log(`   ${country}: ${count} images`);
        });
      }
      
      if (locationStats.gpsCoordinates.length > 0) {
        console.log('\n🗺️ GPS coordinates examples:');
        locationStats.gpsCoordinates.slice(0, 3).forEach(coord => {
          console.log(`   ${coord.fileName}: ${coord.latitude}, ${coord.longitude} (accuracy: ${coord.accuracy || 'unknown'})`);
        });
      }
      
      if (locationStats.recentWithLocation.length > 0) {
        console.log('\n📸 Recent images with location info:');
        locationStats.recentWithLocation.forEach(img => {
          console.log(`   ${img.fileName} (${img.category}) - ${img.takenAt}`);
          if (img.location.latitude && img.location.longitude) {
            console.log(`     GPS: ${img.location.latitude}, ${img.location.longitude}`);
          }
          if (img.location.city) {
            console.log(`     City: ${img.location.city}`);
          }
        });
      }
      
      console.log('\n✅ Location info extraction test completed!');
      
      return {
        totalImages: allImages.length,
        imagesWithLocation,
        imagesWithGPS,
        imagesWithAddress,
        coverageRate: (imagesWithLocation / allImages.length) * 100,
        locationStats
      };
      
    } catch (error) {
      console.error('❌ Location info extraction test failed:', error);
      throw error;
    }
  }

  async testSingleImageLocation(imagePath) {
    try {
      console.log(`🧪 Testing single image location info extraction: ${imagePath}`);
      
      const locationInfo = await extractLocationInfo(imagePath);
      
      if (locationInfo) {
        console.log('✅ Location info extraction successful:');
        console.log(JSON.stringify(locationInfo, null, 2));
        return locationInfo;
      } else {
        console.log('⚠️ No location info found');
        return null;
      }
    } catch (error) {
      console.error('❌ Single image location info extraction failed:', error);
      throw error;
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

  // 创建测试图片数据（仅用于 PC 端演示）
  async createTestImages() {
    console.log('🎨 Creating test images for PC demo...');
    
    const testImages = [
      {
        uri: 'https://picsum.photos/400/300?random=1',
        fileName: 'test_image_1.jpg',
        size: 45678,
        timestamp: Date.now() - 86400000, // 1天前
        takenAt: Date.now() - 86400000,
        path: '/mock/test_image_1.jpg',
        latitude: 39.9042,
        longitude: 116.4074,
        altitude: 50,
        accuracy: 10,
        address: '北京市朝阳区',
        city: '北京',
        country: '中国',
        province: '北京市',
        district: '朝阳区',
        street: '建国门外大街',
        source: 'test'
      },
      {
        uri: 'https://picsum.photos/400/300?random=2',
        fileName: 'test_image_2.jpg',
        size: 52341,
        timestamp: Date.now() - 172800000, // 2天前
        takenAt: Date.now() - 172800000,
        path: '/mock/test_image_2.jpg',
        latitude: 31.2304,
        longitude: 121.4737,
        altitude: 20,
        accuracy: 15,
        address: '上海市黄浦区',
        city: '上海',
        country: '中国',
        province: '上海市',
        district: '黄浦区',
        street: '南京东路',
        source: 'test'
      },
      {
        uri: 'https://picsum.photos/400/300?random=3',
        fileName: 'test_image_3.jpg',
        size: 38912,
        timestamp: Date.now() - 259200000, // 3天前
        takenAt: Date.now() - 259200000,
        path: '/mock/test_image_3.jpg',
        latitude: 22.3193,
        longitude: 114.1694,
        altitude: 100,
        accuracy: 8,
        address: '香港特别行政区',
        city: '香港',
        country: '中国',
        province: '香港特别行政区',
        district: '中西区',
        street: '中环',
        source: 'test'
      },
      {
        uri: 'https://picsum.photos/400/300?random=4',
        fileName: 'test_image_4.jpg',
        size: 41234,
        timestamp: Date.now() - 345600000, // 4天前
        takenAt: Date.now() - 345600000,
        path: '/mock/test_image_4.jpg',
        latitude: 23.1291,
        longitude: 113.2644,
        altitude: 30,
        accuracy: 12,
        address: '广东省广州市',
        city: '广州',
        country: '中国',
        province: '广东省',
        district: '天河区',
        street: '珠江新城',
        source: 'test'
      },
      {
        uri: 'https://picsum.photos/400/300?random=5',
        fileName: 'test_image_5.jpg',
        size: 47890,
        timestamp: Date.now() - 432000000, // 5天前
        takenAt: Date.now() - 432000000,
        path: '/mock/test_image_5.jpg',
        latitude: 30.5728,
        longitude: 104.0668,
        altitude: 500,
        accuracy: 20,
        address: '四川省成都市',
        city: '成都',
        country: '中国',
        province: '四川省',
        district: '锦江区',
        street: '春熙路',
        source: 'test'
      }
    ];

    console.log(`✅ Created ${testImages.length} test images for PC demo`);
    return testImages;
  }
}

export default GalleryScannerService;