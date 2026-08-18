from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any


STATUSES = (
    "fetching",
    "ready",
    "queued",
    "downloading",
    "paused",
    "completed",
    "error",
)


@dataclass
class FormatOption:
    format_id: str
    label: str
    ext: str = "mp4"
    resolution: str = ""


@dataclass
class DownloadItem:
    id: str
    url: str
    type: str  # youtube | social | direct | torrent
    status: str = "fetching"
    progress: float = 0.0
    speed: str = ""
    eta: str = ""
    title: str = ""
    thumbnail: str = ""
    duration: str = ""
    file_path: str = ""
    error: str = ""
    badge: str = "DL"
    formats: list[FormatOption] = field(default_factory=list)
    selected_format: str = ""
    total_size: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "url": self.url,
            "type": self.type,
            "status": self.status,
            "progress": self.progress,
            "speed": self.speed,
            "eta": self.eta,
            "title": self.title or self.url,
            "thumbnail": self.thumbnail,
            "duration": self.duration,
            "file_path": self.file_path,
            "error": self.error,
            "badge": self.badge,
            "selected_format": self.selected_format,
            "formats": [asdict(f) for f in self.formats],
            "total_size": self.total_size,
        }


@dataclass
class HistoryItem:
    id: str
    url: str
    type: str
    title: str
    file_path: str
    completed_at: str
    badge: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict[str, Any]) -> HistoryItem:
        return HistoryItem(
            id=d.get("id", ""),
            url=d.get("url", ""),
            type=d.get("type", "direct"),
            title=d.get("title", ""),
            file_path=d.get("file_path", d.get("filePath", "")),
            completed_at=d.get("completed_at", d.get("completedAt", "")),
            badge=d.get("badge", "DL"),
        )
