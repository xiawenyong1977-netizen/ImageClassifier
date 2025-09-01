import { Platform, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';
import ImageClassifierService from './ImageClassifierService';

// EXIF拍摄时间读取函数
const extractTakenTime = async (filePath) => {
  try {
    // 优先使用备用EXIF库（exif-parser），因为它更稳定
    console.log(`🔍 尝试从文件 ${filePath.split('/').pop()} 读取EXIF拍摄时间...`);
    
    try {
      console.log(`🔄 使用exif-parser库读取EXIF数据...`);
      const ExifParser = require('exif-parser');
      const RNFS = require('react-native-fs');
      const Buffer = require('buffer').Buffer;
      
      // 读取文件的前64KB来解析EXIF数据
      const buffer = await RNFS.read(filePath, 65536, 0, 'base64');
      const arrayBuffer = Buffer.from(buffer, 'base64');
      
      const parser = ExifParser.create(arrayBuffer);
      const exifData = parser.parse();
      console.log(`📸 EXIF数据读取成功:`, exifData);
      
      if (exifData && exifData.tags && exifData.tags.DateTimeOriginal) {
        const takenDate = new Date(exifData.tags.DateTimeOriginal * 1000);
        console.log(`✅ 找到拍摄时间: ${takenDate.toLocaleString('zh-CN')}`);
        return takenDate.getTime();
      }
      
      if (exifData && exifData.tags && exifData.tags.DateTime) {
        const takenDate = new Date(exifData.tags.DateTime * 1000);
        console.log(`✅ 找到修改时间: ${takenDate.toLocaleString('zh-CN')}`);
        return takenDate.getTime();
      }
      
      console.log(`⚠️ 文件中没有找到拍摄时间信息`);
      return null;
      
    } catch (parseError) {
      console.log(`⚠️ exif-parser解析失败:`, parseError.message);
      
      // 如果备用库失败，尝试使用原生库作为最后手段
      try {
        console.log(`🔄 尝试使用react-native-exif原生库...`);
        const RNExif = require('react-native-exif');
        
        const exifData = await RNExif.getExif(filePath);
        console.log(`📸 原生库EXIF数据:`, exifData);
        
        if (exifData && exifData.DateTimeOriginal) {
          const dateTimeStr = exifData.DateTimeOriginal;
          console.log(`📅 原生库找到拍摄时间: ${dateTimeStr}`);
          
          const [datePart, timePart] = dateTimeStr.split(' ');
          const [year, month, day] = datePart.split(':');
          const [hour, minute, second] = timePart.split(':');
          
          const takenDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
          );
          
          console.log(`✅ 原生库拍摄时间解析成功: ${takenDate.toLocaleString('zh-CN')}`);
          return takenDate.getTime();
        }
        
        if (exifData && exifData.DateTime) {
          const dateTimeStr = exifData.DateTime;
          console.log(`📅 原生库找到修改时间: ${dateTimeStr}`);
          
          const [datePart, timePart] = dateTimeStr.split(' ');
          const [year, month, day] = datePart.split(':');
          const [hour, minute, second] = timePart.split(':');
          
          const takenDate = new Date(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(hour),
            parseInt(minute),
            parseInt(second)
          );
          
          console.log(`✅ 原生库修改时间解析成功: ${takenDate.toLocaleString('zh-CN')}`);
          return takenDate.getTime();
        }
        
        console.log(`⚠️ 原生库也未找到拍摄时间`);
        return null;
        
      } catch (nativeError) {
        console.log(`❌ 原生库也失败:`, nativeError.message);
        return null;
      }
    }
    
  } catch (error) {
    console.error(`❌ EXIF读取完全失败:`, error);
    return null;
  }
};
import ImageStorageService from './ImageStorageService';

