// electron-builder appxManifestCreated 钩子
// 在 manifest 生成后添加 Square310x310Logo 的引用

const fs = require('fs');

module.exports = async (manifestPath) => {
  try {
    console.log(`修改 AppxManifest.xml: ${manifestPath}`);
    
    // 读取 manifest
    let manifestContent = fs.readFileSync(manifestPath, 'utf8');
    
    // 检查是否已经包含 Square310x310Logo
    if (manifestContent.includes('Square310x310Logo')) {
      console.log('  ✓ Square310x310Logo 已存在');
      return;
    }
    
    // 查找 DefaultTile 标签
    // 需要在 DefaultTile 中添加 Square310x310Logo
    const defaultTilePattern = /(<uap:DefaultTile[^>]*>)/;
    
    if (defaultTilePattern.test(manifestContent)) {
      // 在 DefaultTile 中添加 Square310x310Logo
      manifestContent = manifestContent.replace(
        /(<uap:DefaultTile[^>]*>)/,
        '$1\n       Square310x310Logo="assets\\Square310x310Logo.png"'
      );
      
      console.log('  ✓ 已添加 Square310x310Logo 到 DefaultTile');
    } else {
      // 如果没有 DefaultTile，需要在 VisualElements 中添加
      const visualElementsPattern = /(<uap:VisualElements[^>]*>)/;
      if (visualElementsPattern.test(manifestContent)) {
        manifestContent = manifestContent.replace(
          /(<uap:VisualElements[^>]*>)/,
          '$1\n       <uap:DefaultTile Square310x310Logo="assets\\Square310x310Logo.png" />'
        );
        console.log('  ✓ 已添加 DefaultTile 和 Square310x310Logo');
      } else {
        console.warn('  ⚠ 未找到 VisualElements 或 DefaultTile，无法添加 Square310x310Logo');
        return;
      }
    }
    
    // 移除位置权限（如果存在）
    // 检查是否包含位置权限声明
    const locationCapabilityPattern = /<Capability[^>]*Name="location"[^>]*\/?>/gi;
    if (locationCapabilityPattern.test(manifestContent)) {
      manifestContent = manifestContent.replace(locationCapabilityPattern, '');
      console.log('  ✓ 已移除位置权限声明');
    }
    
    // 移除位置权限（使用 uap 命名空间）
    const uapLocationCapabilityPattern = /<uap:Capability[^>]*Name="location"[^>]*\/?>/gi;
    if (uapLocationCapabilityPattern.test(manifestContent)) {
      manifestContent = manifestContent.replace(uapLocationCapabilityPattern, '');
      console.log('  ✓ 已移除 uap:location 权限声明');
    }
    
    // 写回 manifest
    fs.writeFileSync(manifestPath, manifestContent, 'utf8');
    console.log('  ✓ AppxManifest.xml 已更新');
    
  } catch (error) {
    console.error(`错误: 修改 manifest 失败:`, error.message);
    throw error;
  }
};

