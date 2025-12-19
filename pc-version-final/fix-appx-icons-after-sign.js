// electron-builder afterAllArtifactBuild 钩子
// 在 APPX 文件创建后、签名前修复图标

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
    console.log('未找到 APPX 文件，跳过图标修复');
    return;
  }

  console.log(`修复 APPX 图标: ${appxFile}`);

  // 调用 PowerShell 脚本修复
  const scriptPath = path.join(__dirname, 'fix-appx-icons.ps1');
  if (fs.existsSync(scriptPath)) {
    try {
      execSync(`powershell -ExecutionPolicy Bypass -File "${scriptPath}" -AppxPath "${appxFile}"`, {
        stdio: 'inherit',
        cwd: __dirname
      });
      console.log('✓ 图标修复完成');
    } catch (error) {
      console.error('图标修复失败:', error.message);
      // 不抛出错误，避免中断构建流程
    }
  } else {
    console.log('警告: 未找到修复脚本:', scriptPath);
  }
};

