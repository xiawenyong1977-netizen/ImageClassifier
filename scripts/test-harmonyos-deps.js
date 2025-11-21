/**
 * 测试鸿蒙依赖包下载
 * 检查 react-native-oh-library 支持的库是否可以正确下载
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('========================================');
console.log('  测试鸿蒙依赖包下载');
console.log('========================================');
console.log('');

const harmonyosDir = path.resolve(__dirname, '..', 'harmonyos');

// 检查 harmonyos 目录是否存在
if (!fs.existsSync(harmonyosDir)) {
  console.log('❌ harmonyos/ 目录不存在');
  console.log('   请先运行: npm run harmonyos:init');
  process.exit(1);
}

// 检查 ohpm 是否安装
try {
  execSync('ohpm --version', { stdio: 'ignore' });
} catch (error) {
  console.log('❌ ohpm 未安装或未添加到 PATH');
  console.log('   请参考: docs/鸿蒙开发环境安装指南.md');
  process.exit(1);
}

console.log('✅ ohpm 已安装');
console.log('');

// 需要测试的库列表（基于之前确认的支持情况）
const testPackages = [
  '@react-native-oh-library/react-native-fs',
  '@react-native-oh-library/react-native-async-storage-async-storage',
  '@react-native-oh-library/react-native-sqlite-storage',
  '@react-native-oh-library/react-native-gesture-handler',
  '@react-native-oh-library/react-native-reanimated',
  '@react-native-oh-library/react-native-screens',
  '@react-native-oh-library/react-native-safe-area-context',
  '@react-native-oh-library/react-native-vector-icons',
  '@react-native-oh-library/react-native-fast-image',
  '@react-native-oh-library/react-native-webview',
  '@react-native-oh-library/react-native-image-picker',
  '@react-native-oh-library/react-native-image-resizer',
  '@react-native-oh-library/react-native-canvas',
  '@react-native-oh-library/react-navigation-native-stack',
  '@react-native-oh-library/react-navigation-bottom-tabs',
];

console.log('📦 测试依赖包下载...');
console.log('');

const results = {
  success: [],
  failed: [],
};

// 读取 oh-package.json5
const ohPackagePath = path.join(harmonyosDir, 'oh-package.json5');
let ohPackage = {};

if (fs.existsSync(ohPackagePath)) {
  try {
    const content = fs.readFileSync(ohPackagePath, 'utf-8');
    // 简单的 JSON5 解析（实际应该使用 json5 库）
    ohPackage = JSON.parse(content.replace(/'/g, '"'));
  } catch (error) {
    console.log('⚠️  无法读取 oh-package.json5，将创建新文件');
  }
}

// 测试每个包
for (const pkg of testPackages) {
  process.stdout.write(`   测试 ${pkg}... `);
  
  try {
    // 尝试查询包信息（不实际安装）
    execSync(`ohpm view ${pkg}`, {
      cwd: harmonyosDir,
      stdio: 'pipe',
      timeout: 10000, // 10秒超时
    });
    
    console.log('✅');
    results.success.push(pkg);
    
    // 添加到依赖列表
    if (!ohPackage.dependencies) {
      ohPackage.dependencies = {};
    }
    // 不添加版本，让 ohpm install 自动解析
    if (!ohPackage.dependencies[pkg]) {
      ohPackage.dependencies[pkg] = 'latest';
    }
  } catch (error) {
    console.log('❌');
    results.failed.push(pkg);
    console.log(`     错误: ${error.message.split('\n')[0]}`);
  }
}

console.log('');

// 保存更新后的 oh-package.json5
if (results.success.length > 0) {
  try {
    // 简单的 JSON5 格式化
    const jsonStr = JSON.stringify(ohPackage, null, 2)
      .replace(/"/g, "'")
      .replace(/'/g, '')
      .replace(/,(\s*})/g, '$1')
      .replace(/,(\s*\])/g, '$1');
    
    fs.writeFileSync(ohPackagePath, jsonStr);
    console.log(`✅ 已更新 oh-package.json5，添加了 ${results.success.length} 个依赖`);
  } catch (error) {
    console.log('⚠️  无法更新 oh-package.json5:', error.message);
  }
}

// 总结
console.log('');
console.log('========================================');
console.log('  测试结果');
console.log('========================================');
console.log(`✅ 成功: ${results.success.length} 个`);
console.log(`❌ 失败: ${results.failed.length} 个`);
console.log('');

if (results.success.length > 0) {
  console.log('成功的包:');
  results.success.forEach(pkg => {
    console.log(`  ✅ ${pkg}`);
  });
  console.log('');
}

if (results.failed.length > 0) {
  console.log('失败的包:');
  results.failed.forEach(pkg => {
    console.log(`  ❌ ${pkg}`);
  });
  console.log('');
  console.log('⚠️  失败的包可能：');
  console.log('  1. 包名不正确（需要确认 react-native-oh-library 的实际包名）');
  console.log('  2. 网络问题（请检查网络连接）');
  console.log('  3. 镜像源配置问题（尝试: ohpm config set registry https://repo.harmonyos.com/ohpm/）');
  console.log('');
}

console.log('下一步：');
if (results.success.length > 0) {
  console.log('1. 运行: npm run harmonyos:install');
  console.log('2. 这将安装所有可用的依赖包');
} else {
  console.log('1. 检查网络连接');
  console.log('2. 检查 ohpm 镜像源配置');
  console.log('3. 参考: docs/鸿蒙开发环境安装指南.md');
}
console.log('');

process.exit(results.failed.length > 0 ? 1 : 0);

