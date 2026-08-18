param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("x64", "x86")]
    [string]$Arch
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $Root

$Iscc = "C:\Program Files (x86)\Inno Setup 6\ISCC.exe"
$Venv = if ($Arch -eq "x64") { ".venv64" } else { ".venv32" }
$PyLauncher = if ($Arch -eq "x64") { "py -3.13" } else { "py -3.12-32" }
$DistName = "HireDownloader"
$DistOut = "dist\$Arch\$DistName"

Write-Host "==> [$Arch] Ensure venv $Venv"
if (-not (Test-Path "$Venv\Scripts\python.exe")) {
    Invoke-Expression "$PyLauncher -m venv $Venv"
}
$Python = Join-Path $Root "$Venv\Scripts\python.exe"
$Pip = Join-Path $Root "$Venv\Scripts\pip.exe"
$PyInstaller = Join-Path $Root "$Venv\Scripts\pyinstaller.exe"

Write-Host "==> [$Arch] Install deps"
& $Python -m pip install --upgrade pip
& $Pip install -r requirements.txt

Write-Host "==> [$Arch] Fetch binaries if missing"
$resDir = Join-Path $Root "resources"
New-Item -ItemType Directory -Path $resDir -Force | Out-Null

# Fetch ffmpeg
$ff = Join-Path $resDir "ffmpeg.exe"
if (-not (Test-Path $ff) -or ((Get-Item $ff).Length -lt 1000000)) {
    & $Python scripts\fetch_ffmpeg.py
}

# Fetch yt-dlp
$ytdlp = Join-Path $resDir "yt-dlp.exe"
if (-not (Test-Path $ytdlp) -or ((Get-Item $ytdlp).Length -lt 1000000)) {
    Write-Host "  Downloading yt-dlp.exe..."
    & $Python -c "import urllib.request; urllib.request.urlretrieve('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe', r'$ytdlp')"
}

# Fetch aria2c
$aria2 = Join-Path $resDir "aria2c.exe"
if (-not (Test-Path $aria2) -or ((Get-Item $aria2).Length -lt 100000)) {
    & $Python scripts\fetch_aria2.py
}

Write-Host "==> [$Arch] PyInstaller"
if (Test-Path "dist\$Arch") { Remove-Item -Recurse -Force "dist\$Arch" }
$icon = Join-Path $Root "media\icon.ico"
$mediaData = (Join-Path $Root "media") + ";media"
$resData = $resDir + ";resources"
$feData = (Join-Path $Root "frontend") + ";frontend"
$piArgs = @(
    "--noconfirm", "--clean", "--windowed",
    "--name", $DistName,
    "--distpath", (Join-Path $Root "dist\$Arch"),
    "--workpath", (Join-Path $Root "build\pyi_$Arch"),
    "--specpath", (Join-Path $Root "build"),
    "--icon", $icon,
    "--paths", $Root,
    "--add-data", $mediaData,
    "--add-data", $resData,
    "--add-data", $feData,
    "--hidden-import", "webview",
    "--hidden-import", "clr",
    (Join-Path $Root "main.py")
)

& $PyInstaller @piArgs
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed for $Arch" }

Write-Host "==> [$Arch] Inno Setup"
if (-not (Test-Path $Iscc)) {
    Write-Host "[WARN] ISCC not found - skipping installer"
} else {
    $iss = if ($Arch -eq "x64") { "build\installer_x64.iss" } else { "build\installer_x86.iss" }
    & $Iscc $iss
    if ($LASTEXITCODE -ne 0) { throw "Inno Setup failed for $Arch" }
}

Write-Host "Done $Arch -> $DistOut"
