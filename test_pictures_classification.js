#!/usr/bin/env node
/**
 * 测试图片智能分类 - 对 D:\Pictures 目录下的文件进行分类
 */

import ImageClassifierService from './src/services/ImageClassifierService.js';
import fs from 'fs';
import path from 'path';

class PictureClassificationTester {
  constructor() {
    this.classifier = new ImageClassifierService();
    this.picturesDir = 'D:\\Pictures';
    this.supportedFormats = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.gif'];
    this.results = [];
    this.stats = {
      total: 0,
      processed: 0,
      success: 0,
      failed: 0,
      categories: {},
      idCardDetected: 0,
      processingTime: 0
    };
  }

  // 获取目录下的所有图片文件
  getImageFiles(dir) {
    const files = [];
    
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dir, item.name);
        
        if (item.isDirectory()) {
          // 递归处理子目录
          files.push(...this.getImageFiles(fullPath));
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (this.supportedFormats.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.error(`❌ 读取目录失败 ${dir}:`, error.message);
    }
    
    return files;
  }

  // 格式化文件大小
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 分类单张图片
  async classifyImage(imagePath) {
    const startTime = Date.now();
    
    try {
      console.log(`\n📸 正在分类: ${path.basename(imagePath)}`);
      
      // 获取文件信息
      const stats = fs.statSync(imagePath);
      const fileSize = this.formatFileSize(stats.size);
      
      // 执行智能分类
      const result = await this.classifier.classifyImage(imagePath, {}, {
        unloadAfterClassification: false  // 保持模型加载，提高批量处理效率
      });
      
      const processingTime = Date.now() - startTime;
      
      // 记录结果
      const classificationResult = {
        path: imagePath,
        fileName: path.basename(imagePath),
        fileSize: fileSize,
        category: result.category,
        confidence: result.confidence,
        reason: result.reason,
        method: result.method,
        idCardDetected: result.idCardDetected,
        usedModels: result.usedModels,
        detections: result.detections,
        processingTime: processingTime,
        success: true
      };
      
      this.results.push(classificationResult);
      this.stats.success++;
      this.stats.categories[result.category] = (this.stats.categories[result.category] || 0) + 1;
      
      if (result.idCardDetected) {
        this.stats.idCardDetected++;
      }
      
      console.log(`  ✅ 分类完成: ${result.category} (${(result.confidence * 100).toFixed(1)}%)`);
      console.log(`  📊 原因: ${result.reason}`);
      console.log(`  🔧 方法: ${result.method}`);
      console.log(`  🆔 身份证: ${result.idCardDetected ? '是' : '否'}`);
      console.log(`  🤖 模型: ${result.usedModels.join(' → ')}`);
      console.log(`  ⏱️  耗时: ${processingTime}ms`);
      
      if (result.detections.length > 0) {
        console.log(`  🎯 检测到 ${result.detections.length} 个物体:`);
        result.detections.forEach((detection, index) => {
          console.log(`    ${index + 1}. ${detection.class} (${(detection.confidence * 100).toFixed(1)}%)`);
        });
      }
      
      return classificationResult;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.log(`  ❌ 分类失败: ${error.message}`);
      
      const failedResult = {
        path: imagePath,
        fileName: path.basename(imagePath),
        fileSize: 'unknown',
        category: 'error',
        confidence: 0,
        reason: error.message,
        method: 'failed',
        idCardDetected: false,
        usedModels: [],
        detections: [],
        processingTime: processingTime,
        success: false,
        error: error.message
      };
      
      this.results.push(failedResult);
      this.stats.failed++;
      
      return failedResult;
    }
  }

  // 生成分类报告
  generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('📊 分类报告');
    console.log('='.repeat(80));
    
