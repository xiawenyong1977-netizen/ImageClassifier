/**
 * 文档检测服务
 * 使用多种图像特征算法来区分文档类图片（书本、证件、文档）和一般照片
 */

import ColorHistogramExtractor from './ColorHistogramExtractor.js';

class DocumentDetectionService {
  constructor() {
    this.colorExtractor = new ColorHistogramExtractor();
    
    // 文档检测的阈值配置（基于颜色特征）
    this.thresholds = {
      // 颜色特征阈值
      colorSaturation: 70.0,  // 最高饱和度阈值（证件照的最高饱和度应该较低）
      colorCount: 80,         // 颜色数量阈值（证件照通常颜色较少）

      
    };
  }

  /**
   * 检测图片是否为文档类（简化版：或逻辑）
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Object>} 检测结果
   */
  async detectDocument(imageUri) {
    try {
      console.log(`📄 开始文档检测: ${imageUri}`);
      
      // 只提取颜色特征
      const colorData = await this.colorExtractor.extractHistogram(imageUri);
      
      // 计算颜色特征
      const colorFeatures = {
        colorSaturation: this._calculateColorSaturation(colorData.color_histogram.hsv),
        colorCount: await this._calculateColorCount(imageUri)
      };
      
      // 检测文档边缘（类似手机文档检测）
      const edgeFeatures = await this._detectDocumentEdges(imageUri);
      
      // 检测前景背景分离模式
      const patternFeatures = await this._detectForegroundBackgroundPattern(imageUri);
      
      // 基于颜色特征的文档检测
      const lowSaturation = colorFeatures.colorSaturation <= this.thresholds.colorSaturation;
      const fewColors = colorFeatures.colorCount <= this.thresholds.colorCount;
      const documentPattern = patternFeatures.isDocumentPattern;
      const hasDocumentEdges = edgeFeatures.hasDocumentEdges;
      
      // 或逻辑：任一条件满足就判定为文档
      const isDocument = lowSaturation || fewColors || documentPattern || hasDocumentEdges;
      
      // 计算置信度
      const conditionCount = [lowSaturation, fewColors, documentPattern, hasDocumentEdges].filter(Boolean).length;
      const confidence = conditionCount / 4;
      
      const result = {
        isDocument,
        documentScore: confidence,
        confidence: confidence,
        conditions: {
          lowSaturation,
          fewColors,
          documentPattern,
          hasDocumentEdges
        },
        details: {
          colorSaturation: colorFeatures.colorSaturation,
          colorCount: colorFeatures.colorCount,
          foregroundRatio: patternFeatures.foregroundRatio,
          backgroundRatio: patternFeatures.backgroundRatio,
          connectivity: patternFeatures.connectivity,
          rightAngleCount: edgeFeatures.rightAngleCount,
          quadrilateralCount: edgeFeatures.quadrilateralCount,
          edgeConfidence: edgeFeatures.confidence
        },
        detected_at: new Date().toISOString()
      };
      
      console.log(`📄 文档检测完成: ${isDocument ? '是文档' : '不是文档'} (置信度: ${confidence.toFixed(2)})`);
      console.log(`📊 检测条件:`, {
        低饱和度: lowSaturation ? '✅' : '❌',
        颜色少: fewColors ? '✅' : '❌',
        文档模式: documentPattern ? '✅' : '❌',
        文档边缘: hasDocumentEdges ? '✅' : '❌'
      });
      console.log(`📊 详细数值:`, {
        颜色饱和度: colorFeatures.colorSaturation.toFixed(2),
        颜色数量: colorFeatures.colorCount,
        饱和度阈值: this.thresholds.colorSaturation,
        颜色数量阈值: this.thresholds.colorCount
      });
      console.log(`📊 原始数据:`, {
        RGB直方图: {
          R通道非零bin数: colorData.color_histogram.rgb.r.filter(count => count > 0).length,
          G通道非零bin数: colorData.color_histogram.rgb.g.filter(count => count > 0).length,
          B通道非零bin数: colorData.color_histogram.rgb.b.filter(count => count > 0).length
        },
        HSV直方图: {
          H通道非零bin数: colorData.color_histogram.hsv.h.filter(count => count > 0).length,
          S通道非零bin数: colorData.color_histogram.hsv.s.filter(count => count > 0).length,
          V通道非零bin数: colorData.color_histogram.hsv.v.filter(count => count > 0).length
        },
        其他特征: {
          亮度: colorData.brightness?.toFixed(2) || 'N/A',
          对比度: colorData.contrast?.toFixed(2) || 'N/A'
        }
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ 文档检测失败:', error);
      throw error;
    }
  }

  /**
   * 提取图像特征
   * @param {string} imageUri - 图片URI
   * @returns {Promise<Object>} 图像特征
   * @private
   */
  async _extractImageFeatures(imageUri) {
    // 加载图片
    const image = await this._loadImage(imageUri);
    
    // 创建canvas进行分析
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
        console.warn('⚠️ Node.js环境下的canvas处理在浏览器构建中被跳过');
        throw new Error('Node.js环境在浏览器构建中不支持');
      }
    }
    
    // 设置canvas尺寸（为了性能，可以缩放）
    const maxSize = 400;
    const scale = Math.min(maxSize / image.width, maxSize / image.height, 1);
    
    canvas.width = image.width * scale;
    canvas.height = image.height * scale;
    
    // 绘制图片
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    
    // 获取像素数据
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // 提取颜色特征
    const colorFeatures = await this.colorExtractor.extractHistogram(imageUri);
    
    // 计算几何特征
    const geometricFeatures = this._extractGeometricFeatures(image, canvas);
    
    // 计算纹理特征
    const textureFeatures = this._extractTextureFeatures(pixels, canvas.width, canvas.height);
    
    return {
      // 几何特征
      aspectRatio: geometricFeatures.aspectRatio,
      rectangularity: geometricFeatures.rectangularity,
      polygonDetails: geometricFeatures.polygonDetails, // 多边形检测详情
      
      // 颜色特征
      brightness: colorFeatures.brightness,
      contrast: colorFeatures.contrast,
      colorSaturation: this._calculateColorSaturation(colorFeatures.color_histogram),
      colorCount: this._calculateColorCount(pixels, canvas.width, canvas.height),
      
      // 纹理特征
      edgeDensity: textureFeatures.edgeDensity,
      textDensity: textureFeatures.textDensity,
      
      // 原始数据
      pixels,
      width: canvas.width,
      height: canvas.height
    };
  }

  /**
   * 提取几何特征
   * @param {HTMLImageElement} image - 图片对象
   * @param {HTMLCanvasElement} canvas - Canvas对象
   * @returns {Object} 几何特征
   * @private
   */
  _extractGeometricFeatures(image, canvas) {
    // 计算长宽比
    const aspectRatio = image.width / image.height;
    
    // 计算矩形度（密闭多边形检测）
    const rectangularity = this._calculateRectangularity(canvas);
    
    return {
      aspectRatio,
      rectangularity
    };
  }

  /**
   * 计算密闭多边形度（基于边缘检测+轮廓检测的简化版本）
   * @param {HTMLCanvasElement} canvas - Canvas对象
   * @returns {number} 密闭多边形度 (0-1)
   * @private
   */
  _calculateRectangularity(canvas) {
    try {
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      // 1. 转换为灰度图
      const grayPixels = this._convertToGrayscale(pixels);
      
      // 2. 直方图均衡化
      const equalizedPixels = this._equalizeHistogram(grayPixels, canvas.width, canvas.height);
      
      // 3. 高斯模糊
      const blurredPixels = this._gaussianBlur(equalizedPixels, canvas.width, canvas.height, 5);
      
      // 4. Canny边缘检测
      const edges = this._cannyEdgeDetection(blurredPixels, canvas.width, canvas.height, 50, 150);
      
      // 5. 形态学操作 - 连接断裂的边缘
      const morphedEdges = this._morphologyClose(edges, canvas.width, canvas.height, 3);
      
      // 6. 查找轮廓
      const contours = this._findContours(morphedEdges, canvas.width, canvas.height);
      
      // 7. 分析轮廓，寻找最像文档的轮廓
      const bestContour = this._findBestDocumentContour(contours, canvas.width, canvas.height);
      
      if (bestContour) {
        console.log(`📄 检测到文档轮廓: 面积=${bestContour.area.toFixed(0)}, 尺寸=${bestContour.width}x${bestContour.height}, 长宽比=${bestContour.aspectRatio.toFixed(2)}`);
        return bestContour.score;
      } else {
        console.log(`📄 未检测到文档轮廓`);
        return 0;
      }
    } catch (error) {
      console.error('❌ 矩形度检测失败:', error);
      return 0;
    }
  }