class GalleryScannerService {
  constructor() {
    this.isInitialized = false;
    
    // 创建服务实例
    this.imageClassifier = new ImageClassifierService();
    
    // 定义本地相册路径 - 尝试多种可能的路径
    this.galleryPaths = [
      // Android 标准路径
      '/storage/emulated/0/DCIM/Camera',           // 相机拍摄的照片
      '/storage/emulated/0/DCIM/Screenshots',      // 截图
      '/storage/emulated/0/Pictures',              // 图片文件夹
      '/storage/emulated/0/Download',              // 下载文件夹
      '/storage/emulated/0/WeChat/WeChat Images',  // 微信图片
      '/storage/emulated/0/QQ_Images',             // QQ图片
      '/storage/emulated/0/Telegram',              // Telegram图片
      '/storage/emulated/0/WhatsApp/Media/WhatsApp Images', // WhatsApp图片
      

    ];
  }

  // 初始化服务
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // 在实际应用中，这里应该请求相册权限
      // 并初始化相关的原生模块
      await this.requestPermissions();
      this.isInitialized = true;
      console.log('相册扫描服务初始化成功');
    } catch (error) {
      console.error('相册扫描服务初始化失败:', error);
      throw error;
    }
  }

  // 请求必要的权限
  async requestPermissions() {
    if (Platform.OS === 'android') {
      try {
        console.log('🔐 开始权限检查和请求...');
        
        // 获取Android API级别
        const apiLevel = Platform.Version;
        console.log(`📱 检测到Android API级别: ${apiLevel}`);
        
        // 打印所有相关权限的当前状态
        console.log('📋 当前权限状态检查:');
        
        // 检查READ_EXTERNAL_STORAGE权限
        const hasReadStorage = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        console.log(`   📁 READ_EXTERNAL_STORAGE: ${hasReadStorage ? '✅ 已授予' : '❌ 未授予'}`);
        
        // 检查WRITE_EXTERNAL_STORAGE权限
        const hasWriteStorage = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
        );
        console.log(`   📝 WRITE_EXTERNAL_STORAGE: ${hasWriteStorage ? '✅ 已授予' : '❌ 未授予'}`);
        
        // 检查READ_MEDIA_IMAGES权限（Android 13+）
        if (apiLevel >= 33) {
          const hasMediaImages = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          console.log(`   🖼️ READ_MEDIA_IMAGES: ${hasMediaImages ? '✅ 已授予' : '❌ 未授予'}`);
        }
        
        // 检查CAMERA权限
        const hasCamera = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.CAMERA
        );
        console.log(`   📷 CAMERA: ${hasCamera ? '✅ 已授予' : '❌ 未授予'}`);
        
        console.log('📋 权限状态检查完成\n');
        
        // 对于 Android 13+ (API 33+)，优先使用 READ_MEDIA_IMAGES 权限
        if (apiLevel >= 33) {
          console.log('✅ Android 13+ 检测到，使用 READ_MEDIA_IMAGES 权限');
          
          // 先检查是否已经有媒体权限
          const hasMediaPermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
          );
          
          console.log(`📋 READ_MEDIA_IMAGES 权限状态: ${hasMediaPermission ? '已授予' : '未授予'}`);
          
          if (hasMediaPermission) {
            console.log('✅ 媒体权限已存在，无需请求');
            return;
          }
          
          console.log('🔄 开始请求 READ_MEDIA_IMAGES 权限...');
          
          // 请求媒体权限
          const mediaGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            {
              title: '相册权限',
              message: '应用需要访问您的相册来扫描和分类图片。请在权限弹窗中选择"允许"。',
              buttonNeutral: '稍后询问',
              buttonNegative: '取消',
              buttonPositive: '确定',
            }
          );
          
          console.log(`📋 权限请求结果: ${mediaGranted}`);
          
          if (mediaGranted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ 媒体权限已授予');
            return;
          } else if (mediaGranted === PermissionsAndroid.RESULTS.DENIED) {
            console.log('❌ 媒体权限被拒绝，请手动授予权限');
            throw new Error('相册权限被拒绝，请在系统设置中手动授予相册权限');
          } else {
            console.log('⚠️ 媒体权限请求被取消');
            throw new Error('相册权限请求被取消，请在系统设置中手动授予相册权限');
          }
        } else {
          // 对于 Android 12 及以下版本，使用 READ_EXTERNAL_STORAGE 权限
          console.log('✅ Android 12 及以下版本，使用 READ_EXTERNAL_STORAGE 权限');
          
          // 先检查是否已经有存储权限
          const hasStoragePermission = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
          );
          
          console.log(`📋 READ_EXTERNAL_STORAGE 权限状态: ${hasStoragePermission ? '已授予' : '未授予'}`);
          
          if (hasStoragePermission) {
            console.log('✅ 存储权限已存在，无需请求');
            return;
          }
          
          console.log('🔄 开始请求 READ_EXTERNAL_STORAGE 权限...');
          
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
            {
              title: '存储权限',
              message: '应用需要访问您的相册来扫描和分类图片。请在权限弹窗中选择"允许"。',
              buttonNeutral: '稍后询问',
              buttonNegative: '取消',
              buttonPositive: '确定',
            }
          );
          
          console.log(`📋 权限请求结果: ${granted}`);
          
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ 存储权限已授予');
          } else if (granted === PermissionsAndroid.RESULTS.DENIED) {
            console.log('❌ 存储权限被拒绝，请手动授予权限');
            throw new Error('存储权限被拒绝，请在系统设置中手动授予存储权限');
          } else {
            console.log('⚠️ 存储权限请求被取消');
            throw new Error('存储权限请求被取消，请在系统设置中手动授予存储权限');
          }
        }
        
        // 尝试请求高级权限（用于删除文件）
        console.log('🔄 尝试请求高级权限...');
        
        // 请求WRITE_EXTERNAL_STORAGE权限（即使可能无效）
        if (!hasWriteStorage) {
          console.log('🔄 请求 WRITE_EXTERNAL_STORAGE 权限...');
          
          const writeGranted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
            {
              title: '写入权限',
              message: '应用需要写入权限来删除图片文件。请在权限弹窗中选择"允许"。',
              buttonNeutral: '稍后询问',
              buttonNegative: '取消',
              buttonPositive: '确定',
            }
          );
          
          console.log(`📋 写入权限请求结果: ${writeGranted}`);
          
          if (writeGranted === PermissionsAndroid.RESULTS.GRANTED) {
            console.log('✅ 写入权限已授予');
          } else {
            console.log('⚠️ 写入权限未授予，删除功能可能受限');
          }
        }
        
        // 提示用户手动授权高级权限
        console.log('📋 高级权限说明:');
        console.log('   某些权限需要在系统设置中手动授权:');
        console.log('   1. 设置 -> 应用 -> 图片分类应用 -> 权限');
        console.log('   2. 允许"存储"、"管理所有文件"等权限');
        console.log('   3. 或者使用文件管理器手动删除图片');
        
      } catch (error) {
        console.error('❌ 请求权限失败:', error);
        console.log('📋 请按以下步骤手动授予权限：');
        if (Platform.Version >= 33) {
          console.log('1. 长按应用图标');
          console.log('2. 选择"应用信息"');
          console.log('3. 点击"权限"');
          console.log('4. 允许"相册"权限');
        } else {
          console.log('1. 长按应用图标');
          console.log('2. 选择"应用信息"');
          console.log('3. 点击"权限"');
          console.log('4. 允许"存储"权限');
        }
        throw error;
      }
    }
  }

  // 自动扫描本地相册中的所有图片
  async scanGallery() {
    try {
      await this.ensureInitialized();
      
      console.log('开始自动扫描本地相册...');
      
      let allImages = [];
      
      // 遍历每个相册路径
      for (const path of this.galleryPaths) {
        try {
          console.log(`尝试扫描路径: ${path}`);
          const images = await this.scanDirectory(path);
          if (images.length > 0) {
            console.log(`路径 ${path} 找到 ${images.length} 张图片`);
            allImages = [...allImages, ...images];
          } else {
            console.log(`路径 ${path} 没有找到图片`);
          }
        } catch (error) {
          console.log(`路径 ${path} 扫描失败:`, error.message);
          // 继续扫描其他路径
        }
      }
      
      // 如果没有找到图片，尝试使用 react-native-fs 的常量路径
      if (allImages.length === 0) {
        console.log('尝试使用 RNFS 常量路径...');
        try {
          const externalDir = RNFS.ExternalDirectoryPath;
          const picturesDir = RNFS.PicturesDirectoryPath;
          const dcimDir = RNFS.DCIMDirectoryPath;
          
          console.log(`ExternalDirectoryPath: ${externalDir}`);
          console.log(`PicturesDirectoryPath: ${picturesDir}`);
          console.log(`DCIMDirectoryPath: ${dcimDir}`);
          
          // 尝试这些路径
          const additionalPaths = [externalDir, picturesDir, dcimDir].filter(Boolean);
          for (const path of additionalPaths) {
            try {
              console.log(`尝试 RNFS 路径: ${path}`);
              const images = await this.scanDirectory(path);
              if (images.length > 0) {
                console.log(`RNFS 路径 ${path} 找到 ${images.length} 张图片`);
                allImages = [...allImages, ...images];
              }
            } catch (error) {
              console.log(`RNFS 路径 ${path} 扫描失败:`, error.message);
            }
          }
        } catch (error) {
          console.log('RNFS 常量路径获取失败:', error.message);
        }
      }
      
             // 按拍摄时间排序，最新的在前面
       // 如果没有拍摄时间，则按文件时间排序
       allImages.sort((a, b) => {
         const timeA = a.takenAt || a.timestamp;
         const timeB = b.takenAt || b.timestamp;
         return timeB - timeA;
       });
      
      console.log(`自动扫描完成，总共发现 ${allImages.length} 张图片`);
      
      if (allImages.length === 0) {
        console.log('⚠️ 没有找到任何图片，可能的原因：');
        console.log('1. 模拟器中没有图片文件');
        console.log('2. 文件路径不正确');
        console.log('3. 权限问题');
        console.log('4. 文件系统结构不同');
      }
      
      return allImages;
      
    } catch (error) {
      console.error('自动扫描相册失败:', error);
      throw error;
    }
  }

  // 自动扫描相册（兼容方法）
  async autoScanGallery() {
    return await this.autoScanGalleryWithProgress();
  }

  // 自动扫描相册（带进度回调）
  async autoScanGalleryWithProgress(onProgress) {
    try {
      console.log('开始自动扫描本地相册...');
      
      // 获取已存在的图片记录，用于增量扫描
      const existingImages = await ImageStorageService.getImages();
      const existingUris = new Set(existingImages.map(img => img.uri));
      
      console.log(`已存在 ${existingImages.length} 张图片记录，开始增量扫描...`);
      
      // 通知进度：初始化完成
      if (onProgress) {
        onProgress({
          current: 0,
          total: 0,
          message: '正在扫描本地相册目录...',
          filesFound: 0,
          filesProcessed: 0,
          filesFailed: 0
        });
      }
      
      const allImages = [];
      let totalDirectories = 0;
      let currentDirectory = 0;
      
      // 首先计算总目录数
      for (const path of this.galleryPaths) {
        try {
          const exists = await RNFS.exists(path);
          if (exists) {
            totalDirectories++;
          }
        } catch (error) {
          console.error(`检查路径 ${path} 失败:`, error);
        }
      }
      
      // 通知进度：开始扫描
      if (onProgress) {
        onProgress({
          current: 0,
          total: totalDirectories,
          message: '正在扫描目录...',
          filesFound: 0,
          filesProcessed: 0,
          filesFailed: 0
        });
      }
      
      for (const path of this.galleryPaths) {
        try {
          const exists = await RNFS.exists(path);
          if (!exists) continue;
          
          currentDirectory++;
          
          // 通知进度：目录扫描进度
          if (onProgress) {
            onProgress({
              current: currentDirectory,
              total: totalDirectories,
              message: `正在扫描: ${path.split('/').pop()}`,
              filesFound: allImages.length,
              filesProcessed: 0,
              filesFailed: 0
            });
          }
          
          const images = await this.scanDirectory(path, existingUris);
          allImages.push(...images);
          
          // 通知进度：文件发现进度
          if (onProgress) {
            onProgress({
              current: currentDirectory,
              total: totalDirectories,
              message: `发现 ${images.length} 张新图片`,
              filesFound: allImages.length,
              filesProcessed: 0,
              filesFailed: 0
            });
          }
          
        } catch (error) {
          console.error(`扫描路径 ${path} 失败:`, error);
        }
      }
      
      console.log(`增量扫描完成，发现 ${allImages.length} 张新图片`);
      
      // 通知进度：开始分类
      if (onProgress) {
        onProgress({
          current: 0,
          total: allImages.length,
          message: '正在分类新发现的图片...',
          filesFound: allImages.length,
          filesProcessed: 0,
          filesFailed: 0
        });
      }
      
      // 只处理新发现的图片
      if (allImages.length > 0) {
        console.log('开始分类新发现的图片...');
        let processedCount = 0;
        let failedCount = 0;
        
        for (const image of allImages) {
          try {
            const classification = await this.imageClassifier.classifyImage(image.uri, {
              timestamp: image.timestamp,
              fileSize: image.size,
              fileName: image.fileName
            });
            
            await ImageStorageService.saveImageClassification({
              uri: image.uri,
              category: classification.category,
              confidence: classification.confidence,
              timestamp: image.timestamp,
              takenAt: image.takenAt, // 添加拍摄时间
              fileName: image.fileName,
              size: image.size
            });
            
            processedCount++;
            console.log(`图片 ${image.fileName} 分类完成: ${classification.category}`);
            
            // 通知进度：分类进度
            if (onProgress) {
              onProgress({
                current: processedCount,
                total: allImages.length,
                message: `正在分类: ${image.fileName}`,
                filesFound: allImages.length,
                filesProcessed: processedCount,
                filesFailed: failedCount
              });
            }
            
          } catch (error) {
            failedCount++;
            console.error(`分类图片 ${image.fileName} 失败:`, error);
            
            // 通知进度：失败统计
            if (onProgress) {
              onProgress({
                current: processedCount,
                total: allImages.length,
                message: `分类失败: ${image.fileName}`,
                filesFound: allImages.length,
                filesProcessed: processedCount,
                filesFailed: failedCount
              });
            }
          }
        }
        
        // 通知进度：完成
        if (onProgress) {
          onProgress({
            current: allImages.length,
            total: allImages.length,
            message: '扫描和分类完成！',
            filesFound: allImages.length,
            filesProcessed: processedCount,
            filesFailed: failedCount
          });
        }
      }
      
      return allImages;
    } catch (error) {
      console.error('自动扫描本地相册失败:', error);
      throw error;
    }
  }

  // 手动重新扫描相册（完整扫描）
  async manualRescanGallery() {
    try {
      console.log('开始手动重新扫描本地相册...');
      console.log('galleryPaths:', this.galleryPaths);
      
      // 清空现有记录，进行完整扫描
      const allImages = [];
      
      for (const path of this.galleryPaths) {
        try {
          console.log(`正在扫描路径: ${path}`);
          const images = await this.scanDirectory(path, new Set()); // 传入空Set，扫描所有文件
          console.log(`路径 ${path} 扫描完成，找到 ${images.length} 张图片`);
          allImages.push(...images);
        } catch (error) {
          console.error(`扫描路径 ${path} 失败:`, error);
        }
      }
      
      console.log(`手动重新扫描完成，发现 ${allImages.length} 张图片`);
      
             // 处理所有发现的图片
       if (allImages.length > 0) {
         console.log('开始分类所有图片...');
         
         
         
         for (const image of allImages) {
            try {
              console.log(`正在分类图片: ${image.fileName}`);
              const classification = await this.imageClassifier.classifyImage(image.uri, {
                timestamp: image.timestamp,
                fileSize: image.size,
                fileName: image.fileName
              });
            
            await ImageStorageService.saveImageClassification({
              uri: image.uri,
              category: classification.category,
              confidence: classification.confidence,
              timestamp: image.timestamp,
              takenAt: image.takenAt, // 添加拍摄时间
              fileName: image.fileName,
              size: image.size
            });
            
            console.log(`图片 ${image.fileName} 分类完成: ${classification.category}`);
          } catch (error) {
            console.error(`分类图片 ${image.fileName} 失败:`, error);
          }
        }
      }
      
      return allImages;
    } catch (error) {
      console.error('手动重新扫描本地相册失败:', error);
      console.error('错误堆栈:', error.stack);
      throw error;
    }
  }

  // 扫描指定目录
  async scanDirectory(dirPath, existingUris = new Set()) {
    try {
      console.log(`开始扫描目录: ${dirPath}`);
      
      if (!existingUris || !(existingUris instanceof Set)) {
        console.warn('existingUris 不是有效的 Set，创建新的空 Set');
        existingUris = new Set();
      }
      
      const exists = await RNFS.exists(dirPath);
      if (!exists) {
        console.log(`目录不存在: ${dirPath}`);
        return [];
      }
      
      console.log(`目录存在，开始读取内容...`);
      const items = await RNFS.readDir(dirPath);
      console.log(`目录 ${dirPath} 包含 ${items.length} 个项目`);
      
      const images = [];
      
      for (const item of items) {
        if (item.isDirectory()) {
          console.log(`发现子目录: ${item.name}`);
          const subImages = await this.scanDirectory(item.path, existingUris);
          images.push(...subImages);
        } else if (this.isImageFile(item.name)) {
          // 检查文件是否已经存在
          const fileUri = `file://${item.path}`;
          if (existingUris.has(fileUri)) {
            continue;
          }
          
                     console.log(`发现新图片文件: ${item.name}`);
           
                      try {
                const stats = await RNFS.stat(item.path);
                const takenTime = await extractTakenTime(item.path);
                
                // 获取文件的多种时间信息
                const mtime = stats.mtime ? new Date(stats.mtime).getTime() : null;
                const ctime = stats.ctime ? new Date(stats.ctime).getTime() : null;
                const currentTime = Date.now();
                
                // 对于从电脑拷贝到模拟器的文件：
                // - ctime（创建时间）通常重置为拷贝时间，更准确反映文件在模拟器中的状态
                // - mtime（修改时间）可能保留原始时间，不够准确
                // - 我们优先使用 ctime，因为它更准确地反映文件被拷贝到模拟器的时间
                const fileTime = ctime || mtime || currentTime;
                
                const imageData = {
                   uri: fileUri,
                   fileName: item.name,
                   size: stats.size,
                   timestamp: fileTime, // 文件时间（拷贝/修改时间）
                   takenAt: takenTime, // 只使用真正的EXIF拍摄时间
                   path: item.path
                 };
               
               images.push(imageData);
             } catch (error) {
               console.error(`获取文件 ${item.name} 信息失败:`, error);
             }
        }
      }
      
      console.log(`目录 ${dirPath} 扫描完成，找到 ${images.length} 张图片`);
      return images;
    } catch (error) {
      console.error(`扫描目录 ${dirPath} 失败:`, error);
      console.error('错误堆栈:', error.stack);
      return [];
    }
  }

  // 判断是否为图片文件
  isImageFile(fileName) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
    const lowerFileName = fileName.toLowerCase();
    return imageExtensions.some(ext => lowerFileName.endsWith(ext));
  }

  // 测试文件系统访问
  async testFileSystemAccess() {
    try {
      console.log('=== 开始测试文件系统访问 ===');
      
      // 测试 RNFS 常量
      console.log('RNFS 常量:');
      console.log(`ExternalDirectoryPath: ${RNFS.ExternalDirectoryPath}`);
      console.log(`PicturesDirectoryPath: ${RNFS.PicturesDirectoryPath}`);
      console.log(`DCIMDirectoryPath: ${RNFS.DCIMDirectoryPath}`);
      console.log(`DocumentDirectoryPath: ${RNFS.DocumentDirectoryPath}`);
      console.log(`MainBundlePath: ${RNFS.MainBundlePath}`);
      
      // 测试基本路径
      const testPaths = [
        '/storage/emulated/0',
        '/sdcard',
        '/mnt/sdcard',
        RNFS.ExternalDirectoryPath,
        RNFS.PicturesDirectoryPath,
        RNFS.DCIMDirectoryPath,
        
        // 用户模拟器中的实际路径
        '/storage/emulated/0/Pictures',
        '/storage/emulated/0/Pictures/Pictures',
        '/sdcard/Pictures',
        '/sdcard/Pictures/Pictures',
      ];
      
      for (const path of testPaths) {
        if (path) {
          try {
            const exists = await RNFS.exists(path);
            console.log(`路径 ${path} 存在: ${exists}`);
            
            if (exists) {
              try {
                const items = await RNFS.readDir(path);
                console.log(`路径 ${path} 包含 ${items.length} 个项目`);
                
                // 显示前几个项目
                const firstItems = items.slice(0, 5);
                firstItems.forEach(item => {
                  console.log(`  - ${item.name} (${item.isDirectory() ? '目录' : '文件'})`);
                });
                
                if (items.length > 5) {
                  console.log(`  ... 还有 ${items.length - 5} 个项目`);
                }
              } catch (error) {
                console.log(`读取路径 ${path} 失败:`, error.message);
              }
            }
          } catch (error) {
            console.log(`检查路径 ${path} 失败:`, error.message);
          }
        }
      }
      
      console.log('=== 文件系统访问测试完成 ===');
    } catch (error) {
      console.error('文件系统访问测试失败:', error);
    }
  }

  // 测试已知文件是否存在
  async testKnownFile() {
    try {
      console.log('=== 开始测试已知文件 ===');
      
      // 根据用户截图中的信息测试
      const knownFile = '/storage/emulated/0/Pictures/Pictures/test2.jpg';
      
      console.log(`测试文件: ${knownFile}`);
      
      // 检查文件是否存在
      const exists = await RNFS.exists(knownFile);
      console.log(`文件存在: ${exists}`);
      
      if (exists) {
        try {
          // 获取文件信息
          const stats = await RNFS.stat(knownFile);
          console.log(`文件信息:`);
          console.log(`  大小: ${stats.size} bytes`);
          console.log(`  修改时间: ${stats.mtime}`);
          console.log(`  创建时间: ${stats.ctime}`);
          console.log(`  权限: ${stats.mode}`);
          
          // 尝试读取文件头（前100字节）
          const fileContent = await RNFS.read(knownFile, 100, 0, 'ascii');
          console.log(`文件头内容: ${fileContent}`);
          
        } catch (error) {
          console.log(`读取文件信息失败:`, error.message);
        }
      }
      
      // 尝试其他可能的路径
      const alternativePaths = [
        '/sdcard/Pictures/Pictures/test2.jpg',
        '/mnt/sdcard/Pictures/Pictures/test2.jpg',
        '/storage/emulated/0/Pictures/test2.jpg',
        '/sdcard/Pictures/test2.jpg',
      ];
      
      for (const path of alternativePaths) {
        try {
          const altExists = await RNFS.exists(path);
          console.log(`替代路径 ${path} 存在: ${altExists}`);
        } catch (error) {
          console.log(`检查替代路径 ${path} 失败:`, error.message);
        }
      }
      
      console.log('=== 已知文件测试完成 ===');
    } catch (error) {
      console.error('已知文件测试失败:', error);
    }
  }

  // 检查权限状态
  async checkPermissions() {
    try {
      console.log('=== 开始检查权限状态 ===');
      
      if (Platform.OS === 'android') {
        // 检查存储权限
        const storagePermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
        );
        console.log(`存储权限状态: ${storagePermission ? '已授予' : '未授予'}`);
        
        // 检查媒体权限（Android 13+）
        let mediaPermission = false;
        if (Platform.Version >= 33) {
          try {
            mediaPermission = await PermissionsAndroid.check(
              PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
            );
            console.log(`媒体权限状态: ${mediaPermission ? '已授予' : '未授予'}`);
          } catch (error) {
            console.log(`检查媒体权限失败: ${error.message}`);
          }
        }
        
        // 检查 Android 版本
        console.log(`Android API 级别: ${Platform.Version}`);
        
        // 如果权限未授予，提供详细的设置指导
        if (!storagePermission && !mediaPermission) {
          console.log('=== 权限设置指导 ===');
          console.log('请按以下步骤手动授予权限：');
          console.log('');
          console.log('步骤1 - 在当前权限页面查找：');
          console.log('1. 向下滚动，查看是否有"未允许"权限类别');
          console.log('2. 点击右上角三个点菜单(:)，查找"所有权限"选项');
          console.log('3. 点击"Camera"权限，查看是否有"相关权限"');
          console.log('');
          console.log('步骤2 - 如果找不到，通过设置应用：');
          console.log('1. 回到主屏幕（按Home键）');
          console.log('2. 打开设置应用（齿轮图标）');
          console.log('3. 找到"应用"或"Apps"');
          console.log('4. 找到"ImageClassifier"应用');
          console.log('5. 点击"权限"或"Permissions"');
          console.log('6. 查看完整权限列表');
          console.log('');
          console.log('步骤3 - 查找以下权限（可能叫不同名称）：');
          console.log('- "相册" 或 "Photos"');
          console.log('- "媒体" 或 "Media"');
          console.log('- "文件" 或 "Files"');
          console.log('- "存储" 或 "Storage"');
          console.log('- "图片" 或 "Images"');
          console.log('');
          console.log('步骤4 - 授予权限：');
          console.log('找到相关权限后，将其设置为"允许"或"Allow"');
          console.log('');
          console.log('如果还是找不到，请尝试：');
          console.log('1. 重启模拟器');
          console.log('2. 检查模拟器设置中的权限配置');
          console.log('3. 查看是否有"高级权限"选项');
          console.log('');
          console.log('权限授予后，请重新运行应用！');
        } else if (storagePermission || mediaPermission) {
          console.log('✅ 权限已授予，可以正常扫描相册！');
        }
      }
      
      console.log('=== 权限检查完成 ===');
    } catch (error) {
      console.error('权限检查失败:', error);
    }
  }

  // 确保服务已初始化
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  // 获取相册统计信息
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
      
      // 按分类统计
      images.forEach(img => {
        if (!stats.byCategory[img.category]) {
          stats.byCategory[img.category] = 0;
        }
        stats.byCategory[img.category]++;
        stats.totalSize += img.size || 0; // 修复：使用 size 而不是 fileSize
      });
      
      // 按日期统计
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
      console.error('获取相册统计失败:', error);
      throw error;
    }
  }
}

export default GalleryScannerService;
