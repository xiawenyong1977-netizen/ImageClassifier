# 将签名密钥打包加密后上传到AGC的脚本
# 使用方法: .\package-sign-key-for-agc.ps1 -KeystorePath "sign-keystore.jks" -Alias "sign"
# 
# 参数说明：
#   -KeystorePath: 签名密钥文件路径（默认: sign-keystore.jks）
#   -Alias: 密钥别名（默认: sign）
#   -PepkPath: pepk.jar文件路径（默认: pepk.jar，在当前目录查找）

param(
    [string]$KeystorePath = "sign-keystore.jks",
    [string]$Alias = "sign",
    [string]$PepkPath = "pepk.jar"
)

Write-Host "🔐 打包签名密钥文件用于上传到AGC..." -ForegroundColor Green
Write-Host ""

# 华为提供的固定加密公钥
$encryptionKey = "034200041E224EE22B45D19B23DB91BA9F52DE0A06513E03A5821409B34976FDEED6E0A47DBA48CC249DD93734A6C5D9A0F43461F9E140F278A5D2860846C2CF5D2C3C02"

# 检查密钥文件是否存在
if (-not (Test-Path $KeystorePath)) {
    Write-Host "❌ 未找到签名密钥文件: $KeystorePath" -ForegroundColor Red
    Write-Host "请先创建签名密钥文件，或使用 -KeystorePath 参数指定路径" -ForegroundColor Yellow
    exit 1
}

# 检查pepk.jar是否存在
if (-not (Test-Path $PepkPath)) {
    Write-Host "⚠️  未找到 pepk.jar 文件: $PepkPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📥 请先下载 pepk.jar 工具：" -ForegroundColor Cyan
    Write-Host "   方式1: 从华为开发者文档下载" -ForegroundColor White
    Write-Host "   方式2: 从 AppGallery Connect 下载" -ForegroundColor White
    Write-Host "   方式3: 访问: https://developer.huawei.com/consumer/cn/doc/development/AppGallery-connect-Guides/agc-appsigning-pepk" -ForegroundColor White
    Write-Host ""
    Write-Host "💡 下载后将 pepk.jar 放到当前目录 ($PWD) 或使用 -PepkPath 参数指定路径" -ForegroundColor Yellow
    exit 1
}

# 检测Java/JDK
$javaPaths = @(
    "C:\Program Files\Android\Android Studio\jbr\bin\java.exe",
    "C:\Program Files\Android\Android Studio\jre\bin\java.exe",
    "java"  # 如果在PATH中
)

$java = $null
foreach ($p in $javaPaths) {
    if ($p -eq "java") {
        try {
            $null = Get-Command java -ErrorAction Stop
            $java = "java"
            break
        } catch {
            continue
        }
    } elseif (Test-Path $p) {
        $java = $p
        break
    }
}

if (-not $java) {
    Write-Host "❌ 未找到Java运行环境" -ForegroundColor Red
    Write-Host "请安装JDK或Android Studio" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 找到Java: $java" -ForegroundColor Green
Write-Host "✅ 找到密钥文件: $KeystorePath" -ForegroundColor Green
Write-Host "✅ 找到pepk.jar: $PepkPath" -ForegroundColor Green
Write-Host ""

# 读取密钥库密码
$storePassword = Read-Host "请输入密钥库密码" -AsSecureString
$storePasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePassword))

# 读取密钥密码
$keyPasswordInput = Read-Host "请输入密钥密码（可直接回车使用相同密码）" -AsSecureString
if ($keyPasswordInput.Length -eq 0) {
    $keyPasswordPlain = $storePasswordPlain
} else {
    $keyPasswordPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPasswordInput))
}

# 输出文件名
$outputZip = "sign.zip"

Write-Host ""
Write-Host "📦 开始打包加密签名密钥..." -ForegroundColor Yellow

