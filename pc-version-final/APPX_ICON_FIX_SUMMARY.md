# APPX 图标打包问题修复总结

## 问题描述
图标文件无法被打包进 APPX 文件中。

## 根本原因
1. `afterPack` 钩子执行时，图标文件可能没有被正确复制到打包目录
2. 图标文件路径在 manifest 中使用了反斜杠，不符合 XML 标准
3. 缺少递归复制逻辑，无法处理子目录中的图标文件

## 修复方案

### 1. 简化目录结构
- 将 `appx-icons` 目录重命名为 `images`，符合 Windows APPX 标准
- 图标文件现在直接放在 `images` 目录中，electron-builder 会自动打包

### 2. 更新 `package.json`
- 在 `files` 配置中使用 `"images/**/*"`，确保图标文件被包含在打包中
- 保持 `afterPack` 钩子配置为 `"./copy-appx-icons.js"`（现在只用于更新 manifest）

### 3. 简化 `copy-appx-icons.js` 脚本
- **移除文件复制逻辑**：图标文件已通过 `files` 配置自动打包，无需手动复制
- **路径标准化**：将所有 manifest 中的反斜杠路径替换为正斜杠（XML 标准）
- **文件验证**：验证图标文件是否已正确打包

### 3. 图标文件要求
必需的图标文件：
- `StoreLogo.png` - 应用商店图标
- `Square44x44Logo.png` - 小图标
- `Square150x150Logo.png` - 中等图标
- `Wide310x150Logo.png` - 宽磁贴图标
- `Square310x310Logo.png` - 大磁贴图标

支持的文件格式：
- 基础文件：`LogoName.png`
- Scale 文件：`LogoName.scale-100.png`, `LogoName.scale-200.png`

## 打包流程

1. **electron-builder 准备文件**
   - 根据 `files` 配置，将 `images/**/*` 复制到打包目录的 `images` 目录
   - 图标文件保持原有目录结构，无需额外处理

2. **执行 `afterPack` 钩子**
   - 更新 `AppxManifest.xml`，确保所有图标路径使用正斜杠（XML 标准）
   - 验证所有必需的图标文件是否已正确打包

3. **创建 APPX 文件**
   - electron-builder 将打包目录中的所有文件（包括 `images` 目录）打包成 APPX 文件

## 验证方法

打包完成后，可以：
1. 解压 APPX 文件（将 `.appx` 重命名为 `.zip` 并解压）
2. 检查 `images` 目录中是否包含所有图标文件
3. 检查 `AppxManifest.xml` 中的图标路径是否正确

## 注意事项

1. **图标文件位置**：图标文件应放在 `images` 目录中（项目根目录下）
2. **文件命名**：确保图标文件命名符合 Windows APPX 要求
3. **路径格式**：manifest 中使用正斜杠 `/`，而不是反斜杠 `\`
4. **Scale 文件**：如果使用 scale 文件（如 `scale-100`, `scale-200`），确保基础文件也存在
5. **简化优势**：现在图标文件直接通过 `files` 配置打包，无需额外的复制步骤

## 相关文件

- `package.json` - electron-builder 配置
- `copy-appx-icons.js` - afterPack 钩子脚本（仅用于更新 manifest）
- `images/` - 图标源文件目录（已从 `appx-icons` 重命名）
- `appx-extensions/Package.appxmanifest` - APPX manifest 模板（参考）

## 测试建议

1. 运行打包命令：`npm run electron-pack-appx`
2. 检查控制台输出，确认图标文件已复制
3. 解压生成的 APPX 文件，验证图标文件是否存在
4. 安装 APPX 包，检查应用图标是否正确显示

