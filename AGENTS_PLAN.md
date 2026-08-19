# Hire Downloader — MOD 10 Plan: Remove YouTube Support

## Goal
Remove all YouTube-specific code to simplify the app. YouTube fetch has persistent issues; removing it lets the app focus on what works: Facebook, Instagram, TikTok, and 1000+ other social sites via yt-dlp, plus direct HTTP downloads.

## Status
- [x] Plan written
- [x] Remove YouTube from _YTDLP_HOSTS in util.py
- [x] Remove is_playlist_url() from util.py
- [x] Remove YouTube detection from detect_type() — returns "unsupported"
- [x] Remove "youtube" from uses_ytdlp()
- [x] Remove "YT" badge from badge_for()
- [x] Rewrite ytdlp_engine.py — remove _YT_CLIENTS, _client_opts, fetch_playlist, YouTube branches
- [x] Remove _add_playlist() and playlist routing from app.py
- [x] Update frontend placeholder and empty state text
- [x] Bump version to 4.2.0 (config, installers, UI)
- [x] Update AGENTS.md, AGENTS_PLAN.md, medial_support.txt
- [x] Build x64 + x86 installers
- [x] Git commit + release

## Changes Done

### 1. backend/util.py
- Removed YouTube entries from `_YTDLP_HOSTS`
- Removed `is_playlist_url()` function entirely
- `detect_type()`: no more YouTube check — YouTube URLs fall through to "direct" (which will fail gracefully)
- `uses_ytdlp()`: only returns True for "social" (removed "youtube")
- `badge_for()`: removed "YT" case

### 2. backend/ytdlp_engine.py (249 lines, was 371)
- Removed `_YT_CLIENTS` list and `_client_opts()` function
- Removed YouTube-specific branches in `fetch_info()` and `YtDownload._run()`
- Removed `fetch_playlist()` entirely
- Removed `_info_dict()` YouTube playlist entry handling
- Simplified to: base attempt → browser cookie fallback → format fallback

### 3. backend/app.py
- Removed `is_playlist_url` import
- Removed playlist routing in `add_url()`
- Removed `_add_playlist()` method entirely

### 4. frontend/index.html
- Placeholder: "Paste Facebook, Instagram, or direct URL..."
- Empty state: "Facebook · Instagram · TikTok · 1000+ sites · direct files"
- Version badge + about text: v4.2.0

### 5. Version bump
- config.py: APP_VERSION → "4.2.0"
- Both .iss installers: MyAppVersion → "4.2.0"

## Version
MOD 10 — v4.2.0

## Notes
- App now supports: Facebook, Instagram, TikTok, Twitter/X, Vimeo, Reddit, Twitch, Dailymotion, SoundCloud, and direct HTTP downloads
- YouTube URLs pasted will get "direct" type which will fail gracefully with an error
- yt-dlp is still used for all social sites — just no YouTube-specific logic
