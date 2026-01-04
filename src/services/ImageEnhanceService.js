/**
 * ImageEnhanceService - AI图像增强服务
 * 
 * 功能：
 * 1. 图片预处理（resize、压缩、hash计算）- 复用 ImageProcessor
 * 2. API交互（提交任务、查询状态、轮询）
 * 3. 文件操作（下载、保存到xualbum目录）
 */

import { logger, normalizeFilePath } from '../adapters/WebAdapters';
import ImageProcessor from './ImageProcessor';
import ImageStorageService from './ImageStorageService';
import WeChatAuthService from './WeChatAuthService';

class ImageEnhanceService {
  constructor() {
    this.apiConfig = {
      baseURL: 'https://api.aifuture.net.cn',
      endpoints: {
        submit: '/api/v2/image-edit/batch',
        taskStatus: '/api/v2/image-edit/task',
        batchCheckCache: '/api/v1/image-edit/batch-check-cache' // v2文档中未提及，保留v1
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
   * 准备图片用于增强（直接使用原图，不缩放不计算哈希）
   * @param {string} imageUri - 图片URI (file:/// 或 content://)
   * @returns {Promise<{originalFileName: string, localUri: string}>}
   */
  async prepareImageForEnhance(imageUri) {
    try {
      logger.debug('🖼️ 准备图片进行增强(原图直传):', imageUri);
      const originalFileName = (() => {
        try {
          const clean = (imageUri || '').replace(/^file:\/\//, '');
          const noQuery = clean.split('?')[0].split('#')[0];
          const segments = noQuery.split(/[\\\/]/);
          const name = segments[segments.length - 1];
          return name && name.trim() ? name : `image_${Date.now()}.jpg`;
        } catch (e) {
          return `image_${Date.now()}.jpg`;
        }
      })();
      // 直接返回本地URI与文件名
      return { originalFileName, localUri: imageUri };
    } catch (error) {
      logger.error('❌ 图片预处理失败:', error);
      throw new Error(`图片预处理失败: ${error.message}`);
    }
  }

  // ========== API交互 ==========
  
  /**
   * 提交增强任务（支持批量：1-9张，v2接口）
   * @param {Array<{file: Blob, hash: string, fileName: string, localUri: string, originalFileName: string}>} preparedImages - 预处理后的图片数组
   * @param {string} presetId - 增强方案ID（如 'portrait', 'custom' 等），提示词从配置中获取
   * @returns {Promise<{task_id: string, total_images: number, request_id: string}>}
   */
  async submitEnhanceTask(preparedImages, presetId) {
    try {
      const imageCount = preparedImages.length;
      logger.debug(`📤 提交批量增强任务: ${imageCount}张图片, 方案: ${presetId}`);
      
      // 从配置获取预设方案对应的提示词
      let prompt = '';
      const normalizedPresetId = (presetId && typeof presetId === 'string') ? presetId.trim() : 'portrait';
      
      try {
        const settings = await this.imageStorageService.getSettings();
        const enhancePresets = settings?.aiEnhancePresets || {};
        const presetConfig = enhancePresets[normalizedPresetId];
        
        if (presetConfig && presetConfig.prompt && typeof presetConfig.prompt === 'string' && presetConfig.prompt.trim()) {
          prompt = presetConfig.prompt.trim();
          logger.debug(`✅ 从配置获取预设方案提示词: ${normalizedPresetId} -> ${prompt}`);
        } else {
          // 配置中找不到，抛出错误提示用户配置缺失
          logger.error(`❌ 配置中未找到预设方案 ${normalizedPresetId} 的提示词`);
          throw new Error(`预设方案 ${normalizedPresetId} 未配置提示词，请在设置中配置该预设方案`);
        }
      } catch (error) {
        // 如果是我们自己抛出的错误，直接抛出
        if (error.message && error.message.includes('预设方案')) {
          throw error;
        }
        // 其他错误（如获取配置失败）
        logger.error('❌ 获取配置失败:', error);
        throw new Error(`获取增强预设配置失败: ${error.message}`);
      }
      
      const formData = new FormData();

      // 获取客户端ID
      const clientId = await this.getClientId();
      // 必填校验：无 client_id 直接失败
      if (!clientId) {
        logger.error('❌ 提交任务失败：缺少 client_id');
        throw new Error('缺少 client_id，无法提交增强任务');
      }

      // 🔥 v2接口：构建 image_metadata（包含图片元数据和提示词）
      const imageMetadataItems = [];
      const filesSummary = [];
      const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
      const isBrowserLike = typeof window !== 'undefined' && !isReactNative;

      // 在浏览器/Electron 渲染进程中，必须传入 Blob/File；在 React Native 中传 { uri, type, name }
      for (let index = 0; index < preparedImages.length; index++) {
        const prepared = preparedImages[index];
        const fileName = prepared.originalFileName || `image_${index + 1}.jpg`;
        const imageUri = prepared.localUri || '';
        const imageHash = prepared.hash || '';

        // 添加到 image_metadata items
        imageMetadataItems.push({
          index,
          image_uri: imageUri,
          image_hash: imageHash || '' // v2接口需要hash，如果没有则传空字符串
        });

        if (isBrowserLike) {
          let fileToAppend;
          try {
            if (/^https?:\/\//i.test(imageUri)) {
              // http(s) 链接，直接拉取为 Blob
              const res = await fetch(imageUri);
              const blob = await res.blob();
              // 使用 File，携带文件名
              fileToAppend = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
            } else {
              // 本地文件：file:/// 或 绝对路径，使用 fs 读取（复用适配层标准化）
              const fs = window.require && window.require('fs');
              if (!fs) {
                throw new Error('Electron fs 不可用');
              }
              const candidate = imageUri || prepared.filePath || '';
              const absPath = normalizeFilePath ? normalizeFilePath(candidate) : candidate.replace(/^file:\/\/*/i, '');
              const buffer = await fs.promises.readFile(absPath);
              const blob2 = new Blob([buffer], { type: 'image/jpeg' });
              fileToAppend = new File([blob2], fileName, { type: 'image/jpeg' });
            }
          } catch (e) {
            logger.error(`❌ 加载图片为Blob失败 (${fileName})`, e);
            throw new Error(`加载图片失败: ${fileName}`);
          }
          formData.append('images', fileToAppend, fileName);
          filesSummary.push({ index, name: fileName, uri: imageUri || '[blob]', type: 'image/jpeg' });
        } else {
          // React Native
          const rnFileObj = {
            uri: imageUri,
            type: 'image/jpeg',
            name: fileName,
          };
          formData.append('images', rnFileObj);
          filesSummary.push({ index, name: fileName, uri: imageUri, type: 'image/jpeg' });
        }

        logger.debug(`  - 图片${index + 1}: ${fileName}`);
      }
      
      // 🔥 v2接口：添加 image_metadata 字段（JSON字符串）
      const imageMetadata = {
        items: imageMetadataItems,
        prompt: prompt,
        user_id: clientId
      };
      formData.append('image_metadata', JSON.stringify(imageMetadata));

      const controller = new AbortController();
      // 动态超时：基础30秒 + 每张图片额外15秒（上传和处理时间）
      const dynamicTimeout = 30000 + (imageCount * 15000);
      logger.debug(`⏱️ 设置超时时间: ${dynamicTimeout}ms (${imageCount}张图片)`);
      const timeoutId = setTimeout(() => controller.abort(), dynamicTimeout);

      // 🔥 v2接口：构建请求头（只使用 X-User-ID，不再使用 client_id 表单字段）
      const headers = { 'X-User-ID': clientId };
      
      const submitUrl = `${this.apiConfig.baseURL}${this.apiConfig.endpoints.submit}`;
      // 打印原始请求信息（不打印文件二进制，仅打印概要）
      logger.debug('🛰️ 提交增强任务请求 (v2)', {
        url: submitUrl,
        method: 'POST',
        headers,
        image_metadata: imageMetadata,
        files: filesSummary
      });

      const response = await fetch(submitUrl, {
        method: 'POST',
        headers: headers,
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const rawText = await response.text();
      // 打印后端原始响应包
      logger.debug('📦 提交增强任务响应', { status: response.status, ok: response.ok, body: rawText });
      if (!response.ok) {
        logger.error('❌ API返回错误:', rawText);
        throw new Error(`HTTP ${response.status}: ${rawText || response.statusText}`);
      }

      let result;
      try {
        result = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`响应解析失败: 非JSON: ${rawText?.slice?.(0, 256)}`);
      }
      
      // 🔥 v2接口：检查 error_type，如果不为 success 则抛出错误
      if (result.error_type !== 'success') {
        const errorMsg = result.error || '提交任务失败';
        logger.error('❌ API返回错误:', errorMsg);
        throw new Error(errorMsg);
      }
      
      logger.debug('✅ 批量任务已提交 (v2):', {
        task_id: result.task_id,
        total_images: result.total_images,
        request_id: result.request_id
      });
      
      // v2接口返回格式：{error_type, error, task_id, total_images, request_id}
      return {
        task_id: result.task_id,
        total_images: result.total_images,
        request_id: result.request_id
      };
      
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
      
      const rawText = await response.text();
      logger.debug('📦 查询任务状态响应', { status: response.status, ok: response.ok, body: rawText });
      if (!response.ok) {
        logger.error(`❌ 查询任务状态失败: HTTP ${response.status}`);
        logger.error(`错误详情: ${rawText}`);
        // 404 通常表示任务不存在或API未实现，不应该继续重试
        if (response.status === 404) {
          throw new Error(`TASK_NOT_FOUND: 任务不存在或API未实现 (${taskId})`);
        }
        throw new Error(`HTTP ${response.status}: ${rawText || response.statusText}`);
      }
      let result;
      try {
        result = JSON.parse(rawText);
      } catch (e) {
        throw new Error(`任务状态解析失败: 非JSON: ${rawText?.slice?.(0, 256)}`);
      }
      
      // 🔥 v2接口：响应格式包含 results 数组，每个结果有 index, image_uri, status, result_url, error, from_cache
      // v2接口：计算进度百分比（completed_images / total_images）
      const progress = result.total_images > 0 
        ? Math.round((result.completed_images || 0) / result.total_images * 100)
        : 0;
      
      logger.debug(`📊 任务状态 (v2): ${result.status}, 进度: ${progress}% (${result.completed_images || 0}/${result.total_images})`);
      
      // 返回兼容格式（包含 progress 字段，方便现有代码使用）
      return {
        ...result,
        progress: progress
      };
      
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
   * @param {AbortSignal} signal - 可选的取消信号，用于取消轮询
   * @returns {Promise<Object>} - 完成后的任务信息
   */
  async pollTaskStatus(taskId, onProgress, signal = null) {
    const interval = 2000;  // 2秒一次
    let pollCount = 0;
    let consecutiveErrors = 0;  // 连续错误次数
    const maxConsecutiveErrors = 5;  // 最多连续5次网络错误后停止

    logger.debug('🔄 开始轮询任务状态:', taskId);

    while (true) {
      // 检查是否已取消
      if (signal && signal.aborted) {
        logger.debug('🛑 轮询已取消:', taskId);
        throw new Error('轮询已被用户取消');
      }

      try {
        pollCount++;
        
        const status = await this.queryTaskStatus(taskId);
        
        // 再次检查是否已取消（在查询完成后）
        if (signal && signal.aborted) {
          logger.debug('🛑 轮询已取消:', taskId);
          throw new Error('轮询已被用户取消');
        }
        
        // 重置连续错误计数
        consecutiveErrors = 0;
        
        // 详细日志：显示后端返回的所有字段（每10次轮询记录一次详细日志，避免日志过多）
        // 🔥 v2接口：响应包含 results 数组，每个结果有 index, image_uri, status, result_url, error, from_cache
        if (pollCount % 10 === 0 || status.status !== 'processing') {
          logger.debug(`📊 第${pollCount}次轮询 (v2):`, {
            status: status.status,
            progress: status.progress,
            completed_images: status.completed_images,
            total_images: status.total_images,
            results_count: status.results ? status.results.length : 0
          });
        }
        
        // 调用进度回调
        if (onProgress) {
          onProgress(status);
        }

        // 检查任务状态
        if (status.status === 'completed') {
          logger.debug(`✅ 任务已完成: ${taskId} (共轮询${pollCount}次)`);
          return status;
        } else if (status.status === 'failed') {
          throw new Error(status.error || '任务处理失败');
        }
        
        // 任务仍在处理中，等待后继续轮询（支持取消）
        await this.delayWithCancel(interval, signal);
        
      } catch (error) {
        // 检查是否是取消操作
        if (error.message && error.message.includes('轮询已被用户取消')) {
          throw error;
        }
        
        consecutiveErrors++;
        
        // 如果是 404 (任务不存在)，立即停止轮询
        if (error.message && error.message.includes('TASK_NOT_FOUND')) {
          logger.error('❌ 任务不存在，停止轮询');
          throw new Error('服务器未找到该任务，可能图像编辑功能暂未部署或任务ID无效');
        }
        
        // 如果是任务失败状态，立即抛出错误
        if (error.message && error.message.includes('任务处理失败')) {
          throw error;
        }
        
        // 网络错误：如果连续错误次数过多，停止轮询
        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.error(`❌ 连续${consecutiveErrors}次轮询失败，停止轮询`);
          throw new Error(`轮询任务状态失败（连续${consecutiveErrors}次错误），请检查网络连接`);
        }
        
        // 其他网络错误，等待后继续重试（支持取消）
        logger.warn(`⚠️ 轮询失败（第${pollCount}次，连续错误${consecutiveErrors}次），${interval}ms后重试...`);
        await this.delayWithCancel(interval, signal);
      }
    }
  }

  /**
   * 支持取消的延迟函数
   * @param {number} ms - 延迟毫秒数
   * @param {AbortSignal} signal - 可选的取消信号
   * @returns {Promise<void>}
   */
  delayWithCancel(ms, signal = null) {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new Error('轮询已被用户取消'));
        return;
      }
      
      const timeoutId = setTimeout(() => {
        resolve();
      }, ms);
      
      // 如果提供了取消信号，监听取消事件
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error('轮询已被用户取消'));
        });
      }
    });
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

