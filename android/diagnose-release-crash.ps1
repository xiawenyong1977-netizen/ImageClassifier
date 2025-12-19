# 诊断 Release 版本闪退问题
# 使用方法: .\diagnose-release-crash.ps1

param(
    [switch]$SaveLogs = $false,
    [string]$LogFile = "crash_log_$(Get-Date -Format 'yyyyMMdd_HHmmss').txt"
)

Write-Host "🔍 Release 版本闪退诊断工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检查 adb 是否可用
$adbPath = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbPath) {
    Write-Host "❌ 错误: 未找到 adb 命令" -ForegroundColor Red
    Write-Host "   请确保 Android SDK Platform Tools 已添加到 PATH" -ForegroundColor Yellow
    exit 1
}

# 检查设备连接
Write-Host "`n[1/6] 检查设备连接..." -ForegroundColor Yellow
$devices = adb devices | Select-String -Pattern "device$"
if ($devices.Count -eq 0) {
    Write-Host "❌ 错误: 未检测到已连接的设备" -ForegroundColor Red
    Write-Host "   请确保设备已通过 USB 连接并启用 USB 调试" -ForegroundColor Yellow
    exit 1
}
Write-Host "✅ 找到设备: $($devices.Count) 个" -ForegroundColor Green

# 检查应用是否已安装
Write-Host "`n[2/6] 检查应用安装状态..." -ForegroundColor Yellow
$packageName = "com.imageclassifier.v2"
$installed = adb shell pm list packages | Select-String -Pattern $packageName
if ($installed) {
    Write-Host "✅ 应用已安装: $packageName" -ForegroundColor Green
    
    # 获取应用版本信息
    $versionInfo = adb shell dumpsys package $packageName | Select-String -Pattern "versionName|versionCode"
    if ($versionInfo) {
        Write-Host "   版本信息:" -ForegroundColor Gray
        $versionInfo | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    }
} else {
    Write-Host "⚠️ 应用未安装" -ForegroundColor Yellow
    Write-Host "   请先安装 Release APK" -ForegroundColor Gray
}

# 清除旧日志
Write-Host "`n[3/6] 清除旧日志..." -ForegroundColor Yellow
adb logcat -c | Out-Null
Write-Host "✅ 日志已清除" -ForegroundColor Green

# 启动应用并捕获日志
Write-Host "`n[4/6] 准备捕获崩溃日志..." -ForegroundColor Yellow
Write-Host "   请手动启动应用（如果应用已安装）" -ForegroundColor Gray
Write-Host "   或运行: adb shell am start -n $packageName/.MainActivity" -ForegroundColor Gray
Write-Host "`n   等待 10 秒后开始捕获日志..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host "`n[5/6] 捕获崩溃日志（30秒）..." -ForegroundColor Yellow
Write-Host "   正在监控应用崩溃..." -ForegroundColor Gray

if ($SaveLogs) {
    Write-Host "   日志将保存到: $LogFile" -ForegroundColor Cyan
    $logContent = adb logcat -d -s ReactNativeJS:E ReactNative:E AndroidRuntime:E *:F | Out-String
    $logContent | Out-File -FilePath $LogFile -Encoding UTF8
    Write-Host "✅ 日志已保存到文件" -ForegroundColor Green
} else {
    Write-Host "`n=== 崩溃日志（最近30秒）===" -ForegroundColor Cyan
    adb logcat -d -s ReactNativeJS:E ReactNative:E AndroidRuntime:E *:F
    Write-Host "`n=== 日志结束 ===" -ForegroundColor Cyan
}

# 检查常见问题
Write-Host "`n[6/6] 检查常见问题..." -ForegroundColor Yellow

# 检查权限
Write-Host "`n检查权限状态:" -ForegroundColor Cyan
$permissions = @(
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.POST_NOTIFICATIONS"
)

foreach ($perm in $permissions) {
    $result = adb shell dumpsys package $packageName | Select-String -Pattern $perm
    if ($result) {
        Write-Host "   ✅ $perm" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ $perm (未找到)" -ForegroundColor Yellow
    }
}

# 检查签名
Write-Host "`n检查 APK 签名:" -ForegroundColor Cyan
$apkPath = adb shell pm path $packageName | ForEach-Object { $_ -replace "package:", "" }
if ($apkPath) {
    Write-Host "   APK 路径: $apkPath" -ForegroundColor Gray
    $signInfo = adb shell "apksigner verify --print-certs $apkPath" 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ APK 已正确签名" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ APK 签名验证失败或未签名" -ForegroundColor Yellow
    }
}

# 检查 ProGuard
Write-Host "`n检查构建配置:" -ForegroundColor Cyan
$buildGradle = Get-Content "app\build.gradle" -ErrorAction SilentlyContinue
if ($buildGradle) {
    $proguardEnabled = $buildGradle | Select-String -Pattern "enableProguardInReleaseBuilds\s*=\s*true"
    if ($proguardEnabled) {
        Write-Host "   ⚠️ ProGuard 已启用（可能导致类找不到）" -ForegroundColor Yellow
    } else {
        Write-Host "   ✅ ProGuard 已禁用" -ForegroundColor Green
    }
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "✅ 诊断完成" -ForegroundColor Green
Write-Host "`n建议检查:" -ForegroundColor Yellow
Write-Host "1. 查看上面的崩溃日志，查找 'FATAL EXCEPTION' 或 'AndroidRuntime'" -ForegroundColor White
Write-Host "2. 检查是否有 'ClassNotFoundException' 或 'NoSuchMethodError'" -ForegroundColor White
Write-Host "3. 检查是否有权限相关错误" -ForegroundColor White
Write-Host "4. 检查是否有原生模块加载失败" -ForegroundColor White
Write-Host "`n查看完整日志:" -ForegroundColor Cyan
Write-Host "  adb logcat -d > full_log.txt" -ForegroundColor Gray
Write-Host "`n实时监控日志:" -ForegroundColor Cyan
Write-Host "  .\view-release-js-logs.ps1" -ForegroundColor Gray

