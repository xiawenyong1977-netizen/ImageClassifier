import { logger } from '../adapters/WebAdapters';
import imageProcessor from './ImageProcessor';

/**
 * 并行哈希计算管理器
 * 使用多个Worker线程并行计算图片哈希值（PC端）
 * 移动端使用单线程 + crypto-js
 */
class ParallelHashCalculator {
  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers;
    this.workers = [];
    this.taskQueue = [];
    this.runningTasks = new Map();
    this.taskIdCounter = 0;
    this.isInitialized = false;
  }

  /**
   * 初始化Worker池
   */
  async initialize() {
    if (this.isInitialized) return;
    
    try {
      // 检查是否支持Worker
      if (typeof Worker === 'undefined') {
        logger.warn('⚠️ 当前环境不支持Web Worker，将使用单线程模式');
        this.isInitialized = false;
        return;
      }
      
      // 创建Worker池 - 使用内联Worker避免路径问题
      for (let i = 0; i < this.maxWorkers; i++) {
        try {
          const worker = this.createInlineWorker();
          worker.onmessage = this.handleWorkerMessage.bind(this);
          worker.onerror = this.handleWorkerError.bind(this);
          this.workers.push(worker);
        } catch (workerError) {
          logger.warn(`⚠️ 创建Worker ${i} 失败:`, workerError.message);
        }
      }
      
      if (this.workers.length > 0) {
        this.isInitialized = true;
        logger.debug(`✅ 并行哈希计算器初始化完成，创建了 ${this.workers.length} 个Worker`);
      } else {
        logger.warn('⚠️ 无法创建任何Worker，将使用单线程模式');
        this.isInitialized = false;
      }
    } catch (error) {
      logger.error('❌ 并行哈希计算器初始化失败:', error);
      // 如果Worker创建失败，回退到单线程模式
      this.isInitialized = false;
    }
  }

  /**
   * 创建内联Worker，避免文件路径问题
   */
  createInlineWorker() {
    const workerCode = `
      self.onmessage = async function(e) {
        const { imageUri, taskId } = e.data;
        
        try {
          // 安全地加载图片数据
          let blob;
          
          if (imageUri.startsWith('file://')) {
            // 在Worker中无法直接访问Node.js fs模块
            // 需要从主线程传递ArrayBuffer
            throw new Error('Worker中无法直接读取本地文件，需要从主线程传递数据');
          } else {
            // 网络URL：使用 fetch
            const response = await fetch(imageUri);
            blob = await response.blob();
          }
          
          const arrayBuffer = await blob.arrayBuffer();
          
          // 计算SHA-256哈希
          const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          
          // 返回结果
          self.postMessage({
            taskId,
            success: true,
            hash: hashHex
          });
          
        } catch (error) {
          // 返回错误
          self.postMessage({
            taskId,
            success: false,
            error: error.message
          });
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    
    // 清理URL对象
    worker.addEventListener('message', () => {
      URL.revokeObjectURL(workerUrl);
    }, { once: true });
    
    return worker;
  }

  /**
   * 处理Worker消息
   */
  handleWorkerMessage(event) {
    const { taskId, success, hash, error } = event.data;
    const task = this.runningTasks.get(taskId);
    
    if (task) {
      if (success) {
        task.resolve(hash);
      } else {
        task.reject(new Error(error));
      }
      this.runningTasks.delete(taskId);
    }
  }

  /**
   * 处理Worker错误
   */
  handleWorkerError(error) {
    logger.error('❌ Worker错误:', error);
  }

  /**
   * 并行计算多个图片的哈希值
   * @param {Array} images - 图片数组，每个元素包含 { uri, fileName, ... }
   * @param {Function} onProgress - 进度回调函数
   * @returns {Promise<Array>} 包含哈希值的图片数组
   */
  async calculateHashesParallel(images, onProgress = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // 如果Worker初始化失败，回退到单线程模式
    if (!this.isInitialized) {
      logger.warn('⚠️ Worker初始化失败，回退到单线程哈希计算');
      return this.calculateHashesSequential(images, onProgress);
    }

    const results = [];
    const totalImages = images.length;
    let processedCount = 0;
    let failedCount = 0;

    logger.info(`🚀 开始Worker并行哈希计算: ${totalImages} 张图片，${this.workers.length} 个Worker`);
    
    // 为每个图片创建任务
    const tasks = images.map((image, index) => ({
      image,
      index,
      taskId: this.taskIdCounter++
    }));

    // 分批处理，避免同时创建太多任务
    const batchSize = this.workers.length * 2;
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batch = tasks.slice(i, i + batchSize);
      
      // 并行处理当前批次
      const batchPromises = batch.map(async (task) => {
        try {
          const hash = await this.calculateSingleHash(task.image);
          results[task.index] = {
            ...task.image,
            hash
          };
          processedCount++;
        } catch (error) {
          logger.warn(`❌ 计算哈希失败: ${task.image.fileName}`, error.message);
          results[task.index] = {
            ...task.image,
            hash: null,
            hashError: error.message
          };
          failedCount++;
        }
        
        // 更新进度
        if (onProgress) {
          onProgress(processedCount + failedCount, totalImages);
        }
      });

      // 等待当前批次完成
      await Promise.all(batchPromises);
    }

    logger.info(`✅ Worker并行哈希计算完成: 成功 ${processedCount} 张，失败 ${failedCount} 张`);
    return results;
  }

  /**
   * 计算单个图片的哈希值
   * @param {Object} image - 图片对象
   * @returns {Promise<string>} 哈希值
   */
  async calculateSingleHash(image) {
    if (!this.isInitialized) {
      // 回退到单线程模式
      return this.calculateHashSequential(image);
    }

    return new Promise((resolve, reject) => {
      const taskId = this.taskIdCounter++;
      
      // 存储任务信息
      this.runningTasks.set(taskId, { resolve, reject });
      
      // 如果是本地文件，需要先读取数据
      if (image.uri.startsWith('file://')) {
        this.handleLocalFileHash(image, taskId);
      } else {
        // 网络URL直接发送给Worker
        const worker = this.getAvailableWorker();
        worker.postMessage({
          imageUri: image.uri,
          taskId
        });
      }
    });
  }

  /**
   * 处理本地文件的哈希计算（使用 ImageProcessor 统一接口）
   */
  async handleLocalFileHash(image, taskId) {
    try {
      // 使用 ImageProcessor 统一接口计算哈希
      const hashHex = await imageProcessor.calculateFileHash(image.uri);
      
      // 模拟Worker消息
      this.handleWorkerMessage({
        data: {
          taskId,
          success: true,
          hash: hashHex
        }
      });
    } catch (error) {
      this.handleWorkerMessage({
        data: {
          taskId,
          success: false,
          error: error.message
        }
      });
    }
  }

  /**
   * 获取可用的Worker
   */
  getAvailableWorker() {
    // 简单的轮询策略
    return this.workers[Math.floor(Math.random() * this.workers.length)];
  }

  /**
   * 单线程哈希计算（回退方案）
   */
  async calculateHashesSequential(images, onProgress = null) {
    const results = [];
    const totalImages = images.length;
    let processedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        const hash = await this.calculateHashSequential(image);
        results.push({
          ...image,
          hash
        });
        processedCount++;
      } catch (error) {
        logger.warn(`❌ 计算哈希失败: ${image.fileName}`, error.message);
        results.push({
          ...image,
          hash: null,
          hashError: error.message
        });
        failedCount++;
      }
      
      // 更新进度
      if (onProgress) {
        onProgress(processedCount + failedCount, totalImages);
      }
      
      // 每处理10个文件就让出控制权，避免UI卡顿
      if ((i + 1) % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    logger.info(`✅ 单线程哈希计算完成: 成功 ${processedCount} 张，失败 ${failedCount} 张`);
    return results;
  }

  /**
   * 单线程计算单个图片哈希（使用 ImageProcessor 统一接口）
   */
  async calculateHashSequential(image) {
    // 使用 ImageProcessor 统一接口计算哈希
    return await imageProcessor.calculateFileHash(image.uri);
  }

  /**
   * 销毁Worker池
   */
  destroy() {
    this.workers.forEach(worker => {
      worker.terminate();
    });
    this.workers = [];
    this.runningTasks.clear();
    this.isInitialized = false;
  }
}

export default ParallelHashCalculator;
