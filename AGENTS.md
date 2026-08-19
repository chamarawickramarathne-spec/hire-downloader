# Hire Downloader

**App Modification Memory** — update after every change.

## Overview
Windows media downloader in **Python** (pywebview + Edge WebView2 + HTML/CSS/JS frontend). Dark UI. YouTube, playlists, torrents (libtorrent), direct files. Supports **32-bit and 64-bit** Windows builds. External binary: ffmpeg.exe only.

## Current Version
- **v4.0.0** — MOD 7 (2026-08-19) — Full engine rewrite

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
- `resources/` — ffmpeg.exe only (gitignored; fetched at build)
- `scripts/build_arch.ps1`, `build.bat` — dual-arch PyInstaller + Inno
- `scripts/fetch_ffmpeg.py` — ffmpeg fetcher
- `build/installer_x64.iss`, `build/installer_x86.iss`

## Python
- x64: Python 3.13 → `.venv64`
- x86: Python 3.12-32 → `.venv32`
- Pip deps: pywebview, pyperclip, pyinstaller, yt-dlp, libtorrent

## Architecture
- pywebview hosts HTML/CSS/JS frontend with Edge WebView2
- Python API class exposed via `window.pywebview.api`
- Progress pushed to JS via `window.evaluate_js()`
- yt-dlp imported as Python library (`yt_dlp.YoutubeDL`) — not subprocess
- Torrents via libtorrent Python bindings (replaced aria2c subprocess)
- Direct downloads via urllib with resume support
- Settings/history stored as JSON in AppData
- Torrent resume data stored as .fastresume files in AppData

## Mod Log

### MOD 7 (v4.0.0) — 2026-08-19 — Full engine rewrite
- Switched yt-dlp from subprocess to Python library import (`yt_dlp.YoutubeDL`)
  - Better progress tracking via progress_hooks (no stderr regex parsing)
  - Cleaner format parsing from info dict
  - Simplified retry logic (5 attempts vs 13+)
  - Browser cookie caching for YouTube
- Replaced aria2c.exe with libtorrent Python bindings
  - Session/alert loop for real-time torrent state
  - Resume data persistence (.fastresume files)
  - Per-file selection for multi-file torrents
  - Download-only mode (no seeding)
  - DHT/UPnP/NAT-PMP enabled
- Added torrent file selection modal to frontend
- Added TorrentFile dataclass to models
- Removed aria2c.exe from resources and build scripts
- Removed yt-dlp.exe from resources (now pip-installed)
- Kept ffmpeg.exe in resources (yt-dlp merge support)
- Simplified retry: no cookies → browser cookies → player clients → format fallback
- Version bumped to 4.0.0

### MOD 6 (v3.0.2) — 2026-08-19 — Update feature fix
- Fixed install_update: use ShellExecuteW with runas verb for UAC elevation.
- Fixed JS doUpdate/settingsInstallUpdate: check errors from download/install, show feedback.
- Removed window.close race condition — user closes app manually after update.

### MOD 5 (v3.0.1) — 2026-08-19 — YouTube fetch fix
- Updated yt-dlp.exe to nightly 2026.08.18 (was 2026.07.04, 6 weeks stale).
- Fixed retryDl() JS bug: now calls pycall('add_url') to re-fetch via Python instead of client-side status hack.
- Removed deprecated `android_sdkless` YouTube player client.
- Reordered player clients: `tv` (most reliable) → `mweb` → `ios+web` → `android+web` → `web`.
- Removed `--no-warnings` flag that suppressed diagnostic error output.
- Added `--socket-timeout 30` and `--extractor-retries 3` for network resilience.
- Stopped persisting `preferred_browser` on success (prevents stale cookie loops).
- Added `os.makedirs(dest, exist_ok=True)` in `_start_job` before download starts.

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
- Do not commit venvs, dist, release, Sell, ffmpeg binaries
- After each mod: AGENTS.md, AGENTS_PLAN.md, medial_support.txt, installers
