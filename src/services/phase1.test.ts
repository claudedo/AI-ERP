import { afterEach, describe, expect, it, vi } from "vitest";
import { openAttachment, saveAttachmentBlob } from "./attachments";
import { validateAttachmentUpload } from "./attachmentPolicy";
import { localChat } from "../ai/localChat";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";

afterEach(() => vi.unstubAllGlobals());

// Tiny asynchronous IDB boundary double; exercises the real save/open functions.
function browserFile(file: Blob) {
  const click = vi.fn();
  const link = { href: "", target: "", rel: "", download: "", click };
  vi.stubGlobal("document", { createElement: () => link });
  const createObjectURL = vi.fn((_blob: Blob) => "blob:synthetic");
  vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  vi.stubGlobal("window", { setTimeout: vi.fn() });
  vi.stubGlobal("indexedDB", {
    open() {
      const request: Record<string, unknown> = {};
      queueMicrotask(() => {
        request.result = {
          close() {},
          transaction() {
            const tx: Record<string, unknown> = {};
            tx.objectStore = () => ({
              put() { queueMicrotask(() => (tx.oncomplete as () => void)()); },
              get() {
                const get: Record<string, unknown> = { result: file };
                queueMicrotask(() => { (get.onsuccess as () => void)(); (tx.oncomplete as () => void)(); });
                return get;
              },
            });
            return tx;
          },
        };
        (request.onsuccess as () => void)();
      });
      return request;
    },
  });
  return { link, click, createObjectURL };
}

describe("phase 1 local attachment boundary", () => {
  it.each(["text/html", "image/svg+xml", "application/javascript"])("rejects new active %s files without persisting them", async type => {
    const file = new File(["<script>unsafe</script>"], "untrusted.html", { type });
    browserFile(file);
    await expect(saveAttachmentBlob("file", file)).rejects.toThrow();
  });
  it.each([
    ["contratto.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["listino.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["offerta.pdf", "application/pdf"],
  ])("accepts business document %s", (name, type) => {
    expect(() => validateAttachmentUpload(new File(["x"], name, { type }))).not.toThrow();
  });
  it.each(["text/xml", "application/xhtml+xml", "text/javascript"])("still rejects active %s by MIME", type => {
    expect(() => validateAttachmentUpload(new File(["x"], "file.bin", { type }))).toThrow();
  });
  it.each(["old.html", "old.svg", "old.pdf", "old.txt"])("existing %s can only be downloaded, never navigated as active content", async name => {
    const file = new File(["<script>unsafe</script>"], name, { type: "text/html" });
    const { link, createObjectURL } = browserFile(file);
    await openAttachment("old-file", name);
    expect(link.download).toBe(name);
    expect(createObjectURL.mock.calls[0][0].type).toBe("application/octet-stream");
  });
  it("does not trust a raster MIME/extension without matching bytes", async () => {
    const file = new File(["<html>not a PNG</html>"], "picture.png", { type: "image/png" });
    const { link } = browserFile(file);
    await openAttachment("old-file", file.name);
    expect(link.download).toBe(file.name);
  });
  it("previews a signature-checked PNG and preserves explicit download", async () => {
    const file = new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])], "safe.png", { type: "image/png" });
    const { link } = browserFile(file);
    await openAttachment("image", file.name);
    expect(link.download).toBe("");
    await openAttachment("image", file.name, true);
    expect(link.download).toBe(file.name);
  });
});

function fixture() {
  const analysis = analyzeBusiness("real estate agency");
  const w = generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]);
  w.entities = [{ id: "properties", name: "Immobili", fields: [
    { id: "address", name: "Indirizzo", type: "text" },
    { id: "askingPrice", name: "Prezzo", type: "currency" },
    { id: "phase", name: "Fase", type: "status", options: ["For sale", "Sold"] },
    { id: "city", name: "Città", type: "text" },
    { id: "date", name: "Data", type: "date" },
  ], records: [{ id: "p1", address: "Via Roma", city: "Milano", askingPrice: 600000, phase: "For sale" }, { id: "p2", city: "Roma", askingPrice: 200000, phase: "Sold" }] }];
  return w;
}
describe("phase 1 query conditions must never disappear", () => {
  it.each([
    "Quanti immobili costano più di 500000 euro?",
    "Quanti immobili abbiamo a Milano?",
    "Quanti immobili abbiamo in vendita a Milano?",
    "Elenca gli immobili con proprietario Rossi",
    "Quanti immobili avevamo lo scorso anno?",
    "Quanti immobili non sono venduti?",
  ])("filters or clarifies: %s", async question => {
    const result = await localChat(question, fixture());
    // Fail closed until the local grammar can interpret the entire condition.
    expect(result.type).toBe("clarification");
  });
  it.each(["Quanti immobili abbiamo?", "Quanti immobili abbiamo in vendita?", "Elenca Immobili con stato Sold", "Quanti immobili abbiamo questo mese?"])("preserves supported query: %s", async question => {
    expect((await localChat(question, fixture())).type).toBe("query_results");
  });
});
