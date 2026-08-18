from __future__ import annotations

import os
import sys


APP_NAME = "HireDownloader"
APP_VERSION = "3.0.1"
GITHUB_OWNER = "chamarawickramarathne-spec"
GITHUB_REPO = "hire-downloader"


def is_frozen() -> bool:
    return getattr(sys, "frozen", False)


def app_dir() -> str:
    if is_frozen():
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def bundle_dir() -> str:
    if is_frozen() and hasattr(sys, "_MEIPASS"):
        return sys._MEIPASS  # type: ignore[attr-defined]
    return app_dir()


def resource_path(*parts: str) -> str:
    return os.path.join(bundle_dir(), "resources", *parts)


def media_path(*parts: str) -> str:
    return os.path.join(bundle_dir(), "media", *parts)


def app_data_dir() -> str:
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    path = os.path.join(base, APP_NAME)
    os.makedirs(path, exist_ok=True)
    return path


def is_64bit() -> bool:
    return sys.maxsize > 2**32


def installer_asset_name() -> str:
    return "HireDownloader_64.exe" if is_64bit() else "HireDownloader_32.exe"


def external_path(name: str) -> str | None:
    """Return path to an external binary in resources/ if it exists."""
    p = resource_path(name)
    return p if os.path.isfile(p) else None
