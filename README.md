# Google Keep → Claude Bridge

Connects your Google Keep notes to Claude Desktop — **no API keys, no OAuth, no passwords**. Works because the Chrome extension reads Keep directly from your browser where you're already logged in.

## How it works

```
Claude Desktop  ──stdio──►  server.js  ──WebSocket──►  Chrome Extension  ──DOM──►  keep.google.com
```

1. You open Google Keep in Chrome (you're already logged in)
2. The extension quietly reads your notes from the page
3. Claude asks the local server for your notes
4. The server asks the extension via WebSocket
5. Your notes come back to Claude in seconds

---

## Installation

### Step 1 — Install the Chrome Extension

1. Open Chrome and go to `chrome://extensions/`
2. Toggle **Developer mode** on (top-right corner)
3. Click **Load unpacked** (top-left)
4. Select the `extension/` folder from this repo
5. The extension icon will appear in your toolbar

### Step 2 — Install Server Dependencies

You need [Node.js](https://nodejs.org) installed.

```bash
cd mcp-server
npm install
```

### Step 3 — Connect to Claude Desktop

Open your Claude Desktop config file:

- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
- **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

Add this inside the `mcpServers` block (replace the path with your actual path):

```json
{
  "mcpServers": {
    "google-keep-bridge": {
      "command": "node",
      "args": ["C:/Users/jesse/ClaudeWorkSpace/google-keep-claude-bridge/mcp-server/server.js"]
    }
  }
}
```

### Step 4 — Use it

1. Start the server: `node mcp-server/server.js`
2. Open [keep.google.com](https://keep.google.com) in Chrome
3. Restart Claude Desktop
4. Ask Claude: **"What notes do I have in Keep?"**

---

## Available Tools

| Tool | What it does |
|------|-------------|
| `get_keep_notes` | Returns all visible notes on the Keep page |
| `search_keep_notes` | Filters notes by a search query |

---

## Troubleshooting

**"Chrome extension is not connected"**
→ Make sure `keep.google.com` is open in a Chrome tab and the extension is enabled.

**No notes returned / empty results**
→ Google occasionally changes Keep's internal HTML structure. Open `extension/content.js` and update the CSS selectors to match the current DOM. Use Chrome DevTools (F12) on keep.google.com to inspect the note elements.

**Claude doesn't see the tool**
→ Double-check the path in `claude_desktop_config.json` and restart Claude Desktop fully.

---

## Project Structure

```
google-keep-claude-bridge/
├── extension/
│   ├── manifest.json   # Chrome extension config
│   ├── content.js      # Runs on keep.google.com, scrapes notes
│   └── popup.html      # Toolbar popup showing connection status
├── mcp-server/
│   ├── server.js       # MCP + WebSocket bridge
│   └── package.json
└── README.md
```
