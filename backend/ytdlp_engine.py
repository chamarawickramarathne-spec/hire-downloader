"""Social download engine using yt-dlp as Python library.

Handles Facebook, Instagram, TikTok, Twitter/X, Vimeo, Reddit, etc.
Direct HTTP downloads handled separately by direct_engine.
"""

from __future__ import annotations

import os
import threading
from typing import Any, Callable, Optional

import yt_dlp

from backend.config import ffmpeg_dir
from backend.models import FormatOption
from backend.util import format_duration, friendly_ytdlp_error, make_ytdlp_hook, safe_filename

ProgressCb = Callable[[str, float, str, str], None]
DoneCb = Callable[[str, str], None]
ErrorCb = Callable[[str, str], None]
DestCb = Callable[[str, str], None]

_BROWSERS = ["edge", "chrome", "brave", "vivaldi", "firefox"]


def _base_opts(extra: dict | None = None) -> dict:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 30,
        "extractor_retries": 3,
        "ignore_noform": True,
    }
    ff = ffmpeg_dir()
    if ff:
        opts["ffmpeg_location"] = ff
    if extra:
        opts.update(extra)
    return opts


def _browser_opts(browser: str | None) -> dict:
    if not browser:
        return {}
    return {"cookiesfrombrowser": (browser,)}


def _info_dict(info: dict) -> dict:
    if not info:
        raise RuntimeError("No video info returned")
    return {
        "title": info.get("title") or info.get("fulltitle") or "Unknown",
        "thumbnail": info.get("thumbnail") or "",
        "duration": format_duration(info.get("duration") or 0) if info.get("duration") else "",
        "formats": _parse_formats(info),
        "total_size": 0,
    }


def _parse_formats(info: dict) -> list[FormatOption]:
    out: list[FormatOption] = [
        FormatOption(format_id="bv*+ba/b", label="Best (video+audio)", ext="mp4", resolution="best"),
        FormatOption(format_id="b", label="Best single file", ext="mp4", resolution="best"),
    ]
    seen_h: set[int] = set()
    formats = list(info.get("formats") or [])

    def height_of(f: dict) -> int:
        try:
            return int(f.get("height") or 0)
        except (TypeError, ValueError):
            return 0

    video_fmts = [
        f for f in formats
        if height_of(f) > 0
        and f.get("vcodec") not in (None, "none")
        and f.get("ext") != "mhtml"
    ]
    video_fmts.sort(key=height_of, reverse=True)

    for f in video_fmts:
        h = height_of(f)
        if h in seen_h:
            continue
        seen_h.add(h)
        size = f.get("filesize") or f.get("filesize_approx") or 0
        ext = str(f.get("ext") or "mp4")
        acodec = f.get("acodec")
        if acodec in (None, "none"):
            fid = f"bv*[height<={h}]+ba/b[height<={h}]/b"
            label = f"{h}p - MP4 (merge)"
        else:
            fid = str(f.get("format_id"))
            label = f"{h}p - {ext.upper()}"
        if size:
            from backend.util import format_bytes
            label += f" (~{format_bytes(size)})"
        out.append(FormatOption(format_id=fid, label=label, ext=ext, resolution=f"{h}p"))

    for f in formats:
        if f.get("vcodec") in (None, "none") or f.get("acodec") in (None, "none"):
            continue
        if f.get("ext") not in ("mp4", "webm", "mkv"):
            continue
        h = height_of(f)
        if h and h in seen_h:
            continue
        if h:
            seen_h.add(h)
        size = f.get("filesize") or f.get("filesize_approx") or 0
        label = f"{h}p - {str(f.get('ext') or 'mp4').upper()}" if h else f"Video - {f.get('ext')}"
        if size:
            from backend.util import format_bytes
            label += f" (~{format_bytes(size)})"
        out.append(FormatOption(
            format_id=str(f.get("format_id")),
            label=label,
            ext=str(f.get("ext") or "mp4"),
            resolution=f"{h}p" if h else "",
        ))

    out.append(FormatOption(format_id="ba/b", label="Audio only", ext="m4a", resolution="audio"))

    uniq: list[FormatOption] = []
    labels: set[str] = set()
    for fo in out:
        if fo.label in labels:
            continue
        labels.add(fo.label)
        uniq.append(fo)
    return uniq


