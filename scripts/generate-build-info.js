#!/usr/bin/env node

/**
 * 生成构建信息文件
 * 在构建时自动生成构建日期和时间
 * 版本号格式与 android/app/build.gradle 中的 versionCode 规则一致
 */

const fs = require('fs');
const path = require('path');

// 获取当前日期和时间
const now = new Date();

// 生成构建版本号（与 build.gradle 中的规则一致）
// 格式：MMddHHmm（例如：11251430 表示 11月25日 14:30）
// 注意：不使用年份，因为年份会导致版本号超出 int 范围
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hour = String(now.getHours()).padStart(2, '0');
const minute = String(now.getMinutes()).padStart(2, '0');
const buildVersionCode = `${month}${day}${hour}${minute}`; // MMddHHmm

// 生成易读的构建时间格式（用于显示）
// 格式：YYYY-MM-DD HH:mm（例如：2025-11-12 14:30）
const fullYear = now.getFullYear();
const buildDateFormatted = `${fullYear}-${month}-${day} ${hour}:${minute}`;

// 检测调用目录：根据 process.cwd() 判断是从根目录还是 pc-version-final 目录调用
// 脚本位于 scripts/ 目录，__dirname 是 scripts 目录的绝对路径
const scriptsDir = __dirname;
const rootDir = path.join(scriptsDir, '..');
const currentWorkingDir = process.cwd();

// 判断是否从 pc-version-final 目录调用（通过检查当前工作目录）
const isPcVersionFinal = currentWorkingDir.endsWith('pc-version-final') || 
                         path.basename(currentWorkingDir) === 'pc-version-final';

let packageJsonPath;
let buildInfoDir;

if (isPcVersionFinal) {
  // 从 pc-version-final 调用：使用 pc-version-final 的 package.json 和 src/config
  packageJsonPath = path.join(currentWorkingDir, 'package.json');
  buildInfoDir = path.join(currentWorkingDir, 'src', 'config');
} else {
  // 从根目录调用：使用根目录的 package.json 和 src/config
  packageJsonPath = path.join(rootDir, 'package.json');
  buildInfoDir = path.join(rootDir, 'src', 'config');
}

// 读取 package.json 获取版本名
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const buildVersion = packageJson.version || '1.0.0';

// 生成构建信息文件内容
const buildInfoContent = `// 构建信息 - 此文件在构建时自动生成
// 请勿手动修改此文件
// 构建版本号格式与 android/app/build.gradle 中的 versionCode 规则一致

export const BUILD_VERSION = '${buildVersion}'; // 版本名（例如：1.0.0）
export const BUILD_VERSION_CODE = '${buildVersionCode}'; // 构建版本号（MMddHHmm格式，例如：11251430）
export const BUILD_DATE = '${buildDateFormatted}'; // 构建时间（易读格式：YYYY-MM-DD HH:mm）
`;

// 确保目录存在
if (!fs.existsSync(buildInfoDir)) {
  fs.mkdirSync(buildInfoDir, { recursive: true });
}

// 写入文件
const buildInfoPath = path.join(buildInfoDir, 'BuildInfo.js');
fs.writeFileSync(buildInfoPath, buildInfoContent, 'utf8');

console.log(`✅ 构建信息已生成:`);
console.log(`   版本名: ${buildVersion}`);
console.log(`   构建版本号: ${buildVersionCode} (${buildDateFormatted})`);

