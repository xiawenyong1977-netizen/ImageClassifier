# 一键构建并签名Release APK脚本
# 使用方法: .\build-and-sign-release.ps1
# CI 仅构建不签名: .\build-and-sign-release.ps1 -SkipSign

param(
    [switch]$SkipSign
)

Write-Host "🚀 开始一键构建并签名Release APK..." -ForegroundColor Green

# 步骤1: 清理并构建Release版本
Write-Host "`n📦 步骤1: 构建Release版本..." -ForegroundColor Yellow
.\gradlew clean
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 清理失败" -ForegroundColor Red
    exit 1
}

.\gradlew assembleRelease
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 构建失败" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Release版本构建成功" -ForegroundColor Green

if ($SkipSign) {
    Write-Host "`n⏭️ 跳过签名 (CI 模式)" -ForegroundColor Yellow
    Write-Host "📱 未签名APK: app\build\outputs\apk\release\app-release-unsigned.apk" -ForegroundColor Cyan
    exit 0
}

# 步骤2: 自动签名
Write-Host "`n🔐 步骤2: 自动签名..." -ForegroundColor Yellow
.\sign-release-apk.ps1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 签名失败" -ForegroundColor Red
    exit 1
}

Write-Host "`n🎉 完整流程完成!" -ForegroundColor Green
Write-Host "📱 可安装的APK: app\build\outputs\apk\release\app-release-signed.apk" -ForegroundColor Cyan
