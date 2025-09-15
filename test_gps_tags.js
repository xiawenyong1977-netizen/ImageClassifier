const fs = require('fs');
const ExifParser = require('exif-parser');
const path = require('path');

// 测试文件路径
const testImagePath = './IMG_20230930_113129_download.jpg';

console.log('=== 分析 IMG_20230930_113129.jpg 的EXIF GPS标签 ===\n');

try {
  // 检查文件是否存在
  if (!fs.existsSync(testImagePath)) {
    console.log('❌ 文件不存在:', testImagePath);
    process.exit(1);
  }

  // 读取文件
  const buffer = fs.readFileSync(testImagePath);
  console.log(`📸 文件大小: ${buffer.length} 字节 (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // 创建EXIF解析器
  const parser = ExifParser.create(buffer);
  const exifData = parser.parse();

  console.log('\n=== 完整EXIF数据结构 ===');
  console.log('EXIF数据:', JSON.stringify(exifData, null, 2));

  console.log('\n=== 所有标签列表 ===');
  if (exifData && exifData.tags) {
    const allTags = Object.keys(exifData.tags);
    console.log(`找到 ${allTags.length} 个标签:`);
    allTags.forEach(tag => {
      console.log(`  ${tag}: ${exifData.tags[tag]} (${typeof exifData.tags[tag]})`);
    });
  }

  console.log('\n=== GPS相关标签 ===');
  if (exifData && exifData.tags) {
    const gpsTags = Object.keys(exifData.tags).filter(tag => 
      tag.toLowerCase().includes('gps') || 
      tag.toLowerCase().includes('lat') || 
      tag.toLowerCase().includes('lon') ||
      tag.toLowerCase().includes('coord') ||
      tag.toLowerCase().includes('location')
    );
    
    if (gpsTags.length > 0) {
      console.log(`找到 ${gpsTags.length} 个GPS相关标签:`);
      gpsTags.forEach(tag => {
        console.log(`  ${tag}: ${exifData.tags[tag]} (${typeof exifData.tags[tag]})`);
      });
    } else {
      console.log('❌ 未找到GPS相关标签');
    }
  }

  console.log('\n=== 标准GPS标签检查 ===');
  const standardGpsTags = [
    'GPSLatitude',
    'GPSLongitude', 
    'GPSLatitudeRef',
    'GPSLongitudeRef',
    'GPSAltitude',
    'GPSAltitudeRef',
    'GPSHPositioningError',
    'GPSDateStamp',
    'GPSTimeStamp',
    'GPSProcessingMethod',
    'GPSAreaInformation'
  ];

  standardGpsTags.forEach(tag => {
    if (exifData && exifData.tags && exifData.tags[tag] !== undefined) {
      console.log(`✅ ${tag}: ${exifData.tags[tag]} (${typeof exifData.tags[tag]})`);
    } else {
      console.log(`❌ ${tag}: 不存在`);
    }
  });

  // 尝试计算GPS坐标
  console.log('\n=== GPS坐标计算 ===');
  if (exifData && exifData.tags) {
    const lat = exifData.tags.GPSLatitude;
    const latRef = exifData.tags.GPSLatitudeRef;
    const lon = exifData.tags.GPSLongitude;
    const lonRef = exifData.tags.GPSLongitudeRef;

    if (lat && lon) {
      console.log(`原始纬度: ${lat} (${latRef || 'N'})`);
      console.log(`原始经度: ${lon} (${lonRef || 'E'})`);
      
      // 转换为十进制度
      let latDecimal = lat;
      let lonDecimal = lon;
      
      if (latRef === 'S') latDecimal = -latDecimal;
      if (lonRef === 'W') lonDecimal = -lonDecimal;
      
      console.log(`转换后纬度: ${latDecimal}`);
      console.log(`转换后经度: ${lonDecimal}`);
    } else {
      console.log('❌ 无法找到有效的GPS坐标数据');
    }
  }

} catch (error) {
  console.error('❌ 分析失败:', error.message);
  console.error('错误详情:', error);
}
