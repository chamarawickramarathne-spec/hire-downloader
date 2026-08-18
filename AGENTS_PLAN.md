# Hire Downloader — v3.0 pywebview Rebuild Plan

## Goal
Replace customtkinter + libtorrent with pywebview + HTML/CSS/JS frontend + aria2c for torrents. yt-dlp as external binary. Target: dramatically smaller exe.

## Status
- [x] Plan approved
- [x] Backend foundation (config, util, models, queue, history, settings)
- [x] Download engines (ytdlp subprocess, direct HTTP, aria2c torrent)
- [x] App controller + pywebview Python API
- [x] Frontend (HTML/CSS/JS with dark theme)
- [x] Build system (requirements, build scripts, installers)
- [x] Delete old ui/ core/ resources_x86/
- [x] Update AGENTS.md, AGENTS_PLAN.md, medial_support.txt
- [ ] Build + test (pending — requires venv setup)

## Version
3.0.0

## Tech Stack
- pywebview 5.x + Edge WebView2 (GUI)
- HTML5 / CSS3 / Vanilla JS (frontend)
- yt-dlp.exe (subprocess — YouTube extraction)
- aria2c.exe (subprocess — torrent/magnet)
- ffmpeg.exe (external — media processing)
- PyInstaller (packaging)
- Inno Setup 6 (installer)

## Pip Dependencies
- pywebview
- pyperclip
- pyinstaller

## Assets
- release/HireDownloader-Setup-x64.exe
- release/HireDownloader-Setup-x86.exe

## Notes
- yt-dlp called as subprocess, not Python import → keeps exe small
- aria2c replaces libtorrent → single small binary for BT downloads
- Progress pushed to JS via window.evaluate_js() from Python threads
- Settings/history in AppData as JSON (same as v2.0)
