@echo off
echo ============================================
echo 芯图相册 APPX 安装程序
echo ============================================
echo.

REM 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [!] 需要管理员权限！
    echo.
    echo 请右键点击此文件，选择"以管理员身份运行"
    echo.
    pause
    exit /b 1
)

echo [√] 已获得管理员权限
echo.

REM 运行 PowerShell 安装脚本
powershell -ExecutionPolicy Bypass -File "%~dp0install-app-dev-mode.ps1"

if %errorLevel% equ 0 (
    echo.
    echo [√] 安装完成！
) else (
    echo.
    echo [×] 安装过程中出现错误
)

echo.
pause


