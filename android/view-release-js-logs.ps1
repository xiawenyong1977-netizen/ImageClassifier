# 查看 Release 版本 JS 日志脚本
# 使用方法: .\view-release-js-logs.ps1

param(
    [switch]$SaveToFile = $false,
    [string]$OutputFile = "release_js_log_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    [string]$Filter = ""
)

Write-Host "📱 查看 Release 版本 JS 日志" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

# 检查 adb 是否可用
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ 错误: 未找到 adb 命令" -ForegroundColor Red
    Write-Host "   请确保 Android SDK Platform Tools 已添加到 PATH" -ForegroundColor Yellow
    exit 1
}

# 检查设备连接
Write-Host "检查设备连接..." -ForegroundColor Cyan
$devices = adb devices | Select-String -Pattern "device$"
if ($devices.Count -eq 0) {
    Write-Host "❌ 错误: 未检测到已连接的设备" -ForegroundColor Red
    Write-Host "   请确保设备已通过 USB 连接并启用 USB 调试" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 找到设备: $($devices.Count) 个" -ForegroundColor Green

# 清除旧日志
Write-Host "清除旧日志..." -ForegroundColor Cyan
adb logcat -c | Out-Null

Write-Host "`n日志标签说明:" -ForegroundColor Yellow
Write-Host "  ReactNativeJS - React Native JS 层日志" -ForegroundColor White
Write-Host "  ReactNative  - React Native 原生层日志" -ForegroundColor White
Write-Host "  GalleryScanService - 原生扫描服务日志" -ForegroundColor White
Write-Host ""

if ($Filter) {
    Write-Host "过滤关键词: $Filter" -ForegroundColor Cyan
}

if ($SaveToFile) {
    Write-Host "开始记录日志到文件: $OutputFile" -ForegroundColor Yellow
    Write-Host "按 Ctrl+C 停止记录" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Cyan
    
    if ($Filter) {
        adb logcat ReactNativeJS:D ReactNative:D GalleryScanService:D *:S | Select-String $Filter > $OutputFile
    } else {
        adb logcat ReactNativeJS:D ReactNative:D GalleryScanService:D *:S > $OutputFile
    }
} else {
    Write-Host "开始实时显示日志（按 Ctrl+C 停止）" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "提示:" -ForegroundColor Yellow
    Write-Host "  - 只显示 ReactNativeJS、ReactNative 和 GalleryScanService 标签" -ForegroundColor Gray
    Write-Host "  - 使用 -Filter 参数可以过滤特定关键词" -ForegroundColor Gray
    Write-Host "  - 使用 -SaveToFile 参数可以保存到文件" -ForegroundColor Gray
    Write-Host ""
    Write-Host "示例命令:" -ForegroundColor Yellow
    Write-Host "  .\view-release-js-logs.ps1 -Filter 'error|warn'" -ForegroundColor White
    Write-Host "  .\view-release-js-logs.ps1 -SaveToFile" -ForegroundColor White
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($Filter) {
        adb logcat ReactNativeJS:D ReactNative:D GalleryScanService:D *:S | Select-String $Filter
    } else {
        adb logcat ReactNativeJS:D ReactNative:D GalleryScanService:D *:S
    }
}

