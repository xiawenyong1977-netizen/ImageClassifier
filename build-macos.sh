#!/bin/bash

# macOS Build Script for ImageClassifier

echo "🚀 Starting macOS build for ImageClassifier..."

# Navigate to the desktop version directory (pc-version-final is inside ImageClassifier)
cd "$(dirname "$0")/pc-version-final"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building the application..."
npm run build

# 若 public 是符号链接，打包前替换为真实目录，避免 electron-builder 打包异常
if [ -L "public" ]; then
  echo "📂 Replacing public symlink with real copy..."
  REAL_PUBLIC=$(readlink public)
  rm public
  cp -R "$REAL_PUBLIC" public
fi

echo "🍎 Creating macOS build..."
npm run electron:build-mac

echo "✅ macOS build completed!"
echo "The built application will be in the dist/ folder"