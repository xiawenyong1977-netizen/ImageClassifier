@echo off
chcp 65001 >nul
echo 🚀 开始一键构建并签名Release APK...

echo.
echo 📦 步骤1: 构建Release版本...
call gradlew clean
if errorlevel 1 (
    echo ❌ 清理失败
    pause
    exit /b 1
)

call gradlew assembleRelease
if errorlevel 1 (
    echo ❌ 构建失败
    pause
    exit /b 1
)

echo ✅ Release版本构建成功

echo.
echo 🔐 步骤2: 自动签名...
powershell -ExecutionPolicy Bypass -File "sign-release-apk.ps1"
if errorlevel 1 (
    echo ❌ 签名失败
    pause
    exit /b 1
)

echo.
echo 🎉 完整流程完成!
echo 📱 可安装的APK: app\build\outputs\apk\release\app-release-signed.apk
pause
