# MSIX 打包说明

## 📋 准备工作

### 1. 生成测试证书

在 `pc-version-final` 目录下，以**管理员权限**运行 PowerShell：

```powershell
# 允许执行脚本（首次需要）
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# 生成测试证书
.\create-test-certificate.ps1
```

这会生成两个文件：
- `test-certificate.pfx` - 用于签名的证书（包含私钥）
- `test-certificate.cer` - 用于安装的公钥证书

### 2. 安装测试证书

**方法 1（推荐）：使用批处理脚本**

右键点击 `install-test-certificate.bat`，选择"以管理员身份运行"

**方法 2：手动安装**

1. 双击 `test-certificate.cer`
2. 点击"安装证书"
3. 选择"本地计算机"（需要管理员权限）
4. 选择"将所有的证书都放入下列存储"
5. 浏览 -> 选择"受信任的根证书颁发机构"
6. 完成安装

**方法 3：命令行**

以管理员权限运行：
```cmd
certutil -addstore Root "test-certificate.cer"
```

## 🔨 打包步骤

### 1. 切换到项目目录

```cmd
cd d:\ImageClassifierApp\pc-version-final
```

### 2. 安装依赖（如果还没安装）

```cmd
npm install
```

### 3. 构建应用

```cmd
npm run build
```

### 4. 打包为 APPX

```cmd
npm run electron-pack
```

这会同时生成两个版本：
- `dist\芯图相册-智能分类，便捷管理，仅你可见.exe` - Portable 版本
- `dist\芯图相册 1.0.0.appx` - Microsoft Store 版本

### 5. 签名 APPX 包（可选，electron-builder 可能会自动签名）

如果需要手动签名：

```powershell
# 使用 Windows SDK 的 SignTool
# 需要先安装 Windows 10 SDK

$appxPath = "dist\芯图相册 1.0.0.appx"
$pfxPath = "test-certificate.pfx"
$pfxPassword = "test123456"

& "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign `
    /fd SHA256 `
    /a `
    /f $pfxPath `
    /p $pfxPassword `
    $appxPath
```

## 📦 测试安装

### 1. 安装 APPX 包

**方法 1：双击安装**

直接双击 `芯图相册 1.0.0.appx` 文件，Windows 会打开应用安装程序。

**方法 2：PowerShell 安装**

```powershell
Add-AppxPackage -Path "dist\芯图相册 1.0.0.appx"
```

### 2. 运行应用

从开始菜单搜索"芯图相册"，或者运行：

```powershell
explorer shell:AppsFolder\ImageClassifier.App_[版本号]!App
```

### 3. 卸载测试应用

**方法 1：设置中卸载**

设置 -> 应用 -> 应用和功能 -> 找到"芯图相册" -> 卸载

**方法 2：PowerShell 卸载**

```powershell
Get-AppxPackage *ImageClassifier* | Remove-AppxPackage
```

## ⚠️ 常见问题

### 1. 打包失败："没有找到签名证书"

**解决方案：**
- 确保已运行 `create-test-certificate.ps1` 生成证书
- 检查 `test-certificate.pfx` 是否存在

### 2. 安装失败："不能安装此应用包"

**可能原因：**
- 证书没有安装到"受信任的根证书颁发机构"
- 证书的 CN 名称与 package.json 中的 publisher 不匹配

**解决方案：**
- 重新运行 `install-test-certificate.bat`（以管理员权限）
- 确保 `package.json` 中的 `publisher` 是 `CN=ImageClassifier`

### 3. 应用运行时崩溃

**可能原因：**
- 原生模块在 APPX 环境中不兼容
- 文件访问权限问题
- 缺少运行时依赖

**解决方案：**
- 检查 Windows 事件查看器中的错误日志
- 测试原生模块（canvas, sharp, onnxruntime-node）是否正常工作

### 4. 无法访问文件系统

**原因：**
Microsoft Store 应用运行在沙盒环境中，文件访问受限。

**解决方案：**
- 在 `package.json` 的 `appx` 配置中添加文件访问权限
- 或使用 Windows.Storage API 让用户选择文件夹

## 📤 提交到 Microsoft Store

测试成功后，准备提交：

### 1. 注册开发者账号

访问：https://developer.microsoft.com/microsoft-store/register

### 2. 获取正式证书

**选项 1：购买代码签名证书**
- DigiCert：约 $300-400/年
- Sectigo：约 $100-200/年

**选项 2：使用 Partner Center 证书**
- 在 Partner Center 中创建应用时会提供

### 3. 更新 package.json

将测试证书信息替换为正式证书：

```json
"appx": {
  "publisher": "CN=您的正式发布者名称",
  "identityName": "从 Partner Center 获取",
  // ...
}
```

### 4. 重新打包并签名

使用正式证书重新打包：

```cmd
npm run electron-pack
```

### 5. 上传到 Partner Center

1. 登录 Partner Center
2. 创建新提交
3. 上传 APPX 包
4. 填写应用信息、截图等
5. 提交审核

## 🔧 Windows SDK 安装

如果需要手动签名工具 SignTool：

1. 下载 Windows 10 SDK
   https://developer.microsoft.com/windows/downloads/windows-sdk/

2. 安装时只选择"Windows App Certification Kit"

3. SignTool 位置：
   ```
   C:\Program Files (x86)\Windows Kits\10\bin\[版本号]\x64\signtool.exe
   ```

## 📝 注意事项

1. **测试证书仅用于本地测试**
   - 不能用于分发给其他用户
   - 提交到 Microsoft Store 必须使用正式证书

2. **原生模块兼容性**
   - 某些 Node.js 原生模块可能在 APPX 环境中不工作
   - 需要充分测试所有功能

3. **文件访问权限**
   - APPX 应用有严格的沙盒限制
   - 需要声明所有使用的权限

4. **应用大小**
   - 包含所有依赖后，应用可能很大
   - 建议优化依赖，减小包体积

5. **更新机制**
   - Microsoft Store 会自动处理应用更新
   - 不需要自己实现更新功能

## 📚 相关链接

- [Electron Builder APPX 文档](https://www.electron.build/configuration/appx)
- [Microsoft Store 提交指南](https://docs.microsoft.com/windows/uwp/publish/)
- [MSIX 打包工具](https://docs.microsoft.com/windows/msix/packaging-tool/tool-overview)


