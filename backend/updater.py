from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from typing import Callable, Optional

from backend.config import (
    APP_VERSION,
    GITHUB_OWNER,
    GITHUB_REPO,
    app_data_dir,
    installer_asset_name,
)
from backend.util import is_newer


UA = "HireDownloader-Updater/3.0"
ProgressCb = Callable[[str, int, int], None]


def _get(url: str, timeout: int = 30) -> tuple[int, bytes, dict]:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/vnd.github+json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        body = e.read() if hasattr(e, "read") else b""
        return e.code, body, dict(getattr(e, "headers", {}) or {})


def _github_err(status: int) -> str:
    if status in (403, 429):
        return "GitHub API rate limit reached \u2014 try again later"
    return f"GitHub error HTTP {status}"


def check_for_update() -> dict:
    current = APP_VERSION
    asset = installer_asset_name()
    try:
        return _check_api(current, asset)
    except Exception as api_err:
        try:
            return _check_atom(current, asset)
        except Exception:
            raise RuntimeError(str(api_err)) from api_err


def _check_api(current: str, asset: str) -> dict:
    url = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest"
    status, body, _ = _get(url)
    if status != 200:
        raise RuntimeError(_github_err(status))
    data = json.loads(body.decode("utf-8", errors="replace"))
    tag = str(data.get("tag_name") or "").lstrip("vV")
    assets = data.get("assets") or []
    found = next((a for a in assets if a.get("name") == asset), None)
    if not found:
        raise RuntimeError(f"Release asset {asset} not found")
    return {
        "has_update": is_newer(tag, current),
        "current_version": current,
        "latest_version": tag,
        "download_url": found.get("browser_download_url") or "",
        "asset_name": asset,
        "size_bytes": int(found.get("size") or 0),
        "release_notes": str(data.get("body") or "")[:2000],
    }


def _check_atom(current: str, asset: str) -> dict:
    url = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases.atom"
    status, body, _ = _get(url)
    if status != 200:
        raise RuntimeError(_github_err(status))
    text = body.decode("utf-8", errors="replace")
    m = re.search(r"<entry>[\s\S]*?<title>([^<]+)</title>", text)
    if not m:
        raise RuntimeError("No releases found")
    tag = m.group(1).strip().lstrip("vV")
    dl = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/v{tag}/{asset}"
    return {
        "has_update": is_newer(tag, current),
        "current_version": current,
        "latest_version": tag,
        "download_url": dl,
        "asset_name": asset,
        "size_bytes": 0,
        "release_notes": "",
    }


def updates_dir() -> str:
    path = os.path.join(app_data_dir(), "updates")
    os.makedirs(path, exist_ok=True)
    return path


def installer_path() -> str:
    return os.path.join(updates_dir(), installer_asset_name())


def meta_path() -> str:
    return os.path.join(updates_dir(), "update.json")


def download_update(url: str, version: str, on_progress: Optional[ProgressCb] = None) -> str:
    dest = installer_path()
    if on_progress:
        on_progress("starting", 0, 0)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        total = int(resp.headers.get("Content-Length") or 0)
        received = 0
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(256 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                received += len(chunk)
                if on_progress:
                    on_progress("downloading", received, total)
    with open(meta_path(), "w", encoding="utf-8") as f:
        json.dump({"version": version}, f)
    if on_progress:
        on_progress("complete", received, total)
    return dest


def get_downloaded_installer() -> Optional[str]:
    path = installer_path()
    if not os.path.isfile(path):
        return None
    version = ""
    try:
        with open(meta_path(), "r", encoding="utf-8") as f:
            version = json.load(f).get("version") or ""
    except (OSError, json.JSONDecodeError):
        version = ""
    if not version or not is_newer(version, APP_VERSION):
        for p in (path, meta_path()):
            try:
                os.remove(p)
            except OSError:
                pass
        return None
    return path


def install_update(path: Optional[str] = None) -> None:
    installer = path or get_downloaded_installer()
    if not installer or not os.path.isfile(installer):
        raise RuntimeError("Installer not found")
    import ctypes
    hinstance = ctypes.windll.shell32.ShellExecuteW(
        None, "runas", installer, None, os.path.dirname(installer), 1
    )
    if hinstance <= 32:
        raise RuntimeError(f"Failed to launch installer (code {hinstance})")
