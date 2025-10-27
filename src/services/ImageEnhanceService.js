/**
 * ImageEnhanceService - AI图像增强服务
 * 
 * 功能：
 * 1. 图片预处理（resize、压缩、hash计算）- 复用 ImageProcessor
 * 2. API交互（提交任务、查询状态、轮询）
 * 3. 文件操作（下载、保存到xualbum目录）
 */

import { logger } from '../adapters/WebAdapters';
import ImageProcessor from './ImageProcessor';
import ImageStorageService from './ImageStorageService';

class ImageEnhanceService {
  constructor() {
    this.apiConfig = {
      baseURL: 'https://www.xintuxiangce.top',
      endpoints: {
        submit: '/api/v1/image-edit/submit',
        taskStatus: '/api/v1/image-edit/task',
        batchCheckCache: '/api/v1/image-edit/batch-check-cache'
      },
      timeout: 30000 // 30秒超时
    };
    this.imageStorageService = new ImageStorageService();
  }

  // ========== 工具方法 ==========
  
  /**
   * 获取客户端ID
   * @returns {Promise<string>} 客户端ID
   */
  async getClientId() {
    try {
      const settings = await this.imageStorageService.getSettings();
      return settings.clientId || '';
    } catch (error) {
      logger.error('❌ 获取客户端ID失败:', error);
      return '';
    }
  }

  // ========== 图片预处理（复用 ImageProcessor）==========
  
  /**
   * 准备图片用于增强（resize + hash）
   * @param {string} imageUri - 图片URI (file:///)
   * @returns {Promise<{file: Blob, hash: string, originalFileName: string}>}
   */
  async prepareImageForEnhance(imageUri) {
    try {
      logger.debug('🖼️ 准备图片进行增强:', imageUri);
      
      // 1. 获取原图尺寸
      const dimensions = await ImageProcessor.getImageDimensions(imageUri);
      logger.debug(`📐 原始尺寸: ${dimensions.width}x${dimensions.height}`);
      
      // 2. 计算缩放尺寸（长边1024px）
      const maxSize = 1024;
      const scale = Math.min(maxSize / dimensions.width, maxSize / dimensions.height, 1);
      const targetWidth = Math.round(dimensions.width * scale);
      const targetHeight = Math.round(dimensions.height * scale);
      
      logger.debug(`📐 缩放后: ${targetWidth}x${targetHeight}`);
      
      // 3. 使用 ImageProcessor 缩放图片并获取 Blob（80%质量，JPEG格式）
      const resizeResult = await ImageProcessor.resizeImageAndGetBlob(
        imageUri,
        targetWidth,
        targetHeight,
        {
          maintainAspectRatio: true,
          outputFormat: 'jpeg',
          quality: 0.8  // 80% 质量
        }
      );
      
      const resizedBlob = resizeResult.blob;
      logger.debug('✅ 图片已缩放:', resizedBlob.size, 'bytes');
      
      // 4. 使用 ImageProcessor 计算 Blob 的 SHA-256 哈希
      const hash = await ImageProcessor.calculateBlobHash(resizedBlob);
      logger.debug('✅ 哈希已计算:', hash.substring(0, 16) + '...');
      
      // 5. 提取文件名
      const path = window.require('path');
      const originalFileName = path.basename(imageUri.replace('file:///', ''));
      
      return { file: resizedBlob, hash, originalFileName };
      
    } catch (error) {
      logger.error('❌ 图片预处理失败:', error);
      throw new Error(`图片预处理失败: ${error.message}`);
    }
  }

  // ========== API交互 ==========
  
