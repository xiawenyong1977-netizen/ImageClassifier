# 路径长度检查报告

## 检查时间
2025-12-18

## 检查结果总结

### 1. onnxruntime-node 目录
- **基础路径长度**: 114 字符
- **总文件数**: 39
- **最长路径**: 167 字符
- **最短路径**: 127 字符
- **平均路径**: 143.59 字符
- **超过260字符的文件**: 0 ✅

**结论**: `onnxruntime-node` 目录下的文件路径都在安全范围内，最长路径距离260字符限制还有93字符的余量。

### 2. 整个 win-unpacked 目录
- **基础路径长度**: 56 字符
- **总文件数**: 3451
- **最长路径**: 256 字符 ⚠️
- **最短路径**: 67 字符
- **平均路径**: 165.12 字符
- **超过260字符的文件**: 0 ✅

**最长路径示例**:
```
.\resources\app.asar.unpacked\node_modules\react-native\ReactCommon\react\renderer\components\textinput\androidtextinput\react\renderer\components\androidtextinput\AndroidTextInputComponentDescriptor.h
```
长度: 256 字符（距离260字符限制仅差4字符）

**路径深度分析**:
- 最大深度: 17 层
- 平均深度: 9.48 层
- 最深路径来自 `react-native` 的深层嵌套文件

## 潜在问题分析

### ⚠️ 风险点
虽然当前文件路径没有超过260字符，但存在以下风险：

1. **WACK 临时目录路径**
   - WACK 测试时会在临时目录解压 APPX
   - 临时目录路径通常类似：`C:\Users\用户名\AppData\Local\Temp\...`
   - 如果临时目录路径 + 文件路径 > 260，会导致失败

2. **最长路径已接近限制**
   - 最长路径为 256 字符，距离限制仅 4 字符
   - 如果 WACK 临时目录路径超过 4 字符，就会失败

### 示例计算
假设 WACK 临时目录路径为：
```
C:\Users\Administrator\AppData\Local\Temp\WinAppCertKit_xxxxx\
```
长度约为 50 字符

加上最长文件路径（256字符）：
- 总长度 ≈ 306 字符 ❌ **超过260字符限制**

## 解决方案

### 方案1: 使用短路径目录（推荐）✅
使用 `prepare-for-wack.ps1` 脚本将 APPX 复制到短路径：
```powershell
.\prepare-for-wack.ps1
```
这会复制到 `C:\WACK\`，路径更短。

### 方案2: 排除不必要的文件
在 `package.json` 中配置排除深层嵌套的文件：
```json
{
  "build": {
    "files": [
      "build/**/*",
      "public/**/*",
      "node_modules/**/*",
      "!node_modules/react-native/**/*.h",
      "!node_modules/react-native/**/*.cpp",
      "!node_modules/react-native/**/android/**",
      "!node_modules/react-native/**/ios/**"
    ]
  }
}
```

### 方案3: 启用 Windows 长路径支持
需要管理员权限：
```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```
重启后生效。

### 方案4: 优化 react-native 打包
由于最长路径来自 `react-native`，可以考虑：
- 只打包必要的 react-native 文件
- 使用 `react-native-web` 替代完整的 `react-native`（如果可能）

## 建议

1. **立即行动**: 使用 `prepare-for-wack.ps1` 将 APPX 复制到短路径进行测试
2. **长期优化**: 考虑排除不必要的 react-native 文件，减少包大小和路径长度
3. **监控**: 定期运行 `check-path-length.ps1` 检查路径长度

## 相关文件

- `check-path-length.ps1` - 路径长度检查脚本
- `prepare-for-wack.ps1` - 为 WACK 准备 APPX 文件
- `WACK_TEST_GUIDE.md` - WACK 测试指南





