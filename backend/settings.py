from __future__ import annotations

import json
import os
from copy import deepcopy

from backend.config import app_data_dir


DEFAULT_SETTINGS = {
    "download_path": os.path.join(os.path.expanduser("~"), "Downloads", "Hire Downloads"),
    "max_concurrent": 1,
    "preferred_browser": None,
}


def _settings_path() -> str:
    return os.path.join(app_data_dir(), "settings.json")


def _valid_download_path(path: str) -> bool:
    if not path or not isinstance(path, str):
        return False
    if not os.path.isabs(path):
        return False
    return True


def load_settings() -> dict:
    path = _settings_path()
    settings = deepcopy(DEFAULT_SETTINGS)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                settings.update(json.load(f))
        except (json.JSONDecodeError, OSError):
            pass
    dl = settings.get("download_path") or DEFAULT_SETTINGS["download_path"]
    if not _valid_download_path(dl):
        dl = DEFAULT_SETTINGS["download_path"]
    os.makedirs(dl, exist_ok=True)
    settings["download_path"] = dl
    return settings


def save_settings(settings: dict) -> None:
    path = _settings_path()
    dl = settings.get("download_path")
    if not _valid_download_path(dl):
        settings["download_path"] = DEFAULT_SETTINGS["download_path"]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(settings, f, indent=2)
