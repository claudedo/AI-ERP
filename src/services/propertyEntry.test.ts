import { describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
import { upgradeCompanies } from "./companies";
import { applyEntry, proposeEntry } from "./smartEntry";
import { creationTarget } from "./entryIntent";
import { localChat } from "../ai/localChat";
import { requestChat, validateChatResponse } from "../ai/chatClient";
import { loadConversation } from "./nodusChat";

const request = "aggiungi una nuova proprietà da 450 mila euro";
const base = () => { const a = analyzeBusiness("real estate agency"); return upgradeCompanies(generateWorkspace(a, generateArchitectureOptions(a)[2])); };
describe("real estate creation regression", () => {
  it.each([request, "aggiungi una proprietà da 450.000 euro", "Crea un immobile da €450000", "Aggiungi un appartamento da 450 mila euro", "Add a new property for 450000 euro"])("routes %s to properties, never companies", text => {
    const w = base(), before = JSON.stringify(w), proposal = proposeEntry(text, w);
    expect(creationTarget(text)).toBe("property");
    expect(proposal.operations).toHaveLength(1); expect(proposal.operations[0].entityId).toBe("properties");
    expect(proposal.operations[0].record.askingPrice).toBe(450000);
    expect(proposal.questions.length).toBeGreaterThan(0);
    expect(proposal.operations[0].record.reference).toBeUndefined(); expect(proposal.operations[0].record.owner).toBeUndefined(); expect(JSON.stringify(w)).toBe(before);
    expect(() => applyEntry(w, { ...proposal, questions: [] })).toThrow(/riferimento|indirizzo/);
  });
  it("prefers the explicitly requested module over the active Companies module", () => {
    expect(proposeEntry(request, base(), "companies").operations[0].entityId).toBe("properties");
  });
  it("asks for a module when Properties is absent, instead of creating a company", () => {
    const w = base(); w.entities = w.entities.filter(e => e.id !== "properties");
    const proposal = proposeEntry(request, w, "companies");
    expect(proposal.operations).toHaveLength(0); expect(proposal.questions.join(" ")).toContain("modulo immobili");
  });
  it("accepts a follow-up identifier and address, without inventing an owner", () => {
    const w = base(), before = JSON.stringify(w), proposal = proposeEntry(request + "\nRiferimento: MOD-450; Indirizzo: Via Roma 12, Modena", w);
    expect(proposal.questions).toEqual([]); expect(proposal.operations[0].record).toMatchObject({ reference: "MOD-450", address: "Via Roma 12, Modena", askingPrice: 450000 });
    expect(proposal.operations[0].record.owner).toBeUndefined(); expect(JSON.stringify(w)).toBe(before);
    const saved = applyEntry(w, proposal);
    expect(saved.entities.find(e => e.id === "properties")!.records).toHaveLength(w.entities.find(e => e.id === "properties")!.records.length + 1);
    expect(saved.entities.find(e => e.id === "companies")!.records).toEqual(w.entities.find(e => e.id === "companies")!.records);
  });
  it("does not hijack a company named Casa Italia", () => {
    const proposal = proposeEntry("Aggiungi un'azienda Casa Italia Srl", base());
    expect(proposal.operations[0].entityId).toBe("companies");
    expect(proposal.operations[0].record.name).toBe("Casa Italia Srl");
    expect(creationTarget("Aggiungi un cliente Casa Italia Srl")).toBe("company");
  });
  it("does not treat invoices, payments or unknown nouns as company names", () => {
    for (const text of ["Aggiungi un pagamento da 100 euro", "Aggiungi una fattura", "Aggiungi un oggetto sconosciuto"]) expect(proposeEntry(text, base()).operations.some(op => op.entityId === "companies")).toBe(false);
  });
  it("blocks an already generated wrong company proposal, including after browser reload", () => {
    const w = base(), wrong = { id: "old-wrong-draft", request, baseRevision: w.revision || 0, operations: [{ entityId: "companies", kind: "create" as const, record: { id: "bad-company", name: "nuova proprietà da 450 mila euro", partyRole: "Cliente" } }], questions: [], builder: false };
    expect(() => applyEntry(w, wrong)).toThrow(/non corrisponde/);
    expect(() => validateChatResponse({ type: "entry_proposal", source: "openai", message: "Proposta", proposal: wrong }, w, request)).toThrow(/non corrisponde/);
    const getItem = (key: string) => key === `nodus-ai-${w.id}` ? JSON.stringify({ input: "", messages: [{ q: request, a: "Vecchia proposta" }], entry: wrong }) : null;
    const loaded = loadConversation({ getItem }, w.id, w);
    expect(loaded.entry).toBeNull(); expect(loaded.input).toBe(request); expect(loaded.messages).toHaveLength(1);
    expect(w.entities.find(e => e.id === "companies")!.records).toHaveLength(0);
  });
  it("handles both provider outage and server fallback safely", async () => {
    const w = base(), fallback = await localChat(request, w);
    expect(fallback.type).toBe("entry_proposal"); if (fallback.type === "entry_proposal") expect(fallback.proposal.operations[0].entityId).toBe("properties");
    const reply = await requestChat(w, request, [], undefined, undefined, vi.fn().mockRejectedValue(new Error("offline")));
    expect(reply.source).toBe("local"); if (reply.type === "entry_proposal") expect(reply.proposal.operations[0].record.askingPrice).toBe(450000); else throw Error("Expected property proposal");
  });
});
