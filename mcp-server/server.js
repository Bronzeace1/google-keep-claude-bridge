/**
 * server.js — Local MCP bridge server
 *
 * Sits between Claude Desktop (via stdio MCP) and the Chrome extension
 * (via WebSocket on port 8080). No API keys, no OAuth — the extension
 * reads Keep directly from the browser where you're already logged in.
 */

import { Server }              from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer } from "ws";

// ---------------------------------------------------------------------------
// WebSocket server — the Chrome extension connects here
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ port: 8080 });
let extensionSocket = null;

wss.on("connection", (ws) => {
  extensionSocket = ws;
  console.error("[bridge] Chrome extension connected.");

  ws.on("close",   () => { extensionSocket = null; console.error("[bridge] Extension disconnected."); });
  ws.on("error",   (err) => console.error("[bridge] Extension socket error:", err.message));
});

console.error("[bridge] WebSocket server listening on ws://localhost:8080");

// ---------------------------------------------------------------------------
// Helper: ask the extension for notes, wait for the reply (5 s timeout)
// ---------------------------------------------------------------------------
function requestNotes() {
  return new Promise((resolve, reject) => {
    if (!extensionSocket || extensionSocket.readyState !== 1 /* OPEN */) {
      return reject(new Error(
        "Chrome extension is not connected. " +
        "Make sure Google Keep is open in Chrome and the extension is installed."
      ));
    }

    const timeout = setTimeout(() => {
      extensionSocket.off("message", handler);
      reject(new Error("Timed out waiting for notes from the extension (15 s)."));
    }, 15000);

    function handler(data) {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      if (msg.action === "send_notes") {
        clearTimeout(timeout);
        extensionSocket.off("message", handler);
        resolve(msg.data);
      }
    }

    extensionSocket.on("message", handler);
    extensionSocket.send(JSON.stringify({ action: "get_notes" }));
  });
}

// ---------------------------------------------------------------------------
// MCP server — Claude Desktop connects here via stdio
// ---------------------------------------------------------------------------
const mcpServer = new Server(
  { name: "google-keep-bridge", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_keep_notes",
      description:
        "Returns the titles and content of all visible notes on the " +
        "Google Keep page currently open in Chrome.",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "search_keep_notes",
      description:
        "Returns Keep notes whose title or content contains the given query string.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The text to search for across note titles and content.",
          },
        },
        required: ["query"],
      },
    },
  ],
}));

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "get_keep_notes") {
    try {
      const notes = await requestNotes();
      if (!notes.length) {
        return { content: [{ type: "text", text: "No notes found on the current Keep page." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(notes, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }

  if (name === "search_keep_notes") {
    const query = (args?.query || "").toLowerCase();
    try {
      const notes = await requestNotes();
      const matches = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(query) ||
          n.content.toLowerCase().includes(query)
      );
      if (!matches.length) {
        return { content: [{ type: "text", text: `No notes matched "${args.query}".` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }] };
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
