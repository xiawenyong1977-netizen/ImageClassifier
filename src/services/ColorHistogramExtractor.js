/**
 * 颜色直方图提取器
 * 从图片中提取RGB和HSV颜色直方图特征
 * 
 * 平台支持：
 * - PC端（Electron/Web）：使用浏览器Canvas API
 * - 移动端（React Native）：使用react-native-canvas
 * - 通过CanvasAdapter统一适配，代码完全相同
 */

import { logger } from '../adapters/WebAdapters';
import imageProcessor from './ImageProcessor';

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
      // 使用 ImageProcessor 获取图片尺寸
      // 如果遇到内存池错误，会在这里抛出
      const dimensions = await imageProcessor.getImageDimensions(imageUri);
      
      // 计算缩放比例（为了性能，限制最大尺寸）
      const maxSize = 200;
      const scale = Math.min(maxSize / dimensions.width, maxSize / dimensions.height, 1);
      const width = Math.floor(dimensions.width * scale);
      const height = Math.floor(dimensions.height * scale);
      
      // 使用 ImageProcessor 获取像素数据
      const pixels = await imageProcessor.getPixelData(imageUri, width, height, {
        mode: 'contain',
        backgroundColor: [0, 0, 0, 255]
      });
      
      // 提取直方图
      const histogram = this._extractHistogramFromPixels(pixels);
      
      // 提取其他特征
      const features = {
        color_histogram: histogram,
        dominant_colors: this._extractDominantColors(histogram),
        brightness: this._calculateBrightness(histogram),
        contrast: this._calculateContrast(pixels, width, height),
        extracted_at: new Date().toISOString()
      };
      
      return features;
      
    } catch (error) {
      // 检查是否是内存池错误
      const isMemoryPoolError = error?.message?.includes('Pool hard cap violation') || 
                               error?.message?.includes('Hard cap');
      
      if (isMemoryPoolError) {
        logger.error('❌ 提取颜色直方图失败（内存池硬限制）:', error.message);
      } else {
        logger.error('❌ 提取颜色直方图失败:', error);
      }
      throw error;
    }
  }

  // 🗑️ 已移除 _loadImage 方法，现在使用 CanvasAdapter.loadImage()

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
