"""Torrent download engine using libtorrent Python bindings.

Pattern adopted from Vortex Torrent core/engine.py.
Download-only mode (no seeding), resume persistence, file selection.
"""

from __future__ import annotations

import os
import re
import threading
import time
from typing import Any, Callable, Optional
from urllib.parse import unquote

from backend.models import TorrentFile
from backend.util import format_bytes, format_eta, format_rate, new_id, safe_filename

try:
    import libtorrent as lt
    HAS_LIBTORRENT = True
except ImportError:
    HAS_LIBTORRENT = False

STATE_NAMES = {}
if HAS_LIBTORRENT:
    STATE_NAMES = {
        lt.torrent_status.states.queued_for_checking: "Queued",
        lt.torrent_status.states.checking_files: "Checking",
        lt.torrent_status.states.checking_resume_data: "Checking resume",
        lt.torrent_status.states.downloading_metadata: "Fetching metadata",
        lt.torrent_status.states.downloading: "Downloading",
        lt.torrent_status.states.allocating: "Allocating",
        lt.torrent_status.states.finished: "Finished",
        lt.torrent_status.states.seeding: "Seeding",
    }


def torrent_available() -> bool:
    return HAS_LIBTORRENT


class TorrentEntry:
    def __init__(self, handle, name: str, info_hash, save_path: str, source: str):
        self.handle = handle
        self.name = name
        self.info_hash = info_hash
        self.save_path = save_path
        self.source = source
        self.added_at = time.time()
        self.error: Optional[str] = None
        self.job_id: str = ""

    @property
    def id(self) -> str:
        return str(self.info_hash)


