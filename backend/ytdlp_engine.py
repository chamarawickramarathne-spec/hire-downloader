from __future__ import annotations

import json
import os
import re
import subprocess
import threading
from typing import Callable, Optional

from backend.config import external_path, resource_path
from backend.models import FormatOption
from backend.util import format_duration, friendly_ytdlp_error, parse_ytdlp_progress


ProgressCb = Callable[[str, float, str, str], None]
DoneCb = Callable[[str, str], None]
ErrorCb = Callable[[str, str], None]
DestCb = Callable[[str, str], None]

_BROWSERS = ["edge", "chrome", "brave", "vivaldi", "firefox"]

_YT_CLIENTS = [
    ["android", "web"],
    ["android_sdkless"],
    ["mweb"],
    ["tv"],
    ["ios", "web"],
    ["web"],
]


def _yt_dlp_path() -> str | None:
    return external_path("yt-dlp.exe")


def _ffmpeg_location() -> str | None:
    p = resource_path("ffmpeg.exe")
    if os.path.isfile(p):
        return os.path.dirname(p)
    return None


def _base_args(extra: list[str] | None = None) -> list[str]:
    args: list[str] = ["--quiet", "--no-warnings", "--no-playlist"]
    ff = _ffmpeg_location()
    if ff:
        args += ["--ffmpeg-location", ff]
    if extra:
        args += extra
    return args


def _with_client_args(client: list[str]) -> list[str]:
    clients = ",".join(client)
    return ["--extractor-args", f"youtube:player_client={clients}"]


def _info_dict(info: dict) -> dict:
    if not info:
        raise RuntimeError("No video info returned")
    if info.get("_type") == "playlist" and info.get("entries"):
        info = next((e for e in info["entries"] if e), info)
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
    yt = _yt_dlp_path()
    if not yt:
        raise RuntimeError("yt-dlp.exe not found in resources/")

    is_yt = bool(re.search(r"(youtube\.com|youtu\.be|music\.youtube\.com)", url or "", re.I))
    browsers = list(_BROWSERS)
    if preferred_browser:
        browsers = [preferred_browser] + [b for b in browsers if b != preferred_browser]

    attempts: list[tuple[Optional[str], list[str]]] = []

    if is_yt:
        for client in _YT_CLIENTS:
            attempts.append((None, _with_client_args(client)))
        for b in browsers:
            attempts.append((b, _with_client_args(_YT_CLIENTS[0]) + ["--cookies-from-browser", b]))
            attempts.append((b, _with_client_args(["android"]) + ["--cookies-from-browser", b]))
    else:
        attempts.append((None, []))
        for b in browsers:
            attempts.append((b, ["--cookies-from-browser", b]))

    last_err = "Failed to fetch video info"
    for browser, extra_args in attempts:
        try:
            args = [yt] + _base_args(extra_args) + ["--dump-json", url]
            result = subprocess.run(
                args, capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace",
            )
            if result.returncode != 0:
                last_err = result.stderr.strip() or result.stdout.strip() or "yt-dlp failed"
                continue
            info = json.loads(result.stdout)
            if not info:
                continue
            result_dict = _info_dict(info)
            if not result_dict["formats"]:
                result_dict["formats"] = [
                    FormatOption(format_id="bv*+ba/b", label="Best", ext="mp4", resolution="best")
                ]
            return result_dict, browser or preferred_browser
        except subprocess.TimeoutExpired:
            last_err = "yt-dlp timed out"
            continue
        except json.JSONDecodeError as e:
            last_err = f"Invalid response: {e}"
            continue
        except Exception as e:
            last_err = str(e)
            continue

    raise RuntimeError(friendly_ytdlp_error(last_err))


def fetch_playlist(url: str, preferred_browser: Optional[str] = None) -> list[dict]:
    yt = _yt_dlp_path()
    if not yt:
        raise RuntimeError("yt-dlp.exe not found in resources/")

    browsers = list(_BROWSERS)
    if preferred_browser:
        browsers = [preferred_browser] + [b for b in browsers if b != preferred_browser]

    def _try(extra: list[str] | None = None) -> list[dict]:
        args = [yt] + _base_args(extra or []) + [
            "--flat-playlist", "--dump-json", url,
        ]
        result = subprocess.run(
            args, capture_output=True, text=True, timeout=60, encoding="utf-8", errors="replace",
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or "Failed to fetch playlist")
        info = json.loads(result.stdout)
        entries = info.get("entries") or []
        out = []
        for e in entries:
            if not e:
                continue
            eid = e.get("id") or ""
            eurl = e.get("url") or e.get("webpage_url") or (
                f"https://www.youtube.com/watch?v={eid}" if eid else ""
            )
            if eurl and not str(eurl).startswith("http"):
                eurl = f"https://www.youtube.com/watch?v={eurl}"
            if not eurl:
                continue
            out.append({
                "url": eurl,
                "title": e.get("title") or "Unknown",
                "thumbnail": e.get("thumbnail") or "",
                "duration": format_duration(e.get("duration") or 0) if e.get("duration") else "",
            })
        return out

    try:
        entries = _try(_with_client_args(_YT_CLIENTS[0]))
        if entries:
            return entries
    except Exception:
        pass

    for b in browsers:
        try:
            entries = _try(_with_client_args(_YT_CLIENTS[0]) + ["--cookies-from-browser", b])
            if entries:
                return entries
        except Exception:
            continue
    raise RuntimeError("Failed to fetch playlist")


