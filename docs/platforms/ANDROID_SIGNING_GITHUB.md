# Android 签名构建配置指南（GitHub Actions）

## 一、本地签名配置

### 1.1 签名密钥文件位置

本地签名密钥通常存储在：
- **Windows**: `android/android-release-key.keystore` 或 `android/app/release.keystore`
- **macOS/Linux**: `android/android-release-key.keystore` 或 `android/app/release.keystore`

### 1.2 签名配置信息

签名配置通常包含以下信息：
- **密钥库文件路径** (`storeFile`)
- **密钥库密码** (`storePassword`)
- **密钥别名** (`keyAlias`)
- **密钥密码** (`keyPassword`)

### 1.3 当前 build.gradle 配置

当前 `android/app/build.gradle` 中的签名配置被注释掉了，release 构建不会自动签名。

## 二、GitHub Actions 签名配置

### 2.1 配置 GitHub Secrets

在 GitHub 仓库中配置以下 Secrets（Settings → Secrets and variables → Actions → New repository secret）：

**⚠️ 重要：Secret 命名规则**
- 只能包含字母数字字符（[a-z], [A-Z], [0-9]）或下划线（_）
- 不能包含空格、连字符或其他特殊字符
- 必须以字母（[a-z], [A-Z]）或下划线（_）开头
- 示例：`ANDROID_KEYSTORE_BASE64` ✓ | `ANDROID-KEYSTORE-BASE64` ✗ | `ANDROID KEYSTORE BASE64` ✗

#### 必需的 Secrets：

1. **ANDROID_KEYSTORE_BASE64**
   - 描述：签名密钥库文件的 Base64 编码
   - 生成方法：
     ```bash
     # Windows PowerShell
     [Convert]::ToBase64String([IO.File]::ReadAllBytes("android/android-release-key.keystore")) | Out-File -Encoding ASCII keystore-base64.txt
     
     # macOS/Linux
     base64 -i android/android-release-key.keystore -o keystore-base64.txt
     ```
   - 然后将文件内容复制到 Secret

2. **ANDROID_KEYSTORE_PASSWORD**
   - 描述：密钥库密码
   - 类型：字符串（明文）

3. **ANDROID_KEY_ALIAS**
   - 描述：密钥别名
   - 类型：字符串（通常是 `release-key` 或 `key0`）

4. **ANDROID_KEY_PASSWORD**
   - 描述：密钥密码（如果与密钥库密码相同，可以设置为相同的值）
   - 类型：字符串（明文）

### 2.2 更新 build.gradle

在 `android/app/build.gradle` 中添加签名配置：

```gradle
android {
    // ... 其他配置 ...
    
    signingConfigs {
        release {
            if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
                storeFile file(MYAPP_RELEASE_STORE_FILE)
                storePassword MYAPP_RELEASE_STORE_PASSWORD
                keyAlias MYAPP_RELEASE_KEY_ALIAS
                keyPassword MYAPP_RELEASE_KEY_PASSWORD
            }
        }
    }
    
    buildTypes {
        release {
            // ... 其他配置 ...
            signingConfig signingConfigs.release
        }
    }
}
```

### 2.3 更新 GitHub Actions 工作流

在 `.github/workflows/android-build.yml` 中添加签名步骤：

```yaml
- name: Setup signing
  run: |
    echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > android/app/release.keystore
    
- name: Build Android Release APK
  run: |
    cd android
    ./gradlew clean
    ./gradlew assembleRelease --no-daemon \
      -PMYAPP_RELEASE_STORE_FILE=app/release.keystore \
      -PMYAPP_RELEASE_STORE_PASSWORD="${{ secrets.ANDROID_KEYSTORE_PASSWORD }}" \
      -PMYAPP_RELEASE_KEY_ALIAS="${{ secrets.ANDROID_KEY_ALIAS }}" \
      -PMYAPP_RELEASE_KEY_PASSWORD="${{ secrets.ANDROID_KEY_PASSWORD }}"
  env:
    JAVA_OPTS: '-Xmx2048m'
```

## 三、安全最佳实践

### 3.1 Secrets 管理

1. **不要将密钥文件提交到仓库**
   - 确保 `.gitignore` 中包含 `*.keystore`、`*.jks`
   - 密钥文件只存储在 GitHub Secrets 中

2. **使用强密码**
   - 密钥库密码和密钥密码应该足够复杂
   - 定期轮换密钥（如果可能）

3. **限制访问**
   - 只有必要的团队成员可以访问 Secrets
   - 使用 GitHub 的权限管理功能

### 3.2 密钥文件位置

**本地开发**：
- 密钥文件存储在本地 `android/` 目录
- 不提交到 Git 仓库
- 通过 `.gitignore` 排除

**CI/CD**：
- 密钥文件从 GitHub Secrets 动态生成
- 仅在构建时临时存在
- 构建完成后自动清理

## 四、实施步骤

### 步骤 1：准备密钥文件

1. 如果还没有签名密钥，生成一个：
   ```bash
   keytool -genkeypair -v -storetype PKCS12 \
     -keystore android-release-key.keystore \
     -alias release-key \
     -keyalg RSA -keysize 2048 -validity 10000
   ```

2. 记录以下信息：
   - 密钥库密码
   - 密钥别名
   - 密钥密码

### 步骤 2：配置 GitHub Secrets

1. 进入 GitHub 仓库 → Settings → Secrets and variables → Actions
2. 点击 "New repository secret"
3. 添加以下 Secrets（**注意：名称必须完全匹配，区分大小写**）：
   - **Name**: `ANDROID_KEYSTORE_BASE64` （密钥库 Base64 编码）
   - **Name**: `ANDROID_KEYSTORE_PASSWORD` （密钥库密码，默认：`image123`）
   - **Name**: `ANDROID_KEY_ALIAS` （密钥别名，默认：`imageclassifier`）
   - **Name**: `ANDROID_KEY_PASSWORD` （密钥密码，默认：`image123`）

**⚠️ 命名规则提醒**：
- Secret 名称只能包含字母、数字和下划线
- 不能包含空格、连字符（-）或其他特殊字符
- 必须以字母或下划线开头

### 步骤 3：更新 build.gradle

添加签名配置（见 2.2 节）

### 步骤 4：更新 GitHub Actions 工作流

添加签名步骤（见 2.3 节）

### 步骤 5：测试

1. 推送更改到仓库
2. 触发 GitHub Actions 构建
3. 验证生成的 APK 是否已签名

## 五、验证签名

构建完成后，可以验证 APK 是否已签名：

```bash
# 检查 APK 签名信息
jarsigner -verify -verbose -certs app-release.apk

# 或使用 apksigner（Android SDK 工具）
apksigner verify --verbose app-release.apk
```

## 六、故障排除

### 问题 1：Base64 编码问题

如果 Base64 编码失败，检查：
- 文件路径是否正确
- 文件是否存在
- 编码命令是否正确执行

### 问题 2：签名失败

检查：
- Secrets 是否正确配置（名称必须完全匹配，区分大小写）
- Secret 名称是否符合 GitHub 命名规则（只能包含字母、数字、下划线，不能有空格或连字符）
- 密码是否正确
- 密钥别名是否正确
- build.gradle 中的配置是否正确

### 问题 3：APK 未签名

检查：
- `buildTypes.release.signingConfig` 是否设置
- Gradle 属性是否正确传递
- 构建日志中是否有签名相关的错误

## 七、参考资源

- [React Native Android 签名文档](https://reactnative.dev/docs/signed-apk-android)
- [Android 应用签名](https://developer.android.com/studio/publish/app-signing)
- [GitHub Actions Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
