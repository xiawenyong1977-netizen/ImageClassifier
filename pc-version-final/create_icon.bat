@echo off
echo 正在创建正确的ICO文件...

REM 使用PowerShell创建ICO文件
powershell -Command "
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('icons\imageclassify.png')
$ico = [System.Drawing.Icon]::FromHandle((New-Object System.Drawing.Bitmap($img)).GetHicon())
$fs = [System.IO.File]::Create('public\icon.ico')
$ico.Save($fs)
$fs.Close()
$img.Dispose()
"

echo ICO文件创建完成！
pause
