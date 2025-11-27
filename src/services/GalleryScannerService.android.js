/**
 * GalleryScannerService.android.js
 * Android平台专用的扫描服务
 * 
 * 功能：
 * 1. 调用原生层GalleryScanModule启动扫描
 * 2. 监听原生层发送的进度、完成、错误事件
 * 3. 原生层扫描完成后，执行JS层后续处理：
 *    - 阶段4: 位置信息补全
 *    - 阶段5: 本地推理和规则映射（NA分类图片）
 *    - 阶段6: 相似度检测
 */

import { NativeModules, NativeEventEmitter } from 'react-native';
import { logger } from '../adapters/WebAdapters';
import UnifiedDataService from './UnifiedDataService';
import ImageClassifierService from './ImageClassifierService';
import cityLocationService from './CityLocationService';
import ImageSimilarityService from './ImageSimilarityService';
import { ScanService } from '../adapters/ScanServiceAdapter';
import { similarityDetectionPhase as sharedSimilarityDetection } from './similarityDetectionPhase';
import { localInferencePhase as sharedLocalInference } from './localInferencePhase';

const { GalleryScanModule } = NativeModules;

class GalleryScannerService {
  constructor() {
    // 🆕 标识：这是Android原生扫描版本
    this.isNativeScanVersion = true;
    this.scanVersion = 'native-android';
    
    this.isScanning = false;
    this.currentScanId = null;
    this.onProgress = null;
    this.imageClassifier = new ImageClassifierService();
    this.similarityService = new ImageSimilarityService();
    this.eventEmitter = null;
    this.progressSubscriptions = [];
    
    // 核心指标
    this.totalImagesToBeClassified = 0; // 总分类目标（原生层扫描完成后确定，后续阶段不更新）
    this.imagesClassified = 0; // 已分类数量（原生层扫描完成后确定，后续阶段不更新）
    
    // 进度更新控制
    this.lastRefreshCount = 0; // 上次刷新时的分类成功数
    this.lastSimilarityRefreshCount = 0; // 上次相似度检测刷新时的相似组数
    this.lastScreenshotRefreshCount = 0; // 上次截图检测刷新时的处理数量
    this.scanStartTimestamp = null; // 扫描开始时间戳
    
    // 初始化事件监听器
    if (GalleryScanModule) {
      this.eventEmitter = new NativeEventEmitter(GalleryScanModule);
      logger.info('✅ 原生扫描服务已初始化 - GalleryScanModule 可用');
    } else {
      logger.warn('⚠️ GalleryScanModule 不可用，原生扫描功能将无法使用');
    }
    
    // 输出版本信息，方便调试
    logger.info(`📱 GalleryScannerService (${this.scanVersion}) 已创建`);
  }
  
  /**
   * 检查是否使用原生扫描
   * @returns {boolean} 是否使用原生扫描
   */
  isUsingNativeScan() {
    return this.isNativeScanVersion === true && GalleryScanModule !== null && GalleryScanModule !== undefined;
  }
  
  /**
   * 获取扫描版本信息
   * @returns {string} 扫描版本信息
   */
  getScanVersion() {
    return this.scanVersion;
  }

  /**
   * 初始化服务
   * 原生扫描版本不需要复杂的初始化，只需要初始化相似度检测服务
   */
  async initialize() {
    // 原生扫描版本不需要从配置中读取路径（路径由startScan传入）
    // 只需要初始化相似度检测服务
    try {
      await this.similarityService.initialize();
      logger.info('✅ 原生扫描服务初始化完成');
    } catch (error) {
      logger.error('❌ 初始化相似度检测服务失败:', error);
      throw error;
    }
  }

  /**
   * 扫描相册（兼容JS层接口）
   * @param {Function} onProgress - 进度回调函数
   * @param {number|Object} compareLimitOrOptions - 比对限制或选项对象
   * @returns {Promise<Object>} 扫描结果
   */
  async scanGalleryWithProgress(onProgress = null, compareLimitOrOptions = null) {
    try {
      logger.debug('🚀 开始原生扫描（通过scanGalleryWithProgress接口）');
      
      // 处理参数：可能是数字（compareLimit）或对象（options）
      let options = {};
      if (typeof compareLimitOrOptions === 'number') {
        options.compareLimit = compareLimitOrOptions;
      } else if (compareLimitOrOptions && typeof compareLimitOrOptions === 'object') {
        options = compareLimitOrOptions;
      }
      
      // 如果没有指定扫描路径，从配置中读取
      if (!options.scanPaths || options.scanPaths.length === 0) {
        const settings = await UnifiedDataService.readSettings();
        options.scanPaths = settings.scanPaths || [];
      }
      
      // 调用startScan方法
      return await this.startScan(options, onProgress);
    } catch (error) {
      logger.error('❌ 扫描失败:', error);
      throw error;
    }
  }