def fetch_info(url: str, preferred_browser: Optional[str] = None) -> tuple[dict, Optional[str]]:
    """Fetch video metadata using yt-dlp with browser cookie retry."""
    browsers = list(_BROWSERS)
    if preferred_browser:
        browsers = [preferred_browser] + [b for b in browsers if b != preferred_browser]

    attempts: list[tuple[Optional[str], dict]] = [(None, {})]
    if preferred_browser:
        attempts.append((preferred_browser, _browser_opts(preferred_browser)))
    for b in browsers[:2]:
        if b != preferred_browser:
            attempts.append((b, _browser_opts(b)))

    last_err = "Failed to fetch video info"
    for browser, extra_opts in attempts:
        try:
            opts = _base_opts(extra_opts)
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
            if not info:
                continue
            result = _info_dict(info)
            if not result["formats"]:
                result["formats"] = [
                    FormatOption(format_id="bv*+ba/b", label="Best", ext="mp4", resolution="best")
                ]
            return result, browser or preferred_browser
        except yt_dlp.utils.DownloadError as e:
            last_err = str(e)
            continue
        except Exception as e:
            last_err = str(e)
            continue

    raise RuntimeError(friendly_ytdlp_error(last_err))


class YtDownload:
    """Download worker using yt-dlp Python library."""

    def __init__(
        self,
        job_id: str,
        url: str,
        dest_dir: str,
        format_id: str,
        on_progress: ProgressCb,
        on_done: DoneCb,
        on_error: ErrorCb,
        on_dest: Optional[DestCb] = None,
        preferred_browser: Optional[str] = None,
        resume: bool = False,
    ) -> None:
        self.job_id = job_id
        self.url = url
        self.dest_dir = dest_dir
        self.format_id = format_id or "bv*+ba/b"
        self.on_progress = on_progress
        self.on_done = on_done
        self.on_error = on_error
        self.on_dest = on_dest
        self.preferred_browser = preferred_browser
        self.resume = resume
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._ydl: Optional[yt_dlp.YoutubeDL] = None
        self.file_path = ""

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._ydl:
            try:
                self._ydl.cancel_download()
            except Exception:
                pass

    def pause(self) -> None:
        self.stop()

    def _run(self) -> None:
        outtmpl = os.path.join(self.dest_dir, "%(title).200B.%(ext)s")
        fmt = self.format_id if self.format_id not in ("", "best") else "bv*+ba/b"

        base_extra: dict[str, Any] = {
            "outtmpl": outtmpl,
            "format": fmt,
            "merge_output_format": "mp4",
            "progress_hooks": [make_ytdlp_hook(self.job_id, self.on_progress)],
        }
        if self.resume:
            base_extra["continue"] = True

        browsers = list(_BROWSERS)
        if self.preferred_browser:
            browsers = [self.preferred_browser] + [b for b in browsers if b != self.preferred_browser]

        attempts: list[tuple[Optional[str], dict]] = [(None, dict(base_extra))]
        for b in browsers:
            attempts.append((b, {**base_extra, **_browser_opts(b)}))
        fb = dict(base_extra)
        fb["format"] = "bv*+ba/b"
        attempts.append((None, fb))

        last_err = "Download failed"
        for browser, extra_opts in attempts:
            if self._stop.is_set():
                return
            try:
                opts = _base_opts(extra_opts)
                opts["outtmpl"] = extra_opts.get("outtmpl", outtmpl)
                opts["format"] = extra_opts.get("format", fmt)
                opts["merge_output_format"] = extra_opts.get("merge_output_format", "mp4")
                opts["progress_hooks"] = extra_opts.get("progress_hooks", [])
                if extra_opts.get("continue"):
                    opts["continue"] = True
                if extra_opts.get("cookiesfrombrowser"):
                    opts["cookiesfrombrowser"] = extra_opts["cookiesfrombrowser"]

                self._ydl = yt_dlp.YoutubeDL(opts)
                self._ydl.download([self.url])

                if self._stop.is_set():
                    return

                path = self.file_path
                if path and not os.path.exists(path):
                    stem, _ = os.path.splitext(path)
                    for ext in (".mp4", ".mkv", ".webm", ".m4a", ".mp3"):
                        if os.path.exists(stem + ext):
                            path = stem + ext
                            break
                self.on_done(self.job_id, path or self.file_path)
                return

            except yt_dlp.utils.DownloadError as e:
                last_err = str(e)
                continue
            except Exception as e:
                last_err = str(e)
                continue

        if not self._stop.is_set():
            self.on_error(self.job_id, friendly_ytdlp_error(last_err))
