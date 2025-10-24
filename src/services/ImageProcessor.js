/**
 * ImageProcessor - 跨平台图像处理接口
 * 
 * PC端: 使用 Canvas API (浏览器原生，性能最好)
 * 移动端: 使用 react-native-image-resizer + jpeg-js (原生模块，性能好)
 * 
 * 使用场景：
 * 1. 直方图计算 (ColorHistogramExtractor)
 * 2. 模型推理预处理 (preprocessImageForYOLO, preprocessImageForMobileNetV3)
 */

import { Buffer } from 'buffer';
import { logger, Platform, ImageResizer, RNFS, jpegJs, RNImage } from '../adapters/WebAdapters';

// 注意：ImageResizer, RNFS, jpegJs, RNImage 在移动端通过 WebAdapters.native.js 导入
// 在 PC 端这些会是 undefined，但没关系，因为 Platform.OS === 'web' 时不会使用它们

class ImageProcessor {
  constructor() {
      this.isInitialized = true;
    
    // 单图片缓存：因为模型推理是串行的，只需要缓存当前正在处理的图片
    this.currentImageUri = null;  // 当前图片URI
    this.currentImage = null;      // 当前缓存的Image对象（仅PC端使用）
  }

  /**
   * 【核心接口1】获取图片像素数据
   * 
   * @param {string} imageUri - 图片路径
   *   - PC端: file:///C:/path/to/image.jpg
   *   - 移动端: file:///storage/emulated/0/DCIM/image.jpg
   * 
   * @param {number} targetWidth - 目标宽度
   * @param {number} targetHeight - 目标高度
   * 
   * @param {Object} options - 缩放选项
   * @param {string} options.mode - 缩放模式
   *   - 'contain': 保持宽高比，居中，填充背景色（默认）
   *   - 'cover': 保持宽高比，填满，裁剪超出部分
   *   - 'stretch': 拉伸填充，不保持宽高比
   * @param {Array<number>} options.backgroundColor - 背景色 [R, G, B, A]，默认黑色 [0, 0, 0, 255]
   * 
   * @returns {Promise<Uint8ClampedArray>} 像素数据，格式 [R, G, B, A, R, G, B, A, ...]
   */
  async getPixelData(imageUri, targetWidth, targetHeight, options = {}) {
    // 根据平台选择不同的实现
    if (Platform.OS === 'web') {
      return await this._getPixelDataWithCanvas(imageUri, targetWidth, targetHeight, options);
    } else {
      return await this._getPixelDataWithJimp(imageUri, targetWidth, targetHeight, options);
    }
  }

  /**
   * 【PC端实现】使用Canvas API获取像素数据
   */
  async _getPixelDataWithCanvas(imageUri, targetWidth, targetHeight, options = {}) {
    try {
      const {
        mode = 'contain',
        backgroundColor = [0, 0, 0, 255]
      } = options;

      // 减少调试日志，只保留关键信息

      // 1. 检查是否是同一张图片
      let img;
      if (this.currentImageUri === imageUri && this.currentImage) {
        // 使用缓存的Image对象
        img = this.currentImage;
      } else {
        // 不是同一张图片，重新加载
        img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUri;
        });
        
        // 更新缓存
        this.currentImageUri = imageUri;
        this.currentImage = img;
      }

      const originalWidth = img.width;
      const originalHeight = img.height;

      // 3. 创建Canvas
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      // 4. 根据模式处理图片（优化版本）
      if (mode === 'contain') {
        // 保持宽高比，居中，填充背景色
        const scale = Math.min(targetWidth / originalWidth, targetHeight / originalHeight);
        const scaledWidth = originalWidth * scale;
        const scaledHeight = originalHeight * scale;
        const x = (targetWidth - scaledWidth) * 0.5; // 使用位运算优化
        const y = (targetHeight - scaledHeight) * 0.5;

        // 一次性设置背景和绘制
        ctx.fillStyle = `rgba(${backgroundColor[0]},${backgroundColor[1]},${backgroundColor[2]},${backgroundColor[3] / 255})`;
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      } else if (mode === 'cover') {
        // 保持宽高比，填满，裁剪
        const scale = Math.max(targetWidth / originalWidth, targetHeight / originalHeight);
        const scaledWidth = originalWidth * scale;
        const scaledHeight = originalHeight * scale;
        const x = (targetWidth - scaledWidth) * 0.5;
        const y = (targetHeight - scaledHeight) * 0.5;

        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
      } else if (mode === 'stretch') {
        // 拉伸填充
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
      } else {
        throw new Error(`不支持的缩放模式: ${mode}`);
      }

      // 5. 让出主线程，避免阻塞UI
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // 6. 提取像素数据
      const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const pixelData = imageData.data;
      
