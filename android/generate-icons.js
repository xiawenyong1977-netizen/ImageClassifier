/**
 * Android 图标生成脚本
 * 
 * 使用方法：
 * 1. 确保已安装 ImageMagick: https://imagemagick.org/script/download.php
 * 2. 准备一个 1024x1024 的源图标文件（如 public/icon.png）
 * 3. 运行: node android/generate-icons.js [源图标路径]
 * 
 * 示例: node android/generate-icons.js public/icon.png
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 图标尺寸配置
const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// 获取源图标路径
const sourceIcon = process.argv[2] || 'public/icons/icon_300x300.png';
const sourcePath = path.resolve(__dirname, '..', sourceIcon);

// 检查源文件是否存在
if (!fs.existsSync(sourcePath)) {
  console.error(`❌ 源图标文件不存在: ${sourcePath}`);
  console.log('💡 请提供图标文件路径，例如: node android/generate-icons.js public/icon.png');
  process.exit(1);
}

console.log(`📦 开始生成 Android 图标...`);
console.log(`📁 源文件: ${sourcePath}`);

// 检查 ImageMagick 是否安装
try {
  execSync('magick -version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ 未检测到 ImageMagick，请先安装: https://imagemagick.org/script/download.php');
  process.exit(1);
}

const resPath = path.join(__dirname, 'app', 'src', 'main', 'res');

// 生成不同尺寸的图标
console.log('\n🔄 生成传统图标...');
Object.entries(ICON_SIZES).forEach(([folder, size]) => {
  const folderPath = path.join(resPath, folder);
  const outputPath = path.join(folderPath, 'ic_launcher.png');
  
  // 确保文件夹存在
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true });
  }
  
  // 使用 ImageMagick 调整大小
  try {
    execSync(`magick "${sourcePath}" -resize ${size}x${size} "${outputPath}"`, { stdio: 'ignore' });
    console.log(`  ✅ ${folder}/ic_launcher.png (${size}x${size})`);
  } catch (error) {
    console.error(`  ❌ 生成 ${folder}/ic_launcher.png 失败:`, error.message);
  }
});

// 生成自适应图标的前景层（使用源图标，透明背景）
console.log('\n🔄 生成自适应图标前景层...');
const foregroundPath = path.join(resPath, 'drawable', 'ic_launcher_foreground.png');
try {
  // 如果源图标有透明背景，直接使用；否则需要处理
  execSync(`magick "${sourcePath}" -resize 1024x1024 "${foregroundPath}"`, { stdio: 'ignore' });
  console.log(`  ✅ drawable/ic_launcher_foreground.png (1024x1024)`);
  
  // 更新 XML 文件以使用 PNG 而不是 vector
  const foregroundXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`;
  
  // 注意：这里我们保持使用 vector drawable，如果需要使用 PNG，需要修改 XML
  console.log('  💡 提示：如果需要使用 PNG 作为前景，需要手动修改 drawable/ic_launcher_foreground.xml');
} catch (error) {
  console.error(`  ❌ 生成前景层失败:`, error.message);
}

console.log('\n✅ 图标生成完成！');
console.log('📝 下一步：');
console.log('  1. 检查生成的图标文件');
console.log('  2. 如果需要，手动调整 drawable/ic_launcher_background.xml 的背景色');
console.log('  3. 重新编译应用: cd android && ./gradlew assembleRelease');
console.log('  4. 安装并测试图标显示');
