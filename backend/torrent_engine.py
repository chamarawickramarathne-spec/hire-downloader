from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
from typing import Callable, Optional

from backend.config import external_path
from backend.util import format_bytes, format_duration, parse_aria2_progress


ProgressCb = Callable[[str, float, str, str], None]
DoneCb = Callable[[str, str], None]
ErrorCb = Callable[[str, str], None]
DestCb = Callable[[str, str], None]


def _aria2c_path() -> str | None:
    return external_path("aria2c.exe")


def torrent_available() -> bool:
    return _aria2c_path() is not None


def fetch_info(magnet_or_path: str, timeout: float = 30.0) -> dict:
    aria2c = _aria2c_path()
    if not aria2c:
        raise RuntimeError("aria2c.exe not found in resources/")

    if not (magnet_or_path.startswith("magnet:") or magnet_or_path.endswith(".torrent")):
        raise RuntimeError("Only magnet links and .torrent files are supported")

    tmp_dir = os.environ.get("TEMP") or os.path.expanduser("~")
    args = [
        aria2c,
        "--bt-metadata-only=true",
        "--bt-save-metadata=true",
        f"--timeout={int(timeout)}",
        "--enable-dht=true",
        "-d", tmp_dir,
        magnet_or_path,
    ]

    result = subprocess.run(
        args, capture_output=True, text=True, timeout=int(timeout) + 10,
        encoding="utf-8", errors="replace",
    )

    output = result.stdout + result.stderr

    # Try to extract torrent name and size from output
    name_match = re.search(r"[*]{3}\s+(.+?\.torrent)", output)
    name = ""
    if name_match:
        name = os.path.splitext(os.path.basename(name_match.group(1).strip()))[0]

    # Parse file info from aria2c output
    files = []
    total = 0
    for line in output.splitlines():
        fm = re.search(r"\s+\d+/([\d.]+\w+)\s+(.+)", line)
        if fm:
            size_str = fm.group(1)
            fname = fm.group(2).strip()
            files.append({"name": fname, "length": 0})

    # Try reading the saved metadata file for better info
    if not name:
        name_match2 = re.search(r"Saved metadata as (.+\.torrent)", output)
        if name_match2:
            name = os.path.splitext(os.path.basename(name_match2.group(1)))[0]

    if not name:
        # Extract from magnet link
        dn_match = re.search(r"dn=([^&]+)", magnet_or_path)
        if dn_match:
            from urllib.parse import unquote
            name = unquote(dn_match.group(1))
        else:
            name = "Torrent Download"

    return {
        "title": name,
        "thumbnail": "",
        "duration": "",
        "total_size": total,
        "formats": [],
        "files": files,
    }


class AriaDownload:
    def __init__(
        self,
        job_id: str,
        url: str,
        dest_dir: str,
        on_progress: ProgressCb,
        on_done: DoneCb,
        on_error: ErrorCb,
        on_dest: Optional[DestCb] = None,
    ) -> None:
        self.job_id = job_id
        self.url = url
        self.dest_dir = dest_dir
        self.on_progress = on_progress
        self.on_done = on_done
        self.on_error = on_error
        self.on_dest = on_dest
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
        aria2c = _aria2c_path()
        if not aria2c:
            self.on_error(self.job_id, "aria2c.exe not found")
            return

        os.makedirs(self.dest_dir, exist_ok=True)

        args = [
            aria2c,
            "-d", self.dest_dir,
            "--enable-dht=true",
            "--bt-stop-timeout=300",
            "--max-connection-per-server=16",
            "--split=16",
            "--continue=true",
            "--auto-file-renaming=false",
            "--allow-overwrite=true",
            self.url,
        ]

        try:
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
            assert self._proc.stdout is not None

            # Read stdout for download info
            for line in self._proc.stdout:
                if self._stop.is_set():
                    self._proc.terminate()
                    return
                line = line.rstrip("\n\r")
                # Extract filenames from aria2c output
                if "Download complete:" in line:
                    self.file_path = line.split("Download complete:")[-1].strip()

            # Read stderr for progress
            for line in self._proc.stderr:
                if self._stop.is_set():
                    self._proc.terminate()
                    return
                line = line.rstrip("\n\r")
                stderr_lines.append(line)
                prog = parse_aria2_progress(line)
                if prog:
                    # Calculate percentage from downloaded/total
                    pct = 0.0
                    speed = prog.get("speed", "")
                    try:
                        dl = _parse_size(prog["downloaded"])
                        tot = _parse_size(prog["total"])
                        if tot > 0:
                            pct = min(100.0, dl / tot * 100.0)
                    except Exception:
                        pass
                    self.on_progress(self.job_id, pct, speed, "")

            self._proc.wait()
            if self._stop.is_set():
                return

            if self._proc.returncode == 0:
                # Try to find downloaded file
                path = self.file_path
                if not path or not os.path.exists(path):
                    # Look in dest_dir for recent files
                    files = sorted(
                        os.listdir(self.dest_dir),
                        key=lambda f: os.path.getmtime(os.path.join(self.dest_dir, f)),
                        reverse=True,
                    )
                    if files:
                        path = os.path.join(self.dest_dir, files[0])
                self.on_done(self.job_id, path or "")
            else:
                err = "\n".join(stderr_lines[-3:]) if stderr_lines else "aria2c failed"
                self.on_error(self.job_id, err)

        except Exception as e:
            if not self._stop.is_set():
                self.on_error(self.job_id, str(e))


def _parse_size(s: str) -> float:
    """Parse size string like '15.2MiB' to bytes."""
    s = s.strip()
    multipliers = {
        "b": 1, "bytes": 1,
        "kb": 1024, "kib": 1024,
        "mb": 1024**2, "mib": 1024**2,
        "gb": 1024**3, "gib": 1024**3,
        "tb": 1024**4, "tib": 1024**4,
    }
    m = re.match(r"([\d.]+)\s*(\w+)", s.lower())
    if m:
        val = float(m.group(1))
        unit = m.group(2)
        return val * multipliers.get(unit, 1)
    return 0.0
