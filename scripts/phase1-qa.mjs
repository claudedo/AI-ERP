import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Local app, isolated disposable browser, synthetic records. Never production.
const profile = await mkdtemp(join(tmpdir(), "nodus-phase1-"));
const port = 5193, debug = 9243, origin = `http://127.0.0.1:${port}`;
const preview = process.env.PHASE1_PREVIEW === "1";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", ...(preview ? ["preview"] : []), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { stdio: "pipe" });
const chrome = spawn(process.env.CHROME_BIN || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--no-sandbox", `--remote-debugging-port=${debug}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [], errors = [];
let socket;
const permissions = { editRecords: true, deleteRecords: true, editStructure: true, manageUsers: true };
const fixture = () => ({ id: "phase1-browser", version: 5, revision: 0, companyName: "QA", industry: "realestate", architecture: "advanced", currentUserId: "admin", roles: [{ id: "admin", name: "Admin", permissions }], users: [{ id: "admin", name: "QA", initials: "QA", email: "qa@example.test", roleId: "admin", title: "Admin" }],
  entities: [
    { id: "properties", name: "Immobili", fields: [{ id: "title", name: "Titolo", type: "text", required: true }, { id: "phase", name: "Fase", type: "status", options: ["Available", "Sold"] }, { id: "price", name: "Prezzo", type: "currency" }, { id: "owner", name: "Proprietario", type: "relation", relationEntityId: "owners" }], records: [{ id: "p1", title: "Casa test", phase: "Available", price: 600000, owner: "o1" }, { id: "p2", title: "Casa venduta", phase: "Sold", price: 200000, owner: "o1" }] },
    { id: "owners", name: "Proprietari", fields: [{ id: "name", name: "Nome", type: "text", required: true }], records: [{ id: "o1", name: "Rossi" }] },
    { id: "old", name: "Archivio", archived: true, fields: [{ id: "name", name: "Nome", type: "text" }], records: [{ id: "old1", name: "Ghost archived" }] },
  ], relations: [], views: [{ id: "unsold", entityId: "properties", name: "Non venduti", columns: ["title", "phase"], filters: [{ fieldId: "phase", operator: "not-equals", value: "Sold" }, { fieldId: "phase", operator: "contains", value: "Avail" }], sort: { fieldId: "price", direction: "desc" }, layout: "table", createdBy: "admin" }], workflows: [], changeHistory: [], alerts: [], comments: [], attachments: [], approvals: [], activity: [], notifications: [] });

try {
  let targets;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(origin)).ok) { targets = await (await fetch(`http://127.0.0.1:${debug}/json`)).json(); break; } } catch {} await pause(100); }
  if (!targets) throw Error("Local server or Chrome unavailable");
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0; const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (!message.id) return;
    const p = pending.get(message.id); if (!p) return;
    pending.delete(message.id); clearTimeout(p.timer);
    if (message.error) p.reject(Error(message.error.message)); else p.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => reject(Error(`CDP timeout ${method}`)), 15000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const value = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (value.exceptionDetails) throw Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  const until = async (expression, label = expression) => { for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); } throw Error(`Timed out: ${label}`); };
  const click = text => evaluate(`[...document.querySelectorAll('button')].find(e=>e.innerText.trim()===${JSON.stringify(text)} || e.innerText.includes(${JSON.stringify(text)})).click()`);
  const input = (selector, value, textarea = false) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${textarea ? "HTMLTextAreaElement" : "HTMLInputElement"}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const load = async (workspace = fixture(), hash = "workspace/properties") => {
    await evaluate(`localStorage.clear();${workspace ? `localStorage.setItem('ai-business-os-workspace',${JSON.stringify(JSON.stringify(workspace))});` : ""}location.hash=${JSON.stringify(hash)};`);
    await evaluate("window.__phase1Reload=true");
    await send("Page.reload");
    await until("!window.__phase1Reload", "new document after reload");
    await until(workspace ? "!!document.querySelector('.entity-page')" : "!!document.querySelector('.landing')");
  };
  const test = async (name, fn) => { try { await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, error: e.message }); } console.log(JSON.stringify(results.at(-1))); };
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: origin }); await until("!!document.querySelector('button')");
  for (const width of [375, 768, 1440]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 1000, deviceScaleFactor: 1, mobile: width === 375 });
    await test(`${width}px: saved view preserves operators and columns`, async () => {
      await load(); await click("Non venduti"); await pause(150);
      assert.deepEqual(await evaluate("[...document.querySelectorAll('tbody tr')].map(e=>e.innerText.split('\\t')[0])"), ["Casa test"]);
      assert.equal(await evaluate("document.querySelectorAll('thead th').length"), 3);
      assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"), false);
    });
    await test(`${width}px: related-record navigation asks before losing draft`, async () => {
      await load(); await evaluate("document.querySelector('tbody tr').click()"); await until("!!document.querySelector('.record-drawer input')");
      await input(".record-drawer input", "Bozza non salvata"); await evaluate("document.querySelector('.related-list button').click()"); await pause(100);
      assert(await evaluate("!!document.querySelector('[role=alertdialog]')"), "Missing unsaved-changes confirmation");
      await click("Continua a modificare"); await pause(100);
      assert.equal(await evaluate("document.querySelector('.record-drawer input').value"), "Bozza non salvata");
      await evaluate("document.querySelector('.related-list button').click()"); await click("Scarta modifiche"); await until("document.querySelector('.record-drawer h2')?.innerText==='Rossi'");
      assert.equal(await evaluate("JSON.parse(localStorage.getItem('ai-business-os-workspace')).entities.find(e=>e.id==='properties').records[0].title"), "Casa test");
    });
    await test(`${width}px: relation search opens the exact record`, async () => {
      await load(); await input('[aria-label="Search all workspace records"]', "Rossi"); await until("!!document.querySelector('.global-search-results button')");
      await evaluate("document.querySelector('.global-search-results button').click()"); await pause(150);
      assert.equal(await evaluate("document.querySelector('.record-drawer h2')?.innerText"), "Casa test");
    });
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await test("analysis → restart invalidates timer", async () => {
    await load(null, ""); await click("Progetta il tuo workspace"); await until("!!document.querySelector('textarea')");
    await input("textarea", "We run a real estate agency managing properties and owners.", true); await click("Analizza la mia azienda"); await until("!!document.querySelector('.loading-view')"); await click("Ricomincia"); await pause(3700);
    assert(await evaluate("!!document.querySelector('.discovery')"), "Previous analysis timer replaced restart");
  });
  await test("build → restart never saves an obsolete workspace", async () => {
    await load(null, ""); await click("Progetta il tuo workspace"); await until("!!document.querySelector('textarea')");
    await input("textarea", "We run a real estate agency managing properties and owners.", true); await click("Analizza la mia azienda"); await until("!!document.querySelector('.architecture-card')");
    await evaluate("document.querySelector('.architecture-card').click()"); await click("Continua con"); await click("Crea il mio workspace"); await click("Ricomincia"); await pause(3600);
    assert.equal(await evaluate("!!localStorage.getItem('ai-business-os-workspace')"), false);
    assert(await evaluate("!!document.querySelector('.discovery')"));
  });
  await test("archived records are absent from global search and command palette", async () => {
    await load(); await input('[aria-label="Search all workspace records"]', "Ghost"); await pause(100);
    assert.equal(await evaluate("document.querySelectorAll('.global-search-results button').length"), 0);
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "k", code: "KeyK", modifiers: 4 });
    await until("!!document.querySelector('[aria-label=\"Search commands\"]')"); await input('[aria-label="Search commands"]', "Ghost"); await pause(100);
    assert.equal(await evaluate("document.querySelectorAll('.command-results button').length"), 0);
  });
  assert.deepEqual(errors, [], "Runtime exceptions");
  console.log(JSON.stringify({ total: results.length, passed: results.filter(r => r.passed).length, failures: results.filter(r => !r.passed), errors }));
  if (results.some(r => !r.passed)) process.exitCode = 1;
} finally {
  socket?.close(); chrome.kill("SIGTERM"); server.kill("SIGTERM"); await pause(300);
  await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
