/**
 * content.js — Runs inside keep.google.com
 *
 * Scrapes visible notes from the Google Keep DOM.
 * Responds to messages from background.js — no direct WebSocket here,
 * so Google Keep's Content Security Policy cannot block it.
 *
 * NOTE: Google Keep uses obfuscated/changing CSS class names.
 * This script uses structural and ARIA selectors instead, which are
 * far more stable. If notes stop being detected, open DevTools on
 * keep.google.com, inspect a note card, and update the selectors below.
 */

function scrapeKeepNotes() {
  const notes = [];

  // Strategy 1: note cards with data-note-id or data-id attributes
  const noteCards = document.querySelectorAll(
    '[data-note-id], [data-id][jscontroller]'
  );

  if (noteCards.length > 0) {
    noteCards.forEach(card => {
      const id        = card.getAttribute('data-note-id') || card.getAttribute('data-id') || '';
      const titleEl   = card.querySelector('[aria-label="Title"], [id^="title_"], [data-field="title"]');
      const contentEl = card.querySelector('[aria-label="Content"], [id^="content_"], [contenteditable="true"]');

      const title   = titleEl   ? titleEl.innerText.trim()   : '';
      const content = contentEl ? contentEl.innerText.trim() : '';

      if (title || content) {
        notes.push({ id, title: title || '(no title)', content });
      }
    });
  }

  // Strategy 2: semantic role-based selectors (Keep renders a grid/list of cards)
  if (notes.length === 0) {
    const items = document.querySelectorAll('[role="listitem"], [role="gridcell"]');
    items.forEach(item => {
      const headingEl  = item.querySelector('[role="heading"], h2, h3');
      const paragraphs = item.querySelectorAll('p, [role="paragraph"]');
      const title   = headingEl ? headingEl.innerText.trim() : '';
      const content = Array.from(paragraphs).map(p => p.innerText.trim()).join('\n');
      if (title || content) {
        notes.push({ id: '', title: title || '(no title)', content });
      }
    });
  }

  // Strategy 3: last resort — dump all text from the main content area
  if (notes.length === 0) {
    const main = document.querySelector('main, [role="main"]');
    if (main) {
      notes.push({
        id: '',
        title: '(raw page text — selectors may need updating)',
        content: main.innerText.trim().slice(0, 4000)
      });
    }
  }

  return notes;
}

// Listen for requests from background.js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'get_notes') {
    const notes = scrapeKeepNotes();
    sendResponse({ notes });
  }
  return true; // required to use sendResponse asynchronously
});
