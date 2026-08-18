@echo off
setlocal
cd /d "%~dp0"

echo === Hire Downloader v3.0 dual-arch build ===

echo.
echo --- x64 ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_arch.ps1" -Arch x64
if errorlevel 1 (
  echo [ERROR] x64 build failed
  exit /b 1
)

echo.
echo --- x86 ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build_arch.ps1" -Arch x86
if errorlevel 1 (
  echo [WARN] x86 build failed - x64 may still be OK
)

echo.
echo Release folder:
dir /b release 2>nul
echo Done.
endlocal
