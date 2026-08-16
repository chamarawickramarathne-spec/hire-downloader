# Hire Downloader

**App Modification Memory** — update after every change.

## Overview
Windows Electron media downloader (React + Tailwind + yt-dlp + WebTorrent). Dark UI. Downloads YouTube, playlists, torrents, direct files.

## Current Version
- **v1.1.0** — MOD 1 (2026-08-16)

## Update source
- GitHub: `chamarawickramarathne-spec/hire-downloader`
- Installer asset (fixed name): `HireDownloader-Setup.exe`
- In-app updater: GitHub Releases API + Atom feed fallback

## Structure
- `src/main/` — Electron main (settings, queue, ytdlp, direct, torrent, updater, ipc, tray)
- `src/preload/` — contextBridge API
- `src/renderer/` — React UI
- `resources/` — yt-dlp.exe, ffmpeg.exe, tray-icon.png
- `scripts/build.ps1` / `build.bat` — typecheck + win build → `release/HireDownloader-Setup.exe`
- `scripts/download-binaries.js` — postinstall binary fetch

## Mod Log

### MOD 1 (v1.1.0) — 2026-08-16 — Optimize + GIT update
- Split main process into modules (queue, ytdlp, cookies, direct, torrent, updater, ipc, tray, settings, history).
- Fixed concurrent download queue (jobs only start when slots free).
- Faster sequential cookie browser discovery + preferred browser in settings.
- Shared WebTorrent client; direct download speed/ETA + Range resume.
- Playlist URL expansion; pause/resume UI for YT/direct/torrent.
- GIT updater (check/download/install) + Header UpdateBadge + Settings About.
- Fixed installer name `HireDownloader-Setup.exe` (no version); build.ps1/bat.
- ffmpeg fetch from yt-dlp FFmpeg-Builds zip.

## Build / release
1. Bump `package.json` version
2. `.\build.bat` or `npm run release`
3. Commit + push
4. `gh release create vX.Y.Z -a release/HireDownloader-Setup.exe --title "..." --notes "..."`

## Rules
- Keep modules under ~300 lines
- Do not commit `node_modules/`, `dist/`, `release/`, `Final/`, Sell folder, binaries
- After each mod: update this file, AGENTS_PLAN.md, medial_support.txt; produce installer
