/**
 * 原生多线程哈希计算性能测试
 * 
 * 使用方法：
 * import { runHashPerformanceTest } from './src/tests/testNativeHashPerformance';
 * await runHashPerformanceTest();
 */

import MediaStoreService from '../services/MediaStoreService';
import ParallelHashCalculator from '../services/ParallelHashCalculator';
import { logger, Platform } from '../adapters/WebAdapters';

/**
 * 测试1: 原生多线程哈希计算基准测试
 */
async function test1_NativeHashBenchmark() {
  logger.info('==================== 测试1: 原生多线程哈希计算 ====================');
  
  if (Platform.OS !== 'android') {
    logger.warn('⚠️ 不是Android平台，跳过原生测试');
    return false;
  }
  
  try {
    // 获取测试图片
    const result = await MediaStoreService.getAllImages({ limit: 50, offset: 0 });
    
    if (result.images.length === 0) {
      logger.warn('⚠️ 没有图片，跳过测试');
      return false;
    }
    
    const testImages = result.images.slice(0, Math.min(44, result.images.length));
    logger.info(`📊 测试图片数量: ${testImages.length} 张`);
    
    // 提取文件路径
    const filePaths = testImages.map(img => img.path).filter(p => p);
    
    logger.info(`开始原生多线程哈希计算...`);
    const startTime = Date.now();
    
    const hashResult = await MediaStoreService.batchCalculateFileHash(filePaths);
    
    const duration = Date.now() - startTime;
    
    logger.info(`✅ 原生多线程哈希计算完成:`);
    logger.info(`  - 成功: ${hashResult.successCount} 张`);
    logger.info(`  - 失败: ${hashResult.failCount} 张`);
    logger.info(`  - 总数: ${hashResult.total} 张`);
    logger.info(`  - 原生耗时: ${hashResult.duration}ms`);
    logger.info(`  - 总耗时: ${duration}ms`);
    logger.info(`  - 平均速度: ${(hashResult.successCount / (hashResult.duration / 1000)).toFixed(1)} 张/秒`);
    
    // 显示第一个哈希值作为示例
    if (hashResult.results.length > 0 && hashResult.results[0].success) {
      logger.info(`  - 示例哈希: ${hashResult.results[0].hash.substring(0, 16)}...`);
    }
    
    return true;
    
  } catch (error) {
    logger.error('❌ 测试失败:', error);
    return false;
  }
}

/**
 * 测试2: 对比单线程vs多线程性能
 */
async function test2_ComparePerformance() {
  logger.info('==================== 测试2: 性能对比 ====================');
  
  if (Platform.OS !== 'android') {
    logger.warn('⚠️ 不是Android平台，跳过对比测试');
    return false;
  }
  
  try {
    // 获取测试图片
    const result = await MediaStoreService.getAllImages({ limit: 20, offset: 0 });
    
    if (result.images.length < 10) {
      logger.warn('⚠️ 图片太少，跳过对比测试');
      return false;
    }
    
    const testImages = result.images.slice(0, 20);
    const filePaths = testImages.map(img => img.path).filter(p => p);
    
    logger.info(`📊 对比测试: ${filePaths.length} 张图片`);
    logger.info('');
    
    // 测试原生多线程
    logger.info('🚀 测试原生多线程哈希计算...');
    const nativeStart = Date.now();
    const nativeResult = await MediaStoreService.batchCalculateFileHash(filePaths);
    const nativeDuration = Date.now() - nativeStart;
    
    logger.info(`✅ 原生多线程: ${nativeResult.duration}ms (总${nativeDuration}ms), 成功=${nativeResult.successCount}`);
    logger.info('');
    
    // 测试单线程（使用ParallelHashCalculator的回退模式）
    logger.info('🐌 测试单线程哈希计算（模拟）...');
    const calculator = new ParallelHashCalculator();
    
    // 构建测试数据
    const testData = testImages.map(img => ({
      uri: img.path ? `file://${img.path}` : img.uri,
      path: img.path,
      fileName: img.fileName
    }));
    
    const singleStart = Date.now();
    const singleResult = await calculator.calculateHashesSequential(testData);
    const singleDuration = Date.now() - singleStart;
    
    const singleSuccess = singleResult.filter(r => r.hash).length;
    logger.info(`✅ 单线程: ${singleDuration}ms, 成功=${singleSuccess}`);
    logger.info('');
    
    // 性能对比
    const speedup = (singleDuration / nativeResult.duration).toFixed(2);
    logger.info(`📊 性能对比结果:`);
    logger.info(`  - 单线程耗时: ${singleDuration}ms`);
    logger.info(`  - 多线程耗时: ${nativeResult.duration}ms`);
    logger.info(`  - 性能提升: ${speedup}倍 🚀`);
    logger.info(`  - 节省时间: ${singleDuration - nativeResult.duration}ms`);
    
    return true;
    
  } catch (error) {
    logger.error('❌ 对比测试失败:', error);
    return false;
  }
}

/**
 * 测试3: 压力测试（大量图片）
 */
