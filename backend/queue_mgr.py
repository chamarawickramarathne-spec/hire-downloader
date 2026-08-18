from __future__ import annotations

import threading
from collections import deque
from typing import Callable, Deque, Optional


class DownloadQueue:
    def __init__(self, max_concurrent: int = 1) -> None:
        self._max = max(1, int(max_concurrent))
        self._q: Deque[str] = deque()
        self._active: set[str] = set()
        self._lock = threading.Lock()
        self._start_fn: Optional[Callable[[str], None]] = None
        self._on_change: Optional[Callable[[int, int], None]] = None

    def set_handlers(
        self,
        start_fn: Callable[[str], None],
        on_change: Optional[Callable[[int, int], None]] = None,
    ) -> None:
        self._start_fn = start_fn
        self._on_change = on_change

    def set_max(self, n: int) -> None:
        with self._lock:
            self._max = max(1, min(10, int(n)))
        self.process()

    def enqueue(self, job_id: str) -> None:
        with self._lock:
            if job_id in self._active or job_id in self._q:
                return
            self._q.append(job_id)
        self._emit()
        self.process()

    def remove(self, job_id: str) -> None:
        with self._lock:
            self._q = deque(x for x in self._q if x != job_id)
            self._active.discard(job_id)
        self._emit()
        self.process()

    def job_started(self, job_id: str) -> None:
        with self._lock:
            self._active.add(job_id)
            self._q = deque(x for x in self._q if x != job_id)
        self._emit()

    def job_finished(self, job_id: str) -> None:
        with self._lock:
            self._active.discard(job_id)
        self._emit()
        self.process()

    def process(self) -> None:
        to_start: list[str] = []
        with self._lock:
            while len(self._active) + len(to_start) < self._max and self._q:
                jid = self._q.popleft()
                self._active.add(jid)
                to_start.append(jid)
        if to_start:
            self._emit()
        for jid in to_start:
            if self._start_fn:
                self._start_fn(jid)

    def counts(self) -> tuple[int, int]:
        with self._lock:
            return len(self._active), len(self._q)

    def _emit(self) -> None:
        if self._on_change:
            a, q = self.counts()
            self._on_change(a, q)
