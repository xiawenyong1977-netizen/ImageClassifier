# 分析崩溃日志，提取关键信息
# 使用方法: .\analyze-crash-log.ps1 [日志文件路径]

param(
    [string]$LogFile = ""
)

Write-Host "🔍 崩溃日志分析工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 如果没有指定文件，查找最新的日志文件
if ([string]::IsNullOrEmpty($LogFile)) {
    Write-Host "正在查找最新的崩溃日志文件..." -ForegroundColor Yellow
    $logFiles = Get-ChildItem -Path $PSScriptRoot -Filter "crash_log*.txt" -ErrorAction SilentlyContinue | 
                Sort-Object LastWriteTime -Descending
    
    if ($logFiles -and $logFiles.Count -gt 0) {
        $LogFile = $logFiles[0].FullName
        Write-Host "找到日志文件: $LogFile" -ForegroundColor Green
    } else {
        Write-Host "❌ 未找到日志文件" -ForegroundColor Red
        Write-Host "请先运行: .\get-full-crash-log.ps1" -ForegroundColor Yellow
        exit 1
    }
}

if (-not (Test-Path $LogFile)) {
    Write-Host "❌ 日志文件不存在: $LogFile" -ForegroundColor Red
    exit 1
}

Write-Host "`n分析日志文件: $LogFile" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 读取日志文件
$logContent = Get-Content $LogFile -Raw

# 1. 查找 FATAL EXCEPTION
Write-Host "`n[1/6] 查找致命异常 (FATAL EXCEPTION)..." -ForegroundColor Yellow
$fatalExceptions = [regex]::Matches($logContent, 'FATAL EXCEPTION.*?(?=\n\n|\n[A-Z]|\Z)', [System.Text.RegularExpressions.RegexOptions]::Singleline)
if ($fatalExceptions.Count -gt 0) {
    Write-Host "✅ 找到 $($fatalExceptions.Count) 个致命异常" -ForegroundColor Red
    foreach ($match in $fatalExceptions) {
        Write-Host "`n--- 致命异常 ---" -ForegroundColor Red
        $lines = $match.Value -split "`n" | Select-Object -First 30
        $lines | ForEach-Object { Write-Host $_ -ForegroundColor Gray }
    }
} else {
    Write-Host "⚠️ 未找到致命异常" -ForegroundColor Yellow
}

# 2. 查找 ReactNativeJS 错误
Write-Host "`n[2/6] 查找 ReactNativeJS 错误..." -ForegroundColor Yellow
$rnjsErrors = Select-String -Path $LogFile -Pattern "ReactNativeJS.*Error" -AllMatches
if ($rnjsErrors) {
    Write-Host "✅ 找到 $($rnjsErrors.Count) 个 ReactNativeJS 错误" -ForegroundColor Red
    $rnjsErrors | Select-Object -First 10 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️ 未找到 ReactNativeJS 错误" -ForegroundColor Yellow
}

# 3. 查找 require undefined 错误
Write-Host "`n[3/6] 查找 require undefined 错误..." -ForegroundColor Yellow
$requireUndefined = Select-String -Path $LogFile -Pattern "Requiring unknown module.*undefined" -AllMatches
if ($requireUndefined) {
    Write-Host "✅ 找到 $($requireUndefined.Count) 个 require undefined 错误" -ForegroundColor Red
    $requireUndefined | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️ 未找到 require undefined 错误" -ForegroundColor Yellow
}

# 4. 查找 ClassNotFoundException
Write-Host "`n[4/6] 查找类未找到错误..." -ForegroundColor Yellow
$classNotFound = Select-String -Path $LogFile -Pattern "ClassNotFoundException|NoClassDefFoundError" -AllMatches
if ($classNotFound) {
    Write-Host "✅ 找到 $($classNotFound.Count) 个类未找到错误" -ForegroundColor Red
    $classNotFound | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️ 未找到类未找到错误" -ForegroundColor Yellow
}

# 5. 查找权限错误
Write-Host "`n[5/6] 查找权限错误..." -ForegroundColor Yellow
$permissionErrors = Select-String -Path $LogFile -Pattern "Permission.*denied|SecurityException" -AllMatches
if ($permissionErrors) {
    Write-Host "✅ 找到 $($permissionErrors.Count) 个权限错误" -ForegroundColor Red
    $permissionErrors | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️ 未找到权限错误" -ForegroundColor Yellow
}

# 6. 查找原生模块错误
Write-Host "`n[6/6] 查找原生模块错误..." -ForegroundColor Yellow
$nativeErrors = Select-String -Path $LogFile -Pattern "NativeModule|TurboModule|Module.*not found" -AllMatches
if ($nativeErrors) {
    Write-Host "✅ 找到 $($nativeErrors.Count) 个原生模块错误" -ForegroundColor Red
    $nativeErrors | Select-Object -First 10 | ForEach-Object {
        Write-Host "  $_" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️ 未找到原生模块错误" -ForegroundColor Yellow
}

# 总结
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "分析完成" -ForegroundColor Green
Write-Host "`n建议：" -ForegroundColor Yellow
Write-Host "1. 查看完整的致命异常堆栈信息" -ForegroundColor White
Write-Host "2. 检查是否有 require undefined 错误（已修复，但需确认）" -ForegroundColor White
Write-Host "3. 检查是否有原生模块加载失败" -ForegroundColor White
Write-Host "4. 检查是否有权限问题" -ForegroundColor White
Write-Host "`n查看完整日志：" -ForegroundColor Cyan
Write-Host "  Get-Content $LogFile | Select-String -Pattern 'FATAL|Error' -Context 5" -ForegroundColor Gray

