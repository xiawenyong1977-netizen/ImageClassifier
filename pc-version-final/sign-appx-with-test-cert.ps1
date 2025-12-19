# 使用测试证书签名 APPX 包
# 用法: .\sign-appx-with-test-cert.ps1 [appx文件路径]

param(
    [string]$AppxPath = "",
    [string]$CertPath = "",
    [string]$CertPassword = "test123456"
)

$ErrorActionPreference = "Stop"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "APPX 测试证书签名工具" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# 如果没有指定路径，自动查找最新的未签名APPX文件（排除已签名的）
if ([string]::IsNullOrEmpty($AppxPath)) {
    Write-Host "正在查找最新的未签名 APPX 文件..." -ForegroundColor Yellow
    
    $appxFiles = Get-ChildItem -Path "$PSScriptRoot\dist" -Filter "*.appx" -ErrorAction SilentlyContinue | 
                 Where-Object { $_.Name -notlike "*-signed.appx" } |
                 Sort-Object LastWriteTime -Descending
    
    if ($appxFiles -and $appxFiles.Count -gt 0) {
        $AppxPath = $appxFiles[0].FullName
        Write-Host "找到 APPX 文件: $AppxPath" -ForegroundColor Green
    } else {
        Write-Host "错误: 未找到未签名的 APPX 文件！" -ForegroundColor Red
        Write-Host "请先运行打包命令: npm run electron-pack-appx" -ForegroundColor Yellow
        exit 1
    }
}

if (-not (Test-Path $AppxPath)) {
    Write-Host "错误: APPX 文件不存在: $AppxPath" -ForegroundColor Red
    exit 1
}

# 查找证书文件
if ([string]::IsNullOrEmpty($CertPath)) {
    $CertPath = Join-Path $PSScriptRoot "test-certificate.pfx"
}

if (-not (Test-Path $CertPath)) {
    Write-Host "错误: 证书文件不存在: $CertPath" -ForegroundColor Red
    Write-Host "`n请先创建测试证书:" -ForegroundColor Yellow
    Write-Host "  .\create-test-certificate.ps1" -ForegroundColor Gray
    exit 1
}

Write-Host "证书文件: $CertPath" -ForegroundColor Gray

# 检查 SignTool 是否在 PATH 中
Write-Host "`n检查 SignTool..." -ForegroundColor Yellow
try {
    $signTool = (Get-Command signtool.exe -ErrorAction Stop).Source
    Write-Host "✓ 找到 SignTool: $signTool" -ForegroundColor Green
} catch {
    Write-Host "✗ 未找到 SignTool.exe" -ForegroundColor Red
    Write-Host "`n请确保 SignTool 已添加到 PATH 环境变量中" -ForegroundColor Yellow
    Write-Host "或安装 Windows SDK: https://developer.microsoft.com/windows/downloads/windows-sdk/" -ForegroundColor White
    exit 1
}

# 检查证书是否已安装到受信任根证书
Write-Host "`n检查证书是否已安装到受信任根证书..." -ForegroundColor Yellow

$certInstalled = $false
try {
    $rootCerts = Get-ChildItem -Path "Cert:\LocalMachine\Root" -ErrorAction SilentlyContinue
    $pfxCert = Get-PfxData -FilePath $CertPath -Password (ConvertTo-SecureString -String $CertPassword -Force -AsPlainText) -ErrorAction SilentlyContinue
    
    if ($pfxCert) {
        $certThumbprint = $pfxCert.EndEntityCertificates[0].Thumbprint
        foreach ($rootCert in $rootCerts) {
            if ($rootCert.Thumbprint -eq $certThumbprint) {
                $certInstalled = $true
                break
            }
        }
    }
} catch {
    # 忽略错误，继续执行
}

if (-not $certInstalled) {
    Write-Host "警告: 证书可能未安装到受信任根证书颁发机构" -ForegroundColor Yellow
    Write-Host "签名后如果无法安装，请运行: .\install-test-certificate.bat (以管理员身份)" -ForegroundColor Yellow
    Write-Host ""
}

# 验证证书文件
Write-Host "`n验证证书文件..." -ForegroundColor Yellow
try {
    $securePassword = ConvertTo-SecureString -String $CertPassword -Force -AsPlainText
    $pfxCert = Get-PfxData -FilePath $CertPath -Password $securePassword -ErrorAction Stop
    Write-Host "✓ 证书文件有效" -ForegroundColor Green
    Write-Host "  证书主题: $($pfxCert.EndEntityCertificates[0].Subject)" -ForegroundColor Gray
    Write-Host "  证书指纹: $($pfxCert.EndEntityCertificates[0].Thumbprint)" -ForegroundColor Gray
} catch {
    Write-Host "✗ 证书文件验证失败: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  请检查证书文件路径和密码是否正确" -ForegroundColor Yellow
    exit 1
}

# 签名 APPX 文件
Write-Host "`n正在签名 APPX 文件..." -ForegroundColor Yellow

# 确保使用绝对路径
$AppxPath = (Resolve-Path $AppxPath -ErrorAction Stop).Path
$CertPath = (Resolve-Path $CertPath -ErrorAction Stop).Path

# 生成签名后的文件路径（添加 -signed 后缀）
$signedAppxPath = $AppxPath -replace '\.appx$', '-signed.appx'

Write-Host "未签名 APPX: $AppxPath" -ForegroundColor Gray
Write-Host "签名后 APPX: $signedAppxPath" -ForegroundColor Gray
Write-Host "证书: $CertPath" -ForegroundColor Gray

# 验证文件存在
if (-not (Test-Path $AppxPath)) {
    Write-Host "✗ APPX 文件不存在: $AppxPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $CertPath)) {
    Write-Host "✗ 证书文件不存在: $CertPath" -ForegroundColor Red
    exit 1
}

