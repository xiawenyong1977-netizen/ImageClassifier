// electron-builder 构建前脚本和 afterPack 钩子
// 1. 将 images 目录复制到 build/appx/Assets 目录
// 2. 在 afterPack 中修改 manifest，添加 Square310x310Logo

const fs = require('fs');
const path = require('path');

// 复制图标文件的函数
function copyIconsToBuildAppx(projectDir) {
  const sourceDir = path.join(projectDir, 'images');
  const buildDir = path.join(projectDir, 'build');
  const targetDir = path.join(buildDir, 'appx', 'Assets');  // electron-builder 期望的位置
  
  if (!fs.existsSync(sourceDir)) {
    console.warn(`警告: 源目录不存在: ${sourceDir}`);
    return;
  }
  
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  const appxDir = path.join(buildDir, 'appx');
  if (!fs.existsSync(appxDir)) {
    fs.mkdirSync(appxDir, { recursive: true });
  }
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  console.log(`复制 APPX 图标文件: ${sourceDir} -> ${targetDir}`);
  
  function copyRecursive(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        if (!fs.existsSync(destPath)) {
          fs.mkdirSync(destPath, { recursive: true });
        }
        copyRecursive(srcPath, destPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
        // 只复制基础图标，跳过 scale 版本（scale-100, scale-200 等）
        if (!entry.name.match(/\.scale-\d+\.png$/i)) {
          fs.copyFileSync(srcPath, destPath);
          console.log(`  ✓ ${entry.name}`);
        }
      }
    }
  }
  
  try {
    copyRecursive(sourceDir, targetDir);
    console.log(`✓ APPX 图标文件复制完成`);
    console.log(`  electron-builder 将自动从 build/appx/Assets/ 读取图标并生成 manifest`);
  } catch (error) {
    console.error(`错误: 复制图标文件失败:`, error.message);
    throw error;
  }
}

// 递归查找文件
function findFile(dir, filename, maxDepth = 3, currentDepth = 0) {
  if (currentDepth >= maxDepth || !fs.existsSync(dir)) {
    return null;
  }
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === filename) {
        return fullPath;
      }
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const found = findFile(fullPath, filename, maxDepth, currentDepth + 1);
        if (found) return found;
      }
    }
  } catch (error) {
    // 忽略权限错误等
  }
  return null;
}

// afterPack 钩子：修改 manifest，添加 Square310x310Logo
exports.default = async function(context) {
  // 只处理 APPX 包
  if (context.targets && !context.targets.some(t => t.name === 'appx')) {
    return;
  }

  const projectDir = context.projectDir || process.cwd();
  const appOutDir = context.appOutDir;
  
  console.log(`查找 AppxManifest.xml (appOutDir: ${appOutDir})...`);
  
  // 扩展搜索路径
  const searchPaths = [
    appOutDir,
    path.join(appOutDir, 'resources'),
    path.join(projectDir, 'dist', 'win-unpacked'),
    path.join(projectDir, 'dist'),
    path.join(projectDir, 'build'),
  ];
  
  let manifestPath = null;
  for (const searchPath of searchPaths) {
    if (fs.existsSync(searchPath)) {
      manifestPath = findFile(searchPath, 'AppxManifest.xml', 5);
      if (manifestPath) {
        console.log(`  ✓ 找到: ${manifestPath}`);
        break;
      }
    }
  }
  
  if (!manifestPath) {
    console.warn('警告: 未找到 AppxManifest.xml，跳过 Square310x310Logo 添加');
    console.warn(`  已搜索路径: ${searchPaths.join(', ')}`);
    return;
  }
  
  console.log(`修改 AppxManifest.xml: ${manifestPath}`);
  
  try {
    // 读取 manifest
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    
    // 修复路径大小写：将 assets\ 改为 Assets\ (Windows APPX 标准)
    // electron-builder 可能生成小写的 assets\，但实际目录是大写的 Assets\
    manifestContent = manifestContent.replace(/assets\\/gi, 'Assets\\');
    manifestContent = manifestContent.replace(/assets\//gi, 'Assets/');
    console.log('  ✓ 已修复 manifest 中的路径大小写 (assets -> Assets)');
    
    // 检查是否已经包含 Square310x310Logo
    if (manifestContent.includes('Square310x310Logo')) {
      console.log('  ✓ Square310x310Logo 已存在');
    } else {
      // 在 DefaultTile 中添加 Square310x310Logo
      if (manifestContent.includes('<uap:DefaultTile')) {
        // 在 DefaultTile 开始标签中添加 Square310x310Logo 属性
        manifestContent = manifestContent.replace(
          /(<uap:DefaultTile[^>]*)(>)/,
          '$1 Square310x310Logo="Assets\\Square310x310Logo.png"$2'
        );
        console.log('  ✓ 已添加 Square310x310Logo 到 DefaultTile');
      } else {
        // 如果没有 DefaultTile，在 VisualElements 后添加
        if (manifestContent.includes('</uap:VisualElements>')) {
          manifestContent = manifestContent.replace(
            /(<\/uap:VisualElements>)/,
            '<uap:DefaultTile Square310x310Logo="Assets\\Square310x310Logo.png" />\n      $1'
          );
          console.log('  ✓ 已添加 DefaultTile 和 Square310x310Logo');
        } else {
          console.warn('  ⚠ 未找到 VisualElements 或 DefaultTile，无法添加 Square310x310Logo');
        }
      }
    }
    
    // 写回 manifest
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    console.log('  ✓ AppxManifest.xml 已更新');
    
  } catch (error) {
    console.error(`错误: 修改 manifest 失败:`, error.message);
    // 不抛出错误，避免中断构建
  }
};

// 作为独立脚本运行（在构建之前）
if (require.main === module) {
  const projectDir = process.cwd();
  copyIconsToBuildAppx(projectDir);
}
