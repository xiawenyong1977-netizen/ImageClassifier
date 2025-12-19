# 获取完整的崩溃日志
# 使用方法: .\get-full-crash-log.ps1 [选项]

param(
    [switch]$ClearFirst = $false,
    [switch]$SaveToFile = $true,
    [string]$OutputFile = "crash_log_full_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt",
    [int]$Duration = 60,
    [string]$PackageName = "com.imageclassifier.v2"
)

Write-Host "📱 获取完整崩溃日志工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检查 adb 是否可用
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ 错误: 未找到 adb 命令" -ForegroundColor Red
    Write-Host "   请确保 Android SDK Platform Tools 已添加到 PATH" -ForegroundColor Yellow
    exit 1
}

# 检查设备连接
Write-Host "`n[1/4] 检查设备连接..." -ForegroundColor Yellow
$devices = adb devices | Select-String -Pattern "device$"
if ($devices.Count -eq 0) {
    Write-Host "❌ 错误: 未检测到已连接的设备" -ForegroundColor Red
    Write-Host "   请确保设备已通过 USB 连接并启用 USB 调试" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ 找到设备: $($devices.Count) 个" -ForegroundColor Green

# 清除旧日志（可选）
if ($ClearFirst) {
    Write-Host "`n[2/4] 清除旧日志..." -ForegroundColor Yellow
    adb logcat -c | Out-Null
    Write-Host "✅ 日志已清除" -ForegroundColor Green
} else {
    Write-Host "`n[2/4] 跳过清除日志（保留历史记录）" -ForegroundColor Gray
}

# 获取应用 PID（如果应用正在运行）
Write-Host "`n[3/4] 查找应用进程..." -ForegroundColor Yellow
$pidInfo = adb shell "ps | grep $PackageName" | Select-String -Pattern $PackageName
if ($pidInfo) {
    $pid = ($pidInfo -split '\s+')[1]
    Write-Host "✅ 找到应用进程 PID: $pid" -ForegroundColor Green
} else {
    Write-Host "⚠️ 应用未运行，将捕获所有相关日志" -ForegroundColor Yellow
    $pid = $null
}

# 开始捕获日志
Write-Host "`n[4/4] 开始捕获日志..." -ForegroundColor Yellow
Write-Host "   持续时间: $Duration 秒" -ForegroundColor Gray
Write-Host "   应用包名: $PackageName" -ForegroundColor Gray

if ($SaveToFile) {
    Write-Host "   输出文件: $OutputFile" -ForegroundColor Cyan
    Write-Host "`n提示: 请启动应用或触发崩溃，日志将自动保存到文件" -ForegroundColor Yellow
    Write-Host "按 Ctrl+C 提前停止捕获`n" -ForegroundColor Gray
    
    # 捕获所有相关日志
    # 包括：ReactNativeJS, ReactNative, AndroidRuntime, 应用包名相关的日志
    $logFilter = "ReactNativeJS:D ReactNative:D AndroidRuntime:E *:F $PackageName:D"
    
    # 启动后台任务捕获日志
    $job = Start-Job -ScriptBlock {
        param($filter, $file)
        adb logcat -d $filter > $file 2>&1
    } -ArgumentList $logFilter, $OutputFile
    
    # 同时实时显示关键错误
    Write-Host "实时显示关键错误（完整日志保存到文件）..." -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    # 实时显示错误日志
    adb logcat -v time ReactNativeJS:E ReactNative:E AndroidRuntime:E *:F | Tee-Object -Variable logOutput
    
    # 等待指定时间或手动停止
    Start-Sleep -Seconds $Duration
    
    # 停止后台任务
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -ErrorAction SilentlyContinue
    
    Write-Host "`n✅ 日志已保存到: $OutputFile" -ForegroundColor Green
    
    # 显示文件大小
    if (Test-Path $OutputFile) {
        $fileSize = (Get-Item $OutputFile).Length
        $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
        Write-Host "   文件大小: $fileSizeMB MB" -ForegroundColor Gray
    }
} else {
    Write-Host "`n实时显示日志（按 Ctrl+C 停止）..." -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    
    # 实时显示所有相关日志
    adb logcat -v time ReactNativeJS:D ReactNative:D AndroidRuntime:E *:F $PackageName:D
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ 完成" -ForegroundColor Green
Write-Host "`n提示:" -ForegroundColor Yellow
Write-Host "  - 查看完整日志: Get-Content $OutputFile" -ForegroundColor Gray
Write-Host "  - 搜索错误: Select-String -Path $OutputFile -Pattern 'FATAL|Error|Exception'" -ForegroundColor Gray
Write-Host "  - 查看最近的崩溃: Select-String -Path $OutputFile -Pattern 'FATAL EXCEPTION' -Context 0,50" -ForegroundColor Gray

