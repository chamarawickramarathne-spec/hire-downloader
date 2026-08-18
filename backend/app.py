from __future__ import annotations

import json
import os
import subprocess
import threading
from datetime import datetime
from typing import Any, Optional

from backend import direct_engine, history as history_mod, ytdlp_engine, torrent_engine
from backend.config import APP_VERSION, GITHUB_OWNER, GITHUB_REPO, app_data_dir
from backend.models import DownloadItem, FormatOption, HistoryItem
from backend.queue_mgr import DownloadQueue
from backend.settings import load_settings, save_settings
from backend.util import badge_for, detect_type, friendly_ytdlp_error, is_playlist_url, new_id, uses_ytdlp


class Api:
    """Exposed to JavaScript via pywebview js_api."""

    def __init__(self) -> None:
        self._window: Any = None
        self.settings = load_settings()
        self.items: dict[str, DownloadItem] = {}
        self.order: list[str] = []
        self.history: list[HistoryItem] = history_mod.load_history()
        self.queue = DownloadQueue(self.settings.get("max_concurrent", 1))
        self._workers: dict[str, object] = {}
        self._lock = threading.Lock()
        self._last_schedule = ""
        self.queue.set_handlers(self._start_job, self._queue_changed)

    def set_window(self, window: Any) -> None:
        self._window = window

    # ── JS-callable methods ──────────────────────────────────────

    def get_version(self) -> str:
        return APP_VERSION

    def get_settings(self) -> dict:
        return dict(self.settings)

    def save_settings(self, data: dict) -> str:
        self.settings.update(data)
        save_settings(self.settings)
        self.queue.set_max(int(self.settings.get("max_concurrent", 1)))
        return json.dumps({"ok": True})

    def add_url(self, url: str) -> str:
        url = (url or "").strip()
        if not url:
            return json.dumps({"error": "Empty URL"})
        dtype = detect_type(url)
        if dtype == "youtube" and is_playlist_url(url):
            threading.Thread(target=self._add_playlist, args=(url,), daemon=True).start()
            return json.dumps({"ok": True, "type": "playlist"})
        if dtype == "torrent" and not torrent_engine.torrent_available():
            item = self._make_item(url, "torrent")
            item.status = "error"
            item.error = "Torrents unavailable (aria2c.exe not found)."
            self._register(item)
            self._push_downloads()
            return json.dumps({"error": item.error})
        item = self._make_item(url, dtype)
        self._register(item)
        self._push_downloads()
        threading.Thread(target=self._fetch, args=(item.id,), daemon=True).start()
        return json.dumps({"ok": True, "id": item.id})

    def add_urls(self, urls: list) -> str:
        for u in urls:
            self.add_url(u)
        return json.dumps({"ok": True, "count": len(urls)})

    def start_download(self, job_id: str) -> str:
        it = self.items.get(job_id)
        if not it or it.status not in ("ready", "paused"):
            return json.dumps({"error": "Cannot start"})
        it.status = "queued"
        it.error = ""
        self._push_downloads()
        self.queue.enqueue(job_id)
        return json.dumps({"ok": True})

    def start_all(self) -> str:
        for it in self.list_items():
            if it.status == "ready":
                self.start_download(it.id)
        return json.dumps({"ok": True})

    def pause_download(self, job_id: str) -> str:
        it = self.items.get(job_id)
        if not it:
            return json.dumps({"error": "Not found"})
        w = self._workers.get(job_id)
        if it.type == "torrent":
            torrent_engine_ref = self._workers.get("_torrent_engine")
            if torrent_engine_ref:
                torrent_engine_ref.pause(job_id)
        elif w is not None and hasattr(w, "pause"):
            w.pause()
        self._workers.pop(job_id, None)
        it.status = "paused"
        it.speed = ""
        self._push_downloads()
        self.queue.job_finished(job_id)
        return json.dumps({"ok": True})

    def resume_download(self, job_id: str) -> str:
        it = self.items.get(job_id)
        if not it:
            return json.dumps({"error": "Not found"})
        if it.type == "torrent":
            # Re-download with continue
            it.status = "queued"
            it.error = ""
            self._push_downloads()
            self.queue.enqueue(job_id)
            return json.dumps({"ok": True})
        it.status = "queued"
        it.error = ""
        setattr(it, "_resume", True)
        self._push_downloads()
        self.queue.enqueue(job_id)
        return json.dumps({"ok": True})

    def cancel_download(self, job_id: str) -> str:
        self.queue.remove(job_id)
        w = self._workers.pop(job_id, None)
        if w is not None:
            if hasattr(w, "stop"):
                w.stop()
            elif hasattr(w, "pause"):
                w.pause()
        if job_id in self.items:
            self.items[job_id].status = "error"
            self.items[job_id].error = "Cancelled"
            self._push_downloads()
        self.queue.job_finished(job_id)
        return json.dumps({"ok": True})

    def remove_download(self, job_id: str) -> str:
        if job_id in self.items and self.items[job_id].status in ("downloading", "queued", "paused"):
            self.cancel_download(job_id)
        self.items.pop(job_id, None)
        if job_id in self.order:
            self.order.remove(job_id)
        self._push_downloads()
        return json.dumps({"ok": True})

    def set_format(self, job_id: str, format_id: str) -> str:
        it = self.items.get(job_id)
        if it:
            it.selected_format = format_id
        return json.dumps({"ok": True})

    def get_downloads(self) -> str:
        return json.dumps([it.to_dict() for it in self.list_items()])

    def get_history(self) -> str:
        return json.dumps([h.to_dict() for h in self.history[:50]])

    def clear_history(self) -> str:
        self.history = []
        history_mod.save_history(self.history)
        self._push_history()
        return json.dumps({"ok": True})

    def delete_history(self, item_id: str) -> str:
        self.history = [h for h in self.history if h.id != item_id]
        history_mod.save_history(self.history)
        self._push_history()
        return json.dumps({"ok": True})

    def get_queue_info(self) -> str:
        active, queued = self.queue.counts()
        return json.dumps({"active": active, "queued": queued})

    def open_folder(self, path: str) -> str:
        if os.path.exists(path):
            if os.path.isfile(path):
                subprocess.run(["explorer", "/select,", os.path.normpath(path)], check=False)
            else:
                os.startfile(path)  # noqa: S606
        return json.dumps({"ok": True})

    def check_update(self) -> str:
        try:
            from backend import updater
            info = updater.check_for_update()
            return json.dumps(info)
        except Exception as e:
            return json.dumps({"error": str(e), "has_update": False})

    def download_update(self) -> str:
        try:
            from backend import updater
            info = updater.check_for_update()
            if not info.get("has_update"):
                return json.dumps({"error": "No update available"})

            def prog(stage, rec, total):
                self._push_update_progress(stage, rec, total)

            path = updater.download_update(info["download_url"], info["latest_version"], prog)
            return json.dumps({"ok": True, "path": path})
        except Exception as e:
            return json.dumps({"error": str(e)})

    def install_update(self, path: str = "") -> str:
        try:
            from backend import updater
            installer = path or updater.get_downloaded_installer()
            if installer:
                updater.install_update(installer)
                return json.dumps({"ok": True})
            return json.dumps({"error": "No installer found"})
        except Exception as e:
            return json.dumps({"error": str(e)})

    # ── Internal logic ──────────────────────────────────────────

    def list_items(self) -> list[DownloadItem]:
        return [self.items[i] for i in self.order if i in self.items]

    def _make_item(self, url: str, dtype: str) -> DownloadItem:
        return DownloadItem(
            id=new_id(), url=url, type=dtype, status="fetching",
            title=url, badge=badge_for(dtype, url),
        )

    def _register(self, item: DownloadItem) -> None:
        with self._lock:
            self.items[item.id] = item
            if item.id not in self.order:
                self.order.insert(0, item.id)

    def _push_downloads(self) -> None:
        if self._window:
            data = json.dumps([it.to_dict() for it in self.list_items()])
            try:
                self._window.evaluate_js(f"window.app && window.app.updateDownloads({data})")
            except Exception:
                pass

    def _push_history(self) -> None:
        if self._window:
            data = json.dumps([h.to_dict() for h in self.history[:50]])
            try:
                self._window.evaluate_js(f"window.app && window.app.updateHistory({data})")
            except Exception:
                pass

    def _push_queue(self, active: int, queued: int) -> None:
        if self._window:
            try:
                self._window.evaluate_js(
                    f"window.app && window.app.updateQueue({active},{queued})"
                )
            except Exception:
                pass

    def _push_update_progress(self, stage: str, received: int, total: int) -> None:
        if self._window:
            try:
                self._window.evaluate_js(
                    f"window.app && window.app.updateProgress('{stage}',{received},{total})"
                )
            except Exception:
                pass

    def _queue_changed(self, active: int, queued: int) -> None:
        self._push_queue(active, queued)

    def _add_playlist(self, url: str) -> None:
        ph = self._make_item(url, "youtube")
        ph.title = "Loading playlist\u2026"
        self._register(ph)
        self._push_downloads()
        try:
            entries = ytdlp_engine.fetch_playlist(url, self.settings.get("preferred_browser"))
            self.items.pop(ph.id, None)
            if ph.id in self.order:
                self.order.remove(ph.id)
            if not entries:
                raise RuntimeError("Empty playlist")
            for e in entries:
                it = self._make_item(e["url"], "youtube")
                it.title = e.get("title") or e["url"]
                it.thumbnail = e.get("thumbnail") or ""
                it.duration = e.get("duration") or ""
                self._register(it)
            self._push_downloads()
            for e in entries:
                for iid, it in list(self.items.items()):
                    if it.url == e["url"] and it.status == "fetching":
                        threading.Thread(target=self._fetch, args=(iid,), daemon=True).start()
        except Exception as err:
            if ph.id in self.items:
                self.items[ph.id].status = "error"
                self.items[ph.id].error = str(err)
                self._push_downloads()

    def _fetch(self, job_id: str) -> None:
        item = self.items.get(job_id)
        if not item:
            return
        try:
            if uses_ytdlp(item.type):
                info, browser = ytdlp_engine.fetch_info(
                    item.url, self.settings.get("preferred_browser")
                )
                if browser and browser != self.settings.get("preferred_browser"):
                    self.settings["preferred_browser"] = browser
                    save_settings(self.settings)
            elif item.type == "torrent":
                info = torrent_engine.fetch_info(item.url)
            else:
                info = direct_engine.fetch_info(item.url)

            it = self.items.get(job_id)
            if not it:
                return
            it.status = "ready"
            it.title = info.get("title") or it.url
            it.thumbnail = info.get("thumbnail") or ""
            it.duration = info.get("duration") or ""
            it.total_size = int(info.get("total_size") or 0)
            fmts = info.get("formats") or []
            if fmts and isinstance(fmts[0], FormatOption):
                it.formats = fmts
            elif fmts:
                it.formats = [
                    FormatOption(**f) if isinstance(f, dict) else f for f in fmts
                ]
            else:
                it.formats = [
                    FormatOption(format_id="bv*+ba/b", label="Best", ext="mp4", resolution="best")
                ]
            it.selected_format = it.formats[0].format_id if it.formats else "bv*+ba/b"
            self._push_downloads()
        except Exception as e:
            err = friendly_ytdlp_error(str(e)) if uses_ytdlp(item.type) else str(e)
            it = self.items.get(job_id)
            if it:
                it.status = "error"
                it.error = err
                self._push_downloads()

    def _start_job(self, job_id: str) -> None:
        it = self.items.get(job_id)
        if not it:
            self.queue.job_finished(job_id)
            return

        it.status = "downloading"
        self._push_downloads()
        dest = self.settings.get("download_path")
        resume = bool(getattr(it, "_resume", False))
        setattr(it, "_resume", False)

        def on_progress(jid, pct, speed, eta):
            x = self.items.get(jid)
            if x:
                x.progress = pct
                x.speed = speed
                x.eta = eta
                x.status = "downloading"
            if self._window:
                try:
                    self._window.evaluate_js(
                        f"window.app && window.app.updateDownloadProgress('{jid}',{pct},'{speed}','{eta}')"
                    )
                except Exception:
                    pass

        def on_dest(jid, path):
            x = self.items.get(jid)
            if x:
                x.file_path = path
            if self._window:
                try:
                    safe_path = path.replace("\\", "\\\\").replace("'", "\\'")
                    self._window.evaluate_js(
                        f"window.app && window.app.updateDownloadDest('{jid}','{safe_path}')"
                    )
                except Exception:
                    pass

        def on_done(jid, path):
            x = self.items.get(jid)
            if x:
                x.status = "completed"
                x.progress = 100
                x.file_path = path or x.file_path
                x.speed = ""
                hist = HistoryItem(
                    id=x.id, url=x.url, type=x.type, title=x.title,
                    file_path=x.file_path,
                    completed_at=datetime.now().isoformat(timespec="seconds"),
                    badge=x.badge,
                )
                self.history.insert(0, hist)
                history_mod.save_history(self.history)
            self._workers.pop(jid, None)
            self._push_downloads()
            self._push_history()
            self.queue.job_finished(jid)

        def on_error(jid, err):
            x = self.items.get(jid)
            if x:
                x.status = "error"
                x.error = err
                x.speed = ""
            self._workers.pop(jid, None)
            self._push_downloads()
            self.queue.job_finished(jid)

        if uses_ytdlp(it.type):
            w = ytdlp_engine.YtDownload(
                job_id, it.url, dest, it.selected_format or "bv*+ba/b",
                on_progress, on_done, on_error, on_dest,
                preferred_browser=self.settings.get("preferred_browser"),
                resume=resume,
            )
            self._workers[job_id] = w
            w.start()
        elif it.type == "torrent":
            te = torrent_engine.AriaDownload(
                job_id, it.url, dest, on_progress, on_done, on_error, on_dest,
            )
            self._workers[job_id] = te
            self._workers["_torrent_engine"] = te
            te.start()
        else:
            w = direct_engine.DirectDownload(
                job_id, it.url, dest, on_progress, on_done, on_error, on_dest, resume=resume,
            )
            self._workers[job_id] = w
            w.start()

    def shutdown(self) -> None:
        for jid in list(self._workers.keys()):
            if jid.startswith("_"):
                continue
            try:
                self.cancel_download(jid)
            except Exception:
                pass
