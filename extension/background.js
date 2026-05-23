/**
 * background.js — Extension service worker
 *
 * Holds the WebSocket connection to the local MCP bridge server.
 * Runs in the extension's own context (not the page's), so it is
 * never blocked by Google Keep's Content Security Policy.
 *
 * Uses chrome.alarms to stay alive — Chrome MV3 service workers are
 * terminated after ~30s of inactivity. The alarm fires every 25s to
 * keep the worker running and the WebSocket connection open.
 *
 * Flow:
 *   server.js  →  WebSocket message (get_notes)
 *              →  background.js asks content.js via chrome.tabs.sendMessage
 *              →  content.js scrapes DOM, replies with notes
 *              →  background.js sends notes back to server.js over WebSocket
 */

const BRIDGE_URL = 'ws://localhost:8080';
let socket = null;

// ---------------------------------------------------------------------------
// Keepalive alarm — prevents Chrome from terminating the service worker
// ---------------------------------------------------------------------------
// Re-create alarm on install/update and on every Chrome startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
  connect();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
  connect();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'keepalive') {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect();
    }
  }
});

// ---------------------------------------------------------------------------
// WebSocket connection to the local MCP bridge
// ---------------------------------------------------------------------------
function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket(BRIDGE_URL);

  socket.onopen = () => {
    console.log('[Keep→Claude] Connected to bridge server.');
  };

  socket.onmessage = async (event) => {
    let request;
    try { request = JSON.parse(event.data); }
    catch { return; }

    if (request.action === 'get_notes') {
      // Find the Google Keep tab
      const tabs = await chrome.tabs.query({ url: 'https://keep.google.com/*' });

      if (tabs.length === 0) {
        socket.send(JSON.stringify({
          action: 'send_notes',
          data: [],
          error: 'No Google Keep tab found. Please open keep.google.com in Chrome.'
        }));
        return;
      }

      // Ask the content script in that tab to scrape notes
      try {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'get_notes' });
        socket.send(JSON.stringify({ action: 'send_notes', data: response.notes || [] }));
      } catch (err) {
        socket.send(JSON.stringify({
          action: 'send_notes',
          data: [],
          error: `Could not reach content script: ${err.message}`
        }));
      }
    }
  };

  socket.onclose = () => {
    console.log('[Keep→Claude] Disconnected. Retrying in 5 s…');
    socket = null;
    setTimeout(() => {
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connect();
      }
    }, 5000);
  };

  socket.onerror = () => {
    socket.close(); // triggers onclose → retry
  };
}

connect();