      // 处理完成
      
      return pixelData;

    } catch (error) {
      logger.error(`❌ [Canvas] 图片处理失败: ${imageUri}`, error);
      throw new Error(`图片处理失败: ${error.message}`);
    }
  }

  /**
   * 【移动端实现】使用原生模块获取像素数据
   * 使用 react-native-image-resizer + @react-native-community/image-editor 组合
   * 支持所有图片格式：JPEG, PNG, WebP, HEIC等
   */
  async _getPixelDataWithJimp(imageUri, targetWidth, targetHeight, options = {}) {
    try {
      if (!ImageResizer || !RNFS || !jpegJs) {
        throw new Error('移动端图片处理模块未加载');
      }

      const {
        mode = 'contain',
        backgroundColor = [0, 0, 0, 255]
      } = options;

      // 1. 计算缩放尺寸和模式
      let resizeMode;
      if (mode === 'contain') {
        resizeMode = 'contain'; // 保持宽高比，可能有黑边
      } else if (mode === 'cover') {
        resizeMode = 'cover'; // 保持宽高比，填满裁剪
      } else if (mode === 'stretch') {
        resizeMode = 'stretch'; // 拉伸填充
      }
      
      // 2. 使用原生模块缩放图片（强制转为JPEG格式）
      const resizedImage = await ImageResizer.createResizedImage(
        imageUri,
        targetWidth,
        targetHeight,
        'JPEG', // 统一转为JPEG格式，支持所有输入格式
        90,     // 质量
        0,      // 旋转角度
        null,   // 输出路径
        false,  // keepMeta
        { mode: resizeMode }
      );
      
      // 3. 读取缩放后的图片数据
      const imageData = await RNFS.readFile(resizedImage.uri, 'base64');
      const buffer = Buffer.from(imageData, 'base64');
      
      // 4. 使用jpeg-js解码获取像素数据
      // 因为我们强制转为JPEG，所以jpeg-js可以处理
      const rawImageData = jpegJs.decode(buffer);
      const pixelData = rawImageData.data;
      
      // 5. 不立即清理临时文件，收集待清理列表
      // 临时文件会在相似度检测完成后统一批量清理
      // 这样可以避免文件占用问题，且更高效
      
      return new Uint8ClampedArray(pixelData);

    } catch (error) {
      logger.error(`❌ [Native] 图片处理失败: ${imageUri}`, error);
      throw new Error(`图片处理失败: ${error.message}`);
    }
  }

  /**
   * 【核心接口2】获取图片尺寸
   * 
   * @param {string} imageUri - 图片路径
   * @returns {Promise<{width: number, height: number}>} 图片尺寸
   */
  async getImageDimensions(imageUri) {
    // 根据平台选择不同的实现
    if (Platform.OS === 'web') {
      return await this._getImageDimensionsWithCanvas(imageUri);
    } else {
      return await this._getImageDimensionsWithJimp(imageUri);
    }
  }

  /**
   * 【PC端实现】使用Canvas API获取图片尺寸
   */
  async _getImageDimensionsWithCanvas(imageUri) {
    try {
      // 获取图片尺寸
      
      // 检查是否是同一张图片
      let img;
      if (this.currentImageUri === imageUri && this.currentImage) {
        // 使用缓存的Image对象
        img = this.currentImage;
      } else {
        // 不是同一张图片，重新加载
        img = new Image();
        img.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = imageUri;
        });
        
        // 更新缓存
        this.currentImageUri = imageUri;
        this.currentImage = img;
      }

      // 让出主线程
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const width = img.width;
      const height = img.height;
      
      return { width, height };

    } catch (error) {
      logger.error(`❌ [Canvas] 获取图片尺寸失败: ${imageUri}`, error);
      throw new Error(`获取图片尺寸失败: ${error.message}`);
    }
  }

  /**
   * 【移动端实现】使用原生模块获取图片尺寸
   */
  async _getImageDimensionsWithJimp(imageUri) {
    try {
      if (!RNImage) {
        throw new Error('React Native Image 模块未加载');
      }
      
      return new Promise((resolve, reject) => {
        RNImage.getSize(
          imageUri,
          (width, height) => {
            resolve({ width, height });
          },
          (error) => {
            reject(new Error(`获取图片尺寸失败: ${error}`));
          }
        );
      });

    } catch (error) {
      logger.error(`❌ [Native] 获取图片尺寸失败: ${imageUri}`, error);
      throw new Error(`获取图片尺寸失败: ${error.message}`);
    }
  }

  /**
   * 【核心接口3】计算文件哈希值（SHA-256）
   * 
   * @param {string} imageUri - 图片路径
   * @returns {Promise<string>} 哈希值（十六进制字符串）
   */
  async calculateFileHash(imageUri) {
    if (Platform.OS === 'web') {
      return await this._calculateHashWithWebCrypto(imageUri);
    } else {
      return await this._calculateHashWithCryptoJS(imageUri);
    }
  }

  /**
   * 【PC端实现】使用 Web Crypto API 计算哈希
   */
  async _calculateHashWithWebCrypto(imageUri) {
    try {
      // 读取文件为 Blob
      const { readImageFileAsBlob } = require('../adapters/WebAdapters');
      const blob = await readImageFileAsBlob(imageUri);
      
      // 转换为 ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();
      
      // 计算 SHA-256
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      return hashHex;
    } catch (error) {
      logger.error(`❌ [Web] 计算哈希失败: ${imageUri}`, error);
      throw new Error(`计算哈希失败: ${error.message}`);
    }
  }

  /**
   * 【移动端实现】使用 CryptoJS 计算哈希
   */
  async _calculateHashWithCryptoJS(imageUri) {
    try {
      if (!RNFS) {
        throw new Error('RNFS 模块未加载');
      }

      // 导入 CryptoJS
      const CryptoJS = require('crypto-js');
      
      // 移除 file:// 前缀
      const normalizedPath = imageUri.replace(/^file:\/\//, '');
      
      // 读取文件为 base64
      const base64Data = await RNFS.readFile(normalizedPath, 'base64');
      
      // 将 base64 转换为 WordArray
      const wordArray = CryptoJS.enc.Base64.parse(base64Data);
      
      // 计算 SHA-256
      const hash = CryptoJS.SHA256(wordArray);
      
      // 转换为十六进制字符串
      const hashHex = hash.toString(CryptoJS.enc.Hex);
      
      return hashHex;
    } catch (error) {
      logger.error(`❌ [Native] 计算哈希失败: ${imageUri}`, error);
      throw new Error(`计算哈希失败: ${error.message}`);
    }
  }

  /**
   * 【核心接口4】从图片文件创建 Blob 对象（跨平台）
   * 
   * PC端：使用 fetch 直接读取文件为 Blob
   * 移动端：读取文件为 base64，然后转换为 Blob
   * 
   * @param {string} imageUri - 图片路径
   * @returns {Promise<Blob>} Blob 对象
   */
  async createBlobFromImage(imageUri) {
    if (Platform.OS === 'web') {
      // PC端：使用 fetch 读取文件
      return await this._createBlobWithFetch(imageUri);
    } else {
      // 移动端：读取 base64 并转换
      return await this._createBlobWithRNFS(imageUri);
    }
  }

  /**
   * 【PC端实现】使用 fetch 创建 Blob
   */
  async _createBlobWithFetch(imageUri) {
    try {
      const response = await fetch(imageUri);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      return blob;
    } catch (error) {
      logger.error(`❌ [PC] Blob 创建失败: ${imageUri}`, error);
      throw new Error(`创建 Blob 失败: ${error.message}`);
    }
  }

  /**
   * 【移动端实现】从文件读取 base64 并创建 Blob
   */
  async _createBlobWithRNFS(imageUri) {
    try {
      if (!RNFS) {
        throw new Error('RNFS 模块未加载');
      }

      // 移除 file:// 前缀
      const normalizedPath = imageUri.replace(/^file:\/\//, '');
      
      // 读取文件为 base64
      const base64Data = await RNFS.readFile(normalizedPath, 'base64');
      
      // 将 base64 转换为 Uint8Array
      const buffer = Buffer.from(base64Data, 'base64');
      const uint8Array = new Uint8Array(buffer);
      
      // 创建 Blob
      const blob = new Blob([uint8Array], { type: 'image/jpeg' });
      
      logger.debug(`✅ [Native] Blob 创建成功: size=${blob.size}, type=${blob.type}`);
      return blob;
    } catch (error) {
      logger.error(`❌ [Native] Blob 创建失败: ${imageUri}`, error);
      throw new Error(`创建 Blob 失败: ${error.message}`);
    }
  }

  /**
   * 【核心接口5】缩放图片并返回 Blob（用于上传）
   * 
   * 这是一个便捷方法，会自动处理平台差异：
   * - PC端：缩放后直接返回 Blob
   * - 移动端：缩放后读取临时文件并创建 Blob
   * 
   * @param {string} imageUri - 图片路径
   * @param {number} targetWidth - 目标宽度
   * @param {number} targetHeight - 目标高度
   * @param {Object} options - 缩放选项
   * @returns {Promise<{uri: string, width: number, height: number, blob: Blob}>} 缩放结果和 Blob
   */
  async resizeImageAndGetBlob(imageUri, targetWidth, targetHeight, options = {}) {
    // 1. 缩放图片
    const resizedResult = await this.resizeImage(imageUri, targetWidth, targetHeight, options);
    
    // 2. 获取 Blob
    // PC端：resizedResult.blob 已经存在
    // 移动端：需要基于 resizedResult.uri 创建 Blob
    const blob = resizedResult.blob 
      ? resizedResult.blob 
      : await this.createBlobFromImage(resizedResult.uri);
    
    return {
      uri: resizedResult.uri,
      width: resizedResult.width,
      height: resizedResult.height,
      blob: blob
    };
  }

  /**
   * 【核心接口6】缩放图片文件
   * 
   * @param {string} imageUri - 图片路径
   * @param {number} targetWidth - 目标宽度
   * @param {number} targetHeight - 目标高度
   * @param {Object} options - 缩放选项
   * @param {boolean} options.maintainAspectRatio - 是否保持宽高比，默认 true
   * @param {string} options.outputFormat - 输出格式 ('jpeg', 'png')，默认 'jpeg'
   * @param {number} options.quality - JPEG质量 (0-100)，默认 90
   * @param {string} options.outputPath - 输出路径，默认生成临时文件
   * 
   * @returns {Promise<{uri: string, width: number, height: number, blob?: Blob}>} 缩放结果
   */
  async resizeImage(imageUri, targetWidth, targetHeight, options = {}) {
    // 根据平台选择不同的实现
    if (Platform.OS === 'web') {
      return await this._resizeImageWithCanvas(imageUri, targetWidth, targetHeight, options);
    } else {
      return await this._resizeImageWithNative(imageUri, targetWidth, targetHeight, options);
    }
  }

  /**
   * 【PC端实现】使用Canvas API缩放图片
   */
  async _resizeImageWithCanvas(imageUri, targetWidth, targetHeight, options = {}) {
    try {
      const {
        maintainAspectRatio = true,
        outputFormat = 'jpeg',
        quality = 0.9,
        outputPath = null
      } = options;

      // 1. 加载图片
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = imageUri;
      });

      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;
      
      // 2. 计算最终尺寸
      let finalWidth, finalHeight;
      if (maintainAspectRatio) {
        const scaleX = targetWidth / originalWidth;
        const scaleY = targetHeight / originalHeight;
        const scale = Math.min(scaleX, scaleY);
        finalWidth = Math.floor(originalWidth * scale);
        finalHeight = Math.floor(originalHeight * scale);
      } else {
        finalWidth = targetWidth;
        finalHeight = targetHeight;
      }

      // 3. 创建Canvas并绘制缩放后的图片
      const canvas = document.createElement('canvas');
      canvas.width = finalWidth;
      canvas.height = finalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, finalWidth, finalHeight);

      // 4. 转换为Blob
      const mimeType = outputFormat === 'png' ? 'image/png' : 'image/jpeg';
      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, mimeType, quality);
      });

      // 5. 生成输出URI
      let finalUri = outputPath || canvas.toDataURL(mimeType, quality);


      return {
        uri: finalUri,
        width: finalWidth,
        height: finalHeight,
        blob: blob
      };

    } catch (error) {
      logger.error(`❌ [Canvas] 图片缩放失败: ${imageUri}`, error);
      throw new Error(`图片缩放失败: ${error.message}`);
    }
  }

  /**
   * 【移动端实现】使用原生模块缩放图片
   */
  async _resizeImageWithNative(imageUri, targetWidth, targetHeight, options = {}) {
    try {
      if (!ImageResizer) {
        throw new Error('react-native-image-resizer 模块未加载');
      }

      const {
        maintainAspectRatio = true,
        outputFormat = 'jpeg',
        quality = 90,
        outputPath = null
      } = options;


      // 计算缩放模式
      const resizeMode = maintainAspectRatio ? 'contain' : 'stretch';
      const format = outputFormat.toUpperCase(); // 'JPEG' 或 'PNG'

      // 使用原生模块缩放
      const resizedImage = await ImageResizer.createResizedImage(
        imageUri,
        targetWidth,
        targetHeight,
        format,
        quality,
        0,          // 旋转角度
        outputPath, // 输出路径
        false,      // keepMeta
        { mode: resizeMode }
      );


      return {
        uri: resizedImage.uri,
        width: resizedImage.width,
        height: resizedImage.height
      };

    } catch (error) {
      logger.error(`❌ [Native] 图片缩放失败: ${imageUri}`, error);
      throw new Error(`图片缩放失败: ${error.message}`);
    }
  }

}

// 导出单例
const imageProcessor = new ImageProcessor();
export default imageProcessor;