  /**
   * 提交增强任务（支持批量：1-9张）
   * @param {Array<{file: Blob, hash: string, fileName: string}>} preparedImages - 预处理后的图片数组
   * @param {string} preset - 增强方案 (portrait/scenery/food/auto/自定义提示词)
   * @returns {Promise<{task_id: string, total_images: number, estimated_time_ms: number}>}
   */
  async submitEnhanceTask(preparedImages, preset) {
    try {
      const imageCount = preparedImages.length;
      logger.debug(`📤 提交批量增强任务: ${imageCount}张图片, 方案: ${preset}`);
      
      // 根据预设方案生成提示词
      const promptMap = {
        'portrait': '修复面部瑕疵和皱纹，提亮肤色，美化五官，保持人物原貌不变',
        'scenery': '提升色彩饱和度和对比度，增强细节和清晰度，优化光线和层次感',
        'food': '增强食物色彩和质感，提升食欲感，优化光线和细节',
        'auto': '智能识别图片内容并进行全面优化，提升整体质量'
      };
      
      const prompt = promptMap[preset] || preset; // 如果是自定义，直接使用preset作为prompt
      
      const formData = new FormData();
      
      // 添加所有图片文件（API要求用 'images' 复数，多次append同一个key）
      preparedImages.forEach((prepared, index) => {
        formData.append('images', prepared.file);
        logger.debug(`  - 图片${index + 1}: ${prepared.fileName}, hash: ${prepared.hash.substring(0, 16)}...`);
      });
      
      formData.append('edit_type', 'enhance');
      formData.append('edit_params', JSON.stringify({ prompt }));

      const controller = new AbortController();
      // 动态超时：基础30秒 + 每张图片额外15秒（上传和处理时间）
      const dynamicTimeout = 30000 + (imageCount * 15000);
      logger.debug(`⏱️ 设置超时时间: ${dynamicTimeout}ms (${imageCount}张图片)`);
      const timeoutId = setTimeout(() => controller.abort(), dynamicTimeout);

      // 获取客户端ID
      const clientId = await this.getClientId();
      
      const response = await fetch(
        `${this.apiConfig.baseURL}${this.apiConfig.endpoints.submit}`, 
        {
          method: 'POST',
          headers: { 'X-User-ID': clientId },
          body: formData,
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('❌ API返回错误:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();
      logger.debug('✅ 批量任务已提交:', {
        task_id: result.task_id,
        total_images: result.total_images,
        estimated_time_ms: result.estimated_time_ms
      });
      
      return result;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('请求超时，请检查网络连接');
      }
      logger.error('❌ 提交任务失败:', error);
      throw new Error(`提交任务失败: ${error.message}`);
    }
  }

  /**
   * 查询任务状态
   * @param {string} taskId - 任务ID
   * @returns {Promise<Object>} - 任务状态信息
   */
  async queryTaskStatus(taskId) {
    try {
      const clientId = await this.getClientId();
      const url = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.taskStatus}/${taskId}`;
      
      logger.debug(`🔍 查询任务状态: ${taskId}`);
      logger.debug(`请求URL: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const response = await fetch(url, { 
        method: 'GET',
        headers: { 'X-User-ID': clientId },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`❌ 查询任务状态失败: HTTP ${response.status}`);
        logger.error(`错误详情: ${errorText}`);
        
        // 404 通常表示任务不存在或API未实现，不应该继续重试
        if (response.status === 404) {
          throw new Error(`TASK_NOT_FOUND: 任务不存在或API未实现 (${taskId})`);
        }
        
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }
      
      const result = await response.json();
      logger.debug(`📊 任务状态: ${result.status}, 进度: ${result.progress || 0}%`);
      
      return result;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('查询超时，请检查网络连接');
      }
      logger.error('❌ 查询任务状态失败:', error);
      throw error;
    }
  }

  /**
   * 轮询任务直到完成
   * @param {string} taskId - 任务ID
   * @param {Function} onProgress - 进度回调函数 (status) => void
   * @returns {Promise<Object>} - 完成后的任务信息
   */
  async pollTaskStatus(taskId, onProgress) {
    const maxRetries = 60;  // 最多60次（2分钟）
    const interval = 2000;  // 2秒一次
    let retries = 0;

    logger.debug('🔄 开始轮询任务状态:', taskId);

    while (retries < maxRetries) {
      try {
        retries++;
        
        const status = await this.queryTaskStatus(taskId);
        
        // 详细日志：显示后端返回的所有字段
        logger.debug(`📊 第${retries}次轮询:`, {
          status: status.status,
          progress: status.progress,
          completed_images: status.completed_images,
          total_images: status.total_images,
          current_image_index: status.current_image_index
        });
        
        // 调用进度回调
        if (onProgress) {
          onProgress(status);
        }

        // 检查任务状态
        if (status.status === 'completed') {
          logger.debug('✅ 任务已完成:', taskId);
          return status;
        } else if (status.status === 'failed') {
          throw new Error(status.error || '任务处理失败');
        }
        
        // 等待后继续轮询
        await new Promise(resolve => setTimeout(resolve, interval));
        
      } catch (error) {
        // 如果是 404 (任务不存在)，立即停止轮询
        if (error.message && error.message.includes('TASK_NOT_FOUND')) {
          logger.error('❌ 任务不存在，停止轮询');
          throw new Error('服务器未找到该任务，可能图像编辑功能暂未部署或任务ID无效');
        }
        
        // 其他网络错误，继续重试（但只重试几次）
        if (retries < Math.min(maxRetries, 5)) {
          logger.warn(`⚠️ 轮询失败（${retries}/${maxRetries}），继续重试...`);
          await new Promise(resolve => setTimeout(resolve, interval));
          continue;
        }
        throw error;
      }
    }

    throw new Error('任务超时（超过2分钟）');
  }

