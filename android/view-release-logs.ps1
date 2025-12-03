# 查看 Release 版本日志脚本
# 使用方法: .\view-release-logs.ps1

param(
    [switch]$SaveToFile = $false,
    [string]$OutputFile = "release_log_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
)

Write-Host "📱 查看 Release 版本日志" -ForegroundColor Green
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

if ($SaveToFile) {
    Write-Host "开始记录日志到文件: $OutputFile" -ForegroundColor Yellow
    Write-Host "按 Ctrl+C 停止记录" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Cyan
    adb logcat -s GalleryScanService:D *:S > $OutputFile
} else {
    Write-Host "开始实时显示日志（按 Ctrl+C 停止）" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "过滤标签: GalleryScanService" -ForegroundColor Gray
    Write-Host "查看所有日志: adb logcat" -ForegroundColor Gray
    Write-Host "查看错误日志: adb logcat *:E" -ForegroundColor Gray
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 实时显示日志，只显示 GalleryScanService 标签
    adb logcat -s GalleryScanService:D *:S
}

