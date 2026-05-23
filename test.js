/**
 * test.js — End-to-end MCP test
 * Spawns server.js, waits for the extension to connect, then calls get_keep_notes.
 * Run with: node test.js
 */

import { spawn } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "mcp-server", "server.js");

console.log("🚀 Starting MCP bridge server...");
const server = spawn(process.execPath, [serverPath], {
  stdio: ["pipe", "pipe", "pipe"]
});

// Track extension connection from stderr
let extensionConnected = false;
let extensionConnectedResolve;
const extensionReady = new Promise(r => { extensionConnectedResolve = r; });

server.stderr.on("data", (d) => {
  const msg = d.toString();
  process.stdout.write(`  [server] ${msg}`);
  if (msg.includes("Chrome extension connected") || msg.includes("extension connected")) {
    extensionConnected = true;
    extensionConnectedResolve();
  }
});

// MCP message handling
const rl = createInterface({ input: server.stdout });
const pending = new Map();

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve(msg);
    }
  } catch { }
});

function send(msg) {
  server.stdin.write(JSON.stringify(msg) + "\n");
}

function call(id, method, params) {
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timed out waiting for "${method}"`));
      }
    }, 15000);
  });
}

async function run() {
  // MCP handshake
  await call(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" }
  });
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  console.log("✅ MCP handshake complete.\n");

  // Wait for extension to connect (up to 20 seconds)
  console.log("⏳ Waiting for Edge extension to connect...");
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(
      "Extension did not connect within 20 seconds.\n" +
      "   → Make sure Edge is open at keep.google.com\n" +
      "   → Make sure the extension loaded (check edge://extensions/)"
    )), 20000)
  );
  await Promise.race([extensionReady, timeout]);
  console.log("✅ Extension connected!\n");

  // Call the tool
  console.log("📤 Calling get_keep_notes...\n");
  const result = await call(2, "tools/call", {
    name: "get_keep_notes",
    arguments: {}
  });

  const text = result?.result?.content?.[0]?.text ?? "(no response)";

  if (text.startsWith("Error:")) {
    console.error(`❌ Tool error: ${text}`);
  } else {
    let notes;
    try { notes = JSON.parse(text); } catch { notes = null; }

    if (!notes || notes.length === 0) {
      console.log("⚠️  0 notes returned — Keep page may be empty or selectors need updating.");
    } else {
      console.log(`✅ SUCCESS! Got ${notes.length} note(s) from Google Keep:\n`);
      notes.forEach((n, i) => {
        console.log(`  [${i + 1}] "${n.title}"`);
        if (n.content) console.log(`       ${n.content.slice(0, 100)}${n.content.length > 100 ? "..." : ""}`);
      });
      console.log("\n🎉 Full end-to-end test passed!");
    }
  }

  server.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error("\n❌ Test failed:", err.message);
  server.kill();
  process.exit(1);
});
