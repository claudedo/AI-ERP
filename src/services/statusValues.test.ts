import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, deriveAlerts, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
import { upgradeCompanies } from "./companies";
import { statusTone } from "./statusTone";
import { isStatus, needsAttention, pickStatusOption, sameStatus, CONFIRMED, DELAYED } from "./statusValues";
import { queryRecords } from "./viewQuery";
import { saveRecord, workflowApplies } from "./workspaceDomain";
import { localWorkspaceRepository, WORKSPACE_KEY } from "./workspaceStorage";
import type { Entity, Workflow, Workspace } from "../types";

const entity = (id: string, name: string, options: string[], statuses: string[]): Entity => ({
  id, name, fields: [{ id: "name", name: "Name", type: "text" }, { id: "status", name: "Status", type: "status", options }],
  records: statuses.map((status, i) => ({ id: `${id}-${i}`, name: `${id} ${i}`, status })),
});
const flow = (id: string): Workflow => ({ id, name: id, trigger: "", actions: [], active: true, runs: [] });

/** A workspace saved before the Italian demo data: English options and values, already on schema v5. */
function legacyEnglishWorkspace(): Workspace {
  const a = analyzeBusiness("fashion brand"), w = upgradeCompanies(generateWorkspace(a, generateArchitectureOptions(a)[2]));
  const orders = w.entities.find(e => e.id === "wholesale-orders")!, deliveries = w.entities.find(e => e.id === "deliveries")!;
  orders.fields.find(f => f.id === "status")!.options = ["Draft", "Confirmed", "In production", "Delayed", "Delivered"];
  orders.records.forEach((r, i) => { r.status = ["In production", "Delayed", "Confirmed", "Draft"][i] ?? "Draft"; });
  deliveries.fields.find(f => f.id === "status")!.options = ["Preparing", "In transit", "Delivered", "Delayed"];
  deliveries.records.forEach((r, i) => { r.status = i === 0 ? "Preparing" : "Delayed"; });
  w.alerts = deriveAlerts(w.entities);
  return { ...w, version: 5 };
}

describe("bilingual status values", () => {
  it("raises attention alerts for English and Italian late, blocked, overdue and at-risk values", () => {
    const values = ["Delayed", "In ritardo", "Blocked", "Bloccato", "Bloccata", "Overdue", "Scaduto", "Scaduta", "At risk", "A rischio"];
    const alerts = deriveAlerts([entity("orders", "Ordini", values, values)]);
    expect(alerts.map(a => a.title.split(": ")[1])).toEqual(values);
    for (const calm of ["In corso", "Confermato", "Sbloccato", "In scadenza", "In progress", "Paid"]) expect(needsAttention(calm), calm).toBe(false);
  });

  it("fires the confirmed-order workflow on Confirmed and Confermato only on the transition", () => {
    const orders = entity("orders", "Ordini", ["Bozza", "Confermato", "Draft", "Confirmed"], []);
    for (const [before, after] of [["Draft", "Confirmed"], ["Bozza", "Confermato"]]) {
      expect(workflowApplies(flow("confirmed-order-task"), orders, { id: "o", status: after }, { id: "o", status: before })).toBe(true);
      expect(workflowApplies(flow("confirmed-order-task"), orders, { id: "o", status: after }, { id: "o", status: after })).toBe(false);
    }
    expect(workflowApplies(flow("confirmed-order-task"), orders, { id: "o", status: "Confermato" }, { id: "o", status: "Confirmed" })).toBe(false);
  });

  it("fires the delayed-delivery workflow on Delayed and In ritardo", () => {
    const deliveries = entity("deliveries", "Consegne", [], []);
    expect(workflowApplies(flow("delayed-delivery-alert"), deliveries, { id: "d", status: "Delayed" }, { id: "d", status: "Preparing" })).toBe(true);
    expect(workflowApplies(flow("delayed-delivery-alert"), deliveries, { id: "d", status: "In ritardo" }, { id: "d", status: "In viaggio" })).toBe(true);
    expect(workflowApplies(flow("delayed-delivery-alert"), deliveries, { id: "d", status: "In viaggio" }, { id: "d", status: "In preparazione" })).toBe(false);
  });

  it("matches configured workflow conditions across languages", () => {
    const orders = entity("orders", "Ordini", [], []);
    const configured: Workflow = { ...flow("custom"), config: { entityId: "orders", event: "status", fieldId: "status", conditionFieldId: "status", conditionOperator: "equals", conditionValue: "Confirmed", action: "notify" } };
    expect(workflowApplies(configured, orders, { id: "o", status: "Confermato" }, { id: "o", status: "Bozza" })).toBe(true);
    expect(sameStatus("In ritardo", "delayed")).toBe(true);
    expect(sameStatus("Custom", "Custom")).toBe(true);
    expect(sameStatus("Custom", "custom")).toBe(false);
    expect(sameStatus("Confermato", "Consegnato")).toBe(false);
  });

  it("filters the delayed-only table view in both languages and picks the stored option", () => {
    const orders = entity("orders", "Ordini", ["In ritardo", "Delayed", "In corso"], ["In ritardo", "Delayed", "In corso"]);
    expect(queryRecords(orders, "", [], undefined, true).map(r => r.status)).toEqual(["In ritardo", "Delayed"]);
    expect(pickStatusOption(entity("o", "O", ["Draft", "Delayed"], []), DELAYED)).toBe("Delayed");
    expect(pickStatusOption(entity("o", "O", ["Bozza", "In ritardo"], []), DELAYED)).toBe("In ritardo");
    expect(isStatus("confermata", CONFIRMED)).toBe(true);
  });

  it("colours the new Italian demo values", () => {
    for (const value of ["Superata", "In linea", "Rogitato", "Lanciata", "Pagata", "Vinta", "Accettata"]) expect(statusTone(value), value).toBe("success");
    for (const value of ["Proposta in corso", "Verifica legale", "In produzione", "Scorta bassa", "In revisione", "In sospeso"]) expect(statusTone(value), value).toBe("warning");
    for (const value of ["Problemi rilevati", "Bloccata", "Scaduta", "Persa", "Rifiutata", "Annullato"]) expect(statusTone(value), value).toBe("danger");
  });
});

