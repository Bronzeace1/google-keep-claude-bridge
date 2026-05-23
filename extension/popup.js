// popup.js — loaded by popup.html (inline scripts are forbidden in MV3)
const dot    = document.getElementById('dot');
const status = document.getElementById('status');

// Quick WebSocket probe to check if the bridge server is running.
// Extension popup pages are NOT subject to the host page's CSP,
// so this localhost connection is allowed here.
const probe = new WebSocket('ws://localhost:8080');

probe.onopen = () => {
  dot.className      = 'dot connected';
  status.textContent = 'Bridge is running ✓';
  probe.close();
};

probe.onerror = () => {
  dot.className      = 'dot disconnected';
  status.textContent = 'Bridge not running. Start server.js first.';
};
