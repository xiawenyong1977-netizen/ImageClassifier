#!/bin/bash

# macOS Build Script for ImageClassifier

echo "🚀 Starting macOS build for ImageClassifier..."

# Navigate to the desktop version directory (pc-version-final is inside ImageClassifier)
cd "$(dirname "$0")/pc-version-final"

# 若 public 是上次构建留下的实体目录，删掉并恢复为符号链接，保证本次构建从根目录拷贝最新内容
if [ -d "public" ] && [ ! -L "public" ]; then
  echo "📂 Removing previous build copy of public, restoring symlink to ../public..."
  rm -rf public
  ln -s ../public public
fi

echo "📦 Installing dependencies..."
if [ -n "$CI" ]; then
  npm ci --no-optional --legacy-peer-deps
  npm install canvas@^2.11.2 || true
else
  npm install
fi

echo "🔨 Building the application..."
npm run build

# 推荐：pc-version-final/public 为指向 ../public 的符号链接，只维护根目录一份；打包前替换为实体目录，避免 asar 内符号链接异常。
if [ -L "public" ]; then
  echo "📂 Replacing public symlink with real copy (single source: root public)..."
  REAL_PUBLIC=$(readlink public)
  rm public
  cp -R "$REAL_PUBLIC" public
fi

# 用当前 public/icon.png 生成 icon.icns（优先用 Node+sharp 保留透明通道，圆角不丢）
if [ -f "public/icon.png" ]; then
  if [ -f "../scripts/create-mac-icon.js" ]; then
    echo "🖼️ Regenerating icon.icns (Node+sharp, preserve alpha)..."
    node ../scripts/create-mac-icon.js .
  elif [ -x "./create-mac-icon.sh" ]; then
    echo "🖼️ Regenerating icon.icns (sips)..."
    ./create-mac-icon.sh
  fi
fi

echo "🍎 Creating macOS build..."
if [ -n "$BUILD_ZIP" ]; then
  npm run electron:build-mac-zip
else
  npm run electron:build-mac
fi

echo "✅ macOS build completed!"
echo "The built application will be in the dist/ folder"