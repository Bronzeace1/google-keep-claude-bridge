// popup.js — loaded by popup.html (inline scripts are forbidden in MV3)
const dot          = document.getElementById('dot');
const statusEl     = document.getElementById('status');
const downloadBtn  = document.getElementById('downloadBtn');
const instructions = document.getElementById('instructions');

const probe = new WebSocket('ws://localhost:8080');

probe.onopen = () => {
  dot.className        = 'dot connected';
  statusEl.textContent = 'Bridge is running ✓';
  downloadBtn.style.display = 'none';
  instructions.innerHTML =
    '<strong>Ready!</strong> Open ' +
    '<a href="https://keep.google.com" target="_blank">keep.google.com</a> ' +
    'in Chrome, then ask Claude:<br><br>' +
    '<em>"What notes do I have in Keep?"</em>';
  probe.close();
};

probe.onerror = () => {
  dot.className        = 'dot disconnected';
  statusEl.textContent = 'Bridge not installed yet.';
  downloadBtn.style.display = 'block';
  instructions.innerHTML =
    'Click the button above to download the one-time installer. ' +
    'It sets everything up automatically — no technical steps needed.';
};