class YtDownload:
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
        self._proc: Optional[subprocess.Popen] = None
        self.file_path = ""

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._proc and self._proc.poll() is None:
            try:
                self._proc.terminate()
            except Exception:
                pass

    def pause(self) -> None:
        self.stop()

    def _run(self) -> None:
        yt = _yt_dlp_path()
        if not yt:
            self.on_error(self.job_id, "yt-dlp.exe not found")
            return

        is_yt = bool(re.search(r"(youtube\.com|youtu\.be)", self.url or "", re.I))
        outtmpl = os.path.join(self.dest_dir, "%(title).200B.%(ext)s")
        fmt = self.format_id if self.format_id not in ("", "best") else "bv*+ba/b"

        base_extra: list[str] = [
            "--newline", "--progress",
            "-o", outtmpl,
            "-f", fmt,
            "--merge-output-format", "mp4",
        ]
        if self.resume:
            base_extra.append("--continue")
        if is_yt:
            base_extra += _with_client_args(_YT_CLIENTS[0])

        browsers = list(_BROWSERS)
        if self.preferred_browser:
            browsers = [self.preferred_browser] + [b for b in browsers if b != self.preferred_browser]

        attempts: list[tuple[Optional[str], list[str]]] = [(None, base_extra)]
        for b in browsers:
            attempts.append((b, base_extra + ["--cookies-from-browser", b]))
        # format fallback
        fb = list(base_extra)
        fb_sans_fmt = [a for a in fb if a not in ("-f", fmt)]
        attempts.append((None, fb_sans_fmt + ["-f", "bv*+ba/b"]))

        last_err = "Download failed"
        for browser, extra_args in attempts:
            if self._stop.is_set():
                return
            try:
                args = [yt] + _base_args([]) + extra_args + [self.url]
                self._proc = subprocess.Popen(
                    args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )

                stderr_lines = []
                assert self._proc.stderr is not None
                for line in self._proc.stderr:
                    if self._stop.is_set():
                        self._proc.terminate()
                        return
                    line = line.rstrip("\n\r")
                    stderr_lines.append(line)
                    prog = parse_ytdlp_progress(line)
                    if prog:
                        self.on_progress(
                            self.job_id,
                            min(100.0, prog["percent"]),
                            prog.get("speed", ""),
                            prog.get("eta", ""),
                        )
                    # Detect destination filename from output
                    dm = re.search(r"\[download\]\s+Destination:\s+(.+)", line)
                    if dm:
                        self.file_path = dm.group(1).strip()
                        if self.on_dest:
                            self.on_dest(self.job_id, self.file_path)
                    # Detect merge
                    mm = re.search(r"\[Merger\]\s+Merging formats into\s+\"(.+?)\"", line)
                    if mm:
                        self.file_path = mm.group(1)
                        if self.on_dest:
                            self.on_dest(self.job_id, self.file_path)
                    # Detect already downloaded
                    ad = re.search(r"\[download\]\s+(.+)\s+has already been downloaded", line)
                    if ad:
                        self.file_path = ad.group(1).strip()
                        if self.on_dest:
                            self.on_dest(self.job_id, self.file_path)

                self._proc.wait()
                if self._stop.is_set():
                    return

                if self._proc.returncode == 0:
                    # Find the actual output file
                    path = self.file_path
                    if path and not os.path.exists(path):
                        stem, _ = os.path.splitext(path)
                        for ext in (".mp4", ".mkv", ".webm", ".m4a", ".mp3"):
                            if os.path.exists(stem + ext):
                                path = stem + ext
                                break
                    self.on_done(self.job_id, path or self.file_path)
                    return

                last_err = "\n".join(stderr_lines[-5:]) if stderr_lines else "yt-dlp returned error"
                continue
            except Exception as e:
                last_err = str(e)
                continue

        if not self._stop.is_set():
            self.on_error(self.job_id, friendly_ytdlp_error(last_err))
