const fs = require('fs');
const ExifParser = require('exif-parser');

// 读取图片文件
const imageBuffer = fs.readFileSync('./test_image.jpg');
console.log('文件大小:', imageBuffer.length, 'bytes');

// 使用exif-parser解析
const parser = ExifParser.create(imageBuffer);
const exifData = parser.parse();

console.log('\n=== EXIF数据 ===');
console.log('标签数量:', Object.keys(exifData.tags || {}).length);

// 查找GPS相关标签
const gpsTags = {};
Object.keys(exifData.tags || {}).forEach(tag => {
  if (tag.toLowerCase().includes('gps') || 
      tag.toLowerCase().includes('lat') || 
      tag.toLowerCase().includes('lon') ||
      tag.toLowerCase().includes('coord')) {
    gpsTags[tag] = exifData.tags[tag];
  }
});

console.log('\n=== GPS相关标签 ===');
console.log(JSON.stringify(gpsTags, null, 2));

// 检查常见的GPS标签
const commonGpsTags = [
  'GPSLatitude', 'GPSLongitude', 'GPSAltitude', 
  'GPSLatitudeRef', 'GPSLongitudeRef', 'GPSAltitudeRef',
  'GPSHPositioningError', 'GPSDateStamp', 'GPSTimeStamp'
];

console.log('\n=== 常见GPS标签 ===');
commonGpsTags.forEach(tag => {
  if (exifData.tags && exifData.tags[tag] !== undefined) {
    console.log(`${tag}: ${exifData.tags[tag]}`);
  }
});

// 检查所有标签
console.log('\n=== 所有EXIF标签 ===');
Object.keys(exifData.tags || {}).forEach(tag => {
  console.log(`${tag}: ${exifData.tags[tag]}`);
});
