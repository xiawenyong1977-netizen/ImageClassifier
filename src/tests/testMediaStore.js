/**
 * MediaStore 功能测试脚本
 * 
 * 使用方法：
 * 1. 在应用中导入此文件
 * 2. 调用 runMediaStoreTests() 函数
 * 3. 查看控制台输出
 */

import MediaStoreService from '../services/MediaStoreService';
import { logger } from '../adapters/WebAdapters';

/**
 * 测试1: 检查MediaStore可用性
 */
async function test1_CheckAvailability() {
  logger.info('==================== 测试1: 检查可用性 ====================');
  
  const isAvailable = MediaStoreService.checkAvailability();
  logger.info(`MediaStore 可用性: ${isAvailable ? '✅ 可用' : '❌ 不可用'}`);
  
  if (!isAvailable) {
    logger.warn('⚠️ MediaStore不可用，后续测试将跳过');
    return false;
  }
  
  return true;
}

/**
 * 测试2: 获取少量图片（测试基本功能）
 */
async function test2_GetFewImages() {
  logger.info('==================== 测试2: 获取少量图片 ====================');
  
  try {
    const startTime = Date.now();
    const result = await MediaStoreService.getAllImages({ limit: 10, offset: 0 });
    const duration = Date.now() - startTime;
    
    logger.info(`✅ 成功获取 ${result.count} 张图片，耗时 ${duration}ms`);
    logger.info(`分页信息: offset=${result.offset}, hasMore=${result.hasMore}`);
    
    if (result.images.length > 0) {
      const firstImage = result.images[0];
      logger.info('第一张图片信息:', {
        id: firstImage.id,
        fileName: firstImage.fileName,
        size: `${(firstImage.size / 1024 / 1024).toFixed(2)} MB`,
        dimensions: `${firstImage.width}×${firstImage.height}`,
        dateTaken: firstImage.dateTaken ? new Date(firstImage.dateTaken).toLocaleString() : '无'
      });
    }
    
    return true;
  } catch (error) {
    logger.error('❌ 测试失败:', error);
    return false;
  }
}

/**
 * 测试3: 分批获取所有图片（性能测试）
 */
async function test3_GetAllImagesInBatches() {
  logger.info('==================== 测试3: 分批获取所有图片 ====================');
  
  try {
    const startTime = Date.now();
    let batchCount = 0;
    
    const allImages = await MediaStoreService.getAllImagesInBatches(
      500,  // 每批500张
      (batchImages, batchNumber, totalCount) => {
        batchCount = batchNumber;
        logger.info(`📦 批次 ${batchNumber}: 获取 ${batchImages.length} 张，累计 ${totalCount} 张`);
      }
    );
    
    const duration = Date.now() - startTime;
    
    logger.info(`✅ 分批获取完成:`);
    logger.info(`  - 总图片数: ${allImages.length} 张`);
    logger.info(`  - 批次数: ${batchCount} 批`);
    logger.info(`  - 总耗时: ${duration}ms (${(duration / 1000).toFixed(2)}秒)`);
    logger.info(`  - 平均速度: ${(allImages.length / (duration / 1000)).toFixed(0)} 张/秒`);
    
    return allImages;
  } catch (error) {
    logger.error('❌ 测试失败:', error);
    return null;
  }
}

/**
 * 测试4: 提取单张图片EXIF
 */
async function test4_ExtractSingleExif(testImage) {
  logger.info('==================== 测试4: 提取单张图片EXIF ====================');
  
  if (!testImage) {
    logger.warn('⚠️ 没有测试图片，跳过此测试');
    return false;
  }
  
  try {
    const startTime = Date.now();
    const exifData = await MediaStoreService.getImageExif(testImage.uri);
    const duration = Date.now() - startTime;
    
    logger.info(`✅ EXIF提取成功，耗时 ${duration}ms`);
    logger.info('EXIF信息:', {
      fileName: testImage.fileName,
      takenTime: exifData.takenTime ? new Date(exifData.takenTime).toLocaleString() : '无',
      hasGPS: exifData.hasGPS,
      gps: exifData.hasGPS ? {
        latitude: exifData.gps.latitude.toFixed(6),
        longitude: exifData.gps.longitude.toFixed(6),
        altitude: exifData.gps.altitude ? `${exifData.gps.altitude.toFixed(2)}米` : '无'
      } : '无GPS信息',
      dimensions: exifData.width && exifData.height ? `${exifData.width}×${exifData.height}` : '未知',
      camera: `${exifData.make || ''} ${exifData.model || ''}`.trim() || '未知'
    });
    
    return true;
  } catch (error) {
    logger.error('❌ 测试失败:', error);
    return false;
  }
}

/**
 * 测试5: 批量提取EXIF（性能对比）
 */
