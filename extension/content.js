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

/**
 * Scroll through all Keep notes so lazy-loaded cards are rendered before
 * we scrape.
 *
 * Keep uses IntersectionObserver to load cards — raw scrollTop changes on
 * the container are often ignored.  Using scrollIntoView() on the LAST
 * rendered card is the only reliable way to trigger the observer and pull
 * in the next batch.  We also focus the window so Chrome doesn't throttle
 * the tab as a background page.
 */
async function scrollToLoadAllNotes() {
  const delay = ms => new Promise(r => setTimeout(r, ms));
  const getCards = () =>
    document.querySelectorAll('.IZ65Hb-n0tgWb.IZ65Hb-WsjYwc-nUpftc');

  // Wake the page out of background-throttle mode
  window.focus();

  let previousCount = 0;
  const maxPasses = 20; // safety cap — 20 × 700 ms ≈ 14 s worst case

  for (let i = 0; i < maxPasses; i++) {
    const cards = getCards();

    // Stop if no new cards appeared since last scroll
    if (cards.length === previousCount && i > 0) break;
    previousCount = cards.length;

    // Scroll the last rendered card into view — this fires Keep's
    // IntersectionObserver and triggers the next batch to load
    if (cards.length > 0) {
      cards[cards.length - 1].scrollIntoView({ behavior: 'instant', block: 'end' });
    }

    await delay(700);
  }

  // Scroll the first card back into view so the page looks normal
  const first = getCards()[0];
  if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });
}

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

// Wake up the background service worker as soon as Keep loads.
// In Chrome MV3, service workers sleep when idle — sending any message
// forces Chrome to start the worker so it can connect to the bridge server.
chrome.runtime.sendMessage({ action: 'ping' }).catch(() => {
  // Ignore — background may not be ready on very first load
});

// Listen for requests from background.js
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'get_notes') {
    // Scroll first to force-load all lazy notes, then scrape
    scrollToLoadAllNotes().then(() => {
      const notes = scrapeKeepNotes();
      sendResponse({ notes });
    });
    return true; // keep message channel open for async response
  }
  if (message.action === 'ping') {
    sendResponse({ alive: true });
  }
  return true;
});
