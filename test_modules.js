// 测试React Native中各个模块的可用性
console.log('=== 测试模块可用性 ===');

// 测试Buffer
try {
  const Buffer = require('buffer').Buffer;
  console.log('✅ Buffer模块可用:', typeof Buffer);
  console.log('Buffer.from测试:', Buffer.from('test', 'utf8').toString());
} catch (error) {
  console.log('❌ Buffer模块不可用:', error.message);
}

// 测试exif-parser
try {
  const ExifParser = require('exif-parser');
  console.log('✅ exif-parser模块可用:', typeof ExifParser);
} catch (error) {
  console.log('❌ exif-parser模块不可用:', error.message);
}

// 测试react-native-exif
try {
  const RNExif = require('react-native-exif');
  console.log('✅ react-native-exif模块可用:', typeof RNExif);
  console.log('getExif方法:', typeof RNExif.getExif);
} catch (error) {
  console.log('❌ react-native-exif模块不可用:', error.message);
}

// 测试react-native-fs
try {
  const RNFS = require('react-native-fs');
  console.log('✅ react-native-fs模块可用:', typeof RNFS);
} catch (error) {
  console.log('❌ react-native-fs模块不可用:', error.message);
}

// 测试React Native核心模块
try {
  const ReactNative = require('react-native');
  console.log('✅ React Native核心模块可用:', typeof ReactNative);
  console.log('Platform:', typeof ReactNative.Platform);
  console.log('MediaStore:', typeof ReactNative.MediaStore);
} catch (error) {
  console.log('❌ React Native核心模块不可用:', error.message);
}
