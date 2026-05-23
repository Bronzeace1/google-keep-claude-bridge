/**
 * background.js — Extension service worker
 *
 * Holds the WebSocket connection to the local MCP bridge server.
 * Runs in the extension's own context (not the page's), so it is
 * never blocked by Google Keep's Content Security Policy.
 *
 * Flow:
 *   server.js  →  WebSocket message (get_notes)
 *              →  background.js asks content.js via chrome.tabs.sendMessage
 *              →  content.js scrapes DOM, replies with notes
 *              →  background.js sends notes back to server.js over WebSocket
 */

const BRIDGE_URL = 'ws://localhost:8080';
let socket = null;
let reconnectTimer = null;

function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  socket = new WebSocket(BRIDGE_URL);

  socket.onopen = () => {
    console.log('[Keep→Claude] Connected to bridge server.');
    clearTimeout(reconnectTimer);
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
    console.log('[Keep→Claude] Disconnected. Retrying in 5s…');
    reconnectTimer = setTimeout(connect, 5000);
  };

  socket.onerror = () => {
    socket.close(); // onclose handles reconnect
  };
}

connect();
