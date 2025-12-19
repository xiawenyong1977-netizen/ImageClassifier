# 七牛 CDN 上传脚本
# 用法: .\upload-to-qiniu.ps1 [选项]
#
# 选项:
#   -ServerHost: 服务器主机名或IP地址 (默认: "web")
#   -ServerUser: 服务器用户名 (默认: "root")
#   -QiniuUploadScript: 服务器上七牛CDN上传脚本路径 (默认: "/var/www/xintuxiangce/qiniu-upload.py")
#
# 示例:
#   .\upload-to-qiniu.ps1
#   .\upload-to-qiniu.ps1 -ServerHost "192.168.1.100"
#   .\upload-to-qiniu.ps1 -QiniuUploadScript "/custom/path/qiniu-upload.py"

param(
    [string]$ServerHost = "web",
    [string]$ServerUser = "root",
    [string]$QiniuUploadScript = "/var/www/xintuxiangce/qiniu-upload.py"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "七牛 CDN 上传工具" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 检查必要的命令是否可用
if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 错误: 未找到命令 'ssh'，请确保已安装 OpenSSH 客户端" -ForegroundColor Red
    exit 1
}

$serverAddress = "${ServerUser}@${ServerHost}"

Write-Host "服务器: ${serverAddress}" -ForegroundColor Yellow
Write-Host "上传脚本: $QiniuUploadScript" -ForegroundColor Yellow
Write-Host ""

# 先检查脚本是否存在
Write-Host "检查上传脚本是否存在: $QiniuUploadScript" -ForegroundColor Cyan
$scriptCheck = ssh "${serverAddress}" "if [ -f '$QiniuUploadScript' ]; then echo 'EXISTS'; else echo 'NOT_FOUND'; fi" 2>&1
$scriptCheck = $scriptCheck -join "`n"

if ($scriptCheck -notmatch "EXISTS") {
    Write-Host "❌ 错误: 上传脚本不存在或无法访问" -ForegroundColor Red
    Write-Host "   服务器: ${serverAddress}" -ForegroundColor Yellow
    Write-Host "   脚本路径: $QiniuUploadScript" -ForegroundColor Yellow
    Write-Host "`n检查结果: $scriptCheck" -ForegroundColor Gray
    
    # 列出可能的脚本位置（在 /var/www/xintuxiangce 目录查找）
    Write-Host "`n正在查找可能的脚本位置..." -ForegroundColor Cyan
    $findResult = ssh "${serverAddress}" "ls -la /var/www/xintuxiangce/*qiniu*.py /var/www/xintuxiangce/*upload*.py 2>/dev/null | head -5" 2>&1
    if ($findResult) {
        Write-Host "找到以下可能的脚本:" -ForegroundColor Yellow
        $findResult | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    }
    
    Write-Host "`n请确认脚本路径是否正确，或手动执行上传" -ForegroundColor Yellow
    $continue = Read-Host "是否继续尝试执行? (Y/N)"
    if ($continue -ne "Y" -and $continue -ne "y") {
        Write-Host "⏭️  已跳过七牛 CDN 上传" -ForegroundColor Gray
        exit 0
    }
}

    # 根据文件扩展名确定执行命令
    $scriptExt = [System.IO.Path]::GetExtension($QiniuUploadScript).ToLower()
    if ($scriptExt -eq ".py") {
        # 使用 -u 参数禁用 Python 输出缓冲，确保实时显示
        $execCommand = "python3 -u"
        Write-Host "检测到 Python 脚本，使用 python3 -u 执行（无缓冲输出）" -ForegroundColor Cyan
    } elseif ($scriptExt -eq ".sh") {
        $execCommand = "bash"
        Write-Host "检测到 Shell 脚本，使用 bash 执行" -ForegroundColor Cyan
    } else {
        # 默认尝试 python3，如果失败再尝试 bash
        $execCommand = "python3 -u"
        Write-Host "未识别脚本类型，尝试使用 python3 -u 执行（无缓冲输出）" -ForegroundColor Cyan
    }

# 获取脚本所在目录（确保使用正斜杠，因为服务器是 Linux）
$scriptDir = Split-Path $QiniuUploadScript -Parent
# 将 Windows 路径分隔符转换为 Linux 路径分隔符
$scriptDir = $scriptDir -replace '\\', '/'

