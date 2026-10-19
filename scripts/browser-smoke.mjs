import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// An isolated Chrome profile and synthetic data only. No customer browser is touched.
const profile = await mkdtemp(join(tmpdir(), "nodus-browser-test-"));
const chrome = process.env.CHROME_BIN || (process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "/usr/bin/google-chrome");
if (!existsSync(chrome)) throw new Error("Set CHROME_BIN to a Chrome/Chromium executable.");
const port = 5187, debuggingPort = 9238;
const origin = `http://127.0.0.1:${port}`;
const preview = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "pipe" });
const browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--no-sandbox", "--no-proxy-server", `--remote-debugging-port=${debuggingPort}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) { try { const result = await check(); if (result) return result; } catch {} await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
let socket, diagnostic;
try {
  await until(async () => (await fetch(origin)).ok, "preview server");
  const targets = await until(async () => { const response = await fetch(`http://127.0.0.1:${debuggingPort}/json`); return response.json(); }, "Chrome debugger");
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map(), errors = [], requests = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") errors.push(message.params.args.map(arg => arg.description || arg.value).join(" "));
    if (message.method === "Network.requestWillBeSent") requests.push(message.params.request.url);
    if (!message.id) return;
    const callbacks = pending.get(message.id); if (!callbacks) return;
    pending.delete(message.id); clearTimeout(callbacks.timeout);
    if (message.error) callbacks.reject(Error(message.error.message)); else callbacks.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  diagnostic = async () => ({ errors, page: await evaluate('({url:location.href,text:document.body.innerText.slice(0,1000)})'), requests });
  await send("Runtime.enable"); await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: origin });
  await until(() => evaluate('!!document.querySelector(".landing") && !!document.querySelector("button")'), "landing");
  assert(!requests.some(url => /\/charts-/.test(url)), "Charts should not load on the landing page");
  const permissions = { editRecords: true, deleteRecords: true, editStructure: true, manageUsers: true };
  const workspace = { id: "browser-qa", version: 5, revision: 0, companyName: "QA NODUS", industry: "real estate", architecture: "advanced", currentUserId: "admin", roles: [{ id: "admin", name: "Admin", permissions }], users: [{ id: "admin", name: "QA", initials: "QA", email: "qa@example.test", roleId: "admin", title: "Admin" }],
    entities: [{ id: "properties", name: "Properties", fields: [{ id: "title", name: "Title", type: "text", required: true }, { id: "phase", name: "Phase", type: "status", options: ["Available", "Sold"] }, { id: "price", name: "Price", type: "currency" }], records: Array.from({ length: 120 }, (_, index) => ({ id: `p-${index}`, title: `Property ${index}`, phase: index % 2 ? "Sold" : "Available", price: 450000 + index })) }], relations: [], views: [], workflows: [], changeHistory: [], alerts: [], comments: [], attachments: [], approvals: [], activity: [], notifications: [] };
  await evaluate(`localStorage.setItem('ai-business-os-workspace', ${JSON.stringify(JSON.stringify(workspace))}); location.hash='workspace/properties';`);
  await send("Page.reload");
  await until(() => evaluate('document.querySelectorAll("tbody tr").length===50'), "50 paginated records");
  assert.equal(await evaluate('document.querySelector("tbody tr").innerText.includes("Property 0")'), true);
  await evaluate('document.querySelector(\'button[aria-label="Pagina successiva"]\').click()');
  await until(() => evaluate('document.querySelector("tbody tr").innerText.includes("Property 50")'), "next page");
  await evaluate(`(()=>{const input=document.querySelector('.table-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Property 119');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until(() => evaluate('document.querySelectorAll("tbody tr").length===1 && document.querySelector("tbody tr").innerText.includes("Property 119")'), "search across all pages");
  await evaluate(`(()=>{const input=document.querySelector('.table-search input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until(() => evaluate('document.querySelectorAll("tbody tr").length===50'), "clear search");
  await evaluate('document.querySelector(\'button[aria-label="Filtra"]\').click()');
  await until(() => evaluate('!!document.querySelector(\'button[aria-label="Filtra per stato"]\')'), "status filter");
  const point = await evaluate(`(()=>{const rect=document.querySelector('button[aria-label="Filtra per stato"]').getBoundingClientRect();return {x:rect.x+rect.width/2,y:rect.y+rect.height/2}})()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...point });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...point });
  await until(() => evaluate('document.querySelectorAll(\'[role="option"]\').length===3'), "schema-derived status options");
  await evaluate(`[...document.querySelectorAll('[role="option"]')].find(option=>option.innerText.trim()==='Available').click()`);
  await until(() => evaluate('document.querySelector(".table-footer").innerText.includes("60 di 120 record") && [...document.querySelectorAll("tbody tr")].every(row=>row.innerText.includes("Available"))'), "filter on phase field, not hardcoded status");
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.innerText.trim()==='Cancella filtro').click()`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  await until(() => evaluate('document.querySelector(".table-footer").innerText.includes("120 di 120 record")'), "clear status filter");
  await evaluate('document.querySelector("tbody tr").click()');
  await until(() => evaluate('!!document.querySelector(\'[role="dialog"]\')'), "record drawer");
  // Simulate an external save; keep the current form/draft intact and reject its stale snapshot.
  await evaluate(`(()=>{const key='ai-business-os-workspace',oldValue=localStorage.getItem(key),w=JSON.parse(oldValue);w.companyName='Updated by another tab';w.revision++;const newValue=JSON.stringify(w);localStorage.setItem(key,newValue);dispatchEvent(new StorageEvent('storage',{key,oldValue,newValue,storageArea:localStorage}));})()`);
  await evaluate(`[...document.querySelectorAll('button')].find(button=>button.innerText.trim()==='Salva record').click()`);
  await until(() => evaluate('document.body.innerText.includes("altra scheda")'), "stale-tab feedback");
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("ai-business-os-workspace")).companyName'), "Updated by another tab");
  await send("Page.reload");
  await until(() => evaluate('document.querySelectorAll("tbody tr").length===50'), "workspace reload");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(200);
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false, "Mobile horizontal overflow");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'), false, "Desktop horizontal overflow");
  // Recovery must retain the corrupt input and expose a backup action.
  await evaluate(`localStorage.setItem('ai-business-os-workspace',JSON.stringify({version:5,companyName:'Broken',entities:[]}))`);
  await send("Page.reload");
  await until(() => evaluate('document.body.innerText.includes("Download saved data")'), "recoverable invalid data");
  assert.deepEqual(errors, [], "Unexpected browser runtime exceptions");
  console.log("Browser smoke passed: lazy landing, pagination, full search, schema-derived status filter, drawer, stale-tab rejection, responsive layout, recovery; no runtime exceptions.");
} catch (error) {
  if (diagnostic) console.error(JSON.stringify(await diagnostic()));
  throw error;
} finally {
  socket?.close(); browser.kill("SIGTERM"); preview.kill("SIGTERM");
  await pause(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