async function test3_StressTest() {
  logger.info('==================== 测试3: 压力测试 ====================');
  
  if (Platform.OS !== 'android') {
    logger.warn('⚠️ 不是Android平台，跳过压力测试');
    return false;
  }
  
  try {
    // 获取所有图片
    const allImages = await MediaStoreService.getAllImagesInBatches(500);
    
    if (allImages.length === 0) {
      logger.warn('⚠️ 没有图片，跳过压力测试');
      return false;
    }
    
    // 限制测试数量（避免测试时间过长）
    const testCount = Math.min(200, allImages.length);
    const testImages = allImages.slice(0, testCount);
    const filePaths = testImages.map(img => img.path).filter(p => p);
    
    logger.info(`📊 压力测试: ${filePaths.length} 张图片`);
    
    const startTime = Date.now();
    const result = await MediaStoreService.batchCalculateFileHash(filePaths);
    const duration = Date.now() - startTime;
    
    logger.info(`✅ 压力测试完成:`);
    logger.info(`  - 图片数量: ${filePaths.length} 张`);
    logger.info(`  - 成功: ${result.successCount} 张`);
    logger.info(`  - 失败: ${result.failCount} 张`);
    logger.info(`  - 耗时: ${result.duration}ms`);
    logger.info(`  - 平均速度: ${(result.successCount / (result.duration / 1000)).toFixed(1)} 张/秒`);
    logger.info(`  - 估算1000张耗时: ${((result.duration / filePaths.length) * 1000 / 1000).toFixed(1)} 秒`);
    
    return true;
    
  } catch (error) {
    logger.error('❌ 压力测试失败:', error);
    return false;
  }
}

/**
 * 测试4: 验证哈希值正确性
 */
async function test4_VerifyHashCorrectness() {
  logger.info('==================== 测试4: 验证哈希值正确性 ====================');
  
  if (Platform.OS !== 'android') {
    logger.warn('⚠️ 不是Android平台，跳过验证测试');
    return false;
  }
  
  try {
    const result = await MediaStoreService.getAllImages({ limit: 5, offset: 0 });
    
    if (result.images.length === 0) {
      logger.warn('⚠️ 没有图片，跳过验证测试');
      return false;
    }
    
    const testImage = result.images[0];
    const filePath = testImage.path;
    
    logger.info(`验证图片: ${testImage.fileName}`);
    
    // 原生多线程计算
    const nativeResult = await MediaStoreService.batchCalculateFileHash([filePath]);
    const nativeHash = nativeResult.results[0]?.hash;
    
    // 单线程计算（作为对照）
    const calculator = new ParallelHashCalculator();
    const singleResult = await calculator.calculateHashSequential({
      uri: `file://${filePath}`,
      path: filePath,
      fileName: testImage.fileName
    });
    
    logger.info(`原生多线程哈希: ${nativeHash}`);
    logger.info(`单线程哈希:     ${singleResult}`);
    
    if (nativeHash === singleResult) {
      logger.info(`✅ 哈希值一致！验证通过`);
      return true;
    } else {
      logger.error(`❌ 哈希值不一致！验证失败`);
      return false;
    }
    
  } catch (error) {
    logger.error('❌ 验证测试失败:', error);
    return false;
  }
}

/**
 * 运行所有性能测试
 */
export async function runHashPerformanceTest() {
  logger.info('\n');
  logger.info('╔════════════════════════════════════════════════════════════╗');
  logger.info('║        原生多线程哈希计算性能测试套件                        ║');
  logger.info('╚════════════════════════════════════════════════════════════╝');
  logger.info('\n');
  
  const results = {
    total: 4,
    passed: 0,
    failed: 0,
    skipped: 0
  };
  
  try {
    // 测试1: 基准测试
    if (await test1_NativeHashBenchmark()) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 测试2: 性能对比
    if (await test2_ComparePerformance()) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 测试3: 压力测试
    if (await test3_StressTest()) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 测试4: 验证正确性
    if (await test4_VerifyHashCorrectness()) {
      results.passed++;
    } else {
      results.failed++;
    }
    
  } catch (error) {
    logger.error('❌ 测试过程中发生错误:', error);
  }
  
  // 输出测试结果摘要
  logger.info('\n');
  logger.info('╔════════════════════════════════════════════════════════════╗');
  logger.info('║                    测试结果摘要                              ║');
  logger.info('╠════════════════════════════════════════════════════════════╣');
  logger.info(`║  总测试数: ${results.total}`);
  logger.info(`║  通过: ${results.passed} ✅`);
  logger.info(`║  失败: ${results.failed} ❌`);
  logger.info(`║  跳过: ${results.skipped} ⚠️`);
  logger.info(`║  通过率: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  logger.info('╚════════════════════════════════════════════════════════════╝');
  logger.info('\n');
  
  return results;
}

/**
 * 快速测试 - 只测试基本功能
 */
export async function quickHashTest() {
  logger.info('🚀 快速测试原生多线程哈希计算...');
  
  if (Platform.OS !== 'android') {
    logger.error('❌ 不是Android平台');
    return false;
  }
  
  try {
    // 获取10张图片
    const result = await MediaStoreService.getAllImages({ limit: 10, offset: 0 });
    
    if (result.images.length === 0) {
      logger.error('❌ 没有图片');
      return false;
    }
    
    const filePaths = result.images.map(img => img.path).filter(p => p);
    
    // 计算哈希
    const hashResult = await MediaStoreService.batchCalculateFileHash(filePaths);
    
    logger.info(`✅ 快速测试通过！`);
    logger.info(`  - 计算 ${hashResult.total} 张图片`);
    logger.info(`  - 成功 ${hashResult.successCount} 张`);
    logger.info(`  - 耗时 ${hashResult.duration}ms`);
    logger.info(`  - 速度 ${(hashResult.successCount / (hashResult.duration / 1000)).toFixed(1)} 张/秒`);
    
    return true;
    
  } catch (error) {
    logger.error('❌ 快速测试失败:', error);
    return false;
  }
}

export default {
  runHashPerformanceTest,
  quickHashTest
};

