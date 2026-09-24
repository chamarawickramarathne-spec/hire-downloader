# Hire Downloader

**App Modification Memory** — update after every change.

## Overview
Windows media downloader in **Python** (pywebview + Edge WebView2 + HTML/CSS/JS frontend). Dark UI. Facebook, Instagram, TikTok, Twitter/X, and 1000+ social sites via yt-dlp. Direct file downloads. Supports **32-bit and 64-bit** Windows builds. External binary: ffmpeg.exe only.

## Current Version
- **v4.3.2** — MOD 13 (2026-09-25) — Fix Settings download path (Browse + silent fallback)

## Mod Log

### MOD 13 (v4.3.2) — 2026-09-25 — Fix Settings download path (Browse + silent fallback)
- **Bug:** Settings → Browse never worked. `browseFolder` (`frontend/js/app.js`) called the bridge directly (`window.pywebview.api.create_folder_dialog()`) instead of `pycall()`, but that endpoint returns a `json.dumps(...)` **string** which the bridge relays as a raw JS string. `dirs[0]` was therefore `'['`, the path input became `'['`, and `save_settings` (MOD 11's validation) rejected it and **silently** reset to the default `~/Downloads/Hire Downloads` while returning `{"ok": true}` — so downloads always landed in the default folder with no error shown.
- **Fix:** `browseFolder` now uses `pycall('create_folder_dialog')` (parses the JSON string → real folder path).
- **Fix (no silent fallback):** `Api.save_settings` now uses `settings._valid_download_path` and, on an invalid path, returns `{"ok": false, "error": "Invalid download path"}` WITHOUT mutating stored settings. JS `saveSettings` shows the error in `statusBar`, keeps the modal open, and re-syncs `this.settings` from the backend. Supersedes MOD 11's "falls back to default on invalid input" behavior.
- **Verified live (pywebview + WebView2, temp APPDATA):** valid path saved and persisted; bad path (`'['`) rejected and the stored path left unchanged.
- Bumped version to 4.3.2 (config, installers, UI badges).

### MOD 12 (v4.3.1) — 2026-09-25 — Fix frozen UI (Python→JS push regression)
- **Bug (critical, app-wide):** `Api._call` invoked JS push methods via `window.app.{fn}.apply(null, ...)`, so inside each method `this` was `null` and `this.downloads` / `this.renderDownloads()` / `this.renderHistory()` threw `TypeError: this.renderDownloads is not a function`. `_eval` swallowed the exception, so every Python→UI update (fetch → ready, download progress, completion, queue counts, history, updater) silently died. The card stayed on its first snapshot — direct downloads appeared to "keep fetching" forever (no Start button, no progress). Regression introduced by the MOD 11 JSON-safe `_call` rewrite.
- **Fix:** `_call` now binds the receiver: `window.app.{fn}.apply(window.app, payload)`. Method names are fixed app constants and args are JSON-serialized, so no injection surface.
- **Verified live (pywebview + WebView2):** seedr.cc direct link (891 MB .mkv) transitions fetching → ready with correct filename; Start → downloading with live progress pushes; both x64 and x86 headless API flows reach `ready`.
- Bumped version to 4.3.1 (config, installers, UI badges).

### MOD 11 (v4.3.0) — 2026-09-06 — Security audit remediation
- **Security — JS injection (critical):** replaced all untrusted-string interpolation into `evaluate_js` with JSON-serialized args (`Api._call`). `speed`, `eta`, `path`, and update-progress strings from remote sources can no longer inject JS into the pywebview bridge (was an RCE path via `open_folder`/`install_update`).
- **Security — update integrity:** downloaded installers now get SHA-256 verification when a published hash exists, Authenticode signature check (invalid signatures rejected), and lenient-but-warned acceptance with a PE sanity check when no hash is published yet. `install_update` no longer accepts arbitrary JS-supplied paths — only the managed, verified download may be installed.
- **Security — `open_folder`:** restricts launches to paths inside the configured download folder.
- **Security — scheme allow-list:** `detect_type`/`add_url` only accept `http`/`https`; `file://`, `ftp://`, etc. are rejected as unsupported.
- **Security — `download_path` validation:** settings can only store an absolute path; falls back to default on invalid input.
- **Security — atom feed:** `_check_atom` validates the release tag format; download URL stays on the fixed GitHub release-asset path.
- **Build — ffmpeg arch correctness:** `resources/ffmpeg_x64.exe` and `resources/ffmpeg_x86.exe` replace the single `ffmpeg.exe`; `config.ffmpeg_dir()` picks by process arch. SHA-256 verification added to `fetch_ffmpeg.py` (x64 pinned to `fb4565...`; x86 hash TODO — no trusted 32-bit ffmpeg verified yet).
- **Git hygiene:** removed `release/HireDownloader_32.exe` / `_64.exe` from git tracking; added `release/` to `.gitignore`. Installer assets are no longer committed; AGENTS §11/§12 flow updated.
- **Bugs fixed:** `retryDl` resets the existing item (no duplicate card); removed dead schedule settings (`schedule_enabled/start/end`); implemented Settings "Browse" via `create_file_dialog(FOLDER)`; progress updates are now targeted DOM updates (no full re-render per tick); resume falls back to fresh write when server ignores `Range`; `queue.job_started` accounting wired up; valid unique AppId GUIDs in both `.iss` files.
- Bumped version to 4.3.0 (config, installers, UI).

### MOD 10 (v4.2.0) — 2026-08-19 — Remove YouTube support
- Removed all YouTube-specific code from ytdlp_engine.py (player clients, playlist fetch, YouTube cookie logic).
- Removed YouTube from `_YTDLP_HOSTS` in util.py — YouTube URLs now rejected.
- Removed `is_playlist_url()` from util.py.
- Removed `_add_playlist()` and playlist routing from app.py.
- Removed `"youtube"` type from `detect_type()` and `uses_ytdlp()`.
- Removed `"YT"` badge from `badge_for()`.
- App now supports: Facebook, Instagram, TikTok, Twitter/X, Vimeo, Reddit, Twitch, Dailymotion, SoundCloud, and direct HTTP downloads.
- Bumped version to 4.2.0.

### MOD 9 (v4.1.0) — 2026-08-19 — Remove torrent feature
- Removed entire torrent/magnet download engine (`torrent_engine.py` deleted).
- Removed libtorrent dependency from `requirements.txt`.
- Removed `TorrentFile` dataclass from `models.py`.
- Removed torrent detection in `util.py` (`detect_type` returns `"unsupported"` for magnet/.torrent URLs).
- Magnet/torrent URLs now show clear error: "Torrent/magnet downloads are not supported."
- Removed torrent file selection modal from frontend (HTML, JS, CSS).
- Removed torrent hidden-import from PyInstaller build scripts.
- Bumped version to 4.1.0 across config, installers, and UI.

### MOD 8 (v4.0.1) — 2026-08-19 — Fix YouTube playlist false-positive
- Fixed `is_playlist_url()` treating watch URLs with `list=` param as playlists.
- `watch?v=...&list=RD...` and `youtu.be/...?list=...` now correctly treated as single video.
- Only dedicated playlist pages (`/playlist?list=...`) trigger playlist mode.
- Prevents YouTube Mix/Radio URLs from downloading entire playlist instead of one video.

## Update source
- GitHub: `chamarawickramarathne-spec/hire-downloader`
- Installer assets (fixed names, published on GitHub releases, NOT tracked in git):
  - `HireDownloader_64.exe`
  - `HireDownloader_32.exe`
- Updater picks asset by process arch

## Structure
- `main.py` — entry (pywebview window)
- `backend/` — config, util, models, queue_mgr, ytdlp_engine, direct_engine, settings, history, updater, app (controller + API)
- `frontend/` — index.html, css/style.css, js/ (app.js, downloads.js, settings.js, utils.js)
- `media/` — logo.png, icon.ico
- `resources/` — ffmpeg_x64.exe / ffmpeg_x86.exe (gitignored; fetched at build)
- `scripts/build_arch.ps1` — dual-arch PyInstaller + Inno
- `scripts/fetch_ffmpeg.py` — ffmpeg fetcher
- `build/installer_x64.iss`, `build/installer_x86.iss`

## Python
- x64: Python 3.13 → `.venv64`
- x86: Python 3.12-32 → `.venv32`
- Pip deps: pywebview, pyperclip, pyinstaller, yt-dlp

## Architecture
- pywebview hosts HTML/CSS/JS frontend with Edge WebView2
- Python API class exposed via `window.pywebview.api`
- Progress pushed to JS via `window.evaluate_js()`
- yt-dlp imported as Python library (`yt_dlp.YoutubeDL`) — not subprocess
- Direct downloads via urllib with resume support
- Settings/history stored as JSON in AppData

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
2. Build: `scripts\build_arch.ps1 -Arch x64` and `-Arch x86` (or `build.bat`)
3. `build.bat` installers land in `release/` (gitignored — do NOT commit)
4. `gh release create vX.Y.Z release/HireDownloader_64.exe release/HireDownloader_32.exe --notes "HireDownloader_64.exe: <SHA256>`nHireDownloader_32.exe: <SHA256>"`
5. The updater reads the SHA-256 from the release body for each asset and hard-fails on mismatch; if absent it warns (PE sanity + signature). Get hashes via `Get-FileHash release\*.exe -Algorithm SHA256`.

## Rules
- Modules under ~300 lines
- Do not commit venvs, dist, release, Sell, ffmpeg binaries
- After each mod: AGENTS.md, AGENTS_PLAN.md, medial_support.txt, installers
