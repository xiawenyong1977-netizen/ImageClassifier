@echo off
REM 包装 PowerShell 脚本，自动绕过执行策略
powershell -ExecutionPolicy Bypass -File "%~dp0deploy.ps1" %*

