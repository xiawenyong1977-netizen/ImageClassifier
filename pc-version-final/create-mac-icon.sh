#!/bin/bash

# 从 PNG 创建 macOS .icns 图标文件
# 需要在 macOS 或 Linux 上运行

echo "🍎 创建 macOS 图标文件..."

# 检查 icon.png 是否存在
if [ ! -f "public/icon.png" ]; then
    echo "❌ 找不到 public/icon.png"
    exit 1
fi

# 创建临时目录
mkdir -p icon.iconset

# 生成各种尺寸的图标
sips -z 16 16     public/icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     public/icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     public/icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     public/icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   public/icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   public/icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   public/icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   public/icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   public/icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 public/icon.png --out icon.iconset/icon_512x512@2x.png

# 转换为 .icns
iconutil -c icns icon.iconset -o public/icon.icns

# 清理临时文件
rm -rf icon.iconset

echo "✅ 图标文件已创建: public/icon.icns"

