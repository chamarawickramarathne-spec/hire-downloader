from __future__ import annotations

import hashlib
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

# Strictness for Authenticode signature policy. "lenient" skips the app until
# binaries are code-signed; set to "strict" once signing is in place.
_SIGNATURE_POLICY = "lenient"  # "strict" once binaries are code-signed

# Release metadata should publish each installer's SHA-256 in the release
# body, e.g. "HireDownloader_64.exe: <64-hex>". The updater reads it at
# check time so the hash travels with the release (never hard-coded).


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _asset_sha256(release_body: str, asset: str) -> str:
    """Extract the published SHA-256 for an installer asset from release notes."""
    body = (release_body or "") or ""
    m = re.search(rf"{re.escape(asset)}\s*[:=]\s*([0-9a-fA-F]{{64}})", body)
    if m:
        return m.group(1).lower()
    return ""


def _authenticode_state(path: str) -> str:
    """Return signature state: 'valid' | 'unsigned' | 'invalid' | 'unchecked'."""
    ps = (
        "$s = Get-AuthenticodeSignature -FilePath '" + path.replace("'", "''") + "'; "
        "$s.Status.ToString()"
    )
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
            capture_output=True, text=True, timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        return "unchecked"
    if out.returncode != 0:
        return "unchecked"
    return (out.stdout or "").strip().lower() or "unchecked"


def verify_installer(path: str, expected_sha256: str = "") -> tuple[bool, str]:
    """Verify an installer's integrity. Returns (ok, message).

    - If the release publishes a SHA-256 for the asset: hash must match (hard fail).
    - Authenticode signature (if present) must be valid.
    - If no hash is published yet (lenient rollout): accept but return a
      warning, and reject files that are not plausible Windows installers
      (MZ header, reasonable size).
    """
    if expected_sha256:
        actual = _sha256(path)
        if actual.lower() != expected_sha256.lower():
            return False, "Installer checksum mismatch (SHA-256)"
        sig = _authenticode_state(path)
        if sig == "invalid":
            return False, "Installer signature is invalid"
        if sig == "valid":
            return True, "Installer verified (SHA-256 + signature)"
        if _SIGNATURE_POLICY == "strict":
            return False, f"Installer signature check failed ({sig})"
        return True, f"Installer checksum OK (signature: {sig})"

    # No hash published: lenient default — sanity-check the file.
    sig = _authenticode_state(path)
    if sig == "invalid":
        return False, "Installer signature is invalid"
    try:
        with open(path, "rb") as f:
            head = f.read(2)
        size = os.path.getsize(path)
    except OSError:
        return False, "Installer unreadable"
    if head != b"MZ" or size < 1_000_000:
        return False, "Installer file is not a valid Windows executable"
    status = "signed" if sig == "valid" else ("unsigned" if sig == "unsigned" else sig)
    return True, f"Installer accepted (no published checksum; {status}) - publish SHA-256 in release notes"


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
        "expected_sha256": _asset_sha256(str(data.get("body") or ""), asset),
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
    if not re.match(r"^\d+(\.\d+){1,3}$", tag):
        raise RuntimeError("Unrecognized release version")
    # Atom is only a version-notification fallback. The installer is only
    # downloaded from the GitHub release asset path (fixed host, fixed asset name).
    dl = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/v{tag}/{asset}"
    return {
        "has_update": is_newer(tag, current),
        "current_version": current,
        "latest_version": tag,
        "download_url": dl,
        "asset_name": asset,
        "size_bytes": 0,
        "release_notes": "",
        "expected_sha256": "",
    }


def updates_dir() -> str:
    path = os.path.join(app_data_dir(), "updates")
    os.makedirs(path, exist_ok=True)
    return path


def installer_path() -> str:
    return os.path.join(updates_dir(), installer_asset_name())


def meta_path() -> str:
    return os.path.join(updates_dir(), "update.json")


def download_update(
    url: str,
    version: str,
    on_progress: Optional[ProgressCb] = None,
    expected_sha256: str = "",
) -> str:
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
    ok, msg = verify_installer(dest, expected_sha256)
    if not ok:
        try:
            os.remove(dest)
        except OSError:
            pass
        raise RuntimeError(msg)
    with open(meta_path(), "w", encoding="utf-8") as f:
        json.dump({"version": version, "expected_sha256": expected_sha256}, f)
    if on_progress:
        on_progress("complete", received, total)
    return dest


def get_downloaded_installer() -> Optional[str]:
    path = installer_path()
    if not os.path.isfile(path):
        return None
    version = ""
    expected_sha256 = ""
    try:
        with open(meta_path(), "r", encoding="utf-8") as f:
            meta = json.load(f)
            version = meta.get("version") or ""
            expected_sha256 = meta.get("expected_sha256") or ""
    except (OSError, json.JSONDecodeError):
        version = ""
    if not version or not is_newer(version, APP_VERSION):
        for p in (path, meta_path()):
            try:
                os.remove(p)
            except OSError:
                pass
        return None
    ok, _ = verify_installer(path, expected_sha256)
    if not ok:
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
    expected_sha256 = ""
    try:
        with open(meta_path(), "r", encoding="utf-8") as f:
            expected_sha256 = (json.load(f).get("expected_sha256") or "")
    except (OSError, json.JSONDecodeError):
        expected_sha256 = ""
    ok, msg = verify_installer(installer, expected_sha256)
    if not ok:
        raise RuntimeError(msg)
    import ctypes
    hinstance = ctypes.windll.shell32.ShellExecuteW(
        None, "runas", installer, None, os.path.dirname(installer), 1
    )
    if hinstance <= 32:
        raise RuntimeError(f"Failed to launch installer (code {hinstance})")
