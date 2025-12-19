// electron-builder afterAllArtifactBuild 钩子
// 在 APPX 文件创建后，修改其中的 manifest，添加 Square310x310Logo 引用

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

exports.default = async function(context) {
  // 只处理 APPX 包
  if (!context || !context.artifactPaths || context.artifactPaths.length === 0) {
    return;
  }

  const appxFile = context.artifactPaths.find(p => p.endsWith('.appx'));
  if (!appxFile || !fs.existsSync(appxFile)) {
    console.log('未找到 APPX 文件，跳过 Square310x310Logo 添加');
    return;
  }

  console.log(`修改 APPX 文件: ${appxFile}`);
  
  const projectDir = context.projectDir || process.cwd();
  const tempDir = path.join(projectDir, 'dist', 'appx-temp-modify');
  
  try {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempDir, { recursive: true });
    
    // 解压 APPX（APPX 是 ZIP 格式）
    console.log('  解压 APPX 文件...');
    const zipPath = appxFile.replace('.appx', '.zip');
    fs.copyFileSync(appxFile, zipPath);
    
    // 使用 .NET ZipFile 解压
    const zip = require('adm-zip');
    const zipArchive = new zip(zipPath);
    zipArchive.extractAllTo(tempDir, true);
    fs.unlinkSync(zipPath);
    
    // 查找并修改 manifest
    const manifestPath = path.join(tempDir, 'AppxManifest.xml');
    if (!fs.existsSync(manifestPath)) {
      console.warn('  警告: 未找到 AppxManifest.xml');
      return;
    }
    
    console.log('  修改 AppxManifest.xml...');
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    
    // 检查是否已经包含 Square310x310Logo
    if (manifestContent.includes('Square310x310Logo')) {
      console.log('  ✓ Square310x310Logo 已存在');
      return;
    }
    
    // 在 DefaultTile 中添加 Square310x310Logo
    if (manifestContent.includes('<uap:DefaultTile')) {
      manifestContent = manifestContent.replace(
        /(<uap:DefaultTile[^>]*)(>)/,
        '$1 Square310x310Logo="assets\\Square310x310Logo.png"$2'
      );
      console.log('  ✓ 已添加 Square310x310Logo 到 DefaultTile');
    } else {
      console.warn('  ⚠ 未找到 DefaultTile，无法添加 Square310x310Logo');
      return;
    }
    
    // 写回 manifest
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    
    // 重新打包 APPX
    console.log('  重新打包 APPX...');
    const newZip = new zip();
    newZip.addLocalFolder(tempDir);
    newZip.writeZip(appxFile);
    
    console.log('  ✓ APPX 文件已更新');
    
  } catch (error) {
    console.error(`错误: 修改 APPX 失败:`, error.message);
    // 不抛出错误，避免中断构建
  } finally {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
};

