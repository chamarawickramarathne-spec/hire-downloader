window.DownloadsUI = {
  render(list, container, emptyEl) {
    if (!list || list.length === 0) {
      emptyEl.style.display = 'flex';
      container.querySelectorAll('.dl-card').forEach(c => c.remove());
      return;
    }
    emptyEl.style.display = 'none';

    const existing = new Map();
    container.querySelectorAll('.dl-card').forEach(c => existing.set(c.dataset.id, c));
    const currentIds = new Set(list.map(d => d.id));

    existing.forEach((el, id) => {
      if (!currentIds.has(id)) el.remove();
    });

    list.forEach(item => {
      let card = container.querySelector(`.dl-card[data-id="${item.id}"]`);
      if (!card) {
        card = this.createCard(item);
        container.insertBefore(card, emptyEl);
      }
      this.updateCard(card, item);
    });
  },

  createCard(item) {
    const card = document.createElement('div');
    card.className = `dl-card status-${item.status}`;
    card.dataset.id = item.id;

    card.innerHTML = `
      <span class="badge badge-${item.badge}">${escapeHtml(item.badge)}</span>
      <div class="dl-info">
        <div class="dl-title">${escapeHtml(item.title || item.url)}</div>
        <div class="dl-url">${escapeHtml(item.url)}</div>
        <div class="dl-meta"></div>
        <div class="progress-bar"><div class="progress-fill"></div></div>
        <div class="dl-format" style="display:none">
          <select></select>
        </div>
      </div>
      <div class="dl-actions"></div>
    `;
    return card;
  },

  updateCard(card, item) {
    card.className = `dl-card status-${item.status}`;

    card.querySelector('.dl-title').textContent = item.title || item.url;
    card.querySelector('.dl-url').textContent = item.url;

    const meta = card.querySelector('.dl-meta');
    meta.className = 'dl-meta';
    if (item.status === 'downloading') {
      meta.textContent = `${item.progress.toFixed(1)}%  ${item.speed}  ${item.eta ? 'ETA ' + item.eta : ''}`.trim();
      meta.classList.add('speed');
    } else if (item.status === 'paused') {
      meta.textContent = `Paused \u00b7 ${item.progress.toFixed(1)}%`;
    } else if (item.status === 'error') {
      meta.textContent = item.error || 'Error';
      meta.classList.add('error');
    } else if (item.status === 'completed') {
      const name = item.file_path ? item.file_path.split(/[/\\]/).pop() : '';
      meta.textContent = 'Complete' + (name ? ' \u2014 ' + name : '');
      meta.classList.add('done');
    } else if (item.status === 'ready' && item.files && item.files.length > 0) {
      meta.textContent = `${item.files.length} files \u00b7 ${item.files.reduce((s,f) => s + f.size, 0) > 0 ? formatBytes(item.files.reduce((s,f) => s + f.size, 0)) : ''}`;
    } else if (item.duration) {
      meta.textContent = `${item.status} \u00b7 ${item.duration}`;
    } else {
      meta.textContent = item.status;
    }

    // Progress bar
    const bar = card.querySelector('.progress-fill');
    const barWrap = card.querySelector('.progress-bar');
    if (['downloading', 'paused', 'queued'].includes(item.status)) {
      barWrap.style.display = 'block';
      bar.style.width = item.progress + '%';
      bar.classList.remove('complete');
    } else if (item.status === 'completed') {
      barWrap.style.display = 'block';
      bar.style.width = '100%';
      bar.classList.add('complete');
    } else {
      barWrap.style.display = 'none';
    }

    // Format selector
    const fmtWrap = card.querySelector('.dl-format');
    if (item.formats && item.formats.length > 0 && item.status === 'ready') {
      fmtWrap.style.display = 'block';
      const sel = fmtWrap.querySelector('select');
      if (sel.options.length !== item.formats.length) {
        sel.innerHTML = '';
        item.formats.forEach(f => {
          const opt = document.createElement('option');
          opt.value = f.format_id;
          opt.textContent = f.label;
          sel.appendChild(opt);
        });
        sel.value = item.selected_format || item.formats[0].format_id;
      }
      sel.onchange = () => window.app.setFormat(item.id, sel.value);
    } else {
      fmtWrap.style.display = 'none';
    }

    // Actions
    const actions = card.querySelector('.dl-actions');
    actions.innerHTML = '';
    const addBtn = (text, cls, fn) => {
      const b = document.createElement('button');
      b.className = `btn ${cls} btn-sm`;
      b.textContent = text;
      b.onclick = fn;
      actions.appendChild(b);
    };

    if (item.status === 'ready') {
      if (item.type === 'torrent' && item.files && item.files.length > 1) {
        addBtn('Files', 'btn-ghost', () => app.showTorrentFiles(item.id));
        addBtn('Start', 'btn-accent', () => app.startDl(item.id));
      } else {
        addBtn('Start', 'btn-accent', () => app.startDl(item.id));
      }
    }
    if (item.status === 'downloading') {
      addBtn('Pause', 'btn-ghost', () => app.pauseDl(item.id));
      addBtn('Cancel', 'btn-ghost', () => app.cancelDl(item.id));
    }
    if (item.status === 'paused') {
      addBtn('Resume', 'btn-accent', () => app.resumeDl(item.id));
      addBtn('Cancel', 'btn-ghost', () => app.cancelDl(item.id));
    }
    if (item.status === 'queued') addBtn('Cancel', 'btn-ghost', () => app.cancelDl(item.id));
    if (item.status === 'error') addBtn('Retry', 'btn-warning', () => app.retryDl(item.id));
    if (item.status === 'completed' && item.file_path) {
      addBtn('Show', 'btn-success', () => app.showInFolder(item.file_path));
    }
    addBtn('Remove', 'btn-ghost', () => app.removeDl(item.id));
  }
};
