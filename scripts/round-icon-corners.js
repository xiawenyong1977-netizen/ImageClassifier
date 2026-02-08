#!/usr/bin/env node
/**
 * 将 public/icon.png 裁成圆角矩形（像系统应用图标），覆盖原文件；同时处理 public/icons 下各尺寸。
 * 使用：node scripts/round-icon-corners.js
 * 依赖：sharp（项目已包含）
 */

const path = require('path');
const fs = require('fs');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.error('请先在项目根目录执行: npm install');
    process.exit(1);
  }

  const rootDir = path.resolve(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const iconPath = path.join(publicDir, 'icon.png');

  if (!fs.existsSync(iconPath)) {
    console.error('未找到 public/icon.png');
    process.exit(1);
  }

  /** 圆角半径比例（相对短边，约 22%，接近 macOS/iOS 应用图标观感） */
  const radiusRatio = 0.22;

  /** 把图片裁成圆角矩形：四角为圆弧，圆角外透明 */
  async function addRoundedRectMask(inputPath, outputPath) {
    const img = sharp(inputPath);
    const meta = await img.metadata();
    const { width: w, height: h } = meta;
    const r = Math.min(w, h) * radiusRatio;

    const rgba = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = rgba;
    const ww = info.width;
    const hh = info.height;

    function insideRoundedRect(x, y) {
      const left = x < r;
      const right = x >= ww - r;
      const top = y < r;
      const bottom = y >= hh - r;
      if (!left && !right && !top && !bottom) return true;
      if (left && top) return (x - r) ** 2 + (y - r) ** 2 <= r * r;
      if (right && top) return (x - (ww - r)) ** 2 + (y - r) ** 2 <= r * r;
      if (left && bottom) return (x - r) ** 2 + (y - (hh - r)) ** 2 <= r * r;
      if (right && bottom) return (x - (ww - r)) ** 2 + (y - (hh - r)) ** 2 <= r * r;
      return true;
    }

    for (let y = 0; y < hh; y++) {
      for (let x = 0; x < ww; x++) {
        const i = (y * ww + x) * 4;
        if (!insideRoundedRect(x, y)) {
          data[i + 3] = 0;
        }
      }
    }

    await sharp(data, { raw: { width: ww, height: hh, channels: 4 } })
      .png()
      .toFile(outputPath);
  }

  const backupPath = path.join(publicDir, 'icon.png.bak');
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(iconPath, backupPath);
    console.log('已备份原图: public/icon.png.bak');
  }

  const tempMain = path.join(publicDir, 'icon_rounded_tmp.png');
  await addRoundedRectMask(iconPath, tempMain);
  fs.renameSync(tempMain, iconPath);
  console.log('已更新: public/icon.png（圆角矩形）');

  const iconsDir = path.join(publicDir, 'icons');
  if (fs.existsSync(iconsDir)) {
    const names = ['icon_71x71.png', 'icon_150x150.png', 'icon_300x300.png', 'imageclassify.png'];
    for (const name of names) {
      const p = path.join(iconsDir, name);
      if (fs.existsSync(p)) {
        const tempP = path.join(iconsDir, 'tmp_' + name);
        await addRoundedRectMask(p, tempP);
        fs.renameSync(tempP, p);
        console.log('已更新: public/icons/' + name);
      }
    }
  }

  console.log('完成。如需恢复原图: cp public/icon.png.bak public/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
