# Hire Downloader

**App Modification Memory** — update after every change.

## Overview
Windows media downloader in **Python** (pywebview + Edge WebView2 + HTML/CSS/JS frontend). Dark UI. YouTube, playlists, torrents (aria2c), direct files. Supports **32-bit and 64-bit** Windows builds. External binaries: yt-dlp.exe, ffmpeg.exe, aria2c.exe.

## Current Version
- **v3.0.0** — MOD 4 (2026-08-18) — pywebview rewrite (customtkinter → pywebview + HTML/CSS/JS)

## Update source
- GitHub: `chamarawickramarathne-spec/hire-downloader`
- Installer assets (fixed names, tracked in git):
  - `HireDownloader_64.exe`
  - `HireDownloader_32.exe`
- Updater picks asset by process arch

## Structure
- `main.py` — entry (pywebview window)
- `backend/` — config, util, models, queue_mgr, ytdlp_engine, direct_engine, torrent_engine, settings, history, updater, app (controller + API)
- `frontend/` — index.html, css/style.css, js/ (app.js, downloads.js, settings.js, utils.js)
- `media/` — logo.png, icon.ico
- `resources/` — yt-dlp.exe, ffmpeg.exe, aria2c.exe (gitignored; fetched at build)
- `scripts/build_arch.ps1`, `build.bat` — dual-arch PyInstaller + Inno
- `scripts/fetch_aria2.py`, `scripts/fetch_ffmpeg.py` — binary fetchers
- `build/installer_x64.iss`, `build/installer_x86.iss`

## Python
- x64: Python 3.13 → `.venv64`
- x86: Python 3.12-32 → `.venv32`
- Only pip deps: pywebview, pyperclip, pyinstaller

## Architecture
- pywebview hosts HTML/CSS/JS frontend with Edge WebView2
- Python API class exposed via `window.pywebview.api`
- Progress pushed to JS via `window.evaluate_js()`
- yt-dlp called as subprocess (external .exe) — not imported as Python module
- Torrents via aria2c.exe subprocess (replaced libtorrent)
- Settings/history stored as JSON in AppData

## Mod Log

### MOD 4 (v3.0.0) — 2026-08-18 — pywebview rewrite
- Replaced customtkinter with pywebview + HTML/CSS/JS frontend.
- Replaced libtorrent with aria2c.exe for torrent/magnet downloads.
- yt-dlp now called as external subprocess (not Python import).
- Dramatically smaller exe size (~15-20MB vs ~60-80MB).
- Polished dark UI with CSS custom properties, flexbox, animations.
- Backend API exposed to JS via pywebview bridge.
- Removed: ui/ directory, core/ directory, Pillow dependency, libtorrent dependency.

### MOD 3 (v2.0.1) — 2026-08-16 — YouTube fetch + Facebook quality
- Hardened yt-dlp: multiple YouTube player clients, cookie fallback on any failure.
- Facebook/Instagram/TikTok/X/etc routed through yt-dlp (`social` type) with quality picker.
- Format dropdown shown for any item with formats (not YouTube-only).
- Friendlier error messages for bot/403/private.

### MOD 2 (v2.0.0) — 2026-08-16 — Electron → Python
- Full rewrite: customtkinter UI, yt-dlp engine, libtorrent torrents, direct HTTP.
- Dual-arch build (x64 + x86) and arch-aware GitHub updater.
- Removed Electron/Node/React stack.
- Queue, playlist, pause/resume, schedule, history, tray-close confirm.

### MOD 1 (v1.1.0) — 2026-08-16 — Electron optimize + GIT update
- Superseded by MOD 2.

## Build / release
1. Bump `APP_VERSION` in `backend/config.py` + installer iss versions
2. `build.bat` (or `scripts\build_arch.ps1 -Arch x64`)
3. Commit + push (include `release/HireDownloader_32.exe` and `release/HireDownloader_64.exe`)
4. `gh release create vX.Y.Z release/HireDownloader_64.exe release/HireDownloader_32.exe`

## Rules
- Modules under ~300 lines
- Do not commit venvs, dist, release, Sell, ffmpeg/yt-dlp/aria2c binaries
- After each mod: AGENTS.md, AGENTS_PLAN.md, medial_support.txt, installers