class TorrentEngine:
    def __init__(self, config_dir: str, on_alert=None):
        if not HAS_LIBTORRENT:
            raise RuntimeError("libtorrent is not installed")
        self.config_dir = config_dir
        self.resume_dir = os.path.join(config_dir, "resume")
        os.makedirs(self.resume_dir, exist_ok=True)
        self.session: Any = None
        self.lock = threading.Lock()
        self.torrents: dict[str, TorrentEntry] = {}
        self.running = False
        self.on_alert = on_alert
        self._files_ready: list[str] = []

    def start(self, port: int = 6881, download_rate: int = 0):
        settings = {
            "listen_interfaces": "0.0.0.0:%d" % port,
            "enable_dht": True,
            "enable_upnp": True,
            "enable_natpmp": True,
            "active_downloads": 6,
            "active_seeds": 0,
            "unchoke_slots_limit": 0,
            "num_optimistic_unchoke_slots": 0,
            "download_rate_limit": int(download_rate),
            "upload_rate_limit": 0,
            "alert_mask": (
                lt.alert.category_t.error_notification
                | lt.alert.category_t.status_notification
                | lt.alert.category_t.storage_notification
            ),
        }
        self.session = lt.session(settings)
        self.running = True
        threading.Thread(target=self._alert_loop, daemon=True).start()

    def _alert_loop(self):
        while self.running:
            try:
                for alert in self.session.pop_alerts():
                    self._handle_alert(alert)
            except Exception:
                pass
            time.sleep(0.05)

    def _handle_alert(self, alert):
        if isinstance(alert, lt.metadata_received_alert):
            with self.lock:
                entry = self.torrents.get(str(alert.handle.info_hash()))
                if entry:
                    entry.name = alert.handle.name()
                    self._files_ready.append(entry.id)
            alert.handle.pause()
        elif isinstance(alert, lt.torrent_error_alert):
            with self.lock:
                entry = self.torrents.get(str(alert.handle.info_hash()))
                if entry:
                    entry.error = alert.message()
        elif isinstance(alert, lt.save_resume_data_alert):
            self._persist_resume(alert)
        elif isinstance(alert, lt.torrent_finished_alert):
            alert.handle.pause()
        if self.on_alert:
            self.on_alert(alert)

    def add_torrent_file(self, path: str, save_path: str, priorities=None, paused=False) -> TorrentEntry:
        info = lt.torrent_info(path)
        params = self._resume_params(info.info_hash())
        if params is None:
            params = lt.add_torrent_params()
            params.ti = info
        else:
            params.ti = info
        params.save_path = save_path
        if priorities is not None:
            params.file_priorities = list(priorities)
        params.flags &= ~lt.torrent_flags.auto_managed
        if not paused:
            params.flags &= ~lt.torrent_flags.paused
        else:
            params.flags |= lt.torrent_flags.paused
        handle = self.session.add_torrent(params)
        return self._register(handle, save_path, "file")

    def add_magnet(self, uri: str, save_path: str, paused=False) -> TorrentEntry:
        parsed = lt.parse_magnet_uri(uri)
        params = self._resume_params(parsed.info_hash)
        if params is None:
            params = parsed
        params.save_path = save_path
        params.flags &= ~lt.torrent_flags.auto_managed
        if not paused:
            params.flags &= ~lt.torrent_flags.paused
        else:
            params.flags |= lt.torrent_flags.paused
        handle = self.session.add_torrent(params)
        return self._register(handle, save_path, "magnet")

    def file_list_from_file(self, path: str) -> list[tuple[str, int]]:
        info = lt.torrent_info(path)
        return [(info.files().file_path(i), info.files().file_size(i)) for i in range(info.num_files())]

    def file_list(self, torrent_id: str) -> Optional[list[tuple[str, int]]]:
        with self.lock:
            entry = self.torrents.get(torrent_id)
        if not entry:
            return None
        try:
            tf = entry.handle.torrent_file()
        except RuntimeError:
            return None
        if tf is None:
            return None
        files = tf.files()
        return [(files.file_path(i), files.file_size(i)) for i in range(files.num_files())]

    def set_file_priorities(self, torrent_id: str, priorities: list[int]):
        with self.lock:
            entry = self.torrents.get(torrent_id)
        if entry:
            entry.handle.prioritize_files([int(p) for p in priorities])

    def take_files_ready(self) -> list[str]:
        with self.lock:
            ready = list(self._files_ready)
            self._files_ready.clear()
        return ready

    def _resume_params(self, info_hash):
        resume_file = os.path.join(self.resume_dir, "%s.fastresume" % str(info_hash))
        if not os.path.exists(resume_file):
            return None
        try:
            with open(resume_file, "rb") as f:
                return lt.read_resume_data(f.read())
        except Exception:
            return None

    def _register(self, handle, save_path: str, source: str) -> TorrentEntry:
        entry = TorrentEntry(
            handle,
            handle.name() or "Fetching metadata...",
            handle.info_hash(),
            save_path,
            source,
        )
        with self.lock:
            self.torrents[entry.id] = entry
        return entry

    def remove(self, torrent_id: str, delete_files: bool = False):
        with self.lock:
            entry = self.torrents.pop(torrent_id, None)
        if entry is None:
            return
        try:
            entry.handle.save_resume_data()
        except Exception:
            pass
        if delete_files:
            self.session.remove_torrent(entry.handle, lt.options_t.delete_files)
        else:
            self.session.remove_torrent(entry.handle)

    def pause(self, torrent_id: str):
        with self.lock:
            entry = self.torrents.get(torrent_id)
        if entry:
            try:
                entry.handle.save_resume_data()
            except Exception:
                pass
            entry.handle.pause()

    def resume(self, torrent_id: str):
        with self.lock:
            entry = self.torrents.get(torrent_id)
        if entry:
            entry.handle.resume()

    def apply_speed_limits(self, download_rate: int):
        self.session.apply_settings({"download_rate_limit": int(download_rate)})

    def save_all_resume_data(self):
        with self.lock:
            handles = [e.handle for e in self.torrents.values()]
        for h in handles:
            try:
                h.save_resume_data()
            except Exception:
                pass

    def _persist_resume(self, alert):
        if not hasattr(alert, "resume_data"):
            return
        ih = str(alert.handle.info_hash())
        target = os.path.join(self.resume_dir, "%s.fastresume" % ih)
        try:
            data = lt.bencode(alert.resume_data)
            with open(target, "wb") as f:
                f.write(data)
        except Exception:
            pass

    def snapshot(self) -> list[dict]:
        snap = []
        with self.lock:
            entries = list(self.torrents.values())
        for entry in entries:
            try:
                st = entry.handle.status()
            except RuntimeError:
                continue
            state = STATE_NAMES.get(st.state, "Idle")
            if st.paused:
                state = "Paused"
            total = st.total_wanted or st.total
            done = st.total_wanted_done
            progress = st.progress
            if total and done >= total:
                state = "Completed"
            eta_secs = 0
            if st.total_wanted and st.download_rate > 0:
                remaining = st.total_wanted - st.total_wanted_done
                eta_secs = remaining / st.download_rate
            snap.append({
                "id": entry.id,
                "job_id": entry.job_id,
                "name": entry.name or st.name,
                "size": total,
                "done": done,
                "progress": progress,
                "download_rate": st.download_rate,
                "peers": st.num_peers,
                "seeds": st.num_seeds,
                "state": state,
                "eta": eta_secs,
                "error": entry.error,
                "save_path": entry.save_path,
            })
        return snap

    def stop(self):
        self.running = False
        self.save_all_resume_data()
        time.sleep(0.5)
        with self.lock:
            entries = list(self.torrents.values())
        for e in entries:
            try:
                self.session.remove_torrent(e.handle)
            except RuntimeError:
                pass


