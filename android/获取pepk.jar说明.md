# 如何获取 pepk.jar 文件

## 📋 说明

`pepk.jar` 是华为提供的用于打包加密签名密钥的工具，**不在项目代码库中**，需要单独下载。

---

## 🔍 获取方式

### 方式1：从 AppGallery Connect 下载（推荐）

1. **登录 AppGallery Connect**
   - 访问：https://developer.huawei.com/consumer/cn/service/josp/agc/index.html

2. **进入应用详情**
   - 我的应用 → [您的应用] → 版本信息

3. **查找下载入口**
   - 在"签名密钥管理"或"应用签名"页面
   - 查找"工具下载"、"下载pepk.jar"或"应用签名工具"链接
   - 或在帮助文档中查找下载链接

4. **下载文件**
   - 点击下载链接
   - 保存 `pepk.jar` 文件

5. **放置到项目目录**
   ```powershell
   # 将下载的pepk.jar复制到android目录
   Copy-Item "下载路径\pepk.jar" "D:\ImageClassifierApp\android\"
   ```

### 方式2：从华为开发者文档下载

1. **访问华为开发者文档**
   - 搜索"应用签名"或"pepk.jar"
   - 查找相关文档页面

2. **查找下载链接**
   - 文档中通常有pepk.jar的下载链接
   - 或提供获取方式说明

### 方式3：联系华为开发者支持

如果以上方式都无法获取：

1. **在 AppGallery Connect 中**
   - 查找"帮助中心"或"联系支持"
   - 提交工单或咨询客服

2. **说明需求**
   - 需要pepk.jar工具用于应用签名
   - 提供应用信息

---

## ⚠️ 如果暂时无法获取pepk.jar

### 推荐方案：使用方式一（最简单）

如果暂时无法获取pepk.jar，建议使用**方式一**（由AGC创建并管理签名密钥）：

**操作步骤**：

1. **登录 AppGallery Connect**
2. **创建应用**（如果还没有）
3. **直接上传APK**
   - 版本信息 → 新建版本
   - 上传APK（未签名或debug签名都可以）
4. **AGC自动处理**
   - 系统会自动生成签名密钥
   - 自动签名您的APK
5. **完成上架**

**优点**：
- ✅ 无需pepk.jar
- ✅ 无需手动签名
- ✅ 操作最简单
- ✅ AGC自动管理密钥

**后续如果需要pepk.jar**：
- 可以在应用上线后，在AGC控制台查找下载
- 或联系华为支持获取

---

## 📝 使用pepk.jar（如果已获取）

如果已经获取了pepk.jar：

```powershell
# 1. 将pepk.jar放到android目录
# 确保文件路径：D:\ImageClassifierApp\android\pepk.jar

# 2. 打包签名密钥
cd android
.\package-sign-key-for-agc.ps1 -KeystorePath "android-release-key.keystore" -Alias "imageclassifier"

# 3. 上传生成的sign.zip到AGC
```

---

## 🔍 验证pepk.jar是否正确

下载pepk.jar后，可以验证：

```powershell
cd android

# 检查文件是否存在
Test-Path pepk.jar

# 查看文件信息
Get-Item pepk.jar | Select-Object Name, Length, LastWriteTime

# 测试运行（查看帮助信息）
java -jar pepk.jar --help
```

如果pepk.jar正确，运行帮助命令应该显示使用说明。

---

## 📞 需要帮助？

如果仍然无法获取pepk.jar：

1. **检查 AppGallery Connect 权限**
   - 确保已创建应用
   - 确保账户有相应权限

2. **查看应用状态**
   - 某些功能可能需要在应用创建后才能使用

3. **联系华为支持**
   - 在AGC页面查找支持联系方式
   - 说明需要pepk.jar用于应用签名

---

**最后更新**：2025-01-24

