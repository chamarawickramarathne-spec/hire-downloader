# Hire Downloader — MOD 12 Plan: Fix frozen UI (Python→JS push regression)

## Goal
Restore all Python→UI updates that were broken by the MOD 11 JSON-safe `_call` rewrite.

## Status
- [x] Root cause confirmed live (pywebview + WebView2, real JS bridge): every `_call` push threw `TypeError: this.renderDownloads is not a function` because `_call` used `window.app.{fn}.apply(null, ...)` (`this === null`); `_eval` swallowed it → UI frozen at first snapshot ("fetching" forever, no progress).
- [x] Fix: `Api._call` now uses `.apply(window.app, ...)` (binds `this`; fixed method names + JSON args → no injection surface).
- [x] Verified live: seedr direct link transitions fetching → ready (filename shown), Start → downloading with progress; x64 + x86 headless API both reach `ready`.
- [x] Bump version to 4.3.1 (config, installers, UI).
- [x] Update AGENTS.md, AGENTS_PLAN.md, medial_support.txt.
- [x] Build x64 + x86 installers (both succeeded; bundles verified to contain v4.3.1 frontend).
- [x] Test both builds (both packaged exes launch and stay running; live GUI test: fetch → ready → Start → progress; x64 + x86 headless both reach ready).
- [ ] Git commit + release (with published SHA-256 hashes)

## Changes Done
- `backend/app.py` `Api._call`: `window.app.{method}.apply(null, ...)` → `window.app.{method}.apply(window.app, ...)`.
- Version bumps: `backend/config.py`, `build/installer_x64.iss`, `build/installer_x86.iss`, `frontend/index.html` badges.

## Version
MOD 12 — v4.3.1

# Previous — Hire Downloader — MOD 11 Plan: Security Audit Remediation

## Goal
Fix all security issues and bugs found in the full-app security audit, harden the update pipeline, and align with global AGENTS rules (release hygiene, ffmpeg arch correctness).

## Status
- [x] Plan written
- [x] Kill untrusted-string JS injection in the pywebview bridge (JSON args)
- [x] Harden update integrity: SHA-256 + lenient Authenticode + PE sanity check
- [x] Restrict `install_update` to managed downloads (no JS-supplied path)
- [x] Restrict `open_folder` to the configured download folder
- [x] HTTP(S) scheme allow-list in `detect_type`/`add_url`
- [x] `download_path` absolute-path validation (settings + save time)
- [x] `_check_atom` validates release tag; URL stays on fixed GitHub asset path
- [x] ffmpeg: arch-specific files (ffmpeg_x64.exe / ffmpeg_x86.exe) + SHA-256 verify
- [x] Git hygiene: remove release binaries from tracking, gitignore `release/`
- [x] Fix bugs: retryDl duplicate, dead schedule settings, Browse no-op, progress re-render, resume corruption, job_started accounting, malformed installer GUIDs
- [x] Bump version to 4.3.0 (config, installers, UI)
- [x] Update AGENTS.md, AGENTS_PLAN.md, medial_support.txt
- [ ] Build x64 + x86 installers
- [ ] Test both builds
- [ ] Git commit + release (with published SHA-256 hashes)

## Changes Done

### Security — critical
- `backend/app.py`: added `Api._call(method, *args)` — all `evaluate_js` calls now pass JSON-serialized args (no string interpolation). `updateDownloadProgress`, `updateDownloadDest`, `updateProgress`, `updateDownloads`, `updateHistory`, `updateQueue` all use it.
- `backend/app.py`: `install_update()` no longer takes a JS path — only the managed `get_downloaded_installer()`.
- `backend/updater.py`: `download_update` verifies integrity after download (SHA-256 when hash published; lenient default otherwise); `get_downloaded_installer`/`install_update` re-verify; invalid Authenticode rejected.
- `backend/app.py`: `open_folder` restricted to paths inside `download_path`.
- `backend/util.py`: `has_allowed_scheme()` — `detect_type` rejects non-`http(s)`.
- `backend/settings.py` + `app.py`: `download_path` must be absolute or falls back to default.

### Build / environment
- `scripts/fetch_ffmpeg.py`: downloads arch-specific `ffmpeg_x64.exe`/`ffmpeg_x86.exe` with SHA-256 verification; x64 hash pinned (`fb4565...`).
- `backend/config.py`: `ffmpeg_dir()` picks `ffmpeg_{x64|x86}.exe` by process arch.
- `scripts/build_arch.ps1`: checks the correct arch-specific ffmpeg.
- `.gitignore`: added `release/`, `resources/ffmpeg_x64.exe`, `resources/ffmpeg_x86.exe`.
- Removed `release/HireDownloader_32.exe`, `release/HireDownloader_64.exe` from git.

### Bugs
- `frontend/js/app.js` `retryDl` now calls `retry_download(id, url)` which resets the existing item (no duplicate card).
- Removed dead `schedule_enabled/start/end` settings + UI (settings.js, index.html).
- `browseFolder` implemented via `create_folder_dialog` → `webview` `create_file_dialog(FOLDER)`.
- `DownloadsUI.updateProgress` targeted update; `updateDownloadProgress` no longer re-renders whole list per tick.
- `direct_engine.py`: resume falls back to `"wb"` when server ignores `Range` (only appends on `206`).
- `queue.job_started(job_id)` wired into `_start_job`.
- Valid unique GUID AppIds for both Inno installers.

## Version
MOD 11 — v4.3.0

## Notes
- Update pipeline: the release notes must publish each asset's SHA-256 (e.g. `HireDownloader_64.exe: <hex>`); the updater reads it at check time and hard-fails on mismatch. If absent, updates are accepted leniently (PE sanity + signature check) with a warning. Hash is NEVER hard-coded — so the next release can't false-mismatch.
- x86 ffmpeg: no trusted 32-bit hash pinned yet — build will warn if `ffmpeg_x86.exe` is missing.