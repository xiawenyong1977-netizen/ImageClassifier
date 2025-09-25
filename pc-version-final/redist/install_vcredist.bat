@echo off
echo 正在安装 Visual C++ Redistributable...

REM 静默安装 Visual C++ Redistributable
vc_redist.x64.exe /quiet /norestart

if %ERRORLEVEL% EQU 0 (
    echo Visual C++ Redistributable 安装成功
) else (
    echo Visual C++ Redistributable 安装失败，错误代码: %ERRORLEVEL%
)

pause
