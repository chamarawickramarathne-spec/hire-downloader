# Hire Downloader — MOD 5 Plan: YouTube Fetch Fix

## Goal
Fix YouTube video fetching failures caused by stale yt-dlp, broken retry, deprecated player clients, and poor error handling.

## Status
- [x] Plan written
- [x] Update yt-dlp.exe to latest (2026.07.04 → latest)
- [x] Fix retryDl() to re-fetch via Python API
- [x] Update _YT_CLIENTS list + priority order
- [x] Fix _base_args() — remove --no-warnings, add --socket-timeout/--extractor-retries
- [x] Fix preferred_browser persistence (don't persist stale cookies)
- [x] Add os.makedirs in _start_job for download dir
- [x] Update AGENTS.md, AGENTS_PLAN.md, medial_support.txt
- [ ] Build + test

## Root Causes
1. **yt-dlp.exe v2026.07.04** — 6 weeks old, YouTube breaks yt-dlp weekly
2. **retryDl() JS bug** — sets status client-side without calling Python, item has no formats
3. **`android_sdkless` deprecated** — silently fails
4. **`--no-warnings` suppresses diagnostics** — errors become generic "yt-dlp failed"
5. **Client priority suboptimal** — `tv` is most reliable but tried 4th
6. **No network resilience** — missing timeout/retry flags
7. **`preferred_browser` persistence** — stale cookies waste attempts

## Changes Done

### 1. Update yt-dlp.exe
- Fetched latest release from GitHub yt-dlp/yt-dlp

### 2. frontend/js/app.js — Fix retryDl()
- Removed client-side status manipulation
- Now calls `pycall('add_url', item.url)` to re-fetch via Python

### 3. backend/ytdlp_engine.py — Update _YT_CLIENTS
```python
_YT_CLIENTS = [
    ["tv"],           # Most reliable unauthenticated
    ["mweb"],         # Mobile web, less restricted
    ["ios", "web"],   # iOS client combo
    ["android", "web"],
    ["web"],
]
```
Removed `android_sdkless`. Moved `tv` to first position.

### 4. backend/ytdlp_engine.py — Fix _base_args()
- Removed `--no-warnings`
- Added `--socket-timeout 30` and `--extractor-retries 3`

### 5. backend/app.py — Fix preferred_browser
- Removed auto-persistence of browser on success
- Browser cookies can go stale; fresh each session is safer

### 6. backend/app.py — Add os.makedirs in _start_job
- Added `os.makedirs(dest, exist_ok=True)` before download starts

## Version
MOD 5 — v3.0.1

## Notes
- yt-dlp update is the single most impactful fix
- retryDl bug meant ALL failed fetches could never be retried properly
- Client order matters: YouTube rate-limits differently per client
- `tv` client is now first — most reliable unauthenticated client in 2026
