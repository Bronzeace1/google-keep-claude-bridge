/**
 * content.js — Runs inside keep.google.com
 *
 * Scrapes visible notes from the Google Keep DOM.
 * Responds to messages from background.js — no direct WebSocket here,
 * so Google Keep's Content Security Policy cannot block it.
 *
 * Selectors verified against live Keep DOM on 2026-05-22.
 * If Keep updates their UI, use inspect-dom.js to find new selectors.
 */

function scrapeKeepNotes() {
  const notes = [];

  // Primary strategy: verified selectors from live DOM inspection
  // Note cards: .IZ65Hb-n0tgWb.IZ65Hb-WsjYwc-nUpftc
  // Title:      .IZ65Hb-r4nke-haAclf
  // Content:    .IZ65Hb-qJTHM-haAclf
  const noteCards = document.querySelectorAll(
    '.IZ65Hb-n0tgWb.IZ65Hb-WsjYwc-nUpftc'
  );

  if (noteCards.length > 0) {
    noteCards.forEach(card => {
      const titleEl   = card.querySelector('.IZ65Hb-r4nke-haAclf');
      const contentEl = card.querySelector('.IZ65Hb-qJTHM-haAclf');

      const title   = titleEl?.innerText?.trim()   || '';
      // Clean up extra blank lines from list-style notes
      const content = contentEl?.innerText?.trim()
        .replace(/\n{3,}/g, '\n')
        .replace(/\n\n/g, '\n') || '';

      if (title || content) {
        notes.push({ title: title || '(no title)', content });
      }
    });
  }

  // Fallback: if Google updates their class names, grab all text from
  // role=button elements that look like note cards (contain meaningful text)
  if (notes.length === 0) {
    document.querySelectorAll('[role="button"]').forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length > 10 && text.length < 2000) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          notes.push({
            title: lines[0] || '(no title)',
            content: lines.slice(1).join('\n').trim()
          });
        }
      }
    });
  }

  return notes;
}

// Listen for requests from background.js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'get_notes') {
    const notes = scrapeKeepNotes();
    sendResponse({ notes });
  }
  return true; // required to keep channel open for async response
});
