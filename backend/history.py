from __future__ import annotations

import json
import os
from typing import List

from backend.config import app_data_dir
from backend.models import HistoryItem


def _path() -> str:
    return os.path.join(app_data_dir(), "history.json")


def load_history() -> List[HistoryItem]:
    path = _path()
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return [HistoryItem.from_dict(x) for x in data]
    except (json.JSONDecodeError, OSError, TypeError):
        return []


def save_history(items: List[HistoryItem]) -> None:
    with open(_path(), "w", encoding="utf-8") as f:
        json.dump([i.to_dict() for i in items], f, indent=2)
