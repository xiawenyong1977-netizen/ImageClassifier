#!/usr/bin/env node

/**
 * 生成构建信息文件
 * 在构建时自动生成构建日期
 */

const fs = require('fs');
const path = require('path');

// 获取当前日期，格式：YYYY.MM.DD
const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');
const day = String(now.getDate()).padStart(2, '0');
const buildDate = `${year}.${month}.${day}`;

// 读取 package.json 获取版本号
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const buildVersion = packageJson.version || '1.0.0';

// 生成构建信息文件内容
const buildInfoContent = `// 构建信息 - 此文件在构建时自动生成
// 请勿手动修改此文件

export const BUILD_DATE = '${buildDate}'; // 构建日期，格式：YYYY.MM.DD
export const BUILD_VERSION = '${buildVersion}'; // 版本号
`;

// 确保目录存在
const buildInfoDir = path.join(__dirname, '..', 'src', 'config');
if (!fs.existsSync(buildInfoDir)) {
  fs.mkdirSync(buildInfoDir, { recursive: true });
}

// 写入文件
const buildInfoPath = path.join(buildInfoDir, 'BuildInfo.js');
fs.writeFileSync(buildInfoPath, buildInfoContent, 'utf8');

console.log(`✅ 构建信息已生成: ${buildDate} (版本: ${buildVersion})`);

