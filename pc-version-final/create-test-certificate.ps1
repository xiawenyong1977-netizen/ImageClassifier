# 创建用于测试的自签名证书
# 注意：此证书仅用于本地测试，不能用于 Microsoft Store 发布

Write-Host "正在创建测试证书..." -ForegroundColor Green

# 证书参数
$certSubject = "CN=ImageClassifier"
$certName = "ImageClassifier-Test-Certificate"
$pfxPassword = "test123456"  # 测试密码，可以修改

# 创建自签名证书
$cert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $certSubject `
    -KeyUsage DigitalSignature `
    -FriendlyName $certName `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")

Write-Host "证书已创建，指纹: $($cert.Thumbprint)" -ForegroundColor Yellow

# 导出为 PFX 文件
$pfxPath = Join-Path $PSScriptRoot "test-certificate.pfx"
$pwd = ConvertTo-SecureString -String $pfxPassword -Force -AsPlainText

Export-PfxCertificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
    -FilePath $pfxPath `
    -Password $pwd

Write-Host "证书已导出到: $pfxPath" -ForegroundColor Green
Write-Host "证书密码: $pfxPassword" -ForegroundColor Yellow

# 导出公钥（CER 格式，用于安装到受信任根证书）
$cerPath = Join-Path $PSScriptRoot "test-certificate.cer"
Export-Certificate -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
    -FilePath $cerPath

Write-Host "公钥已导出到: $cerPath" -ForegroundColor Green

Write-Host "`n重要提示:" -ForegroundColor Cyan
Write-Host "1. 测试前需要先安装证书到'受信任的根证书颁发机构'" -ForegroundColor White
Write-Host "2. 运行命令: certutil -addstore Root `"$cerPath`"" -ForegroundColor White
Write-Host "3. 或者双击 test-certificate.cer，选择'安装证书' -> '本地计算机' -> '受信任的根证书颁发机构'" -ForegroundColor White
Write-Host "4. 此证书仅用于测试，提交到 Microsoft Store 时需要使用正式证书" -ForegroundColor Yellow

Write-Host "`n完成！" -ForegroundColor Green