def fetch_info(magnet_or_path: str, timeout: float = 30.0) -> dict:
    """Fetch torrent metadata. For .torrent files, returns immediately.
    For magnets, uses a temporary TorrentEngine to fetch metadata."""
    if not HAS_LIBTORRENT:
        raise RuntimeError("libtorrent is not installed")

    if magnet_or_path.endswith(".torrent") and os.path.isfile(magnet_or_path):
        info = lt.torrent_info(magnet_or_path)
        files = [(info.files().file_path(i), info.files().file_size(i)) for i in range(info.num_files())]
        total = info.total_size()
        name = info.name()
        return {
            "title": name,
            "thumbnail": "",
            "duration": "",
            "total_size": total,
            "formats": [],
            "files": [{"name": f[0], "size": f[1]} for f in files],
        }

    if not magnet_or_path.startswith("magnet:"):
        raise RuntimeError("Only magnet links and .torrent files are supported")

    dn_match = re.search(r"dn=([^&]+)", magnet_or_path)
    name = unquote(dn_match.group(1)) if dn_match else "Torrent Download"

    tmp_dir = os.environ.get("TEMP") or os.path.expanduser("~")
    engine = TorrentEngine(tmp_dir)
    engine.start()
    try:
        entry = engine.add_magnet(magnet_or_path, tmp_dir)
        start = time.time()
        while time.time() - start < timeout:
            ready = engine.take_files_ready()
            if entry.id in ready:
                break
            time.sleep(0.5)
        files_list = engine.file_list(entry.id)
        if not files_list:
            files_list = []
        total = 0
        try:
            st = entry.handle.status()
            total = st.total_wanted
        except Exception:
            pass
        return {
            "title": entry.name or name,
            "thumbnail": "",
            "duration": "",
            "total_size": total,
            "formats": [],
            "files": [{"name": f[0], "size": f[1]} for f in files_list],
        }
    finally:
        engine.stop()


class TorrentDownload:
    """Download worker that monitors a torrent via engine snapshot polling."""

    def __init__(
        self,
        job_id: str,
        engine: TorrentEngine,
        torrent_id: str,
        on_progress: Callable,
        on_done: Callable,
        on_error: Callable,
        on_dest: Optional[Callable] = None,
    ):
        self.job_id = job_id
        self.engine = engine
        self.torrent_id = torrent_id
        self.on_progress = on_progress
        self.on_done = on_done
        self.on_error = on_error
        self.on_dest = on_dest
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._reported_done = False

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self.engine.pause(self.torrent_id)

    def pause(self):
        self.stop()

    def _run(self):
        while not self._stop.is_set():
            time.sleep(0.5)
            try:
                snaps = self.engine.snapshot()
                snap = None
                for s in snaps:
                    if s["id"] == self.torrent_id:
                        snap = s
                        break
                if not snap:
                    if self._stop.is_set():
                        return
                    continue

                if snap.get("error"):
                    self.on_error(self.job_id, snap["error"])
                    return

                state = snap.get("state", "")
                progress = snap.get("progress", 0) * 100.0
                rate = snap.get("download_rate", 0)
                eta_secs = snap.get("eta", 0)
                speed_str = format_rate(rate) if rate else ""
                eta_str = format_eta(eta_secs) if eta_secs > 0 else ""

                self.on_progress(self.job_id, min(100.0, progress), speed_str, eta_str)

                save_path = snap.get("save_path", "")
                name = snap.get("name", "")
                if save_path and name and self.on_dest:
                    full = os.path.join(save_path, name)
                    if os.path.exists(full):
                        self.on_dest(self.job_id, full)

                if state == "Completed" and not self._reported_done:
                    self._reported_done = True
                    full = os.path.join(save_path, name) if save_path and name else ""
                    self.on_done(self.job_id, full)
                    return

            except Exception as e:
                if not self._stop.is_set():
                    self.on_error(self.job_id, str(e))
                return