# 检查配置文件是否存在
Write-Host "检查配置文件是否存在..." -ForegroundColor Cyan
$configPath = "$scriptDir/qiniu-config.json"
$configCheck = ssh "${serverAddress}" "if [ -f '$configPath' ]; then echo 'EXISTS'; else echo 'NOT_FOUND'; fi" 2>&1
$configCheck = $configCheck -join "`n"
if ($configCheck -match "EXISTS") {
    Write-Host "✓ 配置文件存在: $configPath" -ForegroundColor Green
} else {
    Write-Host "⚠️  警告: 配置文件不存在: $configPath" -ForegroundColor Yellow
    Write-Host "   检查结果: $configCheck" -ForegroundColor Gray
}

# 检查脚本是否有执行权限，如果没有则添加
Write-Host "检查并设置脚本执行权限..." -ForegroundColor Cyan
ssh "${serverAddress}" "chmod +x '$QiniuUploadScript' 2>/dev/null"

# 检查 Python3 是否可用
Write-Host "检查 Python3 环境..." -ForegroundColor Cyan
$pythonCheck = ssh "${serverAddress}" "which python3 && python3 --version" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  警告: Python3 未找到或不可用" -ForegroundColor Yellow
    Write-Host "   检查结果: $pythonCheck" -ForegroundColor Gray
} else {
    Write-Host "✓ Python3 可用" -ForegroundColor Green
    Write-Host "   $pythonCheck" -ForegroundColor Gray
}

# 执行上传脚本（先切换到脚本所在目录，确保能找到配置文件）
Write-Host "`n执行上传脚本: $QiniuUploadScript" -ForegroundColor Cyan
Write-Host "切换到脚本目录: $scriptDir" -ForegroundColor Gray
Write-Host "执行命令: cd '$scriptDir' && $execCommand '$QiniuUploadScript'" -ForegroundColor Gray
Write-Host "`n开始执行，实时输出如下：" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan

# 实时显示输出
# 使用 -t 参数强制分配伪终端，确保 Python 脚本的输出能实时显示（包括进度条等）
# 使用 python3 -u 禁用输出缓冲，确保实时显示
$uploadExitCode = 0
try {
    # 构建完整的命令字符串
    $sshCommand = "cd '$scriptDir' && $execCommand '$QiniuUploadScript'"
    
    Write-Host "`n正在执行命令..." -ForegroundColor Yellow
    Write-Host "命令: ssh -t ${serverAddress} `"$sshCommand`"" -ForegroundColor Gray
    
    # 使用 & 操作符直接执行 ssh 命令，输出会实时显示到控制台
    # 使用 -t 参数确保 Python 脚本的输出能实时显示（包括进度条等）
    # 注意：在 PowerShell 中，使用 & 操作符调用外部命令时输出会实时显示
    & ssh -t "${serverAddress}" $sshCommand
    
    # 获取退出代码
    if ($LASTEXITCODE -ne $null) {
        $uploadExitCode = $LASTEXITCODE
    } elseif (-not $?) {
        $uploadExitCode = 1
    } else {
        # 如果都没有设置，假设成功
        $uploadExitCode = 0
    }
} catch {
    Write-Host "`n执行过程出错: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "错误详情: $($_.Exception)" -ForegroundColor Red
    $uploadExitCode = 1
}

Write-Host "========================================" -ForegroundColor Cyan

if ($uploadExitCode -ne 0) {
    Write-Host "`n❌ 错误: 七牛 CDN 上传脚本执行失败 (退出代码: $uploadExitCode)" -ForegroundColor Red
    Write-Host "   服务器: ${serverAddress}" -ForegroundColor Yellow
    Write-Host "   脚本路径: $QiniuUploadScript" -ForegroundColor Yellow
    Write-Host "   脚本目录: $scriptDir" -ForegroundColor Yellow
    Write-Host "   执行命令: $execCommand" -ForegroundColor Yellow
    Write-Host "`n可能的解决方案:" -ForegroundColor Yellow
    Write-Host "   1. 检查脚本是否有执行权限: chmod +x $QiniuUploadScript" -ForegroundColor White
    Write-Host "   2. 检查配置文件是否存在: ls -la $scriptDir/qiniu-config.json" -ForegroundColor White
    $testCmd = "ssh ${serverAddress} 'cd $scriptDir && $execCommand $QiniuUploadScript'"
    Write-Host "   3. 手动执行测试: $testCmd" -ForegroundColor White
    $depCheckCmd = "ssh ${serverAddress} 'cd $scriptDir && $execCommand -c `"import qiniu`"'"
    Write-Host "   4. 检查 Python 依赖: $depCheckCmd" -ForegroundColor White
    exit 1
} else {
    Write-Host "`n✅ 七牛 CDN 上传完成" -ForegroundColor Green
}

