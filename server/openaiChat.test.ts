import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import { upgradeCompanies } from "../src/services/companies";
import { applyEntry } from "../src/services/smartEntry";
import { chatIntent } from "../src/services/nodusChat";
import { selectChatContext } from "../src/ai/chatContext";
import { chatResponseSchema, modelReplySchema } from "../src/ai/chatContract";
import { paymentGuard } from "../src/ai/paymentGuard";
import { localChat } from "../src/ai/localChat";
import { requestChat, validateChatResponse } from "../src/ai/chatClient";
import { executeChatQuery } from "../src/ai/chatQueries";
import { openaiChat, validateModelReply, DEFAULT_OPENAI_MODEL } from "./openaiChat";
import { ChatRateLimit } from "./chatRateLimit";
import handler from "../netlify/functions/nodus-ai";

const request = "Abbiamo ricevuto un nuovo pagamento della casa a Modena da 300 mila euro.";
const fixture = () => {
  const analysis = analyzeBusiness("immobiliare"), w = upgradeCompanies(generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]));
  w.entities = [
    { id: "properties", name: "Immobili", fields: [{ id: "reference", name: "Riferimento", type: "text", required: true }, { id: "city", name: "Città", type: "text" }], records: [{ id: "PROP-MODENA-1", reference: "Villa Verdi", city: "Modena" }] },
    { id: "payments", name: "Pagamenti", fields: [{ id: "amount", name: "Importo", type: "currency", required: true }, { id: "property", name: "Immobile", type: "relation", relationEntityId: "properties", required: true }, { id: "date", name: "Data", type: "date" }, { id: "status", name: "Stato", type: "status", options: ["Ricevuto", "In attesa"] }], records: [] },
  ];
  w.workflows = []; w.views = []; w.relations = []; return w;
};
const envelope = (extra = {}) => ({ type: "answer", message: "Ciao, come posso aiutarti?", query: null, changes: [], structure_json: null, questions: [], ...extra });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("NODUS AI: structured contract and financial safety", () => {
  it.each(["Quanti pagamenti abbiamo ricevuto questo mese?", "Mostrami i pagamenti ricevuti"])("does not redirect payment queries into insertion: %s", async message => {
    const w = fixture(); w.users.find(u => u.id === w.currentUserId)!.roleId = "viewer";
    expect(paymentGuard(message, w)).toBeNull();
    const result = await localChat(message, w);
    expect(result.type).not.toBe("entry_proposal"); expect(result.message).not.toMatch(/non l.inserimento|solo di consultare/);
    const model = validateModelReply(envelope({ type: "query_results", query: { entityId: "payments", filters: [], metric: "count", fieldId: null, groupBy: null } }), w, message);
    expect(model.type).toBe("query_results");
  });
  it("handles imperative payments before the model without a provider call", async () => {
    const w = fixture(), fetcher = vi.fn(); vi.stubEnv("OPENAI_API_KEY", "test-only");
    const result = await openaiChat({ message: request, mode: "demo", requestId: crypto.randomUUID(), history: [] }, selectChatContext(w, request), w, fetcher);
    expect(result.type).toBe("entry_proposal"); expect(result.source).toBe("local"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("recognizes natural payment input as records, not a generic question", () => expect(chatIntent(request)).toBe("records"));
  it("rejects unknown response types, invalid shapes and extra keys", () => {
    expect(chatResponseSchema.safeParse({ type: "write_now", message: "saved", source: "openai" }).success).toBe(false);
    expect(modelReplySchema.safeParse(envelope({ changes: [{ entityId: "payments", kind: "delete", values: [] }] })).success).toBe(false);
    expect(modelReplySchema.safeParse(envelope({ sql: "DELETE" })).success).toBe(false);
  });
  it("extracts Modena and €300000 with one linked proposal, with no writes before confirmation", () => {
    const w = fixture(), before = JSON.stringify(w), reply = paymentGuard(request, w)!;
    expect(reply.type).toBe("entry_proposal");
    if (reply.type !== "entry_proposal") throw Error("Expected proposal");
    expect(reply.proposal.operations[0].record).toMatchObject({ amount: 300000, property: "PROP-MODENA-1", status: "Ricevuto" });
    expect(reply.proposal.operations[0].record.date).toBeUndefined();
    expect(JSON.stringify(w)).toBe(before);
    const saved = applyEntry(w, reply.proposal);
    expect(saved.entities.find(e => e.id === "payments")!.records).toHaveLength(1);
    expect(applyEntry(saved, reply.proposal)).toBe(saved);
  });
  it("asks a specific question for multiple Modena properties, and accepts an explicit follow-up ID", () => {
    const w = fixture(); w.entities[0].records.push({ id: "PROP-MODENA-2", reference: "Casa Nuova", city: "Modena" });
    expect(paymentGuard(request, w)?.type).toBe("clarification");
    const reply = paymentGuard(request + "\nCollega PROP-MODENA-2", w)!;
    expect(reply.type).toBe("entry_proposal");
    if (reply.type === "entry_proposal") expect(reply.proposal.operations[0].record.property).toBe("PROP-MODENA-2");
    expect(w.entities[1].records).toHaveLength(0);
  });
  it("asks for the missing link without inventing property or module", () => {
    const w = fixture(); w.entities[0].records = [];
    const reply = paymentGuard(request, w)!; expect(reply.type).toBe("clarification");
    if (reply.type === "clarification") expect(reply.extracted).toContainEqual({ label: "Importo (€)", value: 300000 });
    w.entities.pop(); expect(paymentGuard(request, w)?.type).toBe("clarification");
    expect(w.entities).toHaveLength(1);
  });
  it("does not invent a required payment date", () => {
    const w = fixture(); w.entities[1].fields.find(f => f.id === "date")!.required = true;
    expect(paymentGuard(request, w)?.type).toBe("clarification");
  });
  it("matches complete record IDs, not another record's prefix", () => {
    const w = fixture(); w.entities[0].records.push({ id: "PROP-MODENA-10", reference: "Casa Dieci", city: "Modena" });
    const reply = paymentGuard(request + " Collega PROP-MODENA-10", w)!;
    expect(reply.type).toBe("entry_proposal");
    if (reply.type === "entry_proposal") expect(reply.proposal.operations[0].record.property).toBe("PROP-MODENA-10");
  });
  it("denies writes for a viewer, both model response and client validation", () => {
    const w = fixture(), proposal = paymentGuard(request, w)!;
    w.users.find(u => u.id === w.currentUserId)!.roleId = "viewer";
    expect(paymentGuard(request, w)?.type).toBe("unsupported");
    expect(() => validateChatResponse(proposal, w, request)).toThrow(/consultazione/);
    expect(() => validateModelReply(envelope({ type: "entry_proposal", changes: [{ entityId: "payments", kind: "create", recordId: null, values: [{ fieldId: "amount", value: 3 }] }] }), w, "Crea un record")).toThrow();
  });
  it("requires an explicit Admin request for structural proposals", () => {
    const w = fixture(), input = envelope({ type: "structure_proposal", structure_json: "{}" });
    expect(() => validateModelReply(input, w, "Mostrami i clienti")).toThrow(/Explicit admin/);
    w.users.find(u => u.id === w.currentUserId)!.roleId = "manager";
    expect(() => validateModelReply(input, w, "Crea un modulo qualità")).toThrow(/Explicit admin/);
  });
  it("rejects invented fields and update identifiers", () => {
    const w = fixture();
    expect(() => validateModelReply(envelope({ type: "update_proposal", changes: [{ entityId: "properties", kind: "update", recordId: "not-existing", values: [] }] }), w, "Aggiorna immobile")).toThrow(/Unknown update/);
    expect(() => validateModelReply(envelope({ type: "update_proposal", changes: [{ entityId: "properties", kind: "update", recordId: "PROP-MODENA-1", values: [{ fieldId: "__proto__", value: "x" }] }] }), w, "Aggiorna immobile")).toThrow();
  });
  it("rejects a model proposal that turns a property request into a company, even with questions", () => {
    const analysis = analyzeBusiness("real estate agency"), w = upgradeCompanies(generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]));
    const input = envelope({ type: "entry_proposal", questions: ["Indica una sede"], changes: [{ entityId: "companies", kind: "create", recordId: null, values: [{ fieldId: "name", value: "nuova proprietà da 450 mila euro" }, { fieldId: "partyRole", value: "Cliente" }] }] });
    expect(() => validateModelReply(input, w, "aggiungi una nuova proprietà da 450 mila euro")).toThrow(/Wrong target entity/);
  });
  it("flags ambiguous non-financial updates rather than choosing a homonym silently", () => {
    const w = fixture(); w.entities[0].records.push({ id: "PROP-OTHER", reference: "Villa Verdi", city: "Milano" });
    const reply = validateModelReply(envelope({ type: "update_proposal", changes: [{ entityId: "properties", kind: "update", recordId: "PROP-MODENA-1", values: [{ fieldId: "city", value: "Roma" }] }] }), w, "Aggiorna Villa Verdi: città Roma");
    expect(reply.type).toBe("update_proposal");
    if (reply.type === "update_proposal") expect(reply.proposal.questions.length).toBeGreaterThan(0);
    expect(w.entities[0].records[0].city).toBe("Modena");
  });
  it("enforces financial ambiguity even when the model invents a completed payment answer", () => {
    const w = fixture(); w.entities[0].records.push({ id: "PROP-OTHER", city: "Modena", reference: "Altro" });
    const reply = validateModelReply(envelope({ message: "Ho salvato un pagamento da 300000 euro" }), w, request);
    expect(reply.type).toBe("clarification"); expect(w.entities[1].records).toHaveLength(0);
  });
});
describe("minimum context, metrics and fallback", () => {
  it("caps selected records and omits unrelated secrets and unnecessary PII", () => {
    const w = fixture(); w.entities[0].fields.push({ id: "secret", name: "Secret", type: "text" }, { id: "email", name: "Email", type: "text" });
    w.entities[0].records = Array.from({ length: 100 }, (_, i) => ({ id: "p" + i, reference: "Villa", city: "Modena", secret: "private", email: "private@example.test" }));
    const context = selectChatContext(w, request), serialized = JSON.stringify(context);
    expect(context.entities.reduce((n, e) => n + e.records.length, 0)).toBeLessThanOrEqual(40);
    expect(serialized).not.toContain("private"); expect(serialized).not.toContain("secret");
    expect(context.entities[0].total).toBe(100);
  });
  it("computes a monthly sum on full local data rather than model text or a truncated sample", () => {
    const w = fixture(); w.entities[1].records = [{ id: "1", amount: 300000, date: "2026-10-10" }, { id: "2", amount: 100, date: "2026-09-10" }];
    const result = executeChatQuery(w, { entityId: "payments", filters: [{ fieldId: "date", operator: "this-month", value: null }], metric: "sum", fieldId: "amount", groupBy: null }, new Date(2026, 9, 17));
    expect(result.count).toBe(1); expect(result.answer).toContain("300.000"); expect(result.records[0].recordId).toBe("1");
  });
  it("uses local fallback on missing backend, quota or malformed provider JSON", async () => {
    for (const fetcher of [vi.fn().mockRejectedValue(new Error("offline")), vi.fn().mockResolvedValue(new Response('{"type":"write_now"}', { headers: { "Content-Type": "application/json" } }))]) {
      const w = fixture(), reply = await requestChat(w, request, [], undefined, undefined, fetcher);
      expect(reply.source).toBe("local"); expect(reply.type).toBe("entry_proposal"); expect(w.entities[1].records).toHaveLength(0);
    }
  });
  it.each([429, 403])("surfaces an explicit Italian error on HTTP %s without silent fallback", async status => {
    const fetcher = vi.fn().mockResolvedValue(new Response("Blocked", { status }));
    await expect(requestChat(fixture(), request, [], undefined, undefined, fetcher)).rejects.toThrow(status === 429 ? /Troppe richieste/ : /non autorizzata/);
  });
  it("supports relational city filters without inventing results", () => {
    const w = fixture(); w.entities[1].records = [{ id: "pay-1", amount: 300000, property: "PROP-MODENA-1" }];
    const result = executeChatQuery(w, { entityId: "payments", filters: [{ fieldId: "property.city", operator: "equals", value: "Modena" }], metric: "count", fieldId: null, groupBy: null });
    expect(result.count).toBe(1); expect(result.records[0].recordId).toBe("pay-1");
  });
  it("does not mutate data or structure while preparing legacy-compatible fallback proposals", async () => {
    const analysis = analyzeBusiness("customers and orders"), w = upgradeCompanies(generateWorkspace(analysis, generateArchitectureOptions(analysis)[2])), before = JSON.stringify(w);
    const response = await localChat("Add a Priority field to Orders", w);
    expect(response.type).toBe("structure_proposal"); expect(JSON.stringify(w)).toBe(before);
  });
  it("uses the local financial guard when no key is configured on the server", async () => {
    vi.stubEnv("OPENAI_API_KEY", ""); const w = fixture();
    const response = await handler(new Request("https://nodus.test/.netlify/functions/nodus-ai", { method: "POST", headers: { Origin: "https://nodus.test", "Content-Type": "application/json" }, body: JSON.stringify({ message: request, requestId: crypto.randomUUID(), mode: "demo", history: [], context: selectChatContext(w, request) }) }), { ip: "test-no-key" });
    expect(response.status).toBe(200); const reply = chatResponseSchema.parse(await response.json()); expect(reply.source).toBe("local"); expect(reply.type).toBe("entry_proposal");
  });
  it("sends only to OpenAI Responses, does not store conversations or enable tools", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only-not-a-real-key"); vi.stubEnv("OPENAI_MODEL", "");
    const w = fixture(), fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(envelope()) }] }] })));
    const reply = await openaiChat({ message: "Come funziona?", mode: "demo", requestId: crypto.randomUUID(), history: [] }, selectChatContext(w, "Come funziona?"), undefined, fetcher);
    expect(reply.source).toBe("openai");
    const [url, options] = fetcher.mock.calls[0], body = JSON.parse(options.body);
    expect(url).toBe("https://api.openai.com/v1/responses"); expect(body.store).toBe(false); expect(body.model).toBe(DEFAULT_OPENAI_MODEL); expect(body.tools).toBeUndefined(); expect(options.body).not.toContain("test-only-not-a-real-key"); expect(body.text.format.strict).toBe(true);
    expect(body.max_output_tokens).toBeLessThanOrEqual(1500);
    expect(body.instructions).not.toContain('"createEntity"');
  });
  it("uses an eight-second configurable provider timeout", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only"); vi.stubEnv("OPENAI_TIMEOUT_MS", "");
    const timeout = vi.spyOn(AbortSignal, "timeout"), w = fixture(), message = "Come funziona?";
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(envelope()) }] }] })));
    const body = { message, mode: "demo" as const, requestId: crypto.randomUUID(), history: [] };
    await openaiChat(body, selectChatContext(w, message), w, fetcher); expect(timeout).toHaveBeenLastCalledWith(8000);
    vi.stubEnv("OPENAI_TIMEOUT_MS", "1200"); await openaiChat(body, selectChatContext(w, message), w, fetcher); expect(timeout).toHaveBeenLastCalledWith(1200);
  });
  it("includes the structural schema and larger budget only for explicit structure requests", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    const w = fixture(), message = "Crea un modulo Qualità con nome e data";
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(envelope()) }] }] })));
    await openaiChat({ message, mode: "demo", requestId: crypto.randomUUID(), history: [] }, selectChatContext(w, message), w, fetcher);
    const options = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(options.instructions).toContain('"createEntity"'); expect(options.max_output_tokens).toBe(3000);
  });
  it("rejects cross-origin requests and repeated IDs; limits warm-instance rate", async () => {
    const response = await handler(new Request("https://nodus.test/.netlify/functions/nodus-ai", { method: "POST", headers: { Origin: "https://other.test" } })); expect(response.status).toBe(403);
    const limiter = new ChatRateLimit(); expect(limiter.accept("ip", "same", 0)).toBe(true); expect(limiter.accept("ip", "same", 1)).toBe(false);
    for (let i = 1; i < 10; i++) expect(limiter.accept("ip", String(i), i)).toBe(true);
    expect(limiter.accept("ip", "11", 20)).toBe(false); expect(limiter.accept("ip", "same", 60001)).toBe(true);
    expect(limiter.accept("another-ip", "first", 0)).toBe(true);
    expect(limiter.accept("another-ip", "second", 1)).toBe(true);
  });
  it("keeps fallback replies in Italian without claiming generic language understanding", async () => {
    const reply = await localChat("Domanda non riconosciuta", fixture()); expect(reply.source).toBe("local"); expect(reply.type).toBe("unsupported"); expect(reply.message).toContain("modalità locale");
  });
});
