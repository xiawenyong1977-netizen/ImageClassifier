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
// 格式：yyMMddHHmm（例如：2511121430 表示 2025年11月12日 14:30）
const year = String(now.getFullYear()).slice(-2); // 年份后两位
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const hour = String(now.getHours()).padStart(2, '0');
const minute = String(now.getMinutes()).padStart(2, '0');
const buildVersionCode = `${year}${month}${day}${hour}${minute}`; // yyMMddHHmm

// 生成易读的构建时间格式（用于显示）
// 格式：YYYY-MM-DD HH:mm（例如：2025-11-12 14:30）
const fullYear = now.getFullYear();
const buildDateFormatted = `${fullYear}-${month}-${day} ${hour}:${minute}`;

// 读取 package.json 获取版本名
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const buildVersion = packageJson.version || '1.0.0';

// 生成构建信息文件内容
const buildInfoContent = `// 构建信息 - 此文件在构建时自动生成
// 请勿手动修改此文件
// 构建版本号格式与 android/app/build.gradle 中的 versionCode 规则一致

export const BUILD_VERSION = '${buildVersion}'; // 版本名（例如：1.0.0）
export const BUILD_VERSION_CODE = '${buildVersionCode}'; // 构建版本号（yyMMddHHmm格式，例如：2511121430）
export const BUILD_DATE = '${buildDateFormatted}'; // 构建时间（易读格式：YYYY-MM-DD HH:mm）
`;

// 确保目录存在
const buildInfoDir = path.join(__dirname, '..', 'src', 'config');
if (!fs.existsSync(buildInfoDir)) {
  fs.mkdirSync(buildInfoDir, { recursive: true });
}

// 写入文件
const buildInfoPath = path.join(buildInfoDir, 'BuildInfo.js');
fs.writeFileSync(buildInfoPath, buildInfoContent, 'utf8');

console.log(`✅ 构建信息已生成:`);
console.log(`   版本名: ${buildVersion}`);
console.log(`   构建版本号: ${buildVersionCode} (${buildDateFormatted})`);