try {
    # 对于测试证书，先尝试不使用时间戳服务器（更简单可靠）
    # 如果失败，再尝试使用时间戳服务器
    
    Write-Host "`n尝试签名（不使用时间戳）..." -ForegroundColor Gray
    
    # 先复制未签名文件到签名文件路径（保留原文件）
    Write-Host "`n复制未签名文件到签名文件路径..." -ForegroundColor Gray
    Copy-Item -Path $AppxPath -Destination $signedAppxPath -Force
    Write-Host "✓ 已创建签名文件副本" -ForegroundColor Green
    
    # 方法1: 不使用时间戳（推荐用于测试证书）
    # PowerShell 会自动处理包含空格的路径，不需要手动加引号
    $signArgs1 = @(
        "sign",
        "/fd", "sha256",
        "/f", $CertPath,
        "/p", $CertPassword,
        "/v",
        $signedAppxPath
    )
    
    Write-Host "`n执行命令: signtool sign /fd sha256 /f `"$CertPath`" /p `"***`" /v `"$signedAppxPath`"" -ForegroundColor Gray
    Write-Host ""
    
    & $signTool $signArgs1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✓ APPX 文件签名成功！" -ForegroundColor Green
        Write-Host "  未签名文件: $AppxPath" -ForegroundColor Gray
        Write-Host "  签名文件: $signedAppxPath" -ForegroundColor Green
        
        # 验证签名
        Write-Host "`n正在验证签名..." -ForegroundColor Yellow
        $verifyArgs = @(
            "verify",
            "/pa",
            "/v",
            $signedAppxPath
        )
        
        & $signTool $verifyArgs
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✓ 签名验证成功！" -ForegroundColor Green
        } else {
            Write-Host "`n警告: 签名验证失败，但文件已签名" -ForegroundColor Yellow
        }
        
    } else {
        Write-Host "`n尝试使用时间戳服务器签名..." -ForegroundColor Yellow
        
        # 方法2: 使用时间戳服务器
        # 如果第一次尝试失败，先复制文件
        if (-not (Test-Path $signedAppxPath)) {
            Write-Host "`n复制未签名文件到签名文件路径..." -ForegroundColor Gray
            Copy-Item -Path $AppxPath -Destination $signedAppxPath -Force
            Write-Host "✓ 已创建签名文件副本" -ForegroundColor Green
        }
        
        $signArgs2 = @(
            "sign",
            "/fd", "sha256",
            "/f", $CertPath,
            "/p", $CertPassword,
            "/tr", "http://timestamp.digicert.com",
            "/td", "sha256",
            "/v",
            $signedAppxPath
        )
        
        Write-Host "执行命令: signtool sign /fd sha256 /f `"$CertPath`" /p `"***`" /tr http://timestamp.digicert.com /td sha256 /v `"$signedAppxPath`"" -ForegroundColor Gray
        Write-Host ""
        
        & $signTool $signArgs2
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✓ APPX 文件签名成功（使用时间戳）！" -ForegroundColor Green
            Write-Host "  未签名文件: $AppxPath" -ForegroundColor Gray
            Write-Host "  签名文件: $signedAppxPath" -ForegroundColor Green
            
            # 验证签名
            Write-Host "`n正在验证签名..." -ForegroundColor Yellow
            $verifyArgs = @(
                "verify",
                "/pa",
                "/v",
                $signedAppxPath
            )
            
            & $signTool $verifyArgs
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "`n✓ 签名验证成功！" -ForegroundColor Green
            } else {
                Write-Host "`n警告: 签名验证失败，但文件已签名" -ForegroundColor Yellow
            }
        } else {
            Write-Host "`n✗ 签名失败 (退出代码: $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "`n可能的解决方案:" -ForegroundColor Yellow
            Write-Host "1. 检查证书密码是否正确（默认: test123456）" -ForegroundColor White
            Write-Host "2. 重新创建证书: .\create-test-certificate.ps1" -ForegroundColor White
            Write-Host "3. 检查证书文件是否损坏" -ForegroundColor White
            Write-Host "4. 尝试手动签名: signtool sign /fd sha256 /f `"$CertPath`" /p `"$CertPassword`" `"$signedAppxPath`"" -ForegroundColor White
            # 如果签名失败，删除签名文件副本
            if (Test-Path $signedAppxPath) {
                Remove-Item $signedAppxPath -Force -ErrorAction SilentlyContinue
            }
            exit 1
        }
    }
    
} catch {
    Write-Host "`n✗ 签名过程出错: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "错误详情: $($_.Exception)" -ForegroundColor Gray
    # 如果签名失败，删除签名文件副本
    if (Test-Path $signedAppxPath) {
        Remove-Item $signedAppxPath -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "✓ 签名完成！" -ForegroundColor Green
Write-Host "========================================`n" -ForegroundColor Green

Write-Host "文件位置:" -ForegroundColor Cyan
Write-Host "  • 未签名文件: $AppxPath" -ForegroundColor Gray
Write-Host "    用途: 上传到微软开发中心（Microsoft Store）" -ForegroundColor DarkGray
Write-Host "  • 签名文件: $signedAppxPath" -ForegroundColor Green
Write-Host "    用途: 本地测试安装" -ForegroundColor DarkGray
Write-Host ""
Write-Host "下一步:" -ForegroundColor Cyan
Write-Host "1. 本地测试: Add-AppxPackage `"$signedAppxPath`"" -ForegroundColor Gray
Write-Host "   或使用安装脚本: .\install-and-test-appx.ps1 `"$signedAppxPath`"" -ForegroundColor Gray
Write-Host "2. 上传到微软: 使用未签名文件 $AppxPath" -ForegroundColor Gray