async function test5_BatchExtractExif(testImages) {
  logger.info('==================== 测试5: 批量提取EXIF ====================');
  
  if (!testImages || testImages.length === 0) {
    logger.warn('⚠️ 没有测试图片，跳过此测试');
    return false;
  }
  
  // 选择前100张图片进行测试
  const testCount = Math.min(100, testImages.length);
  const testUris = testImages.slice(0, testCount).map(img => img.uri);
  
  try {
    logger.info(`开始批量提取 ${testCount} 张图片的EXIF...`);
    
    const startTime = Date.now();
    const result = await MediaStoreService.batchGetImageExif(testUris);
    const duration = Date.now() - startTime;
    
    logger.info(`✅ 批量EXIF提取完成:`);
    logger.info(`  - 成功: ${result.successCount} 张`);
    logger.info(`  - 失败: ${result.failCount} 张`);
    logger.info(`  - 总数: ${result.total} 张`);
    logger.info(`  - 耗时: ${duration}ms (${(duration / 1000).toFixed(2)}秒)`);
    logger.info(`  - 平均速度: ${(result.successCount / (duration / 1000)).toFixed(0)} 张/秒`);
    
    // 统计有GPS的图片数量
    const gpsCount = result.results.filter(r => r.success && r.gps).length;
    logger.info(`  - 有GPS信息: ${gpsCount} 张 (${(gpsCount / result.successCount * 100).toFixed(1)}%)`);
    
    return true;
  } catch (error) {
    logger.error('❌ 测试失败:', error);
    return false;
  }
}

/**
 * 测试6: 格式转换测试
 */
async function test6_FormatConversion(testImages) {
  logger.info('==================== 测试6: 格式转换 ====================');
  
  if (!testImages || testImages.length === 0) {
    logger.warn('⚠️ 没有测试图片，跳过此测试');
    return false;
  }
  
  try {
    const testImage = testImages[0];
    logger.info('原始MediaStore格式:', {
      id: testImage.id,
      uri: testImage.uri,
      path: testImage.path,
      fileName: testImage.fileName
    });
    
    const converted = MediaStoreService.convertToCompatibleFormat(testImage);
    logger.info('转换后的格式:', {
      uri: converted.uri,
      contentUri: converted.contentUri,
      mediaStoreId: converted.mediaStoreId,
      fileName: converted.fileName,
      source: converted.source
    });
    
    logger.info('✅ 格式转换测试通过');
    return true;
  } catch (error) {
    logger.error('❌ 测试失败:', error);
    return false;
  }
}

/**
 * 运行所有测试
 */
export async function runMediaStoreTests() {
  logger.info('\n');
  logger.info('╔════════════════════════════════════════════════════════════╗');
  logger.info('║          MediaStore 功能测试套件                            ║');
  logger.info('╚════════════════════════════════════════════════════════════╝');
  logger.info('\n');
  
  const results = {
    total: 6,
    passed: 0,
    failed: 0,
    skipped: 0
  };
  
  try {
    // 测试1: 检查可用性
    const available = await test1_CheckAvailability();
    if (!available) {
      results.skipped = 5;
      logger.warn('⚠️ MediaStore不可用，跳过后续测试');
      return results;
    }
    results.passed++;
    
    // 测试2: 获取少量图片
    if (await test2_GetFewImages()) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 测试3: 分批获取所有图片
    const allImages = await test3_GetAllImagesInBatches();
    if (allImages) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 后续测试需要图片数据
    if (!allImages || allImages.length === 0) {
      logger.warn('⚠️ 没有图片，跳过后续测试');
      results.skipped = 3;
      return results;
    }
    
    // 测试4: 提取单张EXIF
    if (await test4_ExtractSingleExif(allImages[0])) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 测试5: 批量提取EXIF
    if (await test5_BatchExtractExif(allImages)) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // 测试6: 格式转换
    if (await test6_FormatConversion(allImages)) {
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
export async function quickMediaStoreTest() {
  logger.info('🚀 快速测试MediaStore基本功能...');
  
  try {
    // 检查可用性
    if (!MediaStoreService.checkAvailability()) {
      logger.error('❌ MediaStore不可用');
      return false;
    }
    
    // 获取10张图片
    const result = await MediaStoreService.getAllImages({ limit: 10, offset: 0 });
    logger.info(`✅ 成功获取 ${result.count} 张图片`);
    
    // 如果有图片，提取第一张的EXIF
    if (result.images.length > 0) {
      const exif = await MediaStoreService.getImageExif(result.images[0].uri);
      logger.info(`✅ EXIF提取成功, hasGPS=${exif.hasGPS}`);
    }
    
    logger.info('✅ 快速测试通过！MediaStore工作正常');
    return true;
    
  } catch (error) {
    logger.error('❌ 快速测试失败:', error);
    return false;
  }
}

export default {
  runMediaStoreTests,
  quickMediaStoreTest
};

