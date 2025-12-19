# 清理服务器文件脚本
# 功能：清理 /var/www/xintuxiangce/website/dist/ 目录下所有子目录的文件，每个子目录只保留最近的文件
# 使用方法: .\cleanup-server-files.ps1
#
# 参数说明:
#   -ServerHost: 服务器主机名或IP地址 (默认: "web")
#   -ServerUser: 服务器用户名 (默认: "root")
#   -ServerPath: 服务器目标路径 (默认: "/var/www/xintuxiangce/website/dist")    
#   -DryRun: 仅显示将要删除的文件，不实际删除 (默认: false)
#   -KeepCount: 每个子目录保留的文件数量 (默认: 1，即只保留最新的1个文件)
#
# 示例:
#   .\cleanup-server-files.ps1 -DryRun $true                    # 预览模式，不实际删除
#   .\cleanup-server-files.ps1 -KeepCount 2                    # 每个子目录保留最新的2个文件
#   .\cleanup-server-files.ps1 -ServerHost "192.168.1.100"    # 指定服务器

param(
    [string]$ServerHost = "web",
    [string]$ServerUser = "root",
    [string]$ServerPath = "/var/www/xintuxiangce/website/dist",
    [switch]$DryRun = $false,
    [int]$KeepCount = 1
)

$ErrorActionPreference = "Stop"

Write-Host "🧹 服务器文件清理工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "服务器: ${ServerUser}@${ServerHost}" -ForegroundColor Yellow
Write-Host "目标路径: ${ServerPath}" -ForegroundColor Yellow
Write-Host "保留文件数: $KeepCount (每个子目录)" -ForegroundColor Yellow
if ($DryRun) {
    Write-Host "模式: 预览模式（不会实际删除文件）" -ForegroundColor Yellow
} else {
    Write-Host "模式: 执行模式（将实际删除文件）" -ForegroundColor Red
}
Write-Host "========================================`n" -ForegroundColor Cyan

# 检查必要的命令是否可用
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: 未找到命令 'ssh'，请确保已安装 OpenSSH 客户端" -ForegroundColor Red
    exit 1
}

$serverAddress = "${ServerUser}@${ServerHost}"

# 确认操作（非预览模式）
if (-not $DryRun) {
    Write-Host "⚠️  警告: 此操作将删除服务器上的旧文件！" -ForegroundColor Red
    Write-Host "   目标路径: ${ServerPath}" -ForegroundColor Yellow
    Write-Host "   每个子目录将只保留最新的 $KeepCount 个文件" -ForegroundColor Yellow
    Write-Host ""
    $confirm = Read-Host "确认继续? (输入 'YES' 继续)"
    if ($confirm -ne "YES") {
        Write-Host "❌ 用户取消操作" -ForegroundColor Red
        exit 0
    }
}

# 检查目标目录是否存在
Write-Host "`n检查目标目录..." -ForegroundColor Cyan
$dirCheck = ssh "${serverAddress}" "if [ -d '${ServerPath}' ]; then echo 'EXISTS'; else echo 'NOT_FOUND'; fi" 2>&1
$dirCheck = $dirCheck -join "`n"

if ($dirCheck -notmatch "EXISTS") {
    Write-Host "❌ 错误: 目标目录不存在: ${ServerPath}" -ForegroundColor Red
    Write-Host "   检查结果: $dirCheck" -ForegroundColor Gray
    exit 1
}

Write-Host "✓ 目标目录存在" -ForegroundColor Green

# 获取所有子目录（递归，包括嵌套的子目录，如 pc/portable, pc/setup, pc/appx）
Write-Host "`n获取子目录列表..." -ForegroundColor Cyan
# 递归查找所有子目录（不包括根目录本身）
$subdirs = ssh "${serverAddress}" "find '${ServerPath}' -mindepth 1 -type d" 2>&1

if (-not $subdirs -or ($subdirs -match "Permission denied" -or $subdirs -match "No such file")) {
    Write-Host "❌ 错误: 无法访问子目录" -ForegroundColor Red
    Write-Host "   输出: $subdirs" -ForegroundColor Gray
    exit 1
}

$subdirList = $subdirs | Where-Object { $_ -and $_.Trim() -ne "" } | Sort-Object
$subdirCount = ($subdirList | Measure-Object).Count

Write-Host "✓ 找到 $subdirCount 个子目录" -ForegroundColor Green

if ($subdirCount -eq 0) {
    Write-Host "`n没有子目录需要清理" -ForegroundColor Yellow
    exit 0
}

# 显示子目录列表
Write-Host "`n子目录列表:" -ForegroundColor Cyan
$subdirList | ForEach-Object { Write-Host "  • $_" -ForegroundColor Gray }

# 统计信息
$totalFilesToKeep = 0
$totalFilesToDelete = 0
$totalSizeToDelete = 0

# 处理每个子目录
Write-Host "`n开始处理子目录..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

