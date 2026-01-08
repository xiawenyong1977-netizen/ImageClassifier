# 清理旧版本文件脚本 - 清除服务器上的旧版本文件（只保留最新1个文件）
# 使用方法: .\cleanup-old-versions.ps1
# 
# 参数说明:
#   -ServerHost: 服务器主机名或IP地址 (默认: "web")
#   -ServerUser: 服务器用户名 (默认: "root")
#   -ServerPath: 服务器目标路径 (默认: "/var/www/xintuxiangce/website/dist")
#
# 示例:
#   .\cleanup-old-versions.ps1 -ServerHost "192.168.1.100"
#
# 注意: 每个目录只保留最新的1个文件，其他文件都会被删除
#
# 注意:
#   1. 需要确保已安装 OpenSSH 客户端 (Windows 10/11 通常已内置)
#   2. 需要配置 SSH 密钥认证或准备输入密码
#   3. 删除操作需要人工确认，避免误删

param(
    [string]$ServerHost = "web",
    [string]$ServerUser = "root",
    [string]$ServerPath = "/var/www/xintuxiangce/website/dist"
)

$ErrorActionPreference = "Stop"

# 获取脚本所在目录
if ($PSScriptRoot) {
    $scriptDir = $PSScriptRoot
} else {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
}

Write-Host "🧹 清理旧版本文件脚本（只保留最新1个文件）" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "服务器: ${ServerUser}@${ServerHost}" -ForegroundColor Cyan
Write-Host "路径: ${ServerPath}" -ForegroundColor Cyan
Write-Host "保留策略: 每个目录只保留最新的1个文件" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 检查必要的命令是否可用
$requiredCommands = @("ssh")
foreach ($cmd in $requiredCommands) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "❌ 错误: 未找到命令 '$cmd'，请确保已安装 OpenSSH 客户端" -ForegroundColor Red
        Write-Host "   在 Windows 上，可以通过以下方式安装:" -ForegroundColor Yellow
        Write-Host "   设置 -> 应用 -> 可选功能 -> 添加功能 -> OpenSSH 客户端" -ForegroundColor Yellow
        exit 1
    }
}

$serverAddress = "${ServerUser}@${ServerHost}"

# 定义要清理的目录
$cleanupDirs = @(
    @{
        Path = "${ServerPath}/pc/portable"
        Name = "PC便携版"
        Pattern = "xtxc.*\.zip"  # 使用正则表达式匹配：xtxc开头，任意字符，.zip结尾
    },
    @{
        Path = "${ServerPath}/pc/setup"
        Name = "PC安装版"
        Pattern = "xtxcsetup.*\.zip"  # 使用正则表达式匹配：xtxcsetup开头，任意字符，.zip结尾
    },
    @{
        Path = "${ServerPath}/android"
        Name = "Android APK"
        Pattern = "xtxc.*\.apk"  # 使用正则表达式匹配：xtxc开头，任意字符，.apk结尾
    }
)

# 获取所有旧文件
$allOldFiles = @()

Write-Host "`n🔍 扫描服务器上的文件..." -ForegroundColor Yellow

