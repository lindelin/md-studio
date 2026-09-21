@echo off
setlocal
set ELECTRON_RUN_AS_NODE=1
if exist "%~dp0..\node_modules\electron\dist\electron.exe" (
  "%~dp0..\node_modules\electron\dist\electron.exe" "%~dp0cli.cjs" %*
) else (
  "%~dp0..\..\..\MD Studio.exe" "%~dp0cli.cjs" %*
)