    console.log(`\n📈 统计信息:`);
    console.log(`  - 总文件数: ${this.stats.total}`);
    console.log(`  - 已处理: ${this.stats.processed}`);
    console.log(`  - 成功: ${this.stats.success}`);
    console.log(`  - 失败: ${this.stats.failed}`);
    console.log(`  - 成功率: ${this.stats.total > 0 ? ((this.stats.success / this.stats.total) * 100).toFixed(1) : 0}%`);
    console.log(`  - 身份证检测: ${this.stats.idCardDetected} 张`);
    console.log(`  - 总耗时: ${this.stats.processingTime}ms`);
    console.log(`  - 平均耗时: ${this.stats.processed > 0 ? (this.stats.processingTime / this.stats.processed).toFixed(1) : 0}ms/张`);
    
    console.log(`\n📂 分类分布:`);
    Object.entries(this.stats.categories)
      .sort(([,a], [,b]) => b - a)
      .forEach(([category, count]) => {
        const percentage = ((count / this.stats.success) * 100).toFixed(1);
        console.log(`  - ${category}: ${count} 张 (${percentage}%)`);
      });
    
    console.log(`\n🆔 身份证检测详情:`);
    const idCardResults = this.results.filter(r => r.idCardDetected);
    if (idCardResults.length > 0) {
      idCardResults.forEach(result => {
        console.log(`  - ${result.fileName}: ${result.category} (${(result.confidence * 100).toFixed(1)}%)`);
      });
    } else {
      console.log(`  - 未检测到身份证`);
    }
    
    console.log(`\n❌ 失败文件:`);
    const failedResults = this.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      failedResults.forEach(result => {
        console.log(`  - ${result.fileName}: ${result.error}`);
      });
    } else {
      console.log(`  - 无失败文件`);
    }
  }

  // 保存详细结果到文件
  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `classification_results_${timestamp}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      directory: this.picturesDir,
      stats: this.stats,
      results: this.results
    };
    
    try {
      fs.writeFileSync(filename, JSON.stringify(report, null, 2));
      console.log(`\n💾 详细结果已保存到: ${filename}`);
    } catch (error) {
      console.error(`❌ 保存结果失败:`, error.message);
    }
  }

  // 主测试函数
  async runTest() {
    console.log('🚀 开始图片智能分类测试');
    console.log(`📁 目标目录: ${this.picturesDir}`);
    
    const startTime = Date.now();
    
    try {
      // 1. 初始化分类器
      console.log('\n🔄 初始化分类器...');
      await this.classifier.initialize();
      console.log('✅ 分类器初始化完成');
      
      // 2. 获取图片文件
      console.log('\n📂 扫描图片文件...');
      const imageFiles = this.getImageFiles(this.picturesDir);
      this.stats.total = imageFiles.length;
      
      if (imageFiles.length === 0) {
        console.log('❌ 未找到支持的图片文件');
        return;
      }
      
      console.log(`✅ 找到 ${imageFiles.length} 个图片文件`);
      
      // 3. 分类所有图片
      console.log('\n🔍 开始智能分类...');
      for (let i = 0; i < imageFiles.length; i++) {
        const imagePath = imageFiles[i];
        console.log(`\n[${i + 1}/${imageFiles.length}] 处理中...`);
        
        await this.classifyImage(imagePath);
        this.stats.processed++;
        
        // 每处理10张图片显示进度
        if ((i + 1) % 10 === 0) {
          console.log(`\n📊 进度: ${i + 1}/${imageFiles.length} (${((i + 1) / imageFiles.length * 100).toFixed(1)}%)`);
        }
      }
      
      this.stats.processingTime = Date.now() - startTime;
      
      // 4. 生成报告
      this.generateReport();
      
      // 5. 保存结果
      await this.saveResults();
      
      console.log('\n🎉 测试完成！');
      
    } catch (error) {
      console.error('❌ 测试失败:', error.message);
    } finally {
      // 清理资源
      console.log('\n🧹 清理资源...');
      this.classifier.unloadAllModels();
      console.log('✅ 资源清理完成');
    }
  }
}

// 运行测试
async function main() {
  const tester = new PictureClassificationTester();
  await tester.runTest();
}

// 检查目录是否存在
if (!fs.existsSync('D:\\Pictures')) {
  console.error('❌ 目录不存在: D:\\Pictures');
  console.log('💡 请修改脚本中的目录路径或创建该目录');
  process.exit(1);
}

main().catch(console.error);
