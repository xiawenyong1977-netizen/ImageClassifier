# WACK 路径过长问题解决方案

## 问题描述

Windows App Certification Kit (WACK) 在测试 APPX 时遇到路径过长错误：
```
System.IO.PathTooLongException: 指定的路径或文件名太长或者两者都太长。
完全限定文件名必须少于 260 个字符并且目录名必须少于 248 个字符。
```

## 问题原因

虽然 APPX 文件本身的路径可能不长，但 WACK 在测试时会：
1. 将 APPX 解压到临时目录（通常是 `C:\Users\用户名\AppData\Local\Temp\...`）
2. 临时目录路径 + APPX 内部文件路径可能超过 260 字符限制

例如：
- 临时目录: `C:\Users\Administrator\AppData\Local\Temp\WinAppCertKit_xxxxx\` (约 50 字符)
- APPX 内部最长路径: 256 字符
- **总长度 ≈ 306 字符** ❌ 超过 260 字符限制

## 解决方案

### 方案1: 直接修改系统环境变量（最简单）✅✅✅

**这是最简单直接的方法！**

1. **打开系统环境变量设置**
   - 右键"此电脑" -> "属性" -> "高级系统设置" -> "环境变量"

2. **修改用户变量**
   - 找到 `TEMP` 变量，修改为: `C:\T`
   - 找到 `TMP` 变量，修改为: `C:\T`

3. **创建目录**
   ```powershell
   New-Item -ItemType Directory -Path "C:\T" -Force
   ```

4. **重启计算机**（使环境变量生效）

5. **完成！** 之后直接运行 Windows App Certification Kit 即可

**优点**: 一次设置，永久有效，不需要任何脚本

**缺点**: 需要重启计算机

详见: `SET_SYSTEM_TEMP.md`

---

### 方案2: 使用短临时目录脚本（临时方案）

运行脚本设置短临时目录：

```powershell
.\run-wack-with-short-temp.ps1
```

脚本会：
1. 自动查找 APPX 文件
2. 设置临时目录为 `C:\T`（短路径）
3. 检查 APPX 内部路径长度
4. 提供使用说明

**注意**: 需要在运行 WACK 的同一 PowerShell 会话中运行此脚本，或者设置系统环境变量。

### 方案2: 设置系统环境变量（永久解决）

1. **打开系统环境变量设置**
   - 右键"此电脑" -> "属性" -> "高级系统设置" -> "环境变量"

2. **修改用户变量**
   - 找到 `TEMP` 变量，修改为: `C:\T`
   - 找到 `TMP` 变量，修改为: `C:\T`

3. **创建目录**
   ```powershell
   New-Item -ItemType Directory -Path "C:\T" -Force
   ```

4. **重启计算机**（使环境变量生效）

5. **运行 WACK**

### 方案3: 在 WACK 启动前设置环境变量

创建一个批处理文件来启动 WACK：

```batch
@echo off
set TEMP=C:\T
set TMP=C:\T
if not exist C:\T mkdir C:\T
start WinAppCertKit.exe
```

### 方案4: 减少 APPX 内部路径长度

如果上述方案都不行，需要减少 APPX 内部文件路径长度：

1. **排除不必要的文件**
   在 `package.json` 中配置：
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

2. **检查路径长度**
   ```powershell
   .\check-path-length.ps1
   ```

## 验证步骤

1. **检查当前临时目录**
   ```powershell
   echo $env:TEMP
   echo $env:TMP
   ```

2. **检查 APPX 路径长度**
   ```powershell
   .\check-path-length.ps1
   ```

3. **运行 WACK 测试**
   - 使用 `run-wack-with-short-temp.ps1` 脚本
   - 或手动设置环境变量后运行 WACK

## 常见问题

### Q: 为什么设置环境变量后还是失败？

**A:** 可能的原因：
1. WACK 在另一个进程中运行，没有读取到新的环境变量
2. 需要重启计算机使系统环境变量生效
3. WACK 可能使用了硬编码的临时目录路径

**解决方案**: 
- 在运行 WACK 的同一 PowerShell 会话中设置环境变量
- 或使用批处理文件启动 WACK

### Q: 可以删除 react-native 的深层文件吗？

**A:** 可以，但需要确保：
1. 这些文件不是运行时必需的
2. 只删除开发文件（.h, .cpp, android/, ios/ 等）
3. 保留运行时需要的文件（.js, .json 等）

### Q: 启用 Windows 长路径支持有用吗？

**A:** 理论上可以，但：
1. WACK 工具本身可能不支持长路径
2. 需要管理员权限
3. 需要重启计算机
4. 不是所有工具都支持长路径

**建议**: 优先使用短临时目录方案。

## 相关文件

- `run-wack-with-short-temp.ps1` - 使用短临时目录运行 WACK
- `prepare-for-wack.ps1` - 准备 APPX 文件到短路径
- `check-path-length.ps1` - 检查路径长度
- `path-length-report.md` - 路径长度检查报告

## 推荐流程（最简单）

1. **修改系统环境变量**（一次设置，永久有效）
   - 打开系统环境变量设置
   - 将 `TEMP` 和 `TMP` 改为 `C:\T`
   - 创建目录: `New-Item -ItemType Directory -Path "C:\T" -Force`
   - 重启计算机

2. **准备 APPX**
   ```powershell
   .\prepare-for-wack.ps1 -Sign
   ```

3. **直接运行 Windows App Certification Kit**
   - 不需要任何脚本
   - 直接打开 WACK 测试即可

**就这么简单！** 🎉