  /**
   * 转换为灰度图
   * @param {Uint8ClampedArray} pixels - RGBA像素数据
   * @returns {Uint8ClampedArray} 灰度像素数据
   * @private
   */
  _convertToGrayscale(pixels) {
    const grayPixels = new Uint8ClampedArray(pixels.length / 4);
    for (let i = 0; i < grayPixels.length; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      grayPixels[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return grayPixels;
  }

  /**
   * 直方图均衡化
   * @param {Uint8ClampedArray} pixels - 灰度像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Uint8ClampedArray} 均衡化后的像素数据
   * @private
   */
  _equalizeHistogram(pixels, width, height) {
    // 计算直方图
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < pixels.length; i++) {
      histogram[pixels[i]]++;
    }
    
    // 计算累积分布函数
    const cdf = new Array(256);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + histogram[i];
    }
    
    // 归一化
    const totalPixels = pixels.length;
    const normalizedCdf = cdf.map(value => Math.round((value / totalPixels) * 255));
    
    // 应用变换
    const equalizedPixels = new Uint8ClampedArray(pixels.length);
    for (let i = 0; i < pixels.length; i++) {
      equalizedPixels[i] = normalizedCdf[pixels[i]];
    }
    
    return equalizedPixels;
  }

  /**
   * 高斯模糊
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} kernelSize - 核大小
   * @returns {Uint8ClampedArray} 模糊后的像素数据
   * @private
   */
  _gaussianBlur(pixels, width, height, kernelSize) {
    const sigma = kernelSize / 3;
    const kernel = this._createGaussianKernel(kernelSize, sigma);
    const halfKernel = Math.floor(kernelSize / 2);
    const blurredPixels = new Uint8ClampedArray(pixels.length);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const px = Math.max(0, Math.min(width - 1, x + kx));
            const py = Math.max(0, Math.min(height - 1, y + ky));
            const weight = kernel[ky + halfKernel][kx + halfKernel];
            sum += pixels[py * width + px] * weight;
            weightSum += weight;
          }
        }
        
        blurredPixels[y * width + x] = Math.round(sum / weightSum);
      }
    }
    
    return blurredPixels;
  }

  /**
   * 创建高斯核
   * @param {number} size - 核大小
   * @param {number} sigma - 标准差
   * @returns {Array} 高斯核
   * @private
   */
  _createGaussianKernel(size, sigma) {
    const kernel = Array(size).fill().map(() => Array(size).fill(0));
    const halfSize = Math.floor(size / 2);
    let sum = 0;
    
    for (let y = -halfSize; y <= halfSize; y++) {
      for (let x = -halfSize; x <= halfSize; x++) {
        const value = Math.exp(-(x * x + y * y) / (2 * sigma * sigma));
        kernel[y + halfSize][x + halfSize] = value;
        sum += value;
      }
    }
    
    // 归一化
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        kernel[y][x] /= sum;
      }
    }
    
    return kernel;
  }

  /**
   * Canny边缘检测
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} lowThreshold - 低阈值
   * @param {number} highThreshold - 高阈值
   * @returns {Uint8ClampedArray} 边缘像素数据
   * @private
   */
  _cannyEdgeDetection(pixels, width, height, lowThreshold, highThreshold) {
    // 计算梯度
    const gradients = this._calculateGradients(pixels, width, height);
    
    // 非极大值抑制
    const suppressed = this._nonMaximumSuppression(gradients, width, height);
    
    // 双阈值检测
    const edges = this._doubleThreshold(suppressed, width, height, lowThreshold, highThreshold);
    
    return edges;
  }

  /**
   * 计算梯度
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Object} 梯度信息
   * @private
   */
  _calculateGradients(pixels, width, height) {
    const gx = new Uint8ClampedArray(pixels.length);
    const gy = new Uint8ClampedArray(pixels.length);
    const magnitude = new Uint8ClampedArray(pixels.length);
    const direction = new Uint8ClampedArray(pixels.length);
    
    // Sobel算子
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sumX = 0, sumY = 0;
        
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const px = x + kx;
            const py = y + ky;
            const pixel = pixels[py * width + px];
            sumX += pixel * sobelX[ky + 1][kx + 1];
            sumY += pixel * sobelY[ky + 1][kx + 1];
          }
        }
        
        const index = y * width + x;
        gx[index] = Math.abs(sumX);
        gy[index] = Math.abs(sumY);
        magnitude[index] = Math.sqrt(sumX * sumX + sumY * sumY);
        direction[index] = Math.atan2(sumY, sumX);
      }
    }
    
    return { gx, gy, magnitude, direction };
  }

  /**
   * 非极大值抑制
   * @param {Object} gradients - 梯度信息
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Uint8ClampedArray} 抑制后的像素数据
   * @private
   */
  _nonMaximumSuppression(gradients, width, height) {
    const { magnitude, direction } = gradients;
    const suppressed = new Uint8ClampedArray(magnitude.length);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        const mag = magnitude[index];
        const dir = direction[index];
        
        // 将角度标准化到0-180度
        let angle = (dir * 180 / Math.PI) % 180;
        if (angle < 0) angle += 180;
        
        // 确定梯度方向
        let neighbor1, neighbor2;
        if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle < 180)) {
          neighbor1 = magnitude[index - 1];
          neighbor2 = magnitude[index + 1];
        } else if (angle >= 22.5 && angle < 67.5) {
          neighbor1 = magnitude[(y - 1) * width + (x + 1)];
          neighbor2 = magnitude[(y + 1) * width + (x - 1)];
        } else if (angle >= 67.5 && angle < 112.5) {
          neighbor1 = magnitude[(y - 1) * width + x];
          neighbor2 = magnitude[(y + 1) * width + x];
        } else {
          neighbor1 = magnitude[(y - 1) * width + (x - 1)];
          neighbor2 = magnitude[(y + 1) * width + (x + 1)];
        }
        
        // 如果不是局部最大值，则抑制
        if (mag >= neighbor1 && mag >= neighbor2) {
          suppressed[index] = mag;
        }
      }
    }
    
    return suppressed;
  }

  /**
   * 双阈值检测
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} lowThreshold - 低阈值
   * @param {number} highThreshold - 高阈值
   * @returns {Uint8ClampedArray} 边缘像素数据
   * @private
   */
  _doubleThreshold(pixels, width, height, lowThreshold, highThreshold) {
    const edges = new Uint8ClampedArray(pixels.length);
    
    // 强边缘
    for (let i = 0; i < pixels.length; i++) {
      if (pixels[i] >= highThreshold) {
        edges[i] = 255;
      }
    }
    
    // 弱边缘（需要连接到强边缘）
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const index = y * width + x;
        if (pixels[index] >= lowThreshold && pixels[index] < highThreshold) {
          // 检查8邻域是否有强边缘
          let hasStrongNeighbor = false;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const neighborIndex = (y + ky) * width + (x + kx);
              if (edges[neighborIndex] === 255) {
                hasStrongNeighbor = true;
                break;
              }
            }
            if (hasStrongNeighbor) break;
          }
          
          if (hasStrongNeighbor) {
            edges[index] = 255;
          }
        }
      }
    }
    
    return edges;
  }

  /**
   * 形态学闭运算
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} kernelSize - 核大小
   * @returns {Uint8ClampedArray} 处理后的像素数据
   * @private
   */
  _morphologyClose(pixels, width, height, kernelSize) {
    // 先膨胀后腐蚀
    const dilated = this._dilate(pixels, width, height, kernelSize);
    const closed = this._erode(dilated, width, height, kernelSize);
    return closed;
  }

  /**
   * 膨胀操作
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} kernelSize - 核大小
   * @returns {Uint8ClampedArray} 膨胀后的像素数据
   * @private
   */
  _dilate(pixels, width, height, kernelSize) {
    const dilated = new Uint8ClampedArray(pixels.length);
    const halfKernel = Math.floor(kernelSize / 2);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let maxValue = 0;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const px = Math.max(0, Math.min(width - 1, x + kx));
            const py = Math.max(0, Math.min(height - 1, y + ky));
            maxValue = Math.max(maxValue, pixels[py * width + px]);
          }
        }
        
        dilated[y * width + x] = maxValue;
      }
    }
    
    return dilated;
  }

  /**
   * 腐蚀操作
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} kernelSize - 核大小
   * @returns {Uint8ClampedArray} 腐蚀后的像素数据
   * @private
   */
  _erode(pixels, width, height, kernelSize) {
    const eroded = new Uint8ClampedArray(pixels.length);
    const halfKernel = Math.floor(kernelSize / 2);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let minValue = 255;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const px = Math.max(0, Math.min(width - 1, x + kx));
            const py = Math.max(0, Math.min(height - 1, y + ky));
            minValue = Math.min(minValue, pixels[py * width + px]);
          }
        }
        
        eroded[y * width + x] = minValue;
      }
    }
    
    return eroded;
  }

  /**
   * 查找轮廓
   * @param {Uint8ClampedArray} pixels - 边缘像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Array} 轮廓数组
   * @private
   */
  _findContours(pixels, width, height) {
    const contours = [];
    const visited = new Array(width * height).fill(false);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (pixels[index] === 255 && !visited[index]) {
          const contour = this._traceContour(pixels, width, height, x, y, visited);
          if (contour.length > 10) { // 过滤太短的轮廓
            contours.push(contour);
          }
        }
      }
    }
    
    console.log(`🔍 轮廓检测: 找到${contours.length}个轮廓`);
    return contours;
  }

  /**
   * 跟踪轮廓
   * @param {Uint8ClampedArray} pixels - 边缘像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @param {number} startX - 起始X坐标
   * @param {number} startY - 起始Y坐标
   * @param {Array} visited - 访问标记数组
   * @returns {Array} 轮廓点数组
   * @private
   */
  _traceContour(pixels, width, height, startX, startY, visited) {
    const contour = [];
    const stack = [{x: startX, y: startY}];
    
    while (stack.length > 0) {
      const {x, y} = stack.pop();
      const index = y * width + x;
      
      if (x < 0 || x >= width || y < 0 || y >= height || visited[index] || pixels[index] !== 255) {
        continue;
      }
      
      visited[index] = true;
      contour.push({x, y});
      
      // 8邻域搜索
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          stack.push({x: x + dx, y: y + dy});
        }
      }
    }
    
    return contour;
  }

  /**
   * 寻找最像文档的轮廓
   * @param {Array} contours - 轮廓数组
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Object|null} 最佳轮廓信息
   * @private
   */
  _findBestDocumentContour(contours, width, height) {
    let bestContour = null;
    let maxScore = 0;
    const totalImageArea = width * height;
    
    for (let i = 0; i < contours.length; i++) {
      const contour = contours[i];
      const area = this._calculateContourArea(contour);
      
      // 过滤太小的轮廓
      if (area < 50000) continue;
      
      // 计算边界框
      const rect = this._calculateBoundingRect(contour);
      const aspectRatio = rect.width / rect.height;
      
      // 计算规整性（面积比）
      const rectArea = rect.width * rect.height;
      const regularity = area / rectArea;
      
      // 计算圆形度
      const perimeter = this._calculateContourPerimeter(contour);
      const circularity = (4 * Math.PI * area) / (perimeter * perimeter);
      
      // 更严格的过滤条件
      // 1. 面积不能太大（排除接近整个图像的轮廓）
      if (area > totalImageArea * 0.3) continue;
      
      // 2. 长宽比要在合理范围内（身份证长宽比通常在0.6-1.8之间）
      if (aspectRatio < 0.6 || aspectRatio > 1.8) continue;
      
      // 3. 规整性要好（轮廓要相对规整）
      if (regularity < 0.2) continue;
      
      // 4. 尺寸要合理（不能太大或太小）
      if (rect.width > width * 0.8 || rect.height > height * 0.8) continue;
      
      // 综合评分
      const score = area * regularity * circularity;
      
      if (score > maxScore) {
        maxScore = score;
        bestContour = {
          area: area,
          width: rect.width,
          height: rect.height,
          aspectRatio: aspectRatio,
          circularity: circularity,
          score: score / 1000000 // 归一化到0-1范围
        };
      }
    }
    
    return bestContour;
  }

  /**
   * 计算轮廓面积
   * @param {Array} contour - 轮廓点数组
   * @returns {number} 面积
   * @private
   */
  _calculateContourArea(contour) {
    let area = 0;
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      area += contour[i].x * contour[j].y;
      area -= contour[j].x * contour[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * 计算轮廓边界框
   * @param {Array} contour - 轮廓点数组
   * @returns {Object} 边界框信息
   * @private
   */
  _calculateBoundingRect(contour) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const point of contour) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * 计算轮廓周长
   * @param {Array} contour - 轮廓点数组
   * @returns {number} 周长
   * @private
   */
  _calculateContourPerimeter(contour) {
    let perimeter = 0;
    for (let i = 0; i < contour.length; i++) {
      const j = (i + 1) % contour.length;
      const dx = contour[j].x - contour[i].x;
      const dy = contour[j].y - contour[i].y;
      perimeter += Math.sqrt(dx * dx + dy * dy);
    }
    return perimeter;
  }

  /**
   * 计算边缘规整性
   * @param {Array} edges - 边缘点数组
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {number} 规整性分数 (0-1)
   * @private
   */
  _calculateEdgeRegularity(edges, width, height) {
    if (edges.length < 10) return 0;
    
    // 分析边缘的方向分布
    const directions = edges.map(edge => Math.atan2(edge.gy, edge.gx));
    const directionHistogram = Array(8).fill(0); // 8个方向
    
    for (const direction of directions) {
      const normalized = (direction + Math.PI) / (2 * Math.PI); // 0-1
      const bin = Math.floor(normalized * 8) % 8;
      directionHistogram[bin]++;
    }
    
    // 计算方向分布的均匀性（文档边缘方向应该比较集中）
    const maxCount = Math.max(...directionHistogram);
    const totalCount = edges.length;
    const concentration = maxCount / totalCount;
    
    return Math.min(concentration * 2, 1);
  }

  /**
   * 寻找直线交点
   * @param {Array} lines - 直线数组
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Array} 交点数组
   * @private
   */
  _findLineIntersections(lines, width, height) {
    const intersections = [];
    
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const line1 = lines[i];
        const line2 = lines[j];
        
        // 计算两条直线的交点
        const intersection = this._calculateLineIntersection(line1, line2);
        
        if (intersection && 
            intersection.x >= 0 && intersection.x < width &&
            intersection.y >= 0 && intersection.y < height) {
          intersections.push(intersection);
        }
      }
    }
    
    return intersections;
  }

  /**
   * 计算两条直线的交点
   * @param {Object} line1 - 直线1
   * @param {Object} line2 - 直线2
   * @returns {Object|null} 交点坐标
   * @private
   */
  _calculateLineIntersection(line1, line2) {
    const cos1 = Math.cos(line1.angle);
    const sin1 = Math.sin(line1.angle);
    const cos2 = Math.cos(line2.angle);
    const sin2 = Math.sin(line2.angle);
    
    const denominator = cos1 * sin2 - sin1 * cos2;
    if (Math.abs(denominator) < 1e-10) return null; // 平行线
    
    const x = (line1.distance * sin2 - line2.distance * sin1) / denominator;
    const y = (line2.distance * cos1 - line1.distance * cos2) / denominator;
    
    return { x, y };
  }

  /**
   * 计算多边形面积
   * @param {Array} points - 顶点数组
   * @returns {number} 面积
   * @private
   */
  _calculatePolygonArea(points) {
    if (points.length < 3) return 0;
    
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  /**
   * 计算角度规整性
   * @param {Array} points - 顶点数组
   * @returns {number} 角度规整性分数 (0-1)
   * @private
   */
  _calculateAngleRegularity(points) {
    if (points.length < 3) return 0;
    
    const angles = [];
    for (let i = 0; i < points.length; i++) {
      const prev = points[(i - 1 + points.length) % points.length];
      const curr = points[i];
      const next = points[(i + 1) % points.length];
      
      const angle = this._calculateAngle(prev, curr, next);
      angles.push(angle);
    }
    
    // 计算角度与90度的偏差
    const deviations = angles.map(angle => Math.abs(angle - Math.PI / 2));
    const avgDeviation = deviations.reduce((sum, dev) => sum + dev, 0) / deviations.length;
    
    // 偏差越小，规整性越高
    return Math.max(0, 1 - avgDeviation / (Math.PI / 2));
  }

  /**
   * 计算三点形成的角度
   * @param {Object} p1 - 点1
   * @param {Object} p2 - 点2（顶点）
   * @param {Object} p3 - 点3
   * @returns {number} 角度（弧度）
   * @private
   */
  _calculateAngle(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
    
    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
    
    if (mag1 === 0 || mag2 === 0) return 0;
    
    const cosAngle = dot / (mag1 * mag2);
    return Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  }

  /**
   * 获取多边形检测详情
   * @param {HTMLCanvasElement} canvas - Canvas对象
   * @returns {Object} 多边形检测详情
   * @private
   */
  _getPolygonDetails(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    
    // 边缘检测
    const edges = this._detectEdges(pixels, canvas.width, canvas.height);
    
    // 寻找直线边缘
    const lines = this._findStraightEdges(edges, canvas.width, canvas.height);
    
    if (lines.length < 3) {
      return {
        edgeCount: 0,
        areaRatio: 0,
        angleRegularity: 0,
        edgeScore: 0
      };
    }
    
    // 寻找相交的直线形成多边形
    const intersections = this._findLineIntersections(lines, canvas.width, canvas.height);
    
    if (intersections.length < 3) {
      return {
        edgeCount: 0,
        areaRatio: 0,
        angleRegularity: 0,
        edgeScore: 0
      };
    }
    
    const edgeCount = intersections.length;
    const polygonArea = this._calculatePolygonArea(intersections);
    const imageArea = canvas.width * canvas.height;
    const areaRatio = polygonArea / imageArea;
    const angleRegularity = this._calculateAngleRegularity(intersections);
    const edgeScore = edgeCount <= 4 ? 1.0 : Math.max(0.5, 1.0 - (edgeCount - 4) * 0.1);
    
    return {
      edgeCount,
      areaRatio,
      angleRegularity,
      edgeScore
    };
  }

  /**
   * 计算X方向梯度
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} width - 图片宽度
   * @returns {number} X方向梯度
   * @private
   */
  _calculateGradientX(pixels, x, y, width) {
    const idx = (y * width + x) * 4;
    const idxLeft = (y * width + (x - 1)) * 4;
    const idxRight = (y * width + (x + 1)) * 4;
    
    const grayLeft = (pixels[idxLeft] + pixels[idxLeft + 1] + pixels[idxLeft + 2]) / 3;
    const grayRight = (pixels[idxRight] + pixels[idxRight + 1] + pixels[idxRight + 2]) / 3;
    
    return grayRight - grayLeft;
  }

  /**
   * 计算Y方向梯度
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} width - 图片宽度
   * @returns {number} Y方向梯度
   * @private
   */
  _calculateGradientY(pixels, x, y, width) {
    const idx = (y * width + x) * 4;
    const idxTop = ((y - 1) * width + x) * 4;
    const idxBottom = ((y + 1) * width + x) * 4;
    
    const grayTop = (pixels[idxTop] + pixels[idxTop + 1] + pixels[idxTop + 2]) / 3;
    const grayBottom = (pixels[idxBottom] + pixels[idxBottom + 1] + pixels[idxBottom + 2]) / 3;
    
    return grayBottom - grayTop;
  }

  /**
   * 提取纹理特征
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {Object} 纹理特征
   * @private
   */
  _extractTextureFeatures(pixels, width, height) {
    // 计算边缘密度
    const edgeDensity = this._calculateEdgeDensity(pixels, width, height);
    
    // 简化的文本密度计算（基于高频成分）
    const textDensity = this._calculateTextDensity(pixels, width, height);
    
    return {
      edgeDensity,
      textDensity
    };
  }

  /**
   * 计算边缘密度
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {number} 边缘密度 (0-1)
   * @private
   */
  _calculateEdgeDensity(pixels, width, height) {
    let edgePixels = 0;
    let totalPixels = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const gx = this._calculateGradientX(pixels, x, y, width);
        const gy = this._calculateGradientY(pixels, x, y, width);
        const gradient = Math.sqrt(gx * gx + gy * gy);
        
        if (gradient > 50) { // 边缘阈值（提高阈值，减少误检）
          edgePixels++;
        }
        totalPixels++;
      }
    }
    
    return edgePixels / totalPixels;
  }

  /**
   * 计算文本密度（简化版）
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {number} 文本密度 (0-1)
   * @private
   */
  _calculateTextDensity(pixels, width, height) {
    // 简化的文本密度计算：基于高频成分和局部方差
    let highFreqPixels = 0;
    let totalPixels = 0;
    
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const localVariance = this._calculateLocalVariance(pixels, x, y, width);
        
        if (localVariance > 500) { // 高频阈值（提高阈值，减少误检）
          highFreqPixels++;
        }
        totalPixels++;
      }
    }
    
    return highFreqPixels / totalPixels;
  }

  /**
   * 计算局部方差
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   * @param {number} width - 图片宽度
   * @returns {number} 局部方差
   * @private
   */
  _calculateLocalVariance(pixels, x, y, width) {
    const values = [];
    
    // 3x3邻域
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const idx = ((y + dy) * width + (x + dx)) * 4;
        const gray = (pixels[idx] + pixels[idx + 1] + pixels[idx + 2]) / 3;
        values.push(gray);
      }
    }
    
    // 计算方差
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    
    return variance;
  }

  /**
   * 计算颜色饱和度
   * @param {Object} histogram - 颜色直方图
   * @returns {number} 颜色饱和度 (0-1)
   * @private
   */
  _calculateColorSaturation(histogram) {
    const sChannel = histogram.hsv.s;
    let weightedSum = 0;
    let totalWeight = 0;
    
    for (let i = 0; i < sChannel.length; i++) {
      const weight = sChannel[i];
      const value = i / (sChannel.length - 1); // 归一化到0-1
      weightedSum += weight * value;
      totalWeight += weight;
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * 计算颜色数量
   * @param {Uint8ClampedArray} pixels - 像素数据
   * @param {number} width - 图片宽度
   * @param {number} height - 图片高度
   * @returns {number} 颜色数量
   * @private
   */
  _calculateColorCount(pixels, width, height) {
    // 增加采样率，提高检测精度
    const sampleRate = Math.max(1, Math.floor((width * height) / 5000)); // 采样更多像素
    const colorSet = new Set();
    
    for (let i = 0; i < pixels.length; i += 4 * sampleRate) {
      // 更精细的颜色量化
      const r = Math.floor(pixels[i] / 32) * 32;     // 量化到8级
      const g = Math.floor(pixels[i + 1] / 32) * 32; // 量化到8级
      const b = Math.floor(pixels[i + 2] / 32) * 32; // 量化到8级
      const colorKey = `${r},${g},${b}`;
      colorSet.add(colorKey);
    }
    
    console.log(`🎨 颜色数量检测: 采样${Math.floor(pixels.length / 4 / sampleRate)}个像素, 检测到${colorSet.size}种颜色`);
    return colorSet.size;
  }

  /**
   * 计算特征分数
   * @param {Object} features - 图像特征
   * @returns {Object} 特征分数
   * @private
   */
  _calculateFeatureScores(features) {
    // 几何特征分数
    const geometricScore = this._calculateGeometricScore(features);
    
    // 颜色特征分数
    const colorScore = this._calculateColorScore(features);
    
    // 纹理特征分数
    const textureScore = this._calculateTextureScore(features);
    
    return {
      geometric: geometricScore,
      color: colorScore,
      texture: textureScore
    };
  }

  /**
   * 计算几何特征分数
   * @param {Object} features - 图像特征
   * @returns {number} 几何特征分数 (0-1)
   * @private
   */
  _calculateGeometricScore(features) {
    let score = 0;
    
    // 只检测矩形度（密闭多边形检测）
    if (features.rectangularity >= this.thresholds.rectangularity) {
      score += 1.0; // 提高权重，因为去掉了长宽比
    }
    
    return score;
  }

  /**
   * 计算颜色特征分数
   * @param {Object} features - 图像特征
   * @returns {number} 颜色特征分数 (0-1)
   * @private
   */
  _calculateColorScore(features) {
    let score = 0;
    
    // 亮度分数
    if (features.brightness >= this.thresholds.brightness.min && 
        features.brightness <= this.thresholds.brightness.max) {
      score += 0.3;
    }
    
    // 对比度分数
    if (features.contrast >= this.thresholds.contrast.min) {
      score += 0.3;
    }
    
    // 颜色饱和度分数（文档通常饱和度较低）
    if (features.colorSaturation <= this.thresholds.colorSaturation) {
      score += 0.2;
    }
    
    // 颜色数量分数（文档颜色数量较少）
    if (features.colorCount <= this.thresholds.colorCount) {
      score += 0.2;
    }
    
    return score;
  }

  /**
   * 计算纹理特征分数
   * @param {Object} features - 图像特征
   * @returns {number} 纹理特征分数 (0-1)
   * @private
   */
  _calculateTextureScore(features) {
    let score = 0;
    
    // 边缘密度分数
    if (features.edgeDensity >= this.thresholds.edgeDensity) {
      score += 0.5;
    }
    
    // 文本密度分数
    if (features.textDensity >= this.thresholds.textDensity) {
      score += 0.5;
    }
    
    return score;
  }

  /**
   * 计算综合文档评分
   * @param {Object} scores - 特征分数
   * @returns {number} 综合文档评分 (0-1)
   * @private
   */
  _calculateDocumentScore(scores) {
    // 加权平均
    const weights = {
      geometric: 0.3,
      color: 0.4,
      texture: 0.3
    };
    
    return (
      scores.geometric * weights.geometric +
      scores.color * weights.color +
      scores.texture * weights.texture
    );
  }

  /**
   * 计算置信度
   * @param {Object} scores - 特征分数
   * @param {number} documentScore - 文档评分
   * @returns {number} 置信度 (0-1)
   * @private
   */
  _calculateConfidence(scores, documentScore) {
    // 基于各特征分数的一致性计算置信度
    const scoresArray = Object.values(scores);
    const mean = scoresArray.reduce((sum, score) => sum + score, 0) / scoresArray.length;
    const variance = scoresArray.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scoresArray.length;
    const consistency = 1 - Math.sqrt(variance); // 一致性越高，置信度越高
    
    return Math.max(0, Math.min(1, consistency * documentScore));
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
        image.crossOrigin = 'anonymous';
        
        image.onload = () => resolve(image);
        image.onerror = (error) => {
          console.error('❌ 图片加载失败:', error);
          reject(new Error(`图片加载失败: ${imageUri}`));
        };
        
        image.src = imageUri;
      });
    } else {
      // Node.js环境，使用canvas库
      try {
        // 使用createRequire来在ES模块中使用require
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        const canvas = require('D:/ImageClassifierApp/pc-version-final/node_modules/canvas');
        // 将file://协议转换为普通路径
        const filePath = imageUri.replace('file:///', '');
        return await canvas.loadImage(filePath);
      } catch (error) {
        console.warn('⚠️ Node.js环境下的图片加载在浏览器构建中被跳过');
        throw new Error('Node.js环境在浏览器构建中不支持');
      }
    }
  }
  /**
   * 计算颜色饱和度
   * @param {Object} hsvHistogram - HSV直方图数据
   * @returns {number} 平均饱和度
   * @private
   */
  _calculateColorSaturation(hsvHistogram) {
    const { s } = hsvHistogram;
    
    console.log(`📊 饱和度计算: 使用归一化数据，bin数量=${s.length}`);
    
    // 找到最高饱和度和相关统计
    let maxSaturation = 0;
    let maxSaturationWeight = 0;
    let maxSaturationBins = 0;
    let highSaturationBins = 0; // 高饱和度bin数量 (>=80%)
    
    for (let i = 0; i < s.length; i++) {
      const normalizedCount = s[i];
      
      // 过滤掉过小的归一化值（可能是噪声）
      if (normalizedCount < 0.001) {
        continue;
      }
      
      const saturationValue = (i / (s.length - 1)) * 100; // 转换为0-100的饱和度值
      
      if (saturationValue > maxSaturation) {
        maxSaturation = saturationValue;
        maxSaturationWeight = normalizedCount;
        maxSaturationBins = 1; // 重置计数
      } else if (saturationValue === maxSaturation) {
        maxSaturationBins++; // 相同最高饱和度的bin数量
      }
      
      // 统计高饱和度bin数量
      if (saturationValue >= 80) {
        highSaturationBins++;
      }
    }
    
    console.log(`📊 最高饱和度: ${maxSaturation.toFixed(1)}% (权重: ${maxSaturationWeight.toFixed(4)})`);
    console.log(`📊 最高饱和度bin数: ${maxSaturationBins}`);
    console.log(`📊 高饱和度bin数(>=80%): ${highSaturationBins}`);
    
    // 使用最高饱和度作为主要指标
    // 证件照的最高饱和度应该较低
    const saturationScore = maxSaturation;
    
    console.log(`📊 饱和度分数: ${saturationScore.toFixed(2)} (基于最高饱和度)`);
    
    return saturationScore;
  }

  /**
   * 检测文档边缘（类似手机文档检测）
   * @param {string} imageUri - 图片URI
   * @returns {Object} 文档边缘检测结果
   * @private
   */
  async _detectDocumentEdges(imageUri) {
    try {
      // 加载图片
      const image = await this._loadImage(imageUri);
      
      // 创建canvas
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
          console.warn('⚠️ Node.js环境下的canvas处理在浏览器构建中被跳过');
          throw new Error('Node.js环境在浏览器构建中不支持');
        }
      }
      
      // 缩放图像，长边缩放到512像素，保持长宽比
      const maxSize = 512;
      const scale = Math.min(maxSize / image.width, maxSize / image.height);
      const newWidth = Math.floor(image.width * scale);
      const newHeight = Math.floor(image.height * scale);
      
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // 绘制缩放后的图像
      ctx.drawImage(image, 0, 0, newWidth, newHeight);
      
      // 获取像素数据
      const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
      const pixels = imageData.data;
      
      // 转换为灰度图像
      const grayPixels = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        grayPixels.push(gray);
      }
      
      // 高斯模糊预处理
      const blurredPixels = this._gaussianBlur(grayPixels, newWidth, newHeight, 1.0);
      
      // Canny边缘检测
      const edges = this._cannyEdgeDetection(blurredPixels, newWidth, newHeight);
      
      // 检测直角（文档边缘特征）
      const rightAngles = this._detectRightAngles(edges, newWidth, newHeight);
      
      // 寻找四边形
      const quadrilaterals = this._findQuadrilateralsFromAngles(rightAngles, newWidth, newHeight);
      
      // 评估最佳四边形
      const bestQuad = this._evaluateBestQuadrilateral(quadrilaterals, newWidth, newHeight);
      
      console.log(`📊 文档边缘检测:`);
      console.log(`- 检测到直角数: ${rightAngles.length}`);
      console.log(`- 检测到四边形数: ${quadrilaterals.length}`);
      console.log(`- 最佳四边形: ${bestQuad ? '找到' : '未找到'}`);
      console.log(`- 边缘像素数: ${edges.filter(p => p > 0).length}`);
      console.log(`- 图像尺寸: ${newWidth}x${newHeight}`);
      
      return {
        hasDocumentEdges: bestQuad !== null,
        rightAngleCount: rightAngles.length,
        quadrilateralCount: quadrilaterals.length,
        bestQuadrilateral: bestQuad,
        confidence: bestQuad ? this._calculateEdgeConfidence(bestQuad, newWidth, newHeight) : 0
      };
      
    } catch (error) {
      console.error('❌ 文档边缘检测失败:', error);
      return {
        hasDocumentEdges: false,
        rightAngleCount: 0,
        quadrilateralCount: 0,
        bestQuadrilateral: null,
        confidence: 0
      };
    }
  }

  /**
   * 高斯模糊
   * @param {Array} pixels - 像素数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @param {number} sigma - 高斯核标准差
   * @returns {Array} 模糊后的像素数组
   * @private
   */
  _gaussianBlur(pixels, width, height, sigma) {
    const kernelSize = Math.ceil(sigma * 3) * 2 + 1;
    const kernel = this._createGaussianKernel(kernelSize, sigma);
    const halfKernel = Math.floor(kernelSize / 2);
    
    const result = new Array(pixels.length);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        for (let ky = -halfKernel; ky <= halfKernel; ky++) {
          for (let kx = -halfKernel; kx <= halfKernel; kx++) {
            const px = Math.max(0, Math.min(width - 1, x + kx));
            const py = Math.max(0, Math.min(height - 1, y + ky));
            const pixelValue = pixels[py * width + px];
            const weight = kernel[ky + halfKernel][kx + halfKernel];
            
            sum += pixelValue * weight;
            weightSum += weight;
          }
        }
        
        result[y * width + x] = Math.round(sum / weightSum);
      }
    }
    
    return result;
  }

  /**
   * 创建高斯核
   * @param {number} size - 核大小
   * @param {number} sigma - 标准差
   * @returns {Array} 高斯核
   * @private
   */
  _createGaussianKernel(size, sigma) {
    const kernel = [];
    const halfSize = Math.floor(size / 2);
    const sigma2 = 2 * sigma * sigma;
    
    for (let y = -halfSize; y <= halfSize; y++) {
      const row = [];
      for (let x = -halfSize; x <= halfSize; x++) {
        const distance = x * x + y * y;
        const value = Math.exp(-distance / sigma2);
        row.push(value);
      }
      kernel.push(row);
    }
    
    return kernel;
  }

  /**
   * Canny边缘检测
   * @param {Array} pixels - 灰度像素数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Array} 边缘像素数组
   * @private
   */
  _cannyEdgeDetection(pixels, width, height) {
    // Sobel算子计算梯度
    const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    
    const gradientX = this._applyKernel(pixels, width, height, sobelX);
    const gradientY = this._applyKernel(pixels, width, height, sobelY);
    
    // 计算梯度幅值和方向
    const magnitude = [];
    const direction = [];
    
    for (let i = 0; i < pixels.length; i++) {
      const gx = gradientX[i];
      const gy = gradientY[i];
      const mag = Math.sqrt(gx * gx + gy * gy);
      const dir = Math.atan2(gy, gx);
      
      magnitude.push(mag);
      direction.push(dir);
    }
    
    // 非极大值抑制
    const suppressed = this._nonMaximumSuppression(magnitude, direction, width, height);
    
    // 双阈值处理 - 降低阈值以检测更多边缘
    const highThreshold = this._calculateThreshold(magnitude, 0.5);
    const lowThreshold = highThreshold * 0.3;
    
    const edges = suppressed.map((pixel, i) => {
      if (pixel > highThreshold) return 255;
      if (pixel > lowThreshold) return 128;
      return 0;
    });
    
    return edges;
  }

  /**
   * 应用卷积核
   * @param {Array} pixels - 像素数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @param {Array} kernel - 卷积核
   * @returns {Array} 卷积结果
   * @private
   */
  _applyKernel(pixels, width, height, kernel) {
    const result = new Array(pixels.length).fill(0);
    const halfKernel = Math.floor(kernel.length / 2);
    
    for (let y = halfKernel; y < height - halfKernel; y++) {
      for (let x = halfKernel; x < width - halfKernel; x++) {
        let sum = 0;
        
        for (let ky = 0; ky < kernel.length; ky++) {
          for (let kx = 0; kx < kernel[ky].length; kx++) {
            const px = x + kx - halfKernel;
            const py = y + ky - halfKernel;
            const pixelValue = pixels[py * width + px];
            sum += pixelValue * kernel[ky][kx];
          }
        }
        
        result[y * width + x] = sum;
      }
    }
    
    return result;
  }

  /**
   * 非极大值抑制
   * @param {Array} magnitude - 梯度幅值
   * @param {Array} direction - 梯度方向
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Array} 抑制后的幅值
   * @private
   */
  _nonMaximumSuppression(magnitude, direction, width, height) {
    const result = new Array(magnitude.length).fill(0);
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        const mag = magnitude[i];
        const dir = direction[i];
        
        // 确定梯度方向
        let dx, dy;
        if (dir >= -Math.PI/8 && dir < Math.PI/8) {
          dx = 1; dy = 0;
        } else if (dir >= Math.PI/8 && dir < 3*Math.PI/8) {
          dx = 1; dy = 1;
        } else if (dir >= 3*Math.PI/8 && dir < 5*Math.PI/8) {
          dx = 0; dy = 1;
        } else if (dir >= 5*Math.PI/8 && dir < 7*Math.PI/8) {
          dx = -1; dy = 1;
        } else {
          dx = -1; dy = 0;
        }
        
        // 检查是否为局部最大值
        const neighbor1 = magnitude[(y + dy) * width + (x + dx)];
        const neighbor2 = magnitude[(y - dy) * width + (x - dx)];
        
        if (mag >= neighbor1 && mag >= neighbor2) {
          result[i] = mag;
        }
      }
    }
    
    return result;
  }

  /**
   * 计算阈值
   * @param {Array} magnitude - 梯度幅值
   * @param {number} percentile - 百分位数
   * @returns {number} 阈值
   * @private
   */
  _calculateThreshold(magnitude, percentile) {
    const sorted = [...magnitude].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index];
  }

  /**
   * 检测直角（文档边缘特征）
   * @param {Array} edges - 边缘像素数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Array} 检测到的直角
   * @private
   */
  _detectRightAngles(edges, width, height) {
    const rightAngles = [];
    const searchRadius = 15; // 减小搜索半径
    const angleThreshold = Math.PI / 8; // 22.5度容差，更宽松
    
    // 大幅增加采样率，减少计算量
    const sampleRate = 8;
    const edgePoints = [];
    
    for (let y = 0; y < height; y += sampleRate) {
      for (let x = 0; x < width; x += sampleRate) {
        if (edges[y * width + x] > 0) {
          edgePoints.push({ x, y });
        }
      }
    }
    
    console.log(`📊 直角检测: 边缘点数=${edgePoints.length}`);
    
    // 限制处理的边缘点数量
    const maxPoints = 100;
    const limitedPoints = edgePoints.slice(0, maxPoints);
    
    // 对每个边缘点，在其周围寻找直角
    for (const point of limitedPoints) {
      const angles = this._findAnglesAroundPoint(edges, point, width, height, searchRadius);
      
      for (const angle of angles) {
        // 检查是否接近直角（90度）
        const angleDiff = Math.abs(angle.value - Math.PI / 2);
        if (angleDiff < angleThreshold) {
          // 添加边长信息到直角对象
          rightAngles.push({
            x: point.x,
            y: point.y,
            angle: angle.value,
            confidence: 1 - angleDiff / angleThreshold,
            minLength: angle.minLength,
            length1: angle.length1,
            length2: angle.length2
          });
        }
      }
    }
    
    // 去重：合并相近的直角
    const uniqueAngles = this._mergeNearbyAngles(rightAngles, searchRadius);
    
    console.log(`📊 直角检测结果: 原始=${rightAngles.length}, 去重后=${uniqueAngles.length}`);
    
    return uniqueAngles;
  }

  /**
   * 寻找四边形（简化版本）
   * @param {Array} lines - 直线数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Array} 四边形数组
   * @private
   */
  _findQuadrilaterals(lines, width, height) {
    const quadrilaterals = [];
    
    // 限制直线数量，只使用前8条直线
    const limitedLines = lines.slice(0, 8);
    
    // 尝试所有可能的四条直线组合，但限制数量
    for (let i = 0; i < limitedLines.length; i++) {
      for (let j = i + 1; j < limitedLines.length; j++) {
        for (let k = j + 1; k < limitedLines.length; k++) {
          for (let l = k + 1; l < limitedLines.length; l++) {
            const quad = this._createQuadrilateral(
              [limitedLines[i], limitedLines[j], limitedLines[k], limitedLines[l]],
              width, height
            );
            
            if (quad) {
              quadrilaterals.push(quad);
              
              // 限制四边形数量，避免过多计算
              if (quadrilaterals.length >= 5) {
                return quadrilaterals;
              }
            }
          }
        }
      }
    }
    
    return quadrilaterals;
  }

  /**
   * 创建四边形
   * @param {Array} lines - 四条直线
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Object|null} 四边形对象
   * @private
   */
  _createQuadrilateral(lines, width, height) {
    const intersections = [];
    
    // 计算所有直线的交点
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const intersection = this._lineIntersection(lines[i], lines[j]);
        if (intersection && 
            intersection.x >= 0 && intersection.x < width &&
            intersection.y >= 0 && intersection.y < height) {
          intersections.push(intersection);
        }
      }
    }
    
    if (intersections.length < 4) return null;
    
    // 选择最接近图像边界的四个点
    const corners = this._selectBestCorners(intersections, width, height);
    
    if (corners.length < 4) return null;
    
    return {
      corners,
      area: this._calculateQuadrilateralArea(corners),
      aspectRatio: this._calculateAspectRatio(corners),
      lines: lines
    };
  }

  /**
   * 计算直线交点
   * @param {Object} line1 - 第一条直线
   * @param {Object} line2 - 第二条直线
   * @returns {Object|null} 交点坐标
   * @private
   */
  _lineIntersection(line1, line2) {
    const { rho: rho1, theta: theta1 } = line1;
    const { rho: rho2, theta: theta2 } = line2;
    
    const cos1 = Math.cos(theta1);
    const sin1 = Math.sin(theta1);
    const cos2 = Math.cos(theta2);
    const sin2 = Math.sin(theta2);
    
    const denominator = cos1 * sin2 - sin1 * cos2;
    
    if (Math.abs(denominator) < 1e-10) return null; // 平行线
    
    const x = (rho1 * sin2 - rho2 * sin1) / denominator;
    const y = (rho2 * cos1 - rho1 * cos2) / denominator;
    
    return { x, y };
  }

  /**
   * 选择最佳角点
   * @param {Array} intersections - 交点数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Array} 最佳角点
   * @private
   */
  _selectBestCorners(intersections, width, height) {
    // 按距离图像中心的距离排序
    const centerX = width / 2;
    const centerY = height / 2;
    
    const sorted = intersections.sort((a, b) => {
      const distA = Math.sqrt((a.x - centerX) ** 2 + (a.y - centerY) ** 2);
      const distB = Math.sqrt((b.x - centerX) ** 2 + (b.y - centerY) ** 2);
      return distA - distB;
    });
    
    return sorted.slice(0, 4);
  }

  /**
   * 计算四边形面积
   * @param {Array} corners - 角点数组
   * @returns {number} 面积
   * @private
   */
  _calculateQuadrilateralArea(corners) {
    if (corners.length < 4) return 0;
    
    let area = 0;
    for (let i = 0; i < corners.length; i++) {
      const j = (i + 1) % corners.length;
      area += corners[i].x * corners[j].y;
      area -= corners[j].x * corners[i].y;
    }
    
    return Math.abs(area) / 2;
  }

  /**
   * 计算长宽比
   * @param {Array} corners - 角点数组
   * @returns {number} 长宽比
   * @private
   */
  _calculateAspectRatio(corners) {
    if (corners.length < 4) return 0;
    
    const xs = corners.map(c => c.x);
    const ys = corners.map(c => c.y);
    
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    
    return width / height;
  }

  /**
   * 评估最佳四边形
   * @param {Array} quadrilaterals - 四边形数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Object|null} 最佳四边形
   * @private
   */
  _evaluateBestQuadrilateral(quadrilaterals, width, height) {
    if (quadrilaterals.length === 0) return null;
    
    const imageArea = width * height;
    const minAreaRatio = 0.1; // 最小面积比例
    const maxAreaRatio = 0.9; // 最大面积比例
    
    const validQuads = quadrilaterals.filter(quad => {
      const areaRatio = quad.area / imageArea;
      return areaRatio >= minAreaRatio && areaRatio <= maxAreaRatio;
    });
    
    if (validQuads.length === 0) return null;
    
    // 按面积排序，选择最大的
    validQuads.sort((a, b) => b.area - a.area);
    
    return validQuads[0];
  }

  /**
   * 计算边缘检测置信度
   * @param {Object} quadrilateral - 四边形对象
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {number} 置信度
   * @private
   */
  _calculateEdgeConfidence(quadrilateral, width, height) {
    const imageArea = width * height;
    const areaRatio = quadrilateral.area / imageArea;
    
    // 基于面积比例和长宽比的置信度
    let confidence = areaRatio;
    
    // 长宽比越接近1，置信度越高
    const aspectRatio = quadrilateral.aspectRatio;
    const aspectScore = 1 - Math.abs(1 - aspectRatio) * 0.5;
    confidence *= aspectScore;
    
    return Math.min(1, confidence);
  }

  /**
   * 检测前景背景分离模式（证件照特征）
   * @param {string} imageUri - 图片URI
   * @returns {Object} 前景背景分离特征
   * @private
   */
  async _detectForegroundBackgroundPattern(imageUri) {
    try {
      // 加载图片
      const image = await this._loadImage(imageUri);
      
      // 创建canvas
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
          console.warn('⚠️ Node.js环境下的canvas处理在浏览器构建中被跳过');
          throw new Error('Node.js环境在浏览器构建中不支持');
        }
      }
      
      // 缩放图像，长边缩放到256像素，保持长宽比
      const maxSize = 256;
      const scale = Math.min(maxSize / image.width, maxSize / image.height);
      const newWidth = Math.floor(image.width * scale);
      const newHeight = Math.floor(image.height * scale);
      
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // 绘制缩放后的图像
      ctx.drawImage(image, 0, 0, newWidth, newHeight);
      
      // 获取像素数据
      const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
      const pixels = imageData.data;
      
      // 将图像转换为灰度
      const grayPixels = [];
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        grayPixels.push(gray);
      }
      
      // 使用Otsu算法进行二值化
      const threshold = this._calculateOtsuThreshold(grayPixels);
      
      // 二值化图像
      const binaryPixels = grayPixels.map(gray => gray > threshold ? 255 : 0);
      
      // 计算前景和背景的面积
      const foregroundPixels = binaryPixels.filter(pixel => pixel === 0).length;
      const backgroundPixels = binaryPixels.filter(pixel => pixel === 255).length;
      const totalPixels = binaryPixels.length;
      
      const foregroundRatio = foregroundPixels / totalPixels;
      const backgroundRatio = backgroundPixels / totalPixels;
      
      // 计算前景区域的连通性（简单版本：计算前景区域的分散程度）
      const connectivity = this._calculateConnectivity(binaryPixels, newWidth, newHeight);
      
      console.log(`📊 前景背景分离分析:`);
      console.log(`- 前景占比: ${(foregroundRatio * 100).toFixed(1)}%`);
      console.log(`- 背景占比: ${(backgroundRatio * 100).toFixed(1)}%`);
      console.log(`- 连通性: ${connectivity.toFixed(2)}`);
      console.log(`- 二值化阈值: ${threshold}`);
      
      return {
        foregroundRatio,
        backgroundRatio,
        connectivity,
        threshold,
        isDocumentPattern: foregroundRatio > 0.5 && foregroundRatio < 0.65 && connectivity > 0.7
      };
      
    } catch (error) {
      console.error('❌ 前景背景分离检测失败:', error);
      return {
        foregroundRatio: 0,
        backgroundRatio: 1,
        connectivity: 0,
        threshold: 128,
        isDocumentPattern: false
      };
    }
  }

  /**
   * 计算Otsu阈值
   * @param {Array} grayPixels - 灰度像素数组
   * @returns {number} Otsu阈值
   * @private
   */
  _calculateOtsuThreshold(grayPixels) {
    // 计算直方图
    const histogram = new Array(256).fill(0);
    grayPixels.forEach(gray => histogram[gray]++);
    
    const totalPixels = grayPixels.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }
    
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;
    
    for (let t = 0; t < 256; t++) {
      wB += histogram[t];
      if (wB === 0) continue;
      
      wF = totalPixels - wB;
      if (wF === 0) break;
      
      sumB += t * histogram[t];
      
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      
      const varBetween = wB * wF * (mB - mF) * (mB - mF);
      
      if (varBetween > varMax) {
        varMax = varBetween;
        threshold = t;
      }
    }
    
    return threshold;
  }

  /**
   * 计算连通性（简单版本）
   * @param {Array} binaryPixels - 二值化像素数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {number} 连通性分数
   * @private
   */
  _calculateConnectivity(binaryPixels, width, height) {
    // 简单的连通性计算：统计前景像素的聚集程度
    let connectedRegions = 0;
    const visited = new Array(binaryPixels.length).fill(false);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (binaryPixels[index] === 0 && !visited[index]) {
          // 找到一个新的前景区域
          connectedRegions++;
          this._floodFill(binaryPixels, visited, x, y, width, height);
        }
      }
    }
    
    // 连通性分数：区域越少，连通性越高
    const maxPossibleRegions = Math.floor(width * height / 100); // 假设最小区域为100像素
    return Math.max(0, 1 - connectedRegions / maxPossibleRegions);
  }

  /**
   * 洪水填充算法
   * @param {Array} pixels - 像素数组
   * @param {Array} visited - 访问标记数组
   * @param {number} x - 起始x坐标
   * @param {number} y - 起始y坐标
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @private
   */
  _floodFill(pixels, visited, x, y, width, height) {
    const stack = [{x, y}];
    
    while (stack.length > 0) {
      const {x: currentX, y: currentY} = stack.pop();
      const index = currentY * width + currentX;
      
      if (currentX < 0 || currentX >= width || currentY < 0 || currentY >= height) continue;
      if (visited[index] || pixels[index] !== 0) continue;
      
      visited[index] = true;
      
      // 添加四个方向的邻居
      stack.push({x: currentX + 1, y: currentY});
      stack.push({x: currentX - 1, y: currentY});
      stack.push({x: currentX, y: currentY + 1});
      stack.push({x: currentX, y: currentY - 1});
    }
  }

  /**
   * 在点周围寻找角度
   * @param {Array} edges - 边缘像素数组
   * @param {Object} point - 中心点
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @param {number} radius - 搜索半径
   * @returns {Array} 找到的角度
   * @private
   */
  _findAnglesAroundPoint(edges, point, width, height, radius) {
    const angles = [];
    const { x, y } = point;
    const minEdgeLength = 15; // 适中的最小边长限制
    
    // 在搜索半径内寻找边缘点
    const nearbyEdges = [];
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (edges[ny * width + nx] > 0 && (dx !== 0 || dy !== 0)) {
            nearbyEdges.push({ x: nx, y: ny, dx, dy });
          }
        }
      }
    }
    
    // 寻找形成角度的边缘点对
    for (let i = 0; i < nearbyEdges.length; i++) {
      for (let j = i + 1; j < nearbyEdges.length; j++) {
        const edge1 = nearbyEdges[i];
        const edge2 = nearbyEdges[j];
        
        // 计算边长
        const length1 = Math.sqrt(edge1.dx * edge1.dx + edge1.dy * edge1.dy);
        const length2 = Math.sqrt(edge2.dx * edge2.dx + edge2.dy * edge2.dy);
        
        // 过滤掉太短的边
        if (length1 < minEdgeLength || length2 < minEdgeLength) {
          continue;
        }
        
        // 计算角度
        const angle = this._calculateAngle(edge1, edge2);
        
        if (angle !== null) {
          angles.push({
            value: angle,
            edge1,
            edge2,
            length1,
            length2,
            minLength: Math.min(length1, length2)
          });
        }
      }
    }
    
    return angles;
  }

  /**
   * 计算两个边缘点形成的角度
   * @param {Object} edge1 - 第一个边缘点
   * @param {Object} edge2 - 第二个边缘点
   * @returns {number|null} 角度值
   * @private
   */
  _calculateAngle(edge1, edge2) {
    const dx1 = edge1.dx;
    const dy1 = edge1.dy;
    const dx2 = edge2.dx;
    const dy2 = edge2.dy;
    
    // 计算向量长度
    const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    
    if (len1 === 0 || len2 === 0) return null;
    
    // 计算点积
    const dot = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    
    // 限制点积范围，避免数值误差
    const clampedDot = Math.max(-1, Math.min(1, dot));
    
    // 计算角度
    const angle = Math.acos(clampedDot);
    
    return angle;
  }

  /**
   * 合并相近的直角
   * @param {Array} angles - 直角数组
   * @param {number} threshold - 距离阈值
   * @returns {Array} 合并后的直角数组
   * @private
   */
  _mergeNearbyAngles(angles, threshold) {
    const merged = [];
    const used = new Set();
    
    for (let i = 0; i < angles.length; i++) {
      if (used.has(i)) continue;
      
      const angle1 = angles[i];
      const group = [angle1];
      used.add(i);
      
      // 寻找相近的直角
      for (let j = i + 1; j < angles.length; j++) {
        if (used.has(j)) continue;
        
        const angle2 = angles[j];
        const distance = Math.sqrt(
          (angle1.x - angle2.x) ** 2 + (angle1.y - angle2.y) ** 2
        );
        
        if (distance < threshold) {
          group.push(angle2);
          used.add(j);
        }
      }
      
      // 计算组的平均位置和最高置信度
      const avgX = group.reduce((sum, a) => sum + a.x, 0) / group.length;
      const avgY = group.reduce((sum, a) => sum + a.y, 0) / group.length;
      const maxConfidence = Math.max(...group.map(a => a.confidence));
      
      // 选择最长的直角作为代表
      const bestAngle = group.reduce((best, current) => {
        return (current.minLength || 0) > (best.minLength || 0) ? current : best;
      });
      
      merged.push({
        x: avgX,
        y: avgY,
        angle: Math.PI / 2, // 假设都是直角
        confidence: maxConfidence,
        minLength: bestAngle.minLength || 0,
        count: group.length
      });
    }
    
    return merged;
  }

  /**
   * 从直角寻找四边形
   * @param {Array} rightAngles - 直角数组
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Array} 四边形数组
   * @private
   */
  _findQuadrilateralsFromAngles(rightAngles, width, height) {
    const quadrilaterals = [];
    const minAngleLength = 20; // 适中的四边形直角最小边长要求
    
    // 过滤掉边长太短的直角
    const validAngles = rightAngles.filter(angle => 
      (angle.minLength || 0) >= minAngleLength
    );
    
    console.log(`📊 四边形检测: 总直角=${rightAngles.length}, 有效直角=${validAngles.length}`);
    
    // 如果有效直角数量少于4个，无法形成四边形
    if (validAngles.length < 4) {
      return quadrilaterals;
    }
    
    // 按边长排序，优先使用较长的直角
    validAngles.sort((a, b) => (b.minLength || 0) - (a.minLength || 0));
    
    // 尝试所有可能的四个直角组合
    for (let i = 0; i < validAngles.length; i++) {
      for (let j = i + 1; j < validAngles.length; j++) {
        for (let k = j + 1; k < validAngles.length; k++) {
          for (let l = k + 1; l < validAngles.length; l++) {
            const quad = this._createQuadrilateralFromAngles(
              [validAngles[i], validAngles[j], validAngles[k], validAngles[l]],
              width, height
            );
            
            if (quad) {
              quadrilaterals.push(quad);
              
              // 限制四边形数量
              if (quadrilaterals.length >= 5) {
                return quadrilaterals;
              }
            }
          }
        }
      }
    }
    
    return quadrilaterals;
  }

  /**
   * 从四个直角创建四边形
   * @param {Array} angles - 四个直角
   * @param {number} width - 图像宽度
   * @param {number} height - 图像高度
   * @returns {Object|null} 四边形对象
   * @private
   */
  _createQuadrilateralFromAngles(angles, width, height) {
    // 按位置排序，形成矩形
    const sortedAngles = angles.sort((a, b) => {
      if (Math.abs(a.y - b.y) < 10) {
        return a.x - b.x; // 水平位置相近时按x排序
      }
      return a.y - b.y; // 按y排序
    });
    
    // 计算四边形面积
    const area = this._calculateQuadrilateralArea(sortedAngles);
    
    // 计算长宽比
    const aspectRatio = this._calculateAspectRatio(sortedAngles);
    
    // 检查是否合理
    const imageArea = width * height;
    const areaRatio = area / imageArea;
    
    if (areaRatio < 0.1 || areaRatio > 0.9) {
      return null; // 面积太小或太大
    }
    
    return {
      corners: sortedAngles,
      area,
      aspectRatio,
      confidence: Math.min(1, sortedAngles.reduce((sum, a) => sum + a.confidence, 0) / 4)
    };
  }

  /**
   * 计算颜色数量
   * @param {Object} rgbHistogram - RGB直方图数据
   * @returns {number} 颜色数量
   * @private
   */
  async _calculateColorCount(imageUri) {
    // 直接基于像素统计颜色数量
    try {
      // 加载图片
      const image = await this._loadImage(imageUri);
      
      // 创建canvas
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
          console.warn('⚠️ Node.js环境下的canvas处理在浏览器构建中被跳过');
          throw new Error('Node.js环境在浏览器构建中不支持');
        }
      }
      
      // 缩放图像，长边缩放到256像素，保持长宽比
      const maxSize = 256;
      const scale = Math.min(maxSize / image.width, maxSize / image.height);
      const newWidth = Math.floor(image.width * scale);
      const newHeight = Math.floor(image.height * scale);
      
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      // 绘制缩放后的图像
      ctx.drawImage(image, 0, 0, newWidth, newHeight);
      
      // 获取像素数据
      const imageData = ctx.getImageData(0, 0, newWidth, newHeight);
      const pixels = imageData.data;
      
      // 量化颜色（减少到16级）
      const quantizationLevels = 16;
      const uniqueColors = new Set();
      
      // 直接遍历像素统计颜色
      for (let i = 0; i < pixels.length; i += 4) {
        const r = Math.floor(pixels[i] / (256 / quantizationLevels));
        const g = Math.floor(pixels[i + 1] / (256 / quantizationLevels));
        const b = Math.floor(pixels[i + 2] / (256 / quantizationLevels));
        
        uniqueColors.add(`${r},${g},${b}`);
      }
      
      return uniqueColors.size;
      
    } catch (error) {
      console.error('❌ 计算颜色数量失败:', error);
      return 1; // 默认返回1
    }
  }
  
}

export default DocumentDetectionService;