  // ========== 文件操作 ==========
  
  /**
   * 下载增强后的图片
   * @param {string} resultUrl - 图片URL
   * @returns {Promise<Blob>}
   */
  async downloadEnhancedImage(resultUrl) {
    try {
      logger.debug('⬇️ 下载增强图片:', resultUrl);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30秒超时
      
      const response = await fetch(resultUrl, { signal: controller.signal });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      logger.debug('✅ 图片已下载:', blob.size, 'bytes');
      
      return blob;
      
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('下载超时，请检查网络连接');
      }
      logger.error('❌ 下载图片失败:', error);
      throw new Error(`下载图片失败: ${error.message}`);
    }
  }

  /**
   * 保存图片到xualbum目录
   * @param {Blob} imageBlob - 图片Blob
   * @param {string} originalFileName - 原文件名
   * @returns {Promise<{filePath: string, fileName: string, directory: string}>}
   */
  async saveToXualbum(imageBlob, originalFileName) {
    try {
      logger.debug('💾 保存图片到xualbum:', originalFileName);
      
      const { ipcRenderer } = window.require('electron');
      const path = window.require('path');
      const os = window.require('os');

      // 1. 准备路径
      const picturesDir = path.join(os.homedir(), 'Pictures');
      const xualbumDir = path.join(picturesDir, 'xualbum');
      
      // 2. 确保目录存在
      const dirResult = await ipcRenderer.invoke('ensure-directory', xualbumDir);
      if (!dirResult.success) {
        throw new Error(`创建目录失败: ${dirResult.error}`);
      }

      // 3. 生成文件名: 原文件名_xt_时间戳.扩展名
      const timestamp = Date.now();
      const parsedPath = path.parse(originalFileName);
      const newFileName = `${parsedPath.name}_xt_${timestamp}${parsedPath.ext || '.jpg'}`;
      const fullPath = path.join(xualbumDir, newFileName);

      // 4. 保存文件
      const arrayBuffer = await imageBlob.arrayBuffer();
      const saveResult = await ipcRenderer.invoke('save-file-to-path', {
        path: fullPath,
        buffer: Buffer.from(arrayBuffer)
      });

      if (!saveResult.success) {
        throw new Error(`保存文件失败: ${saveResult.error}`);
      }

      logger.debug('✅ 文件已保存:', fullPath);

      return {
        filePath: fullPath,
        fileName: newFileName,
        directory: xualbumDir
      };
      
    } catch (error) {
      logger.error('❌ 保存到xualbum失败:', error);
      throw new Error(`保存文件失败: ${error.message}`);
    }
  }

  /**
   * 批量准备图片（用于批量增强）
   * @param {Array<string>} imageUris - 图片URI数组
   * @returns {Promise<Array<{file: Blob, hash: string, originalFileName: string}>>}
   */
  async prepareImagesForEnhance(imageUris) {
    const results = [];
    
    for (let i = 0; i < imageUris.length; i++) {
      try {
        logger.debug(`📦 准备图片 ${i + 1}/${imageUris.length}:`, imageUris[i]);
        const result = await this.prepareImageForEnhance(imageUris[i]);
        results.push(result);
      } catch (error) {
        logger.error(`❌ 准备图片失败 (${i + 1}/${imageUris.length}):`, error);
        // 继续处理其他图片
        results.push({ error: error.message, uri: imageUris[i] });
      }
    }
    
    return results;
  }
}

// 导出单例
export default new ImageEnhanceService();

