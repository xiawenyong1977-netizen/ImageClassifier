/**
 * 颜色直方图提取器
 * 从图片中提取RGB和HSV颜色直方图特征
 */

import { logger } from '../adapters/WebAdapters.js';

class ColorHistogramExtractor {
  constructor() {
    this.rgbBins = 256;  // RGB每个通道的bin数量
    this.hsvBins = {
      h: 360,  // 色调：0-359度
      s: 100,  // 饱和度：0-100%
      v: 100   // 明度：0-100%
    };
  }

  /**
   * 从图片URI提取颜色直方图
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Object>} 颜色直方图数据
   */
  async extractHistogram(imageUri) {
    try {
      // 创建图片对象
      const image = await this._loadImage(imageUri);
      
      // 创建canvas来获取像素数据
      let canvas, ctx;
      if (typeof document !== 'undefined') {
        // 浏览器环境
        canvas = document.createElement('canvas');
        ctx = canvas.getContext('2d');
      } else {
        // Node.js环境，使用canvas库
        try {
          const { createRequire } = await import('module');
          const require = createRequire(import.meta.url);
          const { createCanvas } = require('D:/ImageClassifierApp/pc-version-final/node_modules/canvas');
          canvas = createCanvas(image.width, image.height);
          ctx = canvas.getContext('2d');
        } catch (error) {
          logger.warn('Node.js环境下的canvas处理在浏览器构建中被跳过');
          throw new Error('Node.js环境在浏览器构建中不支持');
        }
      }
      
      // 设置canvas尺寸（为了性能，可以缩放）
      const maxSize = 200; // 限制最大尺寸以提高性能
      const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
      
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      
      // 绘制图片到canvas
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      
      // 获取像素数据
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      // 提取直方图
      const histogram = this._extractHistogramFromPixels(pixels);
      
      // 提取其他特征
      const features = {
        color_histogram: histogram,
        dominant_colors: this._extractDominantColors(histogram),
        brightness: this._calculateBrightness(histogram),
        contrast: this._calculateContrast(pixels, canvas.width, canvas.height),
        extracted_at: new Date().toISOString()
      };
      
      logger.debug(`提取颜色直方图成功: ${imageUri}`);
      return features;
      
    } catch (error) {
      logger.error('提取颜色直方图失败:', error);
      throw error;
    }
  }

