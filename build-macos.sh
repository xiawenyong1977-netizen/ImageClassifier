#!/bin/bash

# macOS Build Script for ImageClassifier

echo "🚀 Starting macOS build for ImageClassifier..."

# Navigate to the desktop version directory
cd "$(dirname "$0")/../pc-version-final"

echo "📦 Installing dependencies..."
npm install

echo "🔨 Building the application..."
npm run build

echo "🍎 Creating macOS build..."
npm run electron:build-mac

echo "✅ macOS build completed!"
echo "The built application will be in the dist/ folder"