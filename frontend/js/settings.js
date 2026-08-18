window.SettingsUI = {
  show(settings) {
    document.getElementById('settingsPath').value = settings.download_path || '';
    document.getElementById('maxConcSlider').value = settings.max_concurrent || 1;
    document.getElementById('maxConcVal').textContent = settings.max_concurrent || 1;
    document.getElementById('schedEnabled').checked = !!settings.schedule_enabled;
    document.getElementById('schedStart').value = settings.schedule_start || '01:00';
    document.getElementById('schedEnd').value = settings.schedule_end || '06:00';
    document.getElementById('settingsModal').style.display = 'flex';
  },

  hide() {
    document.getElementById('settingsModal').style.display = 'none';
  },

  collect() {
    return {
      download_path: document.getElementById('settingsPath').value.trim(),
      max_concurrent: parseInt(document.getElementById('maxConcSlider').value, 10),
      schedule_enabled: document.getElementById('schedEnabled').checked,
      schedule_start: document.getElementById('schedStart').value.trim() || '01:00',
      schedule_end: document.getElementById('schedEnd').value.trim() || '06:00',
    };
  }
};
