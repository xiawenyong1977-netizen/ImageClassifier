#!/usr/bin/env node
/**
 * 用 sharp 从 public/icon.png 生成 macOS .icns，全程保留透明通道（圆角不丢）。
 * 在 pc-version-final 目录下执行：node ../scripts/create-mac-icon.js
 * 依赖：sharp（项目已包含）；系统需有 iconutil（仅 macOS）。
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ICONSET_ENTRIES = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];

async function main() {
  const sharp = require('sharp');
  const baseDir = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const iconPath = path.join(baseDir, 'public', 'icon.png');
  const iconsetDir = path.join(baseDir, 'icon.iconset');
  const outIcns = path.join(baseDir, 'public', 'icon.icns');

  if (!fs.existsSync(iconPath)) {
    console.error('找不到 public/icon.png，当前目录:', baseDir);
    process.exit(1);
  }

  console.log('🖼️ 使用 sharp 生成 iconset（保留透明通道）...');
  fs.mkdirSync(iconsetDir, { recursive: true });

  for (const [size, name] of ICONSET_ENTRIES) {
    await sharp(iconPath)
      .resize(size, size)
      .ensureAlpha()
      .png()
      .toFile(path.join(iconsetDir, name));
  }

  console.log('🖼️ 调用 iconutil 生成 .icns...');
  execSync(`iconutil -c icns icon.iconset -o public/icon.icns`, {
    cwd: baseDir,
    stdio: 'inherit',
  });

  fs.rmSync(iconsetDir, { recursive: true });
  console.log('✅ 已生成:', outIcns);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
