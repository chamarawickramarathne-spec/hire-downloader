$ErrorActionPreference = "Stop"
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)

Write-Host "==> Typecheck"
npm run typecheck
if ($LASTEXITCODE -ne 0) { throw "Typecheck failed" }

Write-Host "==> Build Windows installer"
npm run build:win
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

$releaseDir = "release"
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null

$setup = Get-ChildItem -LiteralPath "dist" -Filter "HireDownloader-Setup.exe" -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) {
  $setup = Get-ChildItem -LiteralPath "dist" -Filter "*Setup*.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $setup) { throw "Installer not found in dist/" }

$dest = Join-Path $releaseDir "HireDownloader-Setup.exe"
Copy-Item -LiteralPath $setup.FullName -Destination $dest -Force

$unpacked = "dist\win-unpacked\hire-downloader.exe"
if (Test-Path -LiteralPath $unpacked) {
  Copy-Item -LiteralPath $unpacked -Destination (Join-Path $releaseDir "hire-downloader.exe") -Force
}

Write-Host ""
Write-Host "Done:"
Write-Host "  $dest"
Write-Host "Next: commit, push, gh release create vX.Y.Z -a release/HireDownloader-Setup.exe"
