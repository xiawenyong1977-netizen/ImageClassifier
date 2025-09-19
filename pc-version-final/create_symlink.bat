@echo off
echo 正在创建符号链接...
mklink /D src ..\src
if %errorlevel% == 0 (
    echo 符号链接创建成功！
) else (
    echo 符号链接创建失败，请以管理员身份运行此脚本
)
pause
