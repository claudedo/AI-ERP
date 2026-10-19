import { writeFile } from "node:fs/promises";
const target = (await (await fetch("http://127.0.0.1:9227/json")).json()).find(
  (p) => p.type === "page",
);
if (!target || !/^http:\/\/(?:127\.0\.0\.1|localhost):5177\//.test(target.url))
  throw Error("QA requires the isolated local application on port 5177");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map(),
  errors = [],
  network = [],
  results = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
  } else if (m.method === "Runtime.exceptionThrown")
    errors.push(
      m.params.exceptionDetails.exception?.description ||
        m.params.exceptionDetails.text,
    );
  else if (m.method === "Network.loadingFailed") network.push(m.params);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw Error(
      r.exceptionDetails.exception?.description || r.exceptionDetails.text,
    );
  return r.result?.value;
};
const check = (name, value) => {
  if (!value) throw Error("FAILED " + name);
  results.push({ name, passed: true });
  console.log("PASS", name);
};
const text = () => ev("document.body.innerText");
const click = async (name, scope = "document") => {
  await ev(
    `(()=>{const b=[...${scope}.querySelectorAll('button,a,[role=option]')].filter(e=>!e.closest('[aria-hidden="true"]')&&!e.closest('[data-state="closed"][role="dialog"]')).find(e=>e.innerText.trim()===${JSON.stringify(name)}||e.getAttribute('aria-label')===${JSON.stringify(name)});if(!b||b.disabled)throw Error('Missing button '+${JSON.stringify(name)});b.focus();b.click()})()`,
  );
  await wait(260);
};
const field = async (name, value) => {
  await ev(
    `(()=>{const root=[...document.querySelectorAll('[role=dialog]')].filter(e=>!e.closest('[aria-hidden="true"]')&&e.getAttribute('data-state')!=='closed').at(-1)||document;const l=[...root.querySelectorAll('label')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(name)}));const x=l?.querySelector('input,select,textarea');if(!x)throw Error('Missing field '+${JSON.stringify(name)});Object.getOwnPropertyDescriptor(x.tagName==='SELECT'?HTMLSelectElement.prototype:x.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(x,${JSON.stringify(value)});x.dispatchEvent(new Event(x.tagName==='SELECT'?'change':'input',{bubbles:true}))})()`,
  );
  await wait(120);
};
const fill = async (selector, value) => {
  await ev(
    `(()=>{const x=document.querySelector(${JSON.stringify(selector)});if(!x)throw Error('Missing '+${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(x.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(x,${JSON.stringify(value)});x.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  );
  await wait(120);
};
const nav = async (name) => {
  await ev(
    `(()=>{const b=[...document.querySelectorAll('aside button')].find(e=>e.innerText.startsWith(${JSON.stringify(name)}));if(!b)throw Error('Missing nav');b.click()})()`,
  );
  await wait(180);
};
const choose = async (label, value) => {
  const point = await ev(
    `(()=>{const b=document.querySelector('button[aria-label='+${JSON.stringify(JSON.stringify(label))}+']');if(!b)throw Error('Missing select');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`,
  );
  for (const type of ["mousePressed", "mouseReleased"])
    await send("Input.dispatchMouseEvent", {
      type,
      button: "left",
      clickCount: 1,
      ...point,
    });
  await wait(130);
  await click(value);
};
const key = async (key) => {
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key,
    code: key,
    windowsVirtualKeyCode: key === "Escape" ? 27 : 9,
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
  await wait(250);
};
const state = () =>
  ev('JSON.parse(localStorage.getItem("ai-business-os-workspace"))');
const reload = async () => {
  await send("Page.reload", { ignoreCache: true });
  await wait(700);
};
await send("Runtime.enable");
await send("Network.enable");
await send("Page.enable");
try {
  const mode = process.argv[2];
  if (mode === "eval") {
    console.log(
      JSON.stringify(await ev(process.argv.slice(3).join(" ")), null, 2),
    );
  }
  if (mode === "onboarding") {
    check("landing local disclosure", (await text()).includes("regole locali"));
    await click("Crea workspace");
    await fill(
      "textarea",
      "Siamo una società di consulenza con clienti, progetti, preventivi, fatture, scadenze e ore lavorate",
    );
    await click("Analizza la mia azienda");
    await wait(3600);
    check(
      "Italian consulting architecture",
      (await text()).includes("Timesheets"),
    );
    await reload();
    check("architecture survives refresh", (await text()).includes("OPTION C"));
    await ev(
      '[...document.querySelectorAll("button")].find(b=>b.innerText.includes("OPTION C")).click()',
    );
    await wait(100);
    await click("Continua con Avanzata");
    check(
      "consulting recommendation has no inventory",
      !(await text()).includes("inventory"),
    );
    await reload();
    check(
      "recommendations survive refresh",
      (await text()).includes("NODUS RECOMMENDATIONS"),
    );
    await click("Architettura");
    await click("Modifica descrizione");
    check(
      "description retained",
      (await ev('document.querySelector("textarea").value')).includes(
        "consulenza",
      ),
    );
    await fill(
      "textarea",
      "Siamo un team con processi molto diversi e vorremmo un gestionale",
    );
    await click("Analizza la mia azienda");
    check(
      "ambiguous sector requests confirmation",
      (await text()).includes("Conferma prima"),
    );
    await field("Il settore", "fashion");
    await click("Analizza la mia azienda");
    await wait(3600);
    check(
      "confirmed fashion architecture",
      (await text()).includes("Collections"),
    );
    await click("Modifica descrizione");
    await fill(
      "textarea",
      "Siamo una società di consulenza con clienti, progetti, fatture e ore lavorate",
    );
    await click("Analizza la mia azienda");
    await wait(3600);
    await ev(
      '[...document.querySelectorAll("button")].find(b=>b.innerText.includes("OPTION C")).click()',
    );
    await wait(100);
    await click("Continua con Avanzata");
    await click("Crea il mio workspace");
    await wait(3600);
    check(
      "one company module",
      !(await state()).entities.some((e) =>
        ["clients", "customers", "suppliers"].includes(e.id),
      ),
    );
    check(
      "coherent workflow",
      (await state()).workflows.every((w) => w.config?.entityId === "projects"),
    );
  }
  if (mode === "records") {
    await ev(
      `(async()=>{const a=await import('/src/services/aiEngine.ts'),c=await import('/src/services/companies.ts');const x=a.analyzeBusiness('società di consulenza');localStorage.setItem('ai-business-os-workspace',JSON.stringify(c.upgradeCompanies(a.generateWorkspace(x,a.generateArchitectureOptions(x)[2]))));location.hash='workspace/dashboard'})()`,
    );
    await reload();
    await nav("Aziende");
    await click("Aggiungi record");
    await click("Salva record");
    check(
      "blank company rejected",
      (await text()).toLowerCase().includes("ragione sociale"),
    );
    await field("Ragione sociale", "QA Studio Élite");
    await choose("Tipo", "Entrambi");
    await field("Partita IVA", "IT98765432100");
    await click("Salva record");
    check(
      "company saved",
      (await state()).entities
        .find((e) => e.id === "companies")
        .records.some((r) => r.name === "QA Studio Élite"),
    );
    await reload();
    check(
      "URL refresh stays in companies",
      (await text()).includes("WORKSPACE / AZIENDE"),
    );
    await click("Clienti");
    check(
      "both is a customer",
      (await ev('document.querySelector("tbody").innerText')).includes(
        "QA Studio",
      ),
    );
    await click("Fornitori");
    check(
      "both is a supplier",
      (await ev('document.querySelector("tbody").innerText')).includes(
        "QA Studio",
      ),
    );
    await click("Tutti: Aziende");
    await ev(
      '[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA Studio")).click()',
    );
    await wait(150);
    await field("Ragione sociale", "QA UNSAVED");
    await key("Escape");
    check(
      "dirty guard shown",
      (await text()).includes("Continua a modificare"),
    );
    await click("Continua a modificare");
    check(
      "draft retained",
      (await ev('document.querySelector("[role=dialog] input").value')) ===
        "QA UNSAVED",
    );
    await key("Escape");
    await click("Scarta modifiche");
    check(
      "dirty discard closes",
      !(await ev('!!document.querySelector("[role=dialog]")')),
    );
    await ev(
      '[...document.querySelectorAll("tbody tr")].find(r=>r.innerText.includes("QA Studio")).click()',
    );
    await wait(150);
    await click("Contatti");
    await click("Aggiungi contatto");
    await field("Nome", "QA Marco");
    await field("Cognome", "Bianchi");
    await field("Email", "qa.marco@example.test");
    await click("Salva record");
    check(
      "linked contact saved",
      (await state()).entities
        .find((e) => e.id === "company-contacts")
        .records.some((r) => r.name === "QA Marco"),
    );
    await click("Sedi");
    await click("Aggiungi sede");
    await field("Etichetta", "QA Sede legale");
    await field("Città", "Milano");
    await click("Salva record");
    check(
      "linked site saved",
      (await state()).entities
        .find((e) => e.id === "company-sites")
        .records.some((r) => r.city === "Milano"),
    );
    await key("Escape");
    await nav("Tasks");
    await click("Aggiungi record");
    await field("Task", "QA Senza categoria");
    await click("Salva record");
    await click("Kanban");
    check(
      "unassigned lane visible",
      (await text()).includes("Non assegnati") &&
        (await text()).includes("QA Senza categoria"),
    );
    await nav("Dashboard");
    await nav("Aziende");
    await nav("Projects");
    await ev("history.back()");
    await wait(250);
    check("browser back works", (await text()).includes("WORKSPACE / AZIENDE"));
    await ev("history.forward()");
    await wait(250);
    check(
      "browser forward works",
      (await text()).includes("WORKSPACE / PROJECTS"),
    );
    await nav("Utenti e ruoli");
    await ev('document.querySelectorAll(".user-card")[3].click()');
    await wait(150);
    await nav("Aziende");
    check(
      "Viewer no Smart Entry",
      !(await text()).includes("Inserisci con AI"),
    );
    await nav("Utenti e ruoli");
    await ev('document.querySelectorAll(".user-card")[0].click()');
    await wait(150);
  }
  if (mode === "edgecases") {
    if (await ev('!!document.querySelector(".smart-entry")'))
      await click("Chiudi inserimento");
    await nav("Aziende");
    await click("Aggiungi record");
    await field("Ragione sociale", "QA Guard Save");
    await choose("Tipo", "Cliente");
    await key("Escape");
    await click("Salva");
    check(
      "dirty guard save works",
      (await state()).entities
        .find((e) => e.id === "companies")
        .records.some((r) => r.name === "QA Guard Save"),
    );
    check(
      "focus returns to Aggiungi record",
      (await ev("document.activeElement.innerText")) === "Aggiungi record",
    );
    await click("Aggiungi record");
    await field("Ragione sociale", "QA VAT Duplicate");
    await choose("Tipo", "Fornitore");
    await field("Partita IVA", "12345678901");
    await click("Salva record");
    check(
      "duplicate VAT rejected in UI",
      (await text()).includes("Partita IVA già presente"),
    );
    await click("Annulla");
    await click("Scarta modifiche");
    await click("Inserisci con AI");
    await field("Testo", "Crea un ordine per il cliente Rossi Srl");
    await click("Prepara proposta");
    check(
      "missing information blocks confirmation",
      await ev(
        '[...document.querySelectorAll(".smart-entry button")].find(b=>b.innerText==="Conferma e salva").disabled',
      ),
    );
    await click("Annulla");
    await click("Continua a modificare");
    check(
      "cancel retains proposal",
      (await text()).includes("Indica quantità"),
    );
    await click("Annulla");
    await click("Scarta modifiche");
    const before = (await state()).entities.find((e) => e.id === "orders")
      .records.length;
    await click("Inserisci con AI");
    await field(
      "Testo",
      "Crea un ordine per il cliente Rossi Srl: 7 lampade a 22 euro.",
    );
    await click("Prepara proposta");
    await ev(
      '(()=>{const b=[...document.querySelectorAll(".smart-entry button")].find(b=>b.innerText==="Conferma e salva");b.click();b.click()})()',
    );
    await wait(400);
    check(
      "double click saved only once",
      (await state()).entities.find((e) => e.id === "orders").records.length ===
        before + 1,
    );
    await ev(
      `(async()=>{const d=await import('/src/services/workspaceDomain.ts');let w=JSON.parse(localStorage.getItem('ai-business-os-workspace'));for(const id of ['qa-amb-1','qa-amb-2'])w=d.saveRecord(w,'companies',{id,name:'QA Omonimo',partyRole:'Cliente'});localStorage.setItem('ai-business-os-workspace',JSON.stringify(w))})()`,
    );
    await reload();
    await click("Inserisci con AI");
    await field(
      "Testo",
      "Crea un ordine per il cliente QA Omonimo: 1 sedia a 10 euro.",
    );
    await click("Prepara proposta");
    check(
      "ambiguous reference asks choice",
      (await text()).includes("Più corrispondenze"),
    );
    await field("Azienda di riferimento", "qa-amb-1");
    await click("Prepara proposta");
    check(
      "explicit choice resolves ambiguity",
      await ev(
        '![...document.querySelectorAll(".smart-entry button")].find(b=>b.innerText==="Conferma e salva").disabled',
      ),
    );
    await click("Annulla");
    await click("Scarta modifiche");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await click("Inserisci con AI");
    await wait(250);
    check(
      "mobile dialog no internal overflow",
      await ev(
        'document.querySelector(".workflow-editor-fields").scrollWidth<=document.querySelector(".workflow-editor-fields").clientWidth',
      ),
    );
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      "/private/tmp/nodus-v2-mobile.png",
      Buffer.from(shot.data, "base64"),
    );
  }
  if (mode === "smart") {
    await ev(
      `(async()=>{const a=await import('/src/services/aiEngine.ts'),c=await import('/src/services/companies.ts');const x=a.analyzeBusiness('customers and orders');localStorage.setItem('ai-business-os-workspace',JSON.stringify(c.upgradeCompanies(a.generateWorkspace(x,a.generateArchitectureOptions(x)[2]))));location.hash='workspace/dashboard'})()`,
    );
    await reload();
    await click("Inserisci con AI");
    await field(
      "Testo",
      "Aggiungi Rossi Srl, P.IVA 12345678901, sede legale a Milano, referente acquisti Marco Bianchi, email marco@rossi.it.",
    );
    await click("Prepara proposta");
    check(
      "company site contact preview",
      (await text()).includes("3 operazioni"),
    );
    await click("Conferma e salva");
    let w = await state();
    check(
      "company site contact persisted",
      w.entities
        .find((e) => e.id === "company-contacts")
        .records.some((r) => r.email === "marco@rossi.it"),
    );
    await click("Inserisci con AI");
    await field(
      "Testo",
      "Crea due ordini per il cliente Rossi Srl: 20 sedie a 150 euro e 5 tavoli a 800 euro.",
    );
    await click("Prepara proposta");
    check("two orders preview", (await text()).includes("2 operazioni"));
    await click("Conferma e salva");
    w = await state();
    check(
      "orders amounts correct",
      w.entities
        .find((e) => e.id === "orders")
        .records.filter((r) => [3000, 4000].includes(r.value)).length === 2,
    );
    await reload();
    check(
      "Smart Entry survives reload",
      (await state()).appliedEntries.length === 2,
    );
    await click("Inserisci con AI");
    await field("Testo", "Sposta la consegna dell’ordine ORD-1048 a venerdì.");
    await click("Prepara proposta");
    check(
      "absolute delivery date in preview",
      await ev(
        '[...document.querySelectorAll(".smart-entry input[type=date]")].some(e=>/^2026-/.test(e.value))',
      ),
    );
    await click("Conferma e salva");
    await nav("NODUS AI · Operator");
    await fill(
      "textarea",
      "Aggiungi il fornitore QA Tessuti Italia, referente acquisti QA Marco, email qa@tessuti.test",
    );
    await click("Invia messaggio");
    check(
      "chat reuses Smart Entry",
      (await text()).includes("Testo, email o dati"),
    );
    await click("Prepara proposta");
    await click("Conferma e salva");
    check(
      "supplier from chat saved",
      (await state()).entities
        .find((e) => e.id === "companies")
        .records.some(
          (r) => r.name === "QA Tessuti Italia" && r.partyRole === "Fornitore",
        ),
    );
    await send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
    });
    await wait(250);
    check(
      "mobile no page overflow",
      await ev("document.documentElement.scrollWidth<=innerWidth"),
    );
    await click("Inserisci con AI");
    await wait(250);
    check(
      "mobile smart dialog fits",
      await ev(
        'document.querySelector(".smart-entry").getBoundingClientRect().width<=innerWidth',
      ),
    );
    const shot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(
      "/private/tmp/nodus-v2-mobile.png",
      Buffer.from(shot.data, "base64"),
    );
  }
  console.log(JSON.stringify({ results, errors, network }, null, 2));
  await writeFile(
    `/private/tmp/nodus-v2-${mode}-results.json`,
    JSON.stringify({ results, errors, network }, null, 2),
  );
} catch (error) {
  console.error(error);
  console.log("SCREEN", await text());
  const shot = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(
    "/private/tmp/nodus-v2-failure.png",
    Buffer.from(shot.data, "base64"),
  );
  process.exitCode = 1;
} finally {
  ws.close();
}