foreach ($subdir in $subdirList) {
    $subdir = $subdir.Trim()
    if ([string]::IsNullOrEmpty($subdir)) {
        continue
    }
    
    Write-Host "`n处理目录: $subdir" -ForegroundColor Yellow
    
    # 获取该目录下的所有文件（不包括子目录）
    # 使用 stat 命令获取文件信息（时间戳、大小、路径）
    # 格式：Unix时间戳 文件大小 文件路径
    $filesCmd = "for f in '$subdir'/*; do [ -f `"`$f`" ] && stat -c '%Y %s %n' `"`$f`" 2>/dev/null; done | sort -n"
    
    $filesOutput = ssh "${serverAddress}" $filesCmd 2>&1
    
    # 检查是否有错误或空输出
    $hasError = $false
    if ($filesOutput) {
        $outputStr = $filesOutput -join "`n"
        if ($outputStr -match "No such file" -or $outputStr -match "cannot stat" -or $outputStr -match "Permission denied") {
            $hasError = $true
        }
    }
    
    if ($LASTEXITCODE -ne 0 -or $hasError -or -not $filesOutput) {
        # 检查是否是子目录（pc目录下有portable/setup/appx等子目录）
        $subdirCheck = ssh "${serverAddress}" "ls -d '$subdir'/*/ 2>/dev/null | head -1" 2>&1
        if ($subdirCheck -and -not ($subdirCheck -match "No such file")) {
            Write-Host "  ℹ️  此目录包含子目录，跳过（脚本只处理直接文件）" -ForegroundColor Gray
        } else {
            Write-Host "  ⚠️  无法获取文件列表或目录为空" -ForegroundColor Yellow
            if ($filesOutput) {
                Write-Host "   输出: $($filesOutput -join '`n')" -ForegroundColor Gray
            }
        }
        continue
    }
    
    # 解析文件列表（格式：Unix时间戳 大小 路径）
    # 同时从文件名中提取时间戳（格式：xtxc + yyMMddHHmm）
    $fileList = @()
    $filesOutput | ForEach-Object {
        $line = $_.Trim()
        if ($line -and $line -match '^(\d+)\s+(\d+)\s+(.+)$') {
            $filePath = $matches[3]
            $fileName = Split-Path $filePath -Leaf
            
            # 从文件名中提取时间戳（格式：xtxc[后缀] + yyMMddHHmm）
            # 例如：xtxc2512072139.apk -> 2512072139 -> 2025-12-07 21:39
            # 例如：xtxcsetup2512072139.zip -> 2512072139 -> 2025-12-07 21:39
            # 例如：xtxcappx2512072139.zip -> 2512072139 -> 2025-12-07 21:39
            $fileNameTimestamp = $null
            # 匹配 xtxc 或 xtxcsetup 或 xtxcappx 或 xtxcappxsigned 后面跟10位数字
            if ($fileName -match 'xtxc\w*(\d{10})') {
                $timeStr = $matches[1]  # yyMMddHHmm
                try {
                    $year = 2000 + [int]$timeStr.Substring(0, 2)
                    $month = [int]$timeStr.Substring(2, 2)
                    $day = [int]$timeStr.Substring(4, 2)
                    $hour = [int]$timeStr.Substring(6, 2)
                    $minute = [int]$timeStr.Substring(8, 2)
                    # 使用 UTC 时间创建日期，避免时区问题
                    $fileNameDate = [DateTime]::new($year, $month, $day, $hour, $minute, 0, [DateTimeKind]::Utc)
                    # 转换为 Unix 时间戳（秒）
                    $epoch = [DateTime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
                    $fileNameTimestamp = [long](($fileNameDate - $epoch).TotalSeconds)
                } catch {
                    # 如果解析失败，使用文件修改时间
                    $fileNameTimestamp = $null
                }
            }
            
            # 优先使用文件名时间戳，如果没有则使用文件修改时间
            $timestamp = if ($fileNameTimestamp) { $fileNameTimestamp } else { [long]$matches[1] }
            
            $fileList += @{
                Timestamp = $timestamp
                FileNameTimestamp = $fileNameTimestamp  # 用于调试
                FileModifyTimestamp = [long]$matches[1]  # 文件修改时间戳
                Size = [long]$matches[2]
                Path = $filePath
            }
        }
    }
    
    $fileCount = $fileList.Count
    
    if ($fileCount -eq 0) {
        Write-Host "  ✓ 目录为空，跳过" -ForegroundColor Gray
        continue
    }
    
    Write-Host "  找到 $fileCount 个文件" -ForegroundColor Gray
    
    # 确保所有时间戳都是 long 类型
    $fileList | ForEach-Object {
        $_.Timestamp = [long]$_.Timestamp
        if ($_.FileNameTimestamp) {
            $_.FileNameTimestamp = [long]$_.FileNameTimestamp
        }
        if ($_.FileModifyTimestamp) {
            $_.FileModifyTimestamp = [long]$_.FileModifyTimestamp
        }
    }
    
    # 按时间戳排序（最新的在前）
    # 注意：Timestamp 是 Unix 时间戳（秒），数值越大表示越新
    $sortedFiles = $fileList | Sort-Object -Property @{Expression={[long]$_.Timestamp}} -Descending
    
    # 调试：显示排序后的前3个文件的时间戳
    if ($DryRun -and $sortedFiles.Count -gt 0) {
        Write-Host "  🔍 排序后前3个文件的时间戳:" -ForegroundColor DarkGray
        $sortedFiles | Select-Object -First 3 | ForEach-Object {
            $name = Split-Path $_.Path -Leaf
            Write-Host "    • $name : $($_.Timestamp)" -ForegroundColor DarkGray
        }
    }
    
    # 确定要保留和删除的文件
    $filesToKeep = $sortedFiles | Select-Object -First $KeepCount
    $filesToDelete = $sortedFiles | Select-Object -Skip $KeepCount
    
    $keepCount = if ($filesToKeep) { ($filesToKeep | Measure-Object).Count } else { 0 }
    $deleteCount = if ($filesToDelete) { ($filesToDelete | Measure-Object).Count } else { 0 }
    
    $totalFilesToKeep += $keepCount
    $totalFilesToDelete += $deleteCount
    
    # 计算要删除的文件总大小
    if ($deleteCount -gt 0 -and $filesToDelete) {
        # 手动累加 Size 属性，避免 Measure-Object 的问题
        $deleteSize = 0
        foreach ($file in $filesToDelete) {
            if ($file -and $file.PSObject.Properties['Size'] -and $file.Size) {
                $deleteSize += $file.Size
            }
        }
        if ($deleteSize -gt 0) {
            $totalSizeToDelete += $deleteSize
        }
    }
    
    # 显示保留的文件（调试：显示时间戳来源）
    if ($keepCount -gt 0) {
        Write-Host "  ✓ 保留的文件 ($keepCount 个):" -ForegroundColor Green
        $filesToKeep | ForEach-Object {
            $fileName = Split-Path $_.Path -Leaf
            $fileSize = [math]::Round($_.Size / 1KB, 2)
            try {
                $fileDate = [DateTimeOffset]::FromUnixTimeSeconds($_.Timestamp).LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss")
            } catch {
                $fileDate = "未知"
            }
            $source = if ($_.FileNameTimestamp) { "文件名" } else { "修改时间" }
            Write-Host "    • $fileName ($fileSize KB, $fileDate, 时间戳: $($_.Timestamp), 来源: $source)" -ForegroundColor Gray
            if ($_.FileNameTimestamp -and $_.FileModifyTimestamp) {
                Write-Host "      文件名时间戳: $($_.FileNameTimestamp), 修改时间戳: $($_.FileModifyTimestamp)" -ForegroundColor DarkGray
            }
        }
    }
    
    # 显示要删除的文件
    if ($deleteCount -gt 0) {
        if ($DryRun) {
            Write-Host "  📋 将删除的文件 ($deleteCount 个):" -ForegroundColor Yellow
        } else {
            Write-Host "  🗑️  删除的文件 ($deleteCount 个):" -ForegroundColor Red
        }
        
        $filesToDelete | ForEach-Object {
            $fileName = Split-Path $_.Path -Leaf
            $fileSize = [math]::Round($_.Size / 1KB, 2)
            try {
                $fileDate = [DateTimeOffset]::FromUnixTimeSeconds($_.Timestamp).LocalDateTime.ToString("yyyy-MM-dd HH:mm:ss")
            } catch {
                $fileDate = "未知"
            }
            $source = if ($_.FileNameTimestamp) { "文件名" } else { "修改时间" }
            Write-Host "    • $fileName ($fileSize KB, $fileDate, 时间戳: $($_.Timestamp), 来源: $source)" -ForegroundColor Gray
            
            # 实际删除文件（非预览模式）
            if (-not $DryRun) {
                $deleteCmd = "rm -f '$($_.Path)'"
                $deleteResult = ssh "${serverAddress}" $deleteCmd 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "      ✓ 已删除" -ForegroundColor Green
                } else {
                    Write-Host "      ✗ 删除失败: $deleteResult" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "  ✓ 无需删除文件（文件数量 <= $KeepCount）" -ForegroundColor Green
    }
}

# 显示统计信息
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "清理完成统计" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "处理的子目录数: $subdirCount" -ForegroundColor Yellow
Write-Host "保留的文件数: $totalFilesToKeep" -ForegroundColor Green
Write-Host "删除的文件数: $totalFilesToDelete" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Red" })

if ($totalSizeToDelete -gt 0) {
    $sizeMB = [math]::Round($totalSizeToDelete / 1MB, 2)
    $sizeGB = [math]::Round($totalSizeToDelete / 1GB, 2)
    if ($sizeGB -ge 1) {
        Write-Host "释放的磁盘空间: $sizeGB GB" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Green" })
    } else {
        Write-Host "释放的磁盘空间: $sizeMB MB" -ForegroundColor $(if ($DryRun) { "Yellow" } else { "Green" })
    }
}

if ($DryRun) {
    Write-Host "`n⚠️  这是预览模式，没有实际删除文件" -ForegroundColor Yellow
    Write-Host "   要实际执行清理，请运行: .\cleanup-server-files.ps1" -ForegroundColor Yellow
} else {
    Write-Host "`n✅ 清理完成！" -ForegroundColor Green
}

