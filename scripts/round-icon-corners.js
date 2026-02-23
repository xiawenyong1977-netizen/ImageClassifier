#!/usr/bin/env node
/**
 * 将 public/icon.png 裁成圆角矩形（像系统应用图标），覆盖原文件；同时处理 public/icons 下各尺寸。
 * 会先加约 15% 内边距（仅 icon.png），再套圆角；public/icons/* 只套圆角。
 * 说明：.icns 的唯一源是 public/icon.png；public/icons/ 是独立文件，要圆角必须跑本脚本。
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

  /** 圆角半径比例（相对短边，约 22%） */
  const radiusRatio = 0.22;
  /** 内边距比例（仅 icon.png：先缩小再圆角，圆角不会在缩放时糊掉） */
  const paddingRatio = 0.15;

  /** 对一块像素做圆角遮罩（四角透明），不改尺寸 */
  function applyRoundedRectToBuffer(data, ww, hh, r) {
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
        if (!insideRoundedRect(x, y)) data[i + 3] = 0;
      }
    }
  }

  /** 先缩小再圆角，最后居中贴到画布：这样圆角是在缩小后的内容上做的，不会被后续缩放吃没 */
  async function addRoundedRectMask(inputPath, outputPath, options = {}) {
    const usePadding = options.paddingRatio != null && options.paddingRatio > 0;
    let img = sharp(inputPath);
    const meta = await img.metadata();
    const { width: w, height: h } = meta;

    if (usePadding) {
      const contentW = Math.round(w * (1 - 2 * options.paddingRatio));
      const contentH = Math.round(h * (1 - 2 * options.paddingRatio));
      // 1) 先缩小
      const resized = await img.resize(contentW, contentH).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const { data, info } = resized;
      const cw = info.width;
      const ch = info.height;
      const r = Math.min(cw, ch) * radiusRatio;
      // 2) 再在缩小后的图上做圆角
      applyRoundedRectToBuffer(data, cw, ch, r);
      const roundedContent = await sharp(data, { raw: { width: cw, height: ch, channels: 4 } })
        .png()
        .toBuffer();
      // 3) 居中贴到原尺寸画布
      const left = Math.round((w - cw) / 2);
      const top = Math.round((h - ch) / 2);
      await sharp({
        create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: roundedContent, left, top }])
        .png()
        .toFile(outputPath);
      return;
    }

    const rgba = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data, info } = rgba;
    const ww = info.width;
    const hh = info.height;
    const r = Math.min(ww, hh) * radiusRatio;
    applyRoundedRectToBuffer(data, ww, hh, r);
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
  await addRoundedRectMask(iconPath, tempMain, { paddingRatio });
  fs.renameSync(tempMain, iconPath);
  console.log('已更新: public/icon.png（先缩小 → 再圆角 → 再居中）');

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
