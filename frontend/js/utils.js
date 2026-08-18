window.pycall = async function(method, ...args) {
  try {
    if (!window.pywebview || !window.pywebview.api) {
      return null;
    }
    const fn = window.pywebview.api[method];
    if (!fn) return null;
    const result = await fn(...args);
    if (typeof result === 'string') {
      try { return JSON.parse(result); } catch { return result; }
    }
    return result;
  } catch (e) {
    console.error(`pycall(${method}):`, e);
    return { error: String(e) };
  }
};

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return n.toFixed(1) + ' ' + units[i];
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
