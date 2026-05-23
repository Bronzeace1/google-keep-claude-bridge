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

## Quick Install (Windows)

1. [Download or clone this repo](https://github.com/Bronzeace1/google-keep-claude-bridge)
2. Double-click **`install.bat`**
3. Load the extension in Chrome (`chrome://extensions/` → Developer mode → Load unpacked → select `extension/`)
4. Double-click the **Start Keep Bridge** shortcut on your Desktop
5. Open [keep.google.com](https://keep.google.com) in Chrome
6. Ask Claude: **"What notes do I have in Keep?"**

---

## Manual Installation

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
      "args": ["C:/path/to/google-keep-claude-bridge/mcp-server/server.js"]
    }
  }
}
```

### Step 4 — Use it

1. Start the server: double-click **Start Keep Bridge** on your Desktop, or run `node mcp-server/server.js`
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
→ Make sure `keep.google.com` is open in a Chrome tab and the extension is enabled. The extension reconnects automatically within 5 seconds of the bridge server starting.

**No notes returned / empty results**
→ Google occasionally changes Keep's internal HTML structure. Open `extension/content.js` and update the CSS selectors to match the current DOM. Use Chrome DevTools (F12) on keep.google.com to inspect the note elements.

**Claude doesn't see the tool**
→ Double-check the path in `claude_desktop_config.json` and restart Claude Desktop fully.

---

## Project Structure

```
google-keep-claude-bridge/
├── extension/
│   ├── manifest.json      # Chrome extension config
│   ├── background.js      # Service worker — holds WebSocket to bridge
│   ├── content.js         # Runs on keep.google.com, scrapes notes
│   ├── popup.html/js      # Toolbar popup showing connection status
│   └── icons/             # Extension icons (16, 48, 128 px)
├── mcp-server/
│   ├── server.js          # MCP + WebSocket bridge server
│   └── package.json
├── store-assets/          # Chrome Web Store submission files
├── install.bat            # Windows quick-installer (double-click)
├── install.ps1            # Installer script
├── start-server.bat       # Launches the bridge server
└── README.md
```

---

## Privacy Policy

**Your data never leaves your computer.**

- The extension reads note titles and content from the Google Keep tab you have open
- Data is sent only to `localhost:8080` — never to any external server
- Nothing is stored persistently; notes are read on demand and discarded
- No account is created; no passwords are stored

Full privacy policy: [store-assets/privacy-policy.html](store-assets/privacy-policy.html)
