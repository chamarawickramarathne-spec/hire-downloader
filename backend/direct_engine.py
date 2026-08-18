from __future__ import annotations

import os
import re
import threading
import urllib.error
import urllib.request
from typing import Callable, Optional
from urllib.parse import unquote, urlparse

from backend.util import RateMeter, format_bytes, format_eta, safe_filename


ProgressCb = Callable[[str, float, str, str], None]
DoneCb = Callable[[str, str], None]
ErrorCb = Callable[[str, str], None]
DestCb = Callable[[str, str], None]


def fetch_info(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "HireDownloader/3.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return _info_from_response(url, resp)
    except urllib.error.HTTPError as e:
        if e.code in (403, 405, 501):
            req = urllib.request.Request(url, method="GET", headers={"User-Agent": "HireDownloader/3.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                info = _info_from_response(url, resp)
                resp.close()
                return info
        raise


def _info_from_response(url: str, resp) -> dict:
    final = resp.geturl() or url
    headers = {k.lower(): v for k, v in resp.headers.items()}
    length = int(headers.get("content-length") or 0)
    name = _filename(final, headers.get("content-disposition", ""))
    return {
        "title": name,
        "file_name": name,
        "total_size": length,
        "thumbnail": "",
        "duration": "",
        "formats": [],
    }


def _filename(url: str, disposition: str) -> str:
    m = re.search(r"filename\*?=(?:UTF-8''|\"?)([^\";\n]+)", disposition or "", re.I)
    if m:
        return safe_filename(unquote(m.group(1).strip('"')))
    path = urlparse(url).path
    base = unquote(os.path.basename(path)) or "download"
    return safe_filename(base)


class DirectDownload:
    def __init__(
        self,
        job_id: str,
        url: str,
        dest_dir: str,
        on_progress: ProgressCb,
        on_done: DoneCb,
        on_error: ErrorCb,
        on_dest: Optional[DestCb] = None,
        resume: bool = False,
    ) -> None:
        self.job_id = job_id
        self.url = url
        self.dest_dir = dest_dir
        self.on_progress = on_progress
        self.on_done = on_done
        self.on_error = on_error
        self.on_dest = on_dest
        self.resume = resume
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self.file_path = ""

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()

    def pause(self) -> None:
        self.stop()

    def _run(self) -> None:
        try:
            self._download(self.url, 0)
        except Exception as e:
            if not self._stop.is_set():
                self.on_error(self.job_id, str(e))

    def _download(self, url: str, redirects: int) -> None:
        if redirects > 10:
            raise RuntimeError("Too many redirects")
        name = _filename(url, "")
        path = os.path.join(self.dest_dir, name)
        existing = 0
        headers = {"User-Agent": "HireDownloader/3.0"}
        if self.resume and os.path.exists(path):
            existing = os.path.getsize(path)
            if existing > 0:
                headers["Range"] = f"bytes={existing}-"

        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status in (301, 302, 303, 307, 308):
                loc = resp.headers.get("Location")
                if loc:
                    self._download(loc, redirects + 1)
                    return
            if resp.status not in (200, 206):
                raise RuntimeError(f"HTTP {resp.status}")

            name = _filename(resp.geturl() or url, resp.headers.get("Content-Disposition", ""))
            path = os.path.join(self.dest_dir, name)
            if self.resume and os.path.exists(path) and resp.status == 206:
                existing = os.path.getsize(path)
            else:
                existing = 0

            cl = int(resp.headers.get("Content-Length") or 0)
            total = existing + cl if resp.status == 206 else cl
            self.file_path = path
            if self.on_dest:
                self.on_dest(self.job_id, path)

            mode = "ab" if existing and resp.status == 206 else "wb"
            meter = RateMeter()
            downloaded = existing
            with open(path, mode) as f:
                while not self._stop.is_set():
                    chunk = resp.read(256 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    speed = meter.update(downloaded)
                    pct = (downloaded / total * 100.0) if total else 0.0
                    eta = ""
                    if speed > 0 and total:
                        eta = format_eta((total - downloaded) / speed)
                    self.on_progress(
                        self.job_id,
                        min(100.0, pct),
                        f"{format_bytes(speed)}/s" if speed else "",
                        eta,
                    )

            if self._stop.is_set():
                return
            self.on_done(self.job_id, path)
