/**
 * content.js — Runs inside keep.google.com
 *
 * Scrapes visible notes from the Google Keep DOM and sends them
 * to the local MCP bridge server over WebSocket.
 *
 * NOTE: Google Keep uses obfuscated/changing CSS class names.
 * This script uses stable structural and ARIA selectors instead,
 * which are far less likely to break when Google updates their UI.
 */

let socket = null;
let reconnectTimer = null;
const BRIDGE_URL = 'ws://localhost:8080';

// ---------------------------------------------------------------------------
// Note scraping — uses structural selectors, not fragile class names
// ---------------------------------------------------------------------------
function scrapeKeepNotes() {
  const notes = [];

  // Each note card is a focusable list item in Keep's grid
  const noteCards = document.querySelectorAll(
    'div[data-note-id], li[data-note-id], [jscontroller][data-note-id]'
  );

  if (noteCards.length > 0) {
    noteCards.forEach(card => {
      const id    = card.getAttribute('data-note-id') || '';
      const titleEl   = card.querySelector('div[id^="title_"], [aria-label="Title"], .item-title');
      const contentEl = card.querySelector('div[id^="content_"], .item-content, [contenteditable="true"]');

      const title   = titleEl   ? titleEl.innerText.trim()   : '';
      const content = contentEl ? contentEl.innerText.trim() : '';

      if (title || content) {
        notes.push({ id, title: title || '(no title)', content });
      }
    });
  } else {
    // Fallback: walk all heading+paragraph pairs rendered in the notes grid
    const grid = document.querySelector('[role="list"], main');
    if (grid) {
      const headings = grid.querySelectorAll('h2, h3, [role="heading"]');
      headings.forEach(h => {
        const sibling = h.nextElementSibling;
        notes.push({
          id: '',
          title: h.innerText.trim() || '(no title)',
          content: sibling ? sibling.innerText.trim() : ''
        });
      });
    }
  }

  // Last resort: return a snapshot of all readable text in the main content area
  if (notes.length === 0) {
    const main = document.querySelector('main, [role="main"]');
    if (main) {
      notes.push({
        id: '',
        title: '(raw page text)',
        content: main.innerText.trim().slice(0, 4000)
      });
    }
  }

  return notes;
}

// ---------------------------------------------------------------------------
// WebSocket connection to the local MCP bridge
// ---------------------------------------------------------------------------
function connect() {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  socket = new WebSocket(BRIDGE_URL);

  socket.onopen = () => {
    console.log('[Keep→Claude] Connected to local bridge.');
    clearTimeout(reconnectTimer);
  };

  socket.onmessage = (event) => {
    let request;
    try { request = JSON.parse(event.data); }
    catch { return; }

    if (request.action === 'get_notes') {
      const notes = scrapeKeepNotes();
      socket.send(JSON.stringify({ action: 'send_notes', data: notes }));
    }
  };

  socket.onclose = () => {
    console.log('[Keep→Claude] Bridge disconnected. Retrying in 5s…');
    reconnectTimer = setTimeout(connect, 5000);
  };

  socket.onerror = () => {
    // onerror is always followed by onclose, so reconnect is handled there
    socket.close();
  };
}

connect();
