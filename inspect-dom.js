import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { WebSocket } = require("./mcp-server/node_modules/ws");

const WS_URL = "ws://localhost:9222/devtools/page/78BF790F9629942C119770F09C0DD8DC";
const ws = new WebSocket(WS_URL);
let msgId = 1;
const pending = new Map();
ws.on("message", d => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
function evaluate(expr) { return new Promise(res => { const id = msgId++; pending.set(id, res); ws.send(JSON.stringify({ id, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } })); }); }

ws.on("open", async () => {
  // Inspect the second card (first real note = "Places to eat")
  const r = await evaluate(`
    (function() {
      const cards = document.querySelectorAll('.IZ65Hb-n0tgWb.IZ65Hb-WsjYwc-nUpftc');
      const card = cards[0]; // "Places to eat"
      const allEls = Array.from(card.querySelectorAll('*'));
      return JSON.stringify(allEls.map(el => ({
        tag: el.tagName,
        cls: el.className?.toString().slice(0, 60),
        role: el.getAttribute('role'),
        text: el.innerText?.trim().slice(0, 80)
      })).filter(e => e.text).slice(0, 20), null, 2);
    })()
  `);
  console.log(JSON.parse(r.result.result.value));
  ws.close(); process.exit(0);
});
ws.on("error", e => { console.error(e.message); process.exit(1); });
