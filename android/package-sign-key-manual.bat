@echo off
REM 手动打包签名密钥脚本
REM 使用方法：运行此脚本，按提示输入密码

echo 🔐 打包签名密钥文件用于上传到AGC...
echo.

REM 设置变量（请根据实际情况修改）
set KEYSTORE=upload-keystore.jks
set ALIAS=upload
set OUTPUT=sign.zip
set ENCRYPTION_KEY=034200041E224EE22B45D19B23DB91BA9F52DE0A06513E03A5821409B34976FDEED6E0A47DBA48CC249DD93734A6C5D9A0F43461F9E140F278A5D2860846C2CF5D2C3C02

REM 查找Java
set JAVA_CMD=java
where java >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 请确保Java已安装并在PATH中
    pause
    exit /b 1
)

REM 检查文件
if not exist "%KEYSTORE%" (
    echo ❌ 未找到密钥文件: %KEYSTORE%
    echo 请修改脚本中的KEYSTORE变量
    pause
    exit /b 1
)

if not exist "pepk.jar" (
    echo ❌ 未找到pepk.jar文件
    echo 请将pepk.jar放到当前目录
    pause
    exit /b 1
)

echo ✅ 准备就绪
echo.
echo 执行命令：
echo java -jar pepk.jar --keystore %KEYSTORE% --alias %ALIAS% --output=%OUTPUT% --encryptionkey=%ENCRYPTION_KEY% --include-cert
echo.
echo ⚠️  接下来会提示输入密码，请输入：
echo    1. 密钥库密码
echo    2. 密钥密码（如果与密钥库密码相同，输入相同密码）
echo.

REM 执行命令（pepk.jar会提示输入密码）
java -jar pepk.jar --keystore %KEYSTORE% --alias %ALIAS% --output=%OUTPUT% --encryptionkey=%ENCRYPTION_KEY% --include-cert

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ 签名密钥打包成功！
    echo 📁 生成的文件: %OUTPUT%
    echo.
    echo 📤 下一步：上传 sign.zip 到 AppGallery Connect
) else (
    echo.
    echo ❌ 打包失败
)

pause

