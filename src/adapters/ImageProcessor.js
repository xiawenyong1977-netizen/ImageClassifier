/**
 * ImageProcessor - 跨平台图像处理接口
 * 
 * 使用 JIMP (纯JavaScript) 实现，PC端和移动端统一
 * 不依赖DOM，不依赖原生模块
 * 
 * 使用场景：
 * 1. 直方图计算 (ColorHistogramExtractor)
 * 2. 模型推理预处理 (preprocessImageForYOLO, preprocessImageForMobileNetV3)
 */

import { logger } from './WebAdapters';

class ImageProcessor {
  constructor() {
    this.jimp = null;
    this.isInitialized = false;
  }

  /**
   * 初始化JIMP库
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.debug('📦 正在加载 JIMP 库...');
      
      // 动态导入JIMP
      const Jimp = await import('jimp');
      this.jimp = Jimp.default || Jimp;
      
      this.isInitialized = true;
      logger.debug('✅ JIMP 库加载成功');
    } catch (error) {
      logger.error('❌ JIMP 库加载失败:', error);
      throw new Error(`JIMP初始化失败: ${error.message}`);
    }
  }

  /**
   * 确保已初始化
   */
  async ensureInitialized() {
    if (!this.isInitialized) {
      await this.initialize();
    }
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
    await this.ensureInitialized();

    try {
      const {
        mode = 'contain',
        backgroundColor = [0, 0, 0, 255]
      } = options;

      logger.debug(`🖼️ 开始处理图片: ${imageUri}`);
      logger.debug(`📏 目标尺寸: ${targetWidth}x${targetHeight}, 模式: ${mode}`);

      // 1. 加载图片
      const image = await this.jimp.read(imageUri);
      const originalWidth = image.getWidth();
      const originalHeight = image.getHeight();
      
      logger.debug(`📐 原始尺寸: ${originalWidth}x${originalHeight}`);

      // 2. 根据模式处理图片
      let processedImage;

      if (mode === 'contain') {
        // 保持宽高比，居中，填充背景
        processedImage = await this._processContain(
          image, 
          targetWidth, 
          targetHeight, 
          backgroundColor
        );
      } else if (mode === 'cover') {
        // 保持宽高比，填满，裁剪
        processedImage = await this._processCover(
          image, 
          targetWidth, 
          targetHeight
        );
      } else if (mode === 'stretch') {
        // 拉伸填充
        image.resize(targetWidth, targetHeight);
        processedImage = image;
      } else {
        throw new Error(`不支持的缩放模式: ${mode}`);
      }

      // 3. 提取像素数据
      const pixelData = new Uint8ClampedArray(processedImage.bitmap.data);
      
      logger.debug(`✅ 图片处理完成，像素数据大小: ${pixelData.length} bytes`);
      
      return pixelData;

    } catch (error) {
      logger.error(`❌ 图片处理失败: ${imageUri}`, error);
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
    await this.ensureInitialized();

    try {
      logger.debug(`📏 获取图片尺寸: ${imageUri}`);
      
      const image = await this.jimp.read(imageUri);
      const width = image.getWidth();
      const height = image.getHeight();
      
      logger.debug(`✅ 图片尺寸: ${width}x${height}`);
      
      return { width, height };

    } catch (error) {
      logger.error(`❌ 获取图片尺寸失败: ${imageUri}`, error);
      throw new Error(`获取图片尺寸失败: ${error.message}`);
    }
  }

  /**
   * 【私有方法】contain模式处理
   * 保持宽高比，居中，填充背景色
   */
  async _processContain(image, targetWidth, targetHeight, backgroundColor) {
    // 计算缩放比例（保持宽高比）
    const scale = Math.min(
      targetWidth / image.getWidth(),
      targetHeight / image.getHeight()
    );

    const scaledWidth = Math.floor(image.getWidth() * scale);
    const scaledHeight = Math.floor(image.getHeight() * scale);

    // 缩放图片
    image.resize(scaledWidth, scaledHeight);

    // 创建目标画布，填充背景色
    const canvas = new this.jimp(targetWidth, targetHeight, 
      this._rgbaToHex(backgroundColor));

    // 计算居中位置
    const x = Math.floor((targetWidth - scaledWidth) / 2);
    const y = Math.floor((targetHeight - scaledHeight) / 2);

    // 将缩放后的图片绘制到画布中心
    canvas.composite(image, x, y);

    return canvas;
  }

  /**
   * 【私有方法】cover模式处理
   * 保持宽高比，填满，裁剪超出部分
   */
  async _processCover(image, targetWidth, targetHeight) {
    // 计算缩放比例（填满目标尺寸）
    const scale = Math.max(
      targetWidth / image.getWidth(),
      targetHeight / image.getHeight()
    );

    const scaledWidth = Math.floor(image.getWidth() * scale);
    const scaledHeight = Math.floor(image.getHeight() * scale);

    // 缩放图片
    image.resize(scaledWidth, scaledHeight);

    // 计算裁剪位置（居中裁剪）
    const x = Math.floor((scaledWidth - targetWidth) / 2);
    const y = Math.floor((scaledHeight - targetHeight) / 2);

    // 裁剪到目标尺寸
    image.crop(x, y, targetWidth, targetHeight);

    return image;
  }

  /**
   * 【私有方法】RGBA数组转十六进制颜色
   */
  _rgbaToHex(rgba) {
    const [r, g, b, a] = rgba;
    return (
      (r << 24) |
      (g << 16) |
      (b << 8) |
      a
    );
  }
}

// 导出单例
const imageProcessor = new ImageProcessor();
export default imageProcessor;

