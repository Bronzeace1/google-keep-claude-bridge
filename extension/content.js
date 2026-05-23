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

// ---------------------------------------------------------------------------
// Live note cache — always reflects what's currently in the DOM.
// Updated by the MutationObserver whenever the user scrolls and Keep renders
// new cards, and by the proactive scroll on page load.
// ---------------------------------------------------------------------------
let cachedNotes = [];

// ---------------------------------------------------------------------------
// Scrape all note cards currently in the DOM
// ---------------------------------------------------------------------------
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
      const content = contentEl?.innerText?.trim()
        .replace(/\n{3,}/g, '\n')
        .replace(/\n\n/g,   '\n') || '';

      if (title || content) {
        notes.push({ title: title || '(no title)', content });
      }
    });
  }

  // Fallback: if Google updates their class names, grab text from
  // role=button elements that look like note cards
  if (notes.length === 0) {
    document.querySelectorAll('[role="button"]').forEach(el => {
      const text = el.innerText?.trim();
      if (text && text.length > 10 && text.length < 2000) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          notes.push({
            title:   lines[0] || '(no title)',
            content: lines.slice(1).join('\n').trim()
          });
        }
      }
    });
  }

  return notes;
}

// ---------------------------------------------------------------------------
// MutationObserver — watches Keep's DOM for new note cards.
// When the user scrolls down and Keep lazy-loads more cards, this fires,
// re-scrapes, and updates cachedNotes so Claude always has the full list.
// ---------------------------------------------------------------------------
let debounceTimer = null;

const observer = new MutationObserver(() => {
  // Debounce: wait 300 ms after the last DOM change before re-scraping
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const fresh = scrapeKeepNotes();
    // Only update if we found at least as many notes as before (never shrink)
    if (fresh.length >= cachedNotes.length) {
      cachedNotes = fresh;
    }
  }, 300);
});

// Observe the whole document for added/removed nodes anywhere in the tree
observer.observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------------
// Proactive scroll — fires 3 s after page load so all notes are rendered
// before the user or Claude asks for them.
// ---------------------------------------------------------------------------
async function scrollToLoadAllNotes() {
  const delay    = ms => new Promise(r => setTimeout(r, ms));
  const getCards = ()  => document.querySelectorAll('.IZ65Hb-n0tgWb.IZ65Hb-WsjYwc-nUpftc');

  window.focus(); // prevent Chrome background-throttle

  let previousCount = 0;
  const maxPasses   = 10; // 10 × 400 ms = 4 s max

  for (let i = 0; i < maxPasses; i++) {
    const cards = getCards();
    if (cards.length === previousCount && i > 0) break;
    previousCount = cards.length;

    // scrollIntoView fires Keep's IntersectionObserver → loads next batch
    if (cards.length > 0) {
      cards[cards.length - 1].scrollIntoView({ behavior: 'instant', block: 'end' });
    }

    await delay(400);
  }

  // Scroll back to top so the page looks normal
  const first = getCards()[0];
  if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });

  // Capture everything now in the DOM into the cache
  cachedNotes = scrapeKeepNotes();
}

(async () => {
  await new Promise(r => setTimeout(r, 3000)); // wait for Keep's initial render
  await scrollToLoadAllNotes();
})();

// ---------------------------------------------------------------------------
// Keep the MV3 service worker alive (content scripts persist; workers don't)
// ---------------------------------------------------------------------------
chrome.runtime.sendMessage({ action: 'ping' }).catch(() => {});

setInterval(() => {
  chrome.runtime.sendMessage({ action: 'ping' }).catch(() => {});
}, 20000);

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'get_notes') {
    // Return the live cache — updated automatically as the user scrolls.
    // Falls back to a fresh scrape if cache is still empty (very early call).
    sendResponse({ notes: cachedNotes.length ? cachedNotes : scrapeKeepNotes() });
  }

  if (message.action === 'ping') {
    sendResponse({ alive: true });
  }

  return true;
});