foreach ($dir in $cleanupDirs) {
    Write-Host "`n📁 检查目录: $($dir.Name) ($($dir.Path))" -ForegroundColor Cyan
    
    # 使用SSH命令列出文件，按修改时间排序（最新的在前）
    # 格式：修改时间(YYYY-MM-DD HH:MM:SS) 文件名
    # 使用字符串拼接避免PowerShell转义问题
    $awkPart = '{print $6" "$7" "$8" "$9}'
    $listCommand = "ls -lt --time-style='+%Y-%m-%d %H:%M:%S' '$($dir.Path)' 2>/dev/null | grep -E '$($dir.Pattern)' | awk '$awkPart'"
    
    try {
        # 先检查目录是否存在
        $checkDirCommand = "test -d '$($dir.Path)' && echo 'exists' || echo 'not_exists'"
        $dirCheck = ssh "${serverAddress}" $checkDirCommand 2>&1
        
        if ($dirCheck -notmatch 'exists') {
            Write-Host "   ⚠️  目录不存在: $($dir.Path)" -ForegroundColor Yellow
            continue
        }
        
        # 先列出目录中的所有文件，用于调试
        $listAllCommand = "ls -1 '$($dir.Path)' 2>/dev/null"
        $allFiles = ssh "${serverAddress}" $listAllCommand 2>&1
        
        if ([string]::IsNullOrWhiteSpace($allFiles)) {
            Write-Host "   ℹ️  目录为空" -ForegroundColor Gray
            continue
        }
        
        # 显示目录中的文件（用于调试）
        Write-Host "   目录中的文件:" -ForegroundColor DarkGray
        $allFilesLines = $allFiles -split "`n" | Where-Object { $_ -match '\S' }
        foreach ($line in $allFilesLines) {
            Write-Host "     - $line" -ForegroundColor DarkGray
        }
        
        # 列出匹配的文件
        $fileList = ssh "${serverAddress}" $listCommand 2>&1
        
        Write-Host "   grep命令输出:" -ForegroundColor DarkGray
        if ([string]::IsNullOrWhiteSpace($fileList)) {
            Write-Host "     (空)" -ForegroundColor DarkGray
        } else {
            Write-Host "     $fileList" -ForegroundColor DarkGray
        }
        
        # 如果grep没有匹配到文件（空结果），进行调试
        if ([string]::IsNullOrWhiteSpace($fileList)) {
            Write-Host "   ⚠️  模式匹配失败" -ForegroundColor Yellow
            Write-Host "   使用的模式: $($dir.Pattern)" -ForegroundColor Gray
            
            # 测试grep命令是否能匹配
            $testGrepCommand = "ls -1 '$($dir.Path)' 2>/dev/null | grep -E '$($dir.Pattern)'"
            $testResult = ssh "${serverAddress}" $testGrepCommand 2>&1
            Write-Host "   测试grep结果:" -ForegroundColor DarkGray
            if ([string]::IsNullOrWhiteSpace($testResult)) {
                Write-Host "     (空 - grep没有匹配到任何文件)" -ForegroundColor DarkGray
            } else {
                Write-Host "     $testResult" -ForegroundColor DarkGray
            }
            continue
        }
        
        # 解析文件列表
        # grep输出可能在一行中，所有文件用空格分隔
        # 格式：2026-01-0907:32:04xtxc2601090731.zip 2026-01-0612:27:46xtxc2601061226.zip ...
        # 使用正则表达式匹配每个文件条目（日期+时间+文件名，没有空格分隔）
        if (-not [string]::IsNullOrWhiteSpace($fileList)) {
            # 匹配格式：YYYY-MM-DD + HH:MM:SS + 文件名（用空格分隔不同的文件）
            $pattern = '(\d{4}-\d{2}-\d{2})(\d{2}:\d{2}:\d{2})([^\s]+)'
            $matches = [regex]::Matches($fileList, $pattern)
            
            foreach ($match in $matches) {
                $fileDate = $match.Groups[1].Value
                $fileTime = $match.Groups[2].Value
                $fileName = $match.Groups[3].Value.Trim()
                
                # 解析文件日期时间
                $fileDateTime = [DateTime]::Parse("$fileDate $fileTime")
                
                $fileInfo = @{
                    Directory = $dir.Name
                    Path = "$($dir.Path)/$fileName"
                    Name = $fileName
                    Date = $fileDateTime
                }
                
                # 调试：显示文件信息
                Write-Host "     解析文件: $fileName, Directory=$($dir.Name), Date=$($fileDateTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray
                
                $allOldFiles += $fileInfo
            }
        }
    } catch {
        Write-Host "   ❌ 错误: 无法列出目录文件: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 按目录分组，每个目录只保留最新的1个文件
$filesToDelete = @()
$filesToKeep = @()

# 按目录分组
Write-Host "`n📊 开始分组处理，总共 $($allOldFiles.Count) 个文件" -ForegroundColor Cyan
# 使用脚本块访问哈希表的Directory属性（PowerShell中哈希表需要使用脚本块）
$filesByDirectory = $allOldFiles | Group-Object -Property { $_.Directory }

Write-Host "   分组结果: $($filesByDirectory.Count) 个目录组" -ForegroundColor DarkGray
foreach ($g in $filesByDirectory) {
    Write-Host "     目录组: '$($g.Name)' (共 $($g.Count) 个文件)" -ForegroundColor DarkGray
}

foreach ($group in $filesByDirectory) {
    # 按日期排序（最新的在前，使用 -Descending）
    $sortedFiles = $group.Group | Sort-Object { $_.Date } -Descending
    
    if ($sortedFiles.Count -eq 0) {
        continue
    }
    
    # 调试：显示排序后的文件列表
    Write-Host "`n   调试 - '$($group.Name)' 目录，共 $($sortedFiles.Count) 个文件:" -ForegroundColor DarkGray
    for ($i = 0; $i -lt $sortedFiles.Count; $i++) {
        $file = $sortedFiles[$i]
        $marker = if ($i -eq 0) { "✅ 保留" } else { "🗑️ 删除" }
        Write-Host "     [$i] $marker $($file.Name) - $($file.Date.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor DarkGray
    }
    
    # 保留最新的1个文件（索引0，因为已按降序排序）
    $latestFile = $sortedFiles[0]
    $filesToKeep += $latestFile
    Write-Host "     已添加到保留列表: $($latestFile.Name)" -ForegroundColor DarkGray
    
    # 其他文件都标记为删除（索引1到最后）
    if ($sortedFiles.Count -gt 1) {
        $oldFiles = $sortedFiles[1..($sortedFiles.Count - 1)]
        $filesToDelete += $oldFiles
        Write-Host "     已添加到删除列表: $($oldFiles.Count) 个文件" -ForegroundColor DarkGray
    }
}

if ($filesToDelete.Count -eq 0) {
    Write-Host "`n✅ 没有需要清理的旧文件（每个目录最多只有1个文件）" -ForegroundColor Green
    exit 0
}

# 显示保留和删除的文件列表
Write-Host "`n📋 文件清理计划:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

Write-Host "`n✅ 将保留的文件（每个目录最新1个）:" -ForegroundColor Green
foreach ($file in $filesToKeep | Sort-Object { $_.Directory }, { $_.Date } -Descending) {
    Write-Host "   ✅ $($file.Directory): $($file.Name)" -ForegroundColor Green
    Write-Host "      路径: $($file.Path)" -ForegroundColor Gray
    Write-Host "      日期: $($file.Date.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
}

Write-Host "`n🗑️  待删除文件列表:" -ForegroundColor Red
foreach ($file in $filesToDelete | Sort-Object { $_.Directory }, { $_.Date } -Descending) {
    Write-Host "   🗑️  $($file.Directory): $($file.Name)" -ForegroundColor Red
    Write-Host "      路径: $($file.Path)" -ForegroundColor Gray
    Write-Host "      日期: $($file.Date.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Gray
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "保留: $($filesToKeep.Count) 个文件" -ForegroundColor Green
Write-Host "删除: $($filesToDelete.Count) 个文件" -ForegroundColor Red

# 人工确认
Write-Host "`n⚠️  警告: 此操作将永久删除上述文件！" -ForegroundColor Red
Write-Host "是否确认删除? (Y/N)" -ForegroundColor Yellow
$confirm = Read-Host

if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host "`n❌ 用户取消操作" -ForegroundColor Red
    exit 0
}

# 执行删除
Write-Host "`n🗑️  开始删除文件..." -ForegroundColor Yellow

$deletedCount = 0
$failedCount = 0

foreach ($file in $filesToDelete) {
    try {
        Write-Host "   删除: $($file.Name)..." -ForegroundColor Cyan -NoNewline
        
        # 使用SSH删除文件
        $deleteCommand = "rm -f '$($file.Path)'"
        $result = ssh "${serverAddress}" $deleteCommand 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host " ✅" -ForegroundColor Green
            $deletedCount++
        } else {
            Write-Host " ❌ 失败: $result" -ForegroundColor Red
            $failedCount++
        }
    } catch {
        Write-Host " ❌ 错误: $($_.Exception.Message)" -ForegroundColor Red
        $failedCount++
    }
}

# 显示结果
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "🎉 清理完成！" -ForegroundColor Green
Write-Host "成功删除: $deletedCount 个文件" -ForegroundColor Green
if ($failedCount -gt 0) {
    Write-Host "失败: $failedCount 个文件" -ForegroundColor Red
}