  /**
   * 加载图片
   * @param {string} imageUri - 图片URI
   * @returns {Promise<HTMLImageElement>} 图片对象
   * @private
   */
  async _loadImage(imageUri) {
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined' && window.Image) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous'; // 允许跨域
        
        image.onload = () => resolve(image);
        image.onerror = (error) => {
          logger.error('图片加载失败:', error);
          reject(new Error(`图片加载失败: ${imageUri}`));
        };
        
        image.src = imageUri;
      });
    } else {
      // Node.js环境，使用canvas库
      try {
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const { loadImage } = require('D:/ImageClassifierApp/pc-version-final/node_modules/canvas');
        // 将file://协议转换为普通路径
        const filePath = imageUri.replace('file:///', '');
        return await loadImage(filePath);
      } catch (error) {
        console.warn('⚠️ Node.js环境下的图片加载在浏览器构建中被跳过');
        throw new Error('Node.js环境在浏览器构建中不支持');
      }
    }
  }

  /**
   * 从像素数据提取直方图
   * @param {Uint8ClampedArray} pixels - 像素数据数组
   * @returns {Object} 直方图数据
   * @private
   */
  _extractHistogramFromPixels(pixels) {
    // 初始化直方图数组
    const rgbHist = {
      r: new Array(this.rgbBins).fill(0),
      g: new Array(this.rgbBins).fill(0),
      b: new Array(this.rgbBins).fill(0)
    };
    
    const hsvHist = {
      h: new Array(this.hsvBins.h).fill(0),
      s: new Array(this.hsvBins.s).fill(0),
      v: new Array(this.hsvBins.v).fill(0)
    };
    
    // 遍历像素数据（每4个值代表一个像素：R, G, B, A）
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const a = pixels[i + 3];
      
      // 跳过透明像素
      if (a < 128) continue;
      
      // 更新RGB直方图
      rgbHist.r[r]++;
      rgbHist.g[g]++;
      rgbHist.b[b]++;
      
      // 转换RGB到HSV
      const hsv = this._rgbToHsv(r, g, b);
      
      // 更新HSV直方图
      const hIndex = Math.floor(hsv.h * (this.hsvBins.h - 1) / 360);
      const sIndex = Math.floor(hsv.s * (this.hsvBins.s - 1) / 100);
      const vIndex = Math.floor(hsv.v * (this.hsvBins.v - 1) / 100);
      
      hsvHist.h[hIndex]++;
      hsvHist.s[sIndex]++;
      hsvHist.v[vIndex]++;
    }
    
    // 归一化直方图
    this._normalizeHistogram(rgbHist);
    this._normalizeHistogram(hsvHist);
    
    return {
      rgb: rgbHist,
      hsv: hsvHist
    };
  }

  /**
   * RGB转HSV
   * @param {number} r - 红色值 (0-255)
   * @param {number} g - 绿色值 (0-255)
   * @param {number} b - 蓝色值 (0-255)
   * @returns {Object} HSV值 {h, s, v}
   * @private
   */
  _rgbToHsv(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const diff = max - min;
    
    let h = 0;
    if (diff !== 0) {
      if (max === r) {
        h = ((g - b) / diff) % 6;
      } else if (max === g) {
        h = (b - r) / diff + 2;
      } else {
        h = (r - g) / diff + 4;
      }
    }
    
    h = Math.round(h * 60);
    if (h < 0) h += 360;
    
    const s = max === 0 ? 0 : Math.round((diff / max) * 100);
    const v = Math.round(max * 100);
    
    return { h, s, v };
  }

  /**
   * 归一化直方图
   * @param {Object} histogram - 直方图对象
   * @private
   */
  _normalizeHistogram(histogram) {
    Object.keys(histogram).forEach(channel => {
      const channelData = histogram[channel];
      const sum = channelData.reduce((total, count) => total + count, 0);
      
      if (sum > 0) {
        for (let i = 0; i < channelData.length; i++) {
          channelData[i] = channelData[i] / sum;
        }
      }
    });
  }

  /**
   * 提取主要颜色
   * @param {Object} histogram - 直方图数据
   * @returns {Array} 主要颜色数组
   * @private
   */
  _extractDominantColors(histogram) {
    const dominantColors = [];
    
    // 分析RGB直方图的峰值
    const rgbPeaks = this._findHistogramPeaks(histogram.rgb);
    
    // 转换为十六进制颜色
    rgbPeaks.forEach(peak => {
      const hexColor = this._rgbToHex(peak.r, peak.g, peak.b);
      dominantColors.push({
        color: hexColor,
        percentage: peak.percentage
      });
    });
    
    // 按百分比排序
    dominantColors.sort((a, b) => b.percentage - a.percentage);
    
    // 只返回前5个主要颜色
    return dominantColors.slice(0, 5);
  }

  /**
   * 查找直方图峰值
   * @param {Object} rgbHist - RGB直方图
   * @returns {Array} 峰值数组
   * @private
   */
  _findHistogramPeaks(rgbHist) {
    const peaks = [];
    
    // 简化的峰值检测：找到每个通道的最大值
    const rPeak = this._findChannelPeak(rgbHist.r);
    const gPeak = this._findChannelPeak(rgbHist.g);
    const bPeak = this._findChannelPeak(rgbHist.b);
    
    // 创建峰值对象
    peaks.push({
      r: rPeak.index,
      g: gPeak.index,
      b: bPeak.index,
      percentage: (rPeak.value + gPeak.value + bPeak.value) / 3
    });
    
    return peaks;
  }

  /**
   * 查找单个通道的峰值
   * @param {Array} channelData - 通道数据
   * @returns {Object} 峰值信息
   * @private
   */
  _findChannelPeak(channelData) {
    let maxIndex = 0;
    let maxValue = channelData[0];
    
    for (let i = 1; i < channelData.length; i++) {
      if (channelData[i] > maxValue) {
        maxValue = channelData[i];
        maxIndex = i;
      }
    }
    
    return { index: maxIndex, value: maxValue };
  }

  /**
   * RGB转十六进制
   * @param {number} r - 红色值
   * @param {number} g - 绿色值
   * @param {number} b - 蓝色值
   * @returns {string} 十六进制颜色
   * @private
   */
  _rgbToHex(r, g, b) {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * 计算亮度
   * @param {Object} histogram - 直方图数据
   * @returns {number} 亮度值 (0-1)
   * @private
   */
  _calculateBrightness(histogram) {
    // 使用V通道（明度）计算平均亮度
    const vChannel = histogram.hsv.v;
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < vChannel.length; i++) {
      const weight = vChannel[i];
      const value = i / (vChannel.length - 1); // 归一化到0-1
      weightedSum += weight * value;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * 计算对比度
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {number} 对比度值 (0-1)
   * @private
   */
  _calculateContrast(pixels, width, height) {
    // 计算像素值的标准差作为对比度指标
    let sum = 0;
    let count = 0;
    
    // 计算平均值
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const gray = (r + g + b) / 3; // 转换为灰度
      sum += gray;
      count++;
    }
    
    const mean = sum / count;
    
    // 计算标准差
    let variance = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const gray = (r + g + b) / 3;
      variance += Math.pow(gray - mean, 2);
    }
    
    const stdDev = Math.sqrt(variance / count);
    
    // 归一化到0-1范围
    return Math.min(stdDev / 128, 1);
  }
}

export default ColorHistogramExtractor;
