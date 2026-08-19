window.app = {
  downloads: [],
  settings: {},
  pendingTorrentJobId: null,

  async init() {
    const ver = await pycall('get_version');
    if (ver) document.getElementById('versionBadge').textContent = 'v' + ver;

    this.settings = await pycall('get_settings') || {};
    this.downloads = await pycall('get_downloads') || [];
    const hist = await pycall('get_history') || [];
    this.renderDownloads();
    this.renderHistory(hist);
  },

  // ── Actions ──

  async addUrl() {
    const input = document.getElementById('urlInput');
    const url = input.value.trim();
    if (!url) return;
    input.value = '';
    await pycall('add_url', url);
    this.refresh();
  },

  async startDl(id) { await pycall('start_download', id); this.refresh(); },
  async pauseDl(id) { await pycall('pause_download', id); this.refresh(); },
  async resumeDl(id) { await pycall('resume_download', id); this.refresh(); },
  async cancelDl(id) { await pycall('cancel_download', id); this.refresh(); },
  async removeDl(id) { await pycall('remove_download', id); this.refresh(); },

  async retryDl(id) {
    const item = this.downloads.find(d => d.id === id);
    if (item) {
      item.status = 'fetching';
      item.error = '';
      item.progress = 0;
      this.renderDownloads();
      await pycall('add_url', item.url);
      this.refresh();
    }
  },

  async setFormat(id, formatId) { await pycall('set_format', id, formatId); },

  async startAll() { await pycall('start_all'); this.refresh(); },

  async showInFolder(path) { await pycall('open_folder', path); },

  // ── Torrent File Selection ──

  async showTorrentFiles(jobId) {
    this.pendingTorrentJobId = jobId;
    const item = this.downloads.find(d => d.id === jobId);
    if (!item || !item.files || item.files.length === 0) return;

    const list = document.getElementById('torrentFilesList');
    list.innerHTML = '';

    item.files.forEach((f, i) => {
      const row = document.createElement('div');
      row.className = 'torrent-file-row';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = f.selected !== false;
      cb.dataset.index = f.index;
      cb.onchange = () => this._updateFileSummary();
      const name = document.createElement('span');
      name.className = 'torrent-file-name';
      name.textContent = f.name;
      const size = document.createElement('span');
      size.className = 'torrent-file-size';
      size.textContent = f.size > 0 ? formatBytes(f.size) : '';
      row.appendChild(cb);
      row.appendChild(name);
      row.appendChild(size);
      list.appendChild(row);
    });

    this._updateFileSummary();
    document.getElementById('torrentFilesModal').style.display = 'flex';
  },

  _updateFileSummary() {
    const list = document.getElementById('torrentFilesList');
    const cbs = list.querySelectorAll('input[type="checkbox"]');
    let selected = 0;
    let totalSize = 0;
    cbs.forEach(cb => {
      if (cb.checked) {
        selected++;
        const item = this.downloads.find(d => d.id === this.pendingTorrentJobId);
        if (item && item.files) {
          const f = item.files.find(ff => ff.index === parseInt(cb.dataset.index));
          if (f) totalSize += f.size;
        }
      }
    });
    const summary = document.getElementById('torrentFileSummary');
    summary.textContent = `${selected} selected` + (totalSize > 0 ? ` \u00b7 ${formatBytes(totalSize)}` : '');
  },

  selectAllFiles() {
    document.querySelectorAll('#torrentFilesList input[type="checkbox"]').forEach(cb => cb.checked = true);
    this._updateFileSummary();
  },

  selectNoFiles() {
    document.querySelectorAll('#torrentFilesList input[type="checkbox"]').forEach(cb => cb.checked = false);
    this._updateFileSummary();
  },

  async confirmTorrentFiles() {
    const list = document.getElementById('torrentFilesList');
    const cbs = list.querySelectorAll('input[type="checkbox"]');
    const selected = [];
    cbs.forEach(cb => {
      if (cb.checked) selected.push(parseInt(cb.dataset.index));
    });

    if (this.pendingTorrentJobId && selected.length > 0) {
      await pycall('select_torrent_files', this.pendingTorrentJobId, selected);
    }

    document.getElementById('torrentFilesModal').style.display = 'none';
    this.pendingTorrentJobId = null;
  },

  // ── Modals ──

  showSettings() { SettingsUI.show(this.settings); },
  hideSettings() { SettingsUI.hide(); },

  async saveSettings() {
    const data = SettingsUI.collect();
    await pycall('save_settings', data);
    this.settings = data;
    SettingsUI.hide();
  },

  async browseFolder() {},

  showImport() { document.getElementById('importModal').style.display = 'flex'; },

  async importUrls() {
    const text = document.getElementById('importBox').value;
    const urls = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (urls.length > 0) {
      await pycall('add_urls', urls);
    }
    document.getElementById('importBox').value = '';
    document.getElementById('importModal').style.display = 'none';
    this.refresh();
  },

  // ── Update ──

  async checkUpdate() {
    const btn = document.getElementById('updateBtn');
    btn.textContent = '...';
    btn.disabled = true;
    try {
      const info = await pycall('check_update');
      if (info && info.has_update) {
        btn.textContent = 'v' + info.latest_version;
        btn.onclick = () => this.doUpdate(info);
      } else {
        btn.textContent = 'Up to date';
        setTimeout(() => { btn.textContent = 'Update'; btn.disabled = false; btn.onclick = () => app.checkUpdate(); }, 2000);
        return;
      }
    } catch {
      btn.textContent = 'Update';
    }
    btn.disabled = false;
  },

  async doUpdate(info) {
    const btn = document.getElementById('updateBtn');
    btn.textContent = 'Downloading...';
    btn.disabled = true;
    const dlResult = await pycall('download_update');
    if (dlResult && dlResult.error) {
      btn.textContent = 'Download failed';
      setTimeout(() => { btn.textContent = 'Update'; btn.disabled = false; btn.onclick = () => app.checkUpdate(); }, 3000);
      return;
    }
    btn.textContent = 'Installing...';
    const instResult = await pycall('install_update');
    if (instResult && instResult.error) {
      btn.textContent = 'Install failed';
      setTimeout(() => { btn.textContent = 'Update'; btn.disabled = false; btn.onclick = () => app.checkUpdate(); }, 3000);
      return;
    }
    btn.textContent = 'Done - close app to update';
  },

  async settingsCheckUpdate() {
    const el = document.getElementById('updateStatus');
    el.textContent = 'Checking...';
    const info = await pycall('check_update');
    if (info && info.has_update) {
      el.textContent = `Update available: v${info.latest_version}`;
    } else if (info) {
      el.textContent = `Up to date \u00b7 v${info.current_version}`;
    } else {
      el.textContent = 'Check failed';
    }
  },

  async settingsInstallUpdate() {
    const el = document.getElementById('updateStatus');
    el.textContent = 'Working...';
    const info = await pycall('check_update');
    if (!info || !info.has_update) {
      el.textContent = info ? `Up to date \u00b7 v${info.current_version}` : 'Check failed';
      return;
    }
    el.textContent = 'Downloading...';
    const dlResult = await pycall('download_update');
    if (dlResult && dlResult.error) {
      el.textContent = 'Download failed: ' + dlResult.error;
      return;
    }
    el.textContent = 'Installing...';
    const instResult = await pycall('install_update');
    if (instResult && instResult.error) {
      el.textContent = 'Install failed: ' + instResult.error;
      return;
    }
    el.textContent = 'Done - close app to update';
  },

  // ── History ──

  async clearHistory() {
    await pycall('clear_history');
    this.renderHistory([]);
  },

  async deleteHistory(id) {
    await pycall('delete_history', id);
    const hist = await pycall('get_history') || [];
    this.renderHistory(hist);
  },

  async reAddHistory(url) {
    await pycall('add_url', url);
    this.refresh();
  },

  // ── Rendering ──

  renderDownloads() {
    const list = document.getElementById('downloadList');
    const empty = document.getElementById('emptyState');
    DownloadsUI.render(this.downloads, list, empty);
  },

  renderHistory(hist) {
    const container = document.getElementById('historyList');
    const emptyEl = document.getElementById('historyEmpty');
    container.innerHTML = '';
    if (!hist || hist.length === 0) {
      emptyEl.style.display = 'block';
      container.appendChild(emptyEl);
      return;
    }
    emptyEl.style.display = 'none';
    hist.slice(0, 40).forEach(h => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <span class="badge badge-${h.badge}">${escapeHtml(h.badge)}</span>
        <span class="history-title">${escapeHtml(h.title)}</span>
        <button class="btn btn-ghost btn-xs">Re-add</button>
        <button class="btn btn-ghost btn-xs">&times;</button>
      `;
      const btns = row.querySelectorAll('.btn');
      btns[0].onclick = () => app.reAddHistory(h.url);
      btns[1].onclick = () => app.deleteHistory(h.id);
      container.appendChild(row);
    });
  },

  async refresh() {
    this.downloads = await pycall('get_downloads') || [];
    this.renderDownloads();
    const qi = await pycall('get_queue_info');
    if (qi) {
      const parts = [];
      if (qi.active) parts.push(qi.active + ' active');
      if (qi.queued) parts.push(qi.queued + ' queued');
      document.getElementById('queueInfo').textContent = parts.join(' \u00b7 ');
    }
  },

  // ── Push callbacks from Python ──

  updateDownloads(data) {
    this.downloads = data;
    this.renderDownloads();
  },

  updateHistory(data) {
    this.renderHistory(data);
  },

  updateQueue(active, queued) {
    const parts = [];
    if (active) parts.push(active + ' active');
    if (queued) parts.push(queued + ' queued');
    document.getElementById('queueInfo').textContent = parts.join(' \u00b7 ');
  },

  updateDownloadProgress(id, pct, speed, eta) {
    const item = this.downloads.find(d => d.id === id);
    if (item) {
      item.progress = pct;
      item.speed = speed;
      item.eta = eta;
      item.status = 'downloading';
      this.renderDownloads();
    }
  },

  updateDownloadDest(id, path) {
    const item = this.downloads.find(d => d.id === id);
    if (item) {
      item.file_path = path;
    }
  },

  updateProgress(stage, received, total) {
    if (stage === 'downloading' && total) {
      const pct = Math.round(received * 100 / total);
      document.getElementById('statusBar').textContent = `Downloading update... ${pct}%`;
    } else if (stage === 'complete') {
      document.getElementById('statusBar').textContent = 'Launching installer...';
    }
  },

  setStatus(msg) {
    document.getElementById('statusBar').textContent = msg;
  }
};

// Auto-init when pywebview is ready
window.addEventListener('pywebviewready', () => app.init());