describe("Italian demo data", () => {
  it("creates new workspaces with Italian values that still raise alerts and run workflows", () => {
    const a = analyzeBusiness("fashion brand"), w = upgradeCompanies(generateWorkspace(a, generateArchitectureOptions(a)[2]));
    const orders = w.entities.find(e => e.id === "wholesale-orders")!;
    expect(orders.fields.find(f => f.id === "status")!.options).toEqual(["Bozza", "Confermato", "In produzione", "In ritardo", "Consegnato"]);
    expect(w.alerts.map(a => a.recordId)).toEqual(expect.arrayContaining(["ORD-1047", "DEL-209"]));
    const draft = orders.records.find(r => r.status !== "Confermato")!;
    const next = saveRecord(w, orders.id, { ...draft, status: "Confermato" });
    expect(next.workflows.find(f => f.id === "confirmed-order-task")!.runs[0].status).toBe("success");
  });

  it("keeps companies on Italian status values for new workspaces", () => {
    const a = analyzeBusiness("customers and orders"), w = upgradeCompanies(generateWorkspace(a, generateArchitectureOptions(a)[2]));
    const companies = w.entities.find(e => e.id === "companies")!;
    expect(companies.fields.find(f => f.id === "status")!.options).toEqual(["Attivo", "Non attivo"]);
    expect(new Set(companies.records.map(r => r.status))).toEqual(new Set(["Attivo"]));
    expect(JSON.stringify(w.entities)).not.toMatch(/London|Nordhaus|Mayfair/);
  });
});

describe("existing English workspaces", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("loads without rewriting values and keeps alerts and workflows working", () => {
    const legacy = legacyEnglishWorkspace();
    data.set(WORKSPACE_KEY, JSON.stringify(legacy));
    const loaded = localWorkspaceRepository.load()!;
    expect(loaded.entities).toEqual(legacy.entities);
    expect(data.get(WORKSPACE_KEY)).toBe(JSON.stringify(legacy));
    expect(loaded.alerts.map(a => a.recordId)).toEqual(expect.arrayContaining(["ORD-1047", "DEL-209"]));
    const orders = loaded.entities.find(e => e.id === "wholesale-orders")!, draft = orders.records.find(r => r.status === "Draft")!;
    const next = saveRecord(loaded, orders.id, { ...draft, status: "Confirmed" });
    expect(next.workflows.find(f => f.id === "confirmed-order-task")!.runs[0].status).toBe("success");
  });
});