# 获取绝对路径
$keystoreFullPath = (Resolve-Path $KeystorePath).Path
$pepkFullPath = (Resolve-Path $PepkPath).Path
$outputFullPath = Join-Path $PWD $outputZip

# pepk.jar需要通过交互式控制台读取密码，使用cmd.exe的管道功能
try {
    # 执行命令
    Write-Host "执行命令: $java -jar $PepkPath --keystore $KeystorePath --alias $Alias --output=$outputZip --encryptionkey=$encryptionKey --include-cert" -ForegroundColor Gray
    Write-Host ""
    
    # 使用cmd.exe通过管道传递密码（pepk.jar会提示两次密码）
    # 注意：需要转义特殊字符
    $escapedStorePass = $storePasswordPlain -replace '"', '`"'
    $escapedKeyPass = $keyPasswordPlain -replace '"', '`"'
    
    # 使用cmd的管道功能
    $cmdLine = "(echo $escapedStorePass & echo $escapedKeyPass) | `"$java`" -jar `"$pepkFullPath`" --keystore `"$keystoreFullPath`" --alias $Alias --output=`"$outputFullPath`" --encryptionkey=$encryptionKey --include-cert"
    
    $result = cmd.exe /c $cmdLine 2>&1
    $exitCode = $LASTEXITCODE
    
    # 检查输出中是否有错误
    if ($result -match "Error|Exception|失败") {
        Write-Host $result -ForegroundColor Red
        throw "打包失败"
    }
    
    if ($exitCode -ne 0) {
        Write-Host $result -ForegroundColor Red
        Write-Host ""
        Write-Host "💡 如果自动传递密码失败，请手动运行命令：" -ForegroundColor Yellow
        Write-Host "   .\package-sign-key-manual.bat" -ForegroundColor Cyan
        Write-Host "   或直接运行：" -ForegroundColor Yellow
        Write-Host "   java -jar pepk.jar --keystore $KeystorePath --alias $Alias --output=sign.zip --encryptionkey=$encryptionKey --include-cert" -ForegroundColor Cyan
        throw "打包失败，退出码: $exitCode"
    }
    
    # 显示输出
    if ($result) {
        Write-Host $result
    }
    
    Write-Host ""
    Write-Host "✅ 签名密钥打包成功！" -ForegroundColor Green
    Write-Host ""
    Write-Host "📁 生成的文件: $outputFullPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📤 下一步操作：" -ForegroundColor Cyan
    Write-Host "   1. 登录 AppGallery Connect: https://developer.huawei.com/consumer/cn/service/josp/agc/index.html" -ForegroundColor White
    Write-Host "   2. 进入应用详情 → 版本信息 → 签名密钥管理" -ForegroundColor White
    Write-Host "   3. 选择'由AGC创建并管理签名密钥'" -ForegroundColor White
    Write-Host "   4. 上传 sign.zip 文件 ($outputZip)" -ForegroundColor White
    Write-Host "   5. AGC将使用此密钥对后续分发至用户设备的应用进行签名" -ForegroundColor White
    Write-Host ""
    Write-Host "⚠️  重要提示：" -ForegroundColor Yellow
    Write-Host "   - sign.zip 文件包含加密的签名密钥，请妥善保管" -ForegroundColor White
    Write-Host "   - 上传后，AGC将管理签名密钥，您无需在本地保存" -ForegroundColor White
    Write-Host "   - 后续应用更新时，直接上传APK即可，AGC会自动使用此密钥签名" -ForegroundColor White
    
} catch {
    Write-Host ""
    Write-Host "❌ 打包失败: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 可能的原因：" -ForegroundColor Yellow
    Write-Host "   1. 密钥文件路径或别名不正确" -ForegroundColor White
    Write-Host "   2. 密钥库密码或密钥密码错误" -ForegroundColor White
    Write-Host "   3. pepk.jar 文件损坏或不兼容" -ForegroundColor White
    Write-Host "   4. Java版本不兼容（需要Java 8或更高版本）" -ForegroundColor White
    exit 1
}

