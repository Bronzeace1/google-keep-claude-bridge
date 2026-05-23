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

  // Fallback: role=button elements that look like note cards
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
// When the user scrolls down and Keep lazy-loads more cards, the cache
// updates automatically so Claude always has the full list.
// ---------------------------------------------------------------------------
let debounceTimer = null;

const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const fresh = scrapeKeepNotes();
    if (fresh.length >= cachedNotes.length) {
      cachedNotes = fresh;
    }
  }, 300);
});

observer.observe(document.body, { childList: true, subtree: true });

// ---------------------------------------------------------------------------
// Proactive scroll — fires 3 s after page load so all notes are pre-loaded
// ---------------------------------------------------------------------------
async function scrollToLoadAllNotes() {
  const delay    = ms => new Promise(r => setTimeout(r, ms));
  const getCards = ()  => document.querySelectorAll('.IZ65Hb-n0tgWb.IZ65Hb-WsjYwc-nUpftc');

  window.focus();

  let previousCount = 0;
  for (let i = 0; i < 10; i++) {
    const cards = getCards();
    if (cards.length === previousCount && i > 0) break;
    previousCount = cards.length;
    if (cards.length > 0) {
      cards[cards.length - 1].scrollIntoView({ behavior: 'instant', block: 'end' });
    }
    await delay(400);
  }

  const first = getCards()[0];
  if (first) first.scrollIntoView({ behavior: 'instant', block: 'start' });

  cachedNotes = scrapeKeepNotes();
}

(async () => {
  await new Promise(r => setTimeout(r, 3000));
  await scrollToLoadAllNotes();
})();

// ---------------------------------------------------------------------------
// Native Keep search — types the query into Keep's own search bar,
// waits for results to render, scrapes them, then clears the search.
// Falls back to in-memory filter if the search bar can't be found.
// ---------------------------------------------------------------------------
async function nativeSearch(query) {
  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Keep's search input (try several selectors for robustness)
  const inputSelectors = [
    'input[aria-label="Search"]',
    '[role="searchbox"]',
    'input[placeholder="Search"]',
    'input[jsname][type="text"]',
  ];

  let input = inputSelectors.map(s => document.querySelector(s)).find(Boolean);

  // If the input isn't in the DOM yet, click the search icon to reveal it
  if (!input) {
    const triggerSelectors = [
      '[aria-label="Search"]',
      '[data-tooltip="Search"]',
      'button[jsaction*="search"]',
    ];
    const trigger = triggerSelectors
      .map(s => document.querySelector(s))
      .find(el => el && el.tagName !== 'INPUT');

    if (trigger) {
      trigger.click();
      await delay(600);
      input = inputSelectors.map(s => document.querySelector(s)).find(Boolean);
    }
  }

  // No search bar found — fall back to filtering the cache
  if (!input) {
    const q = query.toLowerCase();
    return cachedNotes.filter(n =>
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q)
    );
  }

  // Type query into Keep's search box
  input.focus();
  input.value = '';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await delay(100);

  // Use execCommand so React/Angular virtual DOM handlers fire properly
  input.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, query);

  // Also fire input event in case execCommand alone isn't enough
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: query }));

  // Wait for Keep to render search results
  await delay(1800);

  // Scrape what Keep shows for this search
  const results = scrapeKeepNotes();

  // Clear the search and restore the normal notes view
  input.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, '');
  input.value = '';
  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, keyCode: 27 }));

  await delay(400);

  return results;
}

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
    // Return the live cache — kept current by MutationObserver as user scrolls
    sendResponse({ notes: cachedNotes.length ? cachedNotes : scrapeKeepNotes() });
  }

  if (message.action === 'search_notes') {
    // Use Keep's native search bar for accurate, full-library results
    nativeSearch(message.query).then(results => {
      sendResponse({ notes: results });
    });
    return true; // keep channel open for async response
  }

  if (message.action === 'ping') {
    sendResponse({ alive: true });
  }

  return true;
});