  /**
   * 启动扫描
   * @param {Object} options - 扫描选项
   * @param {string[]} options.scanPaths - 扫描路径数组（相对路径，如 ["DCIM/Camera"]）
   * @param {number} options.compareLimit - 比对限制（0表示不限制，推荐值：100用于快速测试，1000用于正常使用）
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<Object>} 扫描结果
   */
  async startScan(options = {}, onProgress = null) {
    // 检查是否已经在扫描中
    if (this.isScanning) {
      const errorMsg = '扫描已在进行中，请等待当前扫描完成';
      logger.warn(`⚠️ ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // 检查原生模块是否可用
    if (!GalleryScanModule) {
      logger.error('❌ GalleryScanModule 不可用，无法使用原生扫描');
      throw new Error('GalleryScanModule 不可用，请确保在Android平台运行');
    }
    
    // 确认使用原生扫描
    logger.info('🚀 启动原生扫描服务 (Native Android Scan)');
    logger.info(`📋 扫描版本: ${this.scanVersion}`);
    logger.info(`✅ 原生模块状态: ${GalleryScanModule ? '可用' : '不可用'}`);

    // 🔥 在启动新扫描前，检查并强制停止已运行的服务
    try {
      const isRunning = await ScanService.isRunning();
      if (isRunning) {
        logger.warn('⚠️ 检测到扫描服务正在运行，强制停止旧服务...');
        ScanService.forceStop();
        // 等待服务完全停止
        await new Promise(resolve => setTimeout(resolve, 1000));
        logger.info('✅ 旧服务已停止');
      }
    } catch (error) {
      logger.warn('⚠️ 检查服务状态失败，尝试强制停止:', error);
      ScanService.forceStop();
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // 设置扫描状态和回调
    this.isScanning = true;
    this.onProgress = onProgress;
    
    // 记录扫描开始时间（用于阶段6相似度检测）
    this.scanStartTimestamp = new Date();
    
    // 重置统计变量
    this.lastRefreshCount = 0;
    this.lastSimilarityRefreshCount = 0;
    this.lastScreenshotRefreshCount = 0;
    this.currentScanId = null;

    // 创建 Promise 来等待扫描完成
    let scanResolve, scanReject;
    const scanPromise = new Promise((resolve, reject) => {
      scanResolve = resolve;
      scanReject = reject;
    });
    this.scanResolve = scanResolve;
    this.scanReject = scanReject;

    try {
      // 从ImageClassifierService获取API配置（不需要初始化，getAPIConfig不需要初始化）
      // 注意：原生扫描不需要初始化ImageClassifierService，因为本地推理在JS层后续处理阶段才需要
      const apiConfig = this.imageClassifier.getAPIConfig();
      const baseURL = apiConfig.baseURL || 'https://api.aifuture.net.cn';
      
      // 先设置事件监听器，确保能接收到所有事件
      this.setupEventListeners();
      
      // Android平台：启动前台服务，支持后台扫描
      ScanService.start();

      // 发送初始化进度消息
      await this.sendProgressMessage('initializing', 0, 0);

      // 启动原生层扫描
      logger.info('🚀 启动原生层扫描服务...');
      const result = await GalleryScanModule.startScan({
        scanPaths: options.scanPaths || [],
        compareLimit: options.compareLimit || 0,
        remoteApiUrl: baseURL, // 使用配置中的baseURL
        cacheApiUrl: baseURL,  // 缓存API和远程推理API使用同一个baseURL
      });

      this.currentScanId = result.scanId;
      this.totalImagesToBeClassified = result.totalImagesToBeClassified || 0;
      logger.info(`✅ 原生层扫描已启动: ${result.scanId}, 总数量: ${this.totalImagesToBeClassified}`);

      // 等待扫描完成（通过事件监听器 resolve/reject）
      await scanPromise;

      // 返回扫描结果
      return {
        success: true,
        scanId: result.scanId,
        totalImagesToBeClassified: this.totalImagesToBeClassified,
      };

    } catch (error) {
      logger.error('❌ 启动扫描失败:', error);
      // 确保在错误时清理状态
      this._cleanupScanState();
      // 如果 Promise 还没有 resolve/reject，reject 它
      if (this.scanReject) {
        this.scanReject(error);
        this.scanResolve = null;
        this.scanReject = null;
      }
      throw error;
    }
  }

  /**
   * 清理扫描状态（内部方法）
   * @private
   */
  _cleanupScanState() {
    this.isScanning = false;
    this.currentScanId = null;
    this.onProgress = null;
    this.removeEventListeners();
    ScanService.stop();
    // 注意：不在这里清理 scanResolve/scanReject，让事件处理器来清理
  }

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    if (!this.eventEmitter) {
      logger.warn('⚠️ eventEmitter 未初始化，无法设置事件监听器');
      return;
    }

    logger.info('📡 设置事件监听器...');

    // 监听进度事件
    const progressSubscription = this.eventEmitter.addListener(
      'GalleryScanProgress',
      async (event) => {
        await this.handleProgressEvent(event);
      }
    );

    // 监听错误事件
    const errorSubscription = this.eventEmitter.addListener(
      'GalleryScanError',
      async (event) => {
        await this.handleErrorEvent(event);
      }
    );

    this.progressSubscriptions = [
      progressSubscription,
      errorSubscription,
    ];
  }

  /**
   * 移除事件监听器
   */
  removeEventListeners() {
    this.progressSubscriptions.forEach(subscription => {
      subscription.remove();
    });
    this.progressSubscriptions = [];
  }

  /**
   * 处理进度事件
   */
  async handleProgressEvent(event) {
    const { stage, filesProcessed, filesFound, totalImagesToBeClassified, imagesClassified, scanId } = event;
    
    // 如果是原生层扫描完成事件，直接启动后续处理，不更新进度和显示消息
    if (stage === 'native_scan_completed') {
      // 更新核心指标（从原生层进度事件中获取）
      if (imagesClassified !== undefined) {
        this.imagesClassified = imagesClassified;
      }
      if (totalImagesToBeClassified !== undefined) {
        this.totalImagesToBeClassified = totalImagesToBeClassified;
      }
      
      logger.info(`✅ 原生层扫描完成: ${scanId}, 已分类: ${this.imagesClassified}/${this.totalImagesToBeClassified}`);
      
      try {
        // 🔥 原生扫描完成时，先重建缓存，确保后续处理使用最新数据
        logger.debug('🔄 原生扫描完成，开始重建缓存...');
        await UnifiedDataService.imageCache.refreshCache();
        logger.debug('✅ 缓存重建完成');
        
        // 执行JS层后续处理（内部会在核心流程完成后发送 completed 事件）
        await this.performPostScanProcessing();
        
        logger.info('✅ 扫描完全结束（包括相似度检测）');

      } catch (error) {
        logger.error('❌ 后续处理失败:', error);
        await this.sendProgressMessage('error', 0, 0);
      } finally {
        // 清理扫描状态
        this._cleanupScanState();
        // 通知等待的 Promise 扫描已完成
        if (this.scanResolve) {
          this.scanResolve();
          this.scanResolve = null;
          this.scanReject = null;
        }
      }
      return; // 直接返回，不处理进度更新
    }
    
    // 其他进度事件正常处理
    // 更新核心指标（从原生层进度事件中获取）
    if (imagesClassified !== undefined) {
      this.imagesClassified = imagesClassified;
    }
    if (totalImagesToBeClassified !== undefined) {
      this.totalImagesToBeClassified = totalImagesToBeClassified;
    }
    
    // 调用 sendProgressMessage 统一处理进度更新（包括消息生成、UI更新、前台服务更新）
    try {
      await this.sendProgressMessage(stage, filesProcessed, filesFound, imagesClassified, totalImagesToBeClassified);
    } catch (error) {
      logger.error(`❌ 发送进度消息失败 [${stage}]:`, error);
    }
  }


  /**
   * 处理错误事件
   */
  async handleErrorEvent(event) {
    const { message, stage } = event;
    logger.error(`❌ 扫描错误 [${stage}]: ${message}`);
    
    try {
      await this.sendProgressMessage('error', 0, 0);
    } catch (error) {
      logger.error('❌ 发送错误消息失败:', error);
    } finally {
      // 清理扫描状态
      this._cleanupScanState();
      // 通知等待的 Promise 扫描已出错
      if (this.scanReject) {
        this.scanReject(new Error(message || '扫描失败'));
        this.scanResolve = null;
        this.scanReject = null;
      }
    }
  }

  /**
   * 停止扫描（手动停止）
   */
  stopScan() {
    if (!this.isScanning) {
      logger.warn('⚠️ 当前没有进行中的扫描');
      return;
    }
    
    logger.info('🛑 手动停止扫描');
    this._cleanupScanState();
  }

  /**
   * 执行后续处理（原生层扫描完成后）
   */
  async performPostScanProcessing() {
    logger.info('🔄 开始JS层后续处理...');

    try {
      // 阶段4: 位置信息补全
      await this.phase4_LocationEnrichment();

      // 阶段5: 本地推理和规则映射（NA分类图片）
      await this.phase5_LocalInferenceAndRuleMapping();

      // 核心扫描和分类流程已完成，发送 completed 事件
      await this.sendProgressMessage('completed', 0, 0);
      logger.info('✅ 核心扫描和分类流程完成');

      // 阶段6: 相似度检测（可选的后处理步骤）
      await this.phase6_SimilarityDetection();

      logger.info('✅ JS层后续处理完成');

    } catch (error) {
      logger.error('❌ 后续处理失败:', error);
      throw error;
    }
  }

  /**
   * 阶段4: 位置信息补全
   * 对已有GPS坐标但没有位置信息（city/country）的图片，查询并更新位置信息
   * 注意：原生层扫描时已经提取过EXIF GPS信息，这里直接使用已有的坐标
   */
  async phase4_LocationEnrichment() {
    logger.info('📍 阶段4: 开始位置信息补全');

    try {
      // 查询所有图片，找到有坐标但没有位置信息的图片
      const allImages = await UnifiedDataService.readAllImages();
      // 过滤：有GPS坐标（latitude和longitude）但没有位置信息（city或country）
      const imagesWithCoordinatesButNoLocation = allImages.filter(
        img => img.latitude && img.longitude && (!img.city || !img.country)
      );

      if (imagesWithCoordinatesButNoLocation.length === 0) {
        logger.info('✅ 阶段4: 所有有坐标的图片都已补全位置信息，跳过');
        return;
      }

      const totalFoundThisPhase = imagesWithCoordinatesButNoLocation.length;
      logger.info(`📍 阶段4: 发现 ${totalFoundThisPhase} 张图片需要补全位置信息`);
      // 发送开始处理消息（filesFound > 0 && filesProcessed === 0 会触发"开始处理X张图片"）
      await this.sendProgressMessage('location_enrichment', 0, totalFoundThisPhase, this.imagesClassified, this.totalImagesToBeClassified);

      let processedThisPhase = 0;
      const batchSize = 50; // 每批处理50张

      for (let i = 0; i < imagesWithCoordinatesButNoLocation.length; i += batchSize) {
        const batch = imagesWithCoordinatesButNoLocation.slice(i, i + batchSize);
        
        // 并发处理每批内的图片查询（使用 Promise.all）
        const locationQueries = batch.map(async (image) => {
          try {
            // 直接使用原生层已提取的GPS坐标（不需要再次提取EXIF）
            const latitude = image.latitude;
            const longitude = image.longitude;

            if (!latitude || !longitude) {
              return null;
            }

            // 查询地理位置信息（并发执行）
            const locationInfo = await cityLocationService.findNearestCityAsync(
              latitude,
              longitude,
              200, // 200km范围
              true // 使用远程API
            );

            if (locationInfo) {
              return {
                uri: image.uri,
                id: image.id,
                city: locationInfo.name,
                country: locationInfo.country || '中国',
                province: locationInfo.province,
                latitude: latitude,
                longitude: longitude,
              };
            }
            return null;
          } catch (error) {
            logger.warn(`⚠️ 处理图片位置信息失败: ${image.fileName}`, error);
            return null;
          }
        });

        // 等待所有查询完成
        const batchResults = (await Promise.all(locationQueries)).filter(result => result !== null);

        // 批量更新位置信息（一次性更新整个批次）
        if (batchResults.length > 0) {
          await UnifiedDataService.writeImageDetailedInfo(batchResults, false); // 不立即更新缓存
          processedThisPhase += batchResults.length;
        }

        // 发送进度：processedThisPhase, totalFoundThisPhase, imagesClassified, totalImagesToBeClassified
        await this.sendProgressMessage('location_enrichment', processedThisPhase, totalFoundThisPhase, this.imagesClassified, this.totalImagesToBeClassified);
      }

      logger.info(`✅ 阶段4完成: 补全了 ${processedThisPhase} 张图片的位置信息`);

    } catch (error) {
      logger.error('❌ 阶段4失败:', error);
      throw error;
    }
  }

  /**
   * 阶段5: 本地推理和规则映射（NA分类图片）
   * 1. 找出NA分类的图片
   * 2. 检查是否已有推理结果，没有就调用本地推理
   * 3. 统一进行规则映射
   */
  async phase5_LocalInferenceAndRuleMapping() {
    // 🔥 确保 ImageClassifierService 已初始化（本地推理需要）
    if (!this.imageClassifier.isInitialized) {
      logger.info('🔧 初始化 ImageClassifierService（本地推理需要）...');
      try {
        await this.imageClassifier.initialize();
        logger.info('✅ ImageClassifierService 初始化完成');
      } catch (error) {
        logger.error('❌ ImageClassifierService 初始化失败:', error);
        // 初始化失败时，本地推理阶段将无法工作，但不影响其他阶段
        logger.warn('⚠️ 本地推理阶段将跳过（服务未初始化）');
        return;
      }
    }
    
    // 查询所有NA分类的图片（精简信息，只包含ID等基本信息）
    const naImagesSimplified = await UnifiedDataService.readImagesByCategory('NA');

    if (naImagesSimplified.length === 0) {
      logger.info('✅ 阶段5: 没有NA分类图片，跳过');
      return;
    }

    // 使用共享的本地推理函数（统一逻辑：都使用规则映射）
    await sharedLocalInference({
      images: naImagesSimplified,
      sendProgressMessage: this.sendProgressMessage.bind(this),
      imageClassifier: this.imageClassifier,
      totalImagesToBeClassified: this.totalImagesToBeClassified,
      imagesClassified: this.imagesClassified,
      batchSize: 10,
    });
  }

  /**
   * 阶段6: 相似度检测
   * 只对本次扫描后更新的图片进行相似度检测（优化性能）
   */
  async phase6_SimilarityDetection() {
    // 使用共享的相似度检测函数
    await sharedSimilarityDetection({
      scanStartTimestamp: this.scanStartTimestamp,
      sendProgressMessage: this.sendProgressMessage.bind(this),
      similarityService: this.similarityService,
      totalImagesToBeClassified: this.totalImagesToBeClassified, // Android 版本需要传递此参数
    });
  }


  /**
   * 发送进度消息
   * 统一处理进度更新：调用回调函数并更新前台服务
   * @param {string} stage - 阶段名称
   * @param {number} processedThisPhase - 当前阶段已处理数量
   * @param {number} totalFoundThisPhase - 当前阶段总数量
   * @param {number} imagesClassified - 已分类数量（可选，不更新时传当前值）
   * @param {number} totalImagesToBeClassified - 总分类目标（可选，不更新时传当前值）
   */
  async sendProgressMessage(stage, processedThisPhase, totalFoundThisPhase, imagesClassified = this.imagesClassified, totalImagesToBeClassified = this.totalImagesToBeClassified) {
    if (!this.onProgress) {
      logger.warn(`⚠️ onProgress 回调未设置，跳过进度消息: ${stage}`);
      return;
    }
    
    // 🔥 已移除去重逻辑，允许所有进度更新通过（包括更频繁的更新）
    logger.info(`📊 扫描进度: ${stage}, 已处理: ${processedThisPhase}/${totalFoundThisPhase}, 总分类: ${imagesClassified}/${totalImagesToBeClassified}`);
    
    // 生成进度数据并直接调用 onProgress
    const progressData = await this.processProgressData({
      stage,
      filesFound: totalFoundThisPhase,
      filesProcessed: processedThisPhase,
      imagesClassified,
      totalImagesToBeClassified,
    });
    
    // Android平台：更新前台服务通知
    ScanService.updateProgress(
      progressData.message || `${stage}: ${processedThisPhase}/${totalFoundThisPhase}`,
      processedThisPhase,
      totalFoundThisPhase
    );
    
    // 调用进度回调（UI更新）
    this.onProgress({
      stage: progressData.stage,
      message: progressData.message,
      filesProcessed: processedThisPhase,
      filesFound: totalFoundThisPhase,
      imagesClassified,
      totalImagesToBeClassified,
      isComplete: progressData.isComplete,
      shouldRefresh: progressData.shouldRefresh, // 传递刷新标记，让UI知道是否需要刷新数据
    });
  }

  /**
   * 处理进度数据
   * 包括消息生成、缓存刷新频率控制、统计信息
   */
  async processProgressData(rawProgress) {
    const { stage, filesProcessed, filesFound, imagesClassified, totalImagesToBeClassified } = rawProgress;
    
    let simpleMessage = '';
    let shouldRefresh = false;
    
    // 根据阶段生成简单的提示信息
    switch (stage) {
      case 'initializing':
        simpleMessage = '初始化扫描: 准备扫描环境';
        // 如果 scanStartTimestamp 还未设置，设置为当前时间（Date 对象）
        if (!this.scanStartTimestamp) {
          this.scanStartTimestamp = new Date();
        }
        break;
        
      case 'directory_scanning':
        // 如果还没有发现照片，只显示扫描中；否则显示发现数量
        if (filesFound && filesFound > 0) {
          simpleMessage = `目录扫描 | 发现: ${filesFound} 张照片`;
        } else {
          simpleMessage = `目录扫描: 正在扫描...`;
        }
        break;
        
      case 'file_comparison':
        const totalFiles = filesFound || 0;
        simpleMessage = `照片比对: 正在分析 ${totalFiles} 张照片，查找新增和已删除的照片`;
        break;
        
      case 'screenshot_detection':
        if (filesFound > 0 && filesProcessed === 0) {
          simpleMessage = `照片扫描: 开始处理 ${filesFound} 张图片`;
        } else {
          simpleMessage = `照片扫描: ${filesProcessed || 0}/${filesFound || 0}`;
        }
        break;
      
      case 'cache_check':
      case 'cache_checking':
        if (filesFound > 0 && filesProcessed === 0) {
          simpleMessage = `分类查询: 开始处理 ${filesFound} 张图片`;
        } else {
          simpleMessage = `分类查询: ${filesProcessed || 0}/${filesFound || 0}`;
        }
        break;
          
      case 'remote_inference':
        if (filesFound > 0 && filesProcessed === 0) {
          simpleMessage = `智能识别: 开始处理 ${filesFound} 张图片`;
        } else {
          simpleMessage = `智能识别: ${filesProcessed || 0}/${filesFound || 0}`;
        }
        break;
        
      case 'local_inference':
        if (filesFound > 0 && filesProcessed === 0) {
          simpleMessage = `本地识别: 开始处理 ${filesFound} 张图片`;
        } else {
          simpleMessage = `本地识别: ${filesProcessed || 0}/${filesFound || 0}`;
        }
        break;
        
        
      case 'location_enrichment':
        if (filesFound > 0 && filesProcessed === 0) {
          simpleMessage = `位置信息补全: 开始处理 ${filesFound} 张图片`;
        } else {
          simpleMessage = `位置信息补全: ${filesProcessed || 0}/${filesFound || 0}`;
        }
        break;
        
      case 'removing_files':
        simpleMessage = `移除已删除照片: ${filesProcessed || 0} 张`;
        break;
        
      case 'similarity_detection':
        if (filesFound && filesProcessed !== undefined) {
          // 相似度检测阶段显示时间窗口进度和动态相似组数量
          const groupsCount = imagesClassified || 0;
          if (filesFound > 0 && filesProcessed === 0) {
            // 开始时：如果 groupsCount === 0，说明是开始消息，filesFound 是图片数
            // 如果 groupsCount > 0，说明是窗口进度更新，filesFound 是窗口数
            if (groupsCount === 0) {
              simpleMessage = `相似度检测: 开始处理 ${filesFound} 张图片`;
            } else {
              simpleMessage = `相似度检测: 窗口 ${filesProcessed}/${filesFound} | 发现 ${groupsCount} 个相似组`;
            }
          } else {
            // 进度中：filesFound 和 filesProcessed 是窗口数
            simpleMessage = `相似度检测: 窗口 ${filesProcessed}/${filesFound} | 发现 ${groupsCount} 个相似组`;
          }
        } else {
          simpleMessage = `相似度检测: 开始处理`;
        }
        break;
        
      case 'native_scan_completed':
        simpleMessage = `原生层扫描完成`;
        break;
        
      case 'completed':
        simpleMessage = `扫描完成: 处理了 ${filesProcessed || 0} 张照片`;
        // 计算和保存扫描耗时
        if (this.scanStartTimestamp) {
          // 确保 scanStartTimestamp 是 Date 对象
          const scanStartTime = this.scanStartTimestamp instanceof Date 
            ? this.scanStartTimestamp.getTime() 
            : this.scanStartTimestamp;
          const scanEndTimestamp = Date.now();
          const totalScanDuration = scanEndTimestamp - scanStartTime;
          const totalScanDurationSeconds = Math.round(totalScanDuration / 1000);
          
          logger.info(`⏱️ 扫描完成，总耗时: ${totalScanDurationSeconds}秒 (${Math.round(totalScanDuration / 1000 / 60)}分钟)`);
        }
        break;
        
      default:
        simpleMessage = '处理中...';
    }
    
    // 添加全局统计信息到消息中
    let finalMessage = simpleMessage;
    
    // 统一处理 shouldRefresh 标记
    if (stage === 'similarity_detection') {
      // 相似度检测阶段：每发现3个相似组刷新一次
      const groupsCount = imagesClassified || 0;
      logger.debug(`🔍 相似度检测刷新检查: groupsCount=${groupsCount}, lastSimilarityRefreshCount=${this.lastSimilarityRefreshCount}, 差值=${groupsCount - this.lastSimilarityRefreshCount}`);
      if (groupsCount > 0 && groupsCount - this.lastSimilarityRefreshCount >= 3) {
        shouldRefresh = true;
        this.lastSimilarityRefreshCount = groupsCount;
        logger.debug(`🔄 相似度检测刷新: 发现${groupsCount}个相似组, 上次刷新${this.lastSimilarityRefreshCount}个`);
      }
    } else if (stage === 'screenshot_detection' && filesProcessed && filesProcessed > 0) {
      // 截图检测阶段：每处理完100张图片刷新一次（比较差值）
      const lastRefresh = this.lastScreenshotRefreshCount;
      if (filesProcessed - lastRefresh >= 100) {
        shouldRefresh = true;
        this.lastScreenshotRefreshCount = filesProcessed;
        logger.debug(`🔄 截图检测刷新: 已处理 ${filesProcessed} 张图片（上次刷新: ${lastRefresh}）`);
      }
    } else if (imagesClassified > 0 && imagesClassified - this.lastRefreshCount >= 50) {
      // 其他阶段：每50张成功分类的图片刷新一次
      shouldRefresh = true;
      this.lastRefreshCount = imagesClassified;
    }
    
    if (stage === 'completed') {
      // 扫描完成时刷新
      shouldRefresh = true;
    } else if (filesProcessed && filesFound && filesProcessed === filesFound) {
      // 每个阶段完成时刷新：已处理总数等于待处理总数
      shouldRefresh = true;
    }
    
    // 如果需要刷新，同步重建缓存（确保数据能够及时更新）
    if (shouldRefresh) {
      try {
        logger.debug('🔄 开始重建缓存...');
        await UnifiedDataService.imageCache.refreshCache();
        logger.debug('✅ 缓存重建完成');
      } catch (error) {
        logger.error('❌ 缓存重建失败:', error);
      }
    }
    
    // 显示统计信息（除了相似度检测阶段，其他阶段都显示总进度统计）
    if (stage !== 'similarity_detection' && totalImagesToBeClassified > 0) {
      finalMessage += ` | 分类成功: ${imagesClassified}/${totalImagesToBeClassified}`;
    }
    
    return {
      stage,
      message: finalMessage,
      isComplete: stage === 'completed',
      shouldRefresh // 返回刷新标记
    };
  }
}

export default GalleryScannerService;

