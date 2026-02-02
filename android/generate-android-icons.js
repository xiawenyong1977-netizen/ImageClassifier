/**
 * 生成 Android 应用图标
 * 使用项目中的 sharp 库
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sourceIcon = path.join(__dirname, '..', 'public', 'imageclassify.png');
const resPath = path.join(__dirname, 'app', 'src', 'main', 'res');

// 图标尺寸配置
const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// 检查源文件
if (!fs.existsSync(sourceIcon)) {
  console.error(`❌ 源图标文件不存在: ${sourceIcon}`);
  process.exit(1);
}

console.log('📦 开始生成 Android 图标...');
console.log(`📁 源文件: ${sourceIcon}`);

// 生成传统图标
async function generateIcons() {
  try {
    // 读取源图标
    const image = sharp(sourceIcon);
    const metadata = await image.metadata();
    console.log(`📐 源图标尺寸: ${metadata.width}x${metadata.height}`);

    // 生成不同尺寸的图标 - 添加15%边距，避免被裁剪
    console.log('\n🔄 生成传统图标...');
    const paddingPercent = 0.15; // 15% 边距
    
    for (const [folder, size] of Object.entries(ICON_SIZES)) {
      const folderPath = path.join(resPath, folder);
      const outputPath = path.join(folderPath, 'ic_launcher.png');
      
      // 确保文件夹存在
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }
      
      // 提取边缘颜色作为背景色
      const { data } = await sharp(sourceIcon)
        .extract({ left: 0, top: 0, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      
      const bgColor = {
        r: data[0],
        g: data[1],
        b: data[2],
        alpha: 1
      };
      
      // 计算内容区域大小（留出15%边距）
      const contentSize = Math.floor(size * (1 - paddingPercent * 2));
      
      // 先缩放内容，然后添加边距
      await sharp(sourceIcon)
        .resize(contentSize, contentSize)  // 缩放到内容区域
        .extend({
          top: Math.floor((size - contentSize) / 2),
          bottom: Math.ceil((size - contentSize) / 2),
          left: Math.floor((size - contentSize) / 2),
          right: Math.ceil((size - contentSize) / 2),
          background: bgColor
        })
        .png()
        .toFile(outputPath);
      
      console.log(`  ✅ ${folder}/ic_launcher.png (${size}x${size}, 内容${contentSize}x${contentSize})`);
    }

    // 生成自适应图标的前景层（1024x1024）
    console.log('\n🔄 生成自适应图标...');
    const drawablePath = path.join(resPath, 'drawable');
    if (!fs.existsSync(drawablePath)) {
      fs.mkdirSync(drawablePath, { recursive: true });
    }

    // 前景层：添加15%边距，避免被自适应图标系统裁剪
    const foregroundPaddingPercent = 0.15;
    const foregroundContentSize = Math.floor(1024 * (1 - foregroundPaddingPercent * 2)); // 约 716px
    
    const { data: foregroundData } = await sharp(sourceIcon)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const foregroundBgColor = {
      r: foregroundData[0],
      g: foregroundData[1],
      b: foregroundData[2],
      alpha: 0  // 前景层使用透明背景
    };
    
    const foregroundPath = path.join(drawablePath, 'ic_launcher_foreground.png');
    await sharp(sourceIcon)
      .resize(foregroundContentSize, foregroundContentSize)  // 缩放到内容区域
      .extend({
        top: Math.floor((1024 - foregroundContentSize) / 2),
        bottom: Math.ceil((1024 - foregroundContentSize) / 2),
        left: Math.floor((1024 - foregroundContentSize) / 2),
        right: Math.ceil((1024 - foregroundContentSize) / 2),
        background: foregroundBgColor  // 透明背景
      })
      .png()
      .toFile(foregroundPath);
    console.log(`  ✅ drawable/ic_launcher_foreground.png (1024x1024, 内容${foregroundContentSize}x${foregroundContentSize}, 15%边距)`);

    // 背景层：提取源图标边缘颜色作为背景色
    const { data: backgroundData } = await sharp(sourceIcon)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const backgroundBgColor = {
      r: backgroundData[0],
      g: backgroundData[1],
      b: backgroundData[2],
      alpha: 1
    };
    console.log(`  🎨 提取的背景色: RGB(${backgroundBgColor.r}, ${backgroundBgColor.g}, ${backgroundBgColor.b})`);
    
    const backgroundPath = path.join(drawablePath, 'ic_launcher_background.png');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: backgroundBgColor
      }
    })
      .png()
      .toFile(backgroundPath);
    console.log(`  ✅ drawable/ic_launcher_background.png (1024x1024, 使用提取的背景色)`);

    // 更新前景层 XML（使用 PNG 而不是 vector）
    const foregroundXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>`;

    // 更新 mipmap-anydpi-v26 中的 XML
    const anydpiPath = path.join(resPath, 'mipmap-anydpi-v26');
    if (!fs.existsSync(anydpiPath)) {
      fs.mkdirSync(anydpiPath, { recursive: true });
    }

    const launcherXmlPath = path.join(anydpiPath, 'ic_launcher.xml');
    fs.writeFileSync(launcherXmlPath, foregroundXml);
    console.log(`  ✅ mipmap-anydpi-v26/ic_launcher.xml`);

    const launcherRoundXmlPath = path.join(anydpiPath, 'ic_launcher_round.xml');
    fs.writeFileSync(launcherRoundXmlPath, foregroundXml);
    console.log(`  ✅ mipmap-anydpi-v26/ic_launcher_round.xml`);

    console.log('\n✅ 所有图标生成完成！');
    console.log('\n📝 下一步：');
    console.log('  1. 检查生成的图标文件');
    console.log('  2. 重新编译应用: cd android && ./gradlew assembleRelease');
    console.log('  3. 安装并测试图标显示');

  } catch (error) {
    console.error('❌ 生成图标时出错:', error);
    process.exit(1);
  }
}

generateIcons();
