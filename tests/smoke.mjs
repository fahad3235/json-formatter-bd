// Headless-Chrome smoke test via raw CDP (no deps). Run: node tests/smoke.mjs [mobile]
// Uses /opt/meta-chromium/chrome + built-in WebSocket. Pure ASCII source.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = "file://" + path.join(DIR, "..", "index.html");
const PORT = 9224 + Math.floor(Math.random() * 500);
const MOBILE = process.argv[2] === "mobile";
const chrome = spawn("/opt/meta-chromium/chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage",
  "--remote-debugging-port=" + PORT, "--remote-debugging-address=127.0.0.1",
  "about:blank",
], { stdio: "ignore" });

let checks = 0, failures = [];
function check(name, cond, extra) {
  checks++;
  if (cond) console.log("ok - " + name);
  else { failures.push(name); console.log("FAIL - " + name + (extra ? " :: " + extra : "")); }
}

async function waitForWs() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch("http://127.0.0.1:" + PORT + "/json/list");
      if (r.ok) {
        const targets = await r.json();
        const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("chrome did not start");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const pending = new Map();
let ws;
const consoleErrors = [];
const pageErrors = [];
let loadResolve; const loaded = new Promise((r) => (loadResolve = r));

function send(method, params) {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
async function evaluate(expr) {
  const res = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
  if (res.result && res.result.exceptionDetails) {
    pageErrors.push(JSON.stringify(res.result.exceptionDetails).slice(0, 300));
    return undefined;
  }
  return res.result && res.result.result ? res.result.result.value : undefined;
}

try {
  const url = await waitForWs();
  ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Page.loadEventFired") loadResolve();
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error")
      consoleErrors.push(JSON.stringify(m.params.args).slice(0, 300));
    if (m.method === "Runtime.exceptionThrown")
      pageErrors.push((m.params.exceptionDetails.exception?.description || "exception").slice(0, 300));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error")
      consoleErrors.push(m.params.entry.text.slice(0, 300));
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Log.enable");
  if (MOBILE) await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: PAGE });
  await loaded;
  await sleep(600);

  check("title", (await evaluate("document.title"))?.includes("JSON Formatter BD"));
  check("lang buttons present", (await evaluate("!!document.getElementById('langEn') && !!document.getElementById('langBn')")) === true);

  // Format
  await evaluate("document.getElementById('input').value = '{\"b\":1,\"a\":2}'; document.getElementById('btnFormat').click();");
  await sleep(200);
  check("format 2-space", (await evaluate("document.getElementById('output').textContent")) === '{\n  "b": 1,\n  "a": 2\n}');
  check("status valid", (await evaluate("document.getElementById('status').textContent"))?.includes("Valid"));
  check("stats show keys", (await evaluate("document.getElementById('stats').textContent"))?.includes("Keys"));
  check("tree rows rendered", (await evaluate("document.querySelectorAll('#tree .tr').length")) === 3);

  // Indent 4
  await evaluate("document.getElementById('indent').value = '4'; document.getElementById('btnFormat').click();");
  await sleep(150);
  check("format 4-space", (await evaluate("document.getElementById('output').textContent"))?.includes('    "b"'));

  // Minify
  await evaluate("document.getElementById('btnMinify').click();");
  await sleep(150);
  check("minify", (await evaluate("document.getElementById('output').textContent")) === '{"b":1,"a":2}');

  // Sort keys
  await evaluate("document.getElementById('btnSort').click();");
  await sleep(150);
  check("sort keys", (await evaluate("document.getElementById('output').textContent")) === '{\n    "a": 2,\n    "b": 1\n}');

  // Invalid
  await evaluate("document.getElementById('input').value = '{\"a\":1,}'; document.getElementById('btnValidate').click();");
  await sleep(150);
  check("invalid status", (await evaluate("document.getElementById('status').className"))?.includes("err"));
  check("invalid message", (await evaluate("document.getElementById('status').textContent"))?.includes("Invalid"));

  // Sample (contains Bengali city name via \\u escapes in the app)
  await evaluate("document.getElementById('btnSample').click();");
  await sleep(200);
  check("sample renders Bengali", (await evaluate("document.getElementById('output').textContent"))?.includes("\u09A2\u09BE\u0995\u09BE"));
  check("sample tree rows", (await evaluate("document.querySelectorAll('#tree .tr').length")) > 5);

  // Tree search narrows rows
  await evaluate("var s=document.getElementById('treeSearch'); s.value='capital'; s.dispatchEvent(new Event('input',{bubbles:true}));");
  await sleep(150);
  check("tree search narrows", (await evaluate("document.querySelectorAll('#tree .tr').length")) === 2);
  await evaluate("var s=document.getElementById('treeSearch'); s.value='zzz-no-match'; s.dispatchEvent(new Event('input',{bubbles:true}));");
  await sleep(150);
  check("tree search no matches", (await evaluate("document.getElementById('tree').textContent"))?.includes("No matches") || (await evaluate("document.getElementById('tree').textContent"))?.includes("\u0995\u09CB\u09A8\u09CB"));
  await evaluate("var s=document.getElementById('treeSearch'); s.value=''; s.dispatchEvent(new Event('input',{bubbles:true}));");

  // Collapse all reduces visible rows
  const before = await evaluate("document.querySelectorAll('#tree .tr').length");
  await evaluate("document.getElementById('btnCollapse').click();");
  await sleep(150);
  const after = await evaluate("document.querySelectorAll('#tree .tr').length");
  check("collapse all reduces rows", after < before, before + " -> " + after);
  await evaluate("document.getElementById('btnExpand').click();");
  await sleep(150);

  // BN toggle
  await evaluate("document.getElementById('langBn').click();");
  await sleep(200);
  check("BN toggle title", (await evaluate("document.querySelector('h1').textContent")) === "JSON \u09AB\u09B0\u09AE\u09CD\u09AF\u09BE\u099F\u09BE\u09B0 \u09AC\u09BF\u09A1\u09BF");
  check("BN toggle persists", (await evaluate("localStorage.getItem('jsonfmt-lang')")) === "bn");
  await evaluate("document.getElementById('langEn').click();");
  await sleep(150);
  check("EN toggle back", (await evaluate("document.querySelector('h1').textContent")) === "JSON Formatter BD");

  // Clear
  await evaluate("document.getElementById('btnClear').click();");
  await sleep(150);
  check("clear empties input+output", (await evaluate("document.getElementById('input').value")) === "" && (await evaluate("document.getElementById('output').textContent")) === "");

  // Validate empty -> error state (no crash)
  await evaluate("document.getElementById('btnValidate').click();");
  await sleep(150);
  check("validate empty errors", (await evaluate("document.getElementById('status').className"))?.includes("err"));

  if (MOBILE) {
    check("390px no horizontal overflow", (await evaluate("document.documentElement.scrollWidth")) <= 390, "scrollWidth=" + (await evaluate("document.documentElement.scrollWidth")));
  }

  check("zero console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  check("zero page exceptions", pageErrors.length === 0, pageErrors.join(" | "));
} catch (e) {
  failures.push("harness: " + e.message);
  console.log("FAIL - harness: " + e.message);
} finally {
  try { ws && ws.close(); } catch (e) {}
  chrome.kill();
}

console.log("\n" + (checks - failures.length) + "/" + checks + " smoke checks passed" + (MOBILE ? " (mobile)" : " (desktop)"));
if (failures.length) { console.log("FAILURES: " + failures.join(", ")); process.exit(1); }
