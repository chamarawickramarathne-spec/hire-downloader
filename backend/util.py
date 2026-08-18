from __future__ import annotations

import os
import re
import time
import uuid


def new_id() -> str:
    return uuid.uuid4().hex[:12]


def format_bytes(n: float) -> str:
    try:
        n = float(n)
    except (TypeError, ValueError):
        return "0 B"
    if n <= 0:
        return "0 B"
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    while n >= 1024 and i < len(units) - 1:
        n /= 1024.0
        i += 1
    return f"{n:.1f} {units[i]}"


def format_duration(seconds: float) -> str:
    try:
        seconds = int(seconds)
    except (TypeError, ValueError):
        return ""
    if seconds < 0:
        seconds = 0
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def format_eta(seconds: float) -> str:
    try:
        seconds = int(seconds)
    except (TypeError, ValueError):
        return ""
    if seconds < 0:
        return ""
    if seconds < 60:
        return f"{seconds}s"
    m, s = divmod(seconds, 60)
    if m < 60:
        return f"{m}m {s}s"
    h, m = divmod(m, 60)
    return f"{h}h {m}m"


_YTDLP_HOSTS = (
    r"youtube\.com",
    r"youtu\.be",
    r"music\.youtube\.com",
    r"facebook\.com",
    r"fb\.watch",
    r"fb\.com",
    r"m\.facebook\.com",
    r"instagram\.com",
    r"tiktok\.com",
    r"vm\.tiktok\.com",
    r"twitter\.com",
    r"x\.com",
    r"vimeo\.com",
    r"reddit\.com",
    r"redd\.it",
    r"twitch\.tv",
    r"dailymotion\.com",
    r"soundcloud\.com",
)


def is_ytdlp_url(url: str) -> bool:
    u = (url or "").strip().lower()
    if not u:
        return False
    return any(re.search(h, u) for h in _YTDLP_HOSTS)


def detect_type(url: str) -> str:
    u = (url or "").strip()
    if re.match(r"^(magnet:|udp:)", u, re.I) or re.search(r"\.torrent(\?|$)", u, re.I):
        return "torrent"
    if re.search(r"(youtube\.com|youtu\.be|music\.youtube\.com)", u, re.I):
        return "youtube"
    if is_ytdlp_url(u):
        return "social"
    return "direct"


def uses_ytdlp(dtype: str) -> bool:
    return dtype in ("youtube", "social")


def is_playlist_url(url: str) -> bool:
    u = url or ""
    if re.search(r"(facebook|instagram|tiktok|twitter|x\.com)", u, re.I):
        return False
    return bool(re.search(r"[?&]list=", u, re.I))


def badge_for(dtype: str, url: str = "") -> str:
    u = (url or "").lower()
    if dtype == "youtube":
        return "YT"
    if dtype == "torrent":
        return "TOR"
    if dtype == "social":
        if "facebook" in u or "fb.watch" in u or "fb.com" in u:
            return "FB"
        if "instagram" in u:
            return "IG"
        if "tiktok" in u:
            return "TT"
        if "twitter" in u or "x.com" in u:
            return "X"
        if "vimeo" in u:
            return "VM"
        return "WEB"
    return "DL"


def parse_semver(v: str) -> list[int]:
    clean = (v or "").strip().lstrip("vV").split("-")[0].split("+")[0]
    parts = []
    for p in clean.split("."):
        try:
            parts.append(int(p))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return parts


def is_newer(latest: str, current: str) -> bool:
    a, b = parse_semver(latest), parse_semver(current)
    return a > b


class RateMeter:
    def __init__(self) -> None:
        self._t = time.time()
        self._bytes = 0
        self.speed = 0.0

    def update(self, total_downloaded: int) -> float:
        now = time.time()
        dt = now - self._t
        if dt >= 0.4:
            self.speed = max(0.0, (total_downloaded - self._bytes) / dt)
            self._bytes = total_downloaded
            self._t = now
        return self.speed


def safe_filename(name: str) -> str:
    name = re.sub(r'[<>:"/\\|?*]', "_", name or "download")
    name = name.strip(" .")
    return name[:180] or "download"


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def friendly_ytdlp_error(err: str) -> str:
    e = (err or "").lower()
    if any(x in e for x in ("sign in", "bot", "captcha", "confirm you're not", "login required")):
        return "Site blocked the request. Open the page in Edge/Chrome, play once, then retry."
    if "private" in e or "unavailable" in e:
        return "Video unavailable or private."
    if "403" in e or "forbidden" in e:
        return "Access denied (403). Try again or open the site in your browser first."
    if "ffmpeg" in e:
        return "ffmpeg missing or failed while merging video+audio."
    msg = (err or "Download failed").strip()
    return msg[:240]


def parse_ytdlp_progress(line: str) -> dict | None:
    """Parse yt-dlp stderr progress line. Returns dict with pct/speed/eta or None."""
    m = re.search(
        r"\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)\s+at\s+([\d.]+\w+/s)\s+ETA\s+(\S+)",
        line,
    )
    if m:
        return {
            "percent": float(m.group(1)),
            "total": m.group(2),
            "speed": m.group(3),
            "eta": m.group(4),
        }
    m2 = re.search(r"\[download\]\s+([\d.]+)%\s+of\s+~?([\d.]+\w+)", line)
    if m2:
        return {"percent": float(m2.group(1)), "total": m2.group(2), "speed": "", "eta": ""}
    return None


def parse_aria2_progress(line: str) -> dict | None:
    """Parse aria2c stderr progress line."""
    m = re.search(r"\[DL:([\d.]+\w+)\(([\d.]+\w+)\)\s+CN:(\d+)\s+DL:([\d.]+\w+/s)", line)
    if m:
        downloaded = m.group(1)
        total = m.group(2)
        return {"downloaded": downloaded, "total": total, "peers": m.group(3), "speed": m.group(4)}
    return None
