@echo off
echo ========================================
echo 安装测试证书到受信任的根证书颁发机构
echo ========================================
echo.

REM 检查是否以管理员权限运行
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [错误] 需要管理员权限！
    echo 请右键点击此文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo 正在安装证书...
certutil -addstore Root "%~dp0test-certificate.cer"

if %errorLevel% equ 0 (
    echo.
    echo [成功] 证书已安装到受信任的根证书颁发机构
    echo 现在可以测试安装 APPX 包了
) else (
    echo.
    echo [失败] 证书安装失败
)

echo.
pause


