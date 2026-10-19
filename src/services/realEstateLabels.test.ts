import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
import { localizeRealEstateNames } from "./realEstateLabels";
import { widgetMetric } from "./dashboardMetrics";
import { localWorkspaceRepository, WORKSPACE_KEY } from "./workspaceStorage";
import { upgradeCompanies } from "./companies";
import { configurationOf } from "./configuration";
// A workspace saved before label localization: no `labelsLocalized` marker yet.
const fixture = () => { const a = analyzeBusiness("real estate agency"), w = upgradeCompanies(generateWorkspace(a, generateArchitectureOptions(a)[2])); delete w.labelsLocalized; return w; };
afterEach(() => vi.unstubAllGlobals());
describe("name-only real estate migration", () => {
  it("never renames modules created after the one-time localization, even with a template id", () => {
    const a = analyzeBusiness("consulting company"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    const imported = { ...w, entities: [...w.entities, { id: "products", name: "Products", fields: [{ id: "status", name: "Status", type: "status" as const, options: ["New"] }], records: [] }] };
    expect(localizeRealEstateNames(imported)).toBe(imported);
  });
  it("counts Italian-named date fields in the due-in-7-days widget", () => {
    const a = analyzeBusiness("customers and orders"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    const soon = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    w.entities = [{ id: "shipments", name: "Spedizioni", fields: [{ id: "arrivo", name: "Consegna prevista", type: "date" }], records: [{ id: "s1", arrivo: soon }] }];
    expect(widgetMetric(w, { id: "due", kind: "due" }).value).toBe("1");
  });
  it("localizes every template once at creation and keeps the marker", () => {
    const a = analyzeBusiness("consulting company"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    expect(w.entities.map(e => e.name)).not.toContain("Projects");
    expect(w.entities.find(e => e.id === "projects")!.fields.find(f => f.id === "status")!.name).toBe("Stato");
    expect(w.labelsLocalized).toEqual(expect.arrayContaining(w.entities.map(e => e.id)));
  });
  it("changes template names but preserves IDs, record contents and custom labels", () => {
    const w = fixture(), p = w.entities.find(e => e.id === "properties")!;
    p.name = "Properties"; p.fields.find(f => f.id === "reference")!.name = "Reference"; p.fields.find(f => f.id === "address")!.name = "Address"; p.fields.find(f => f.id === "askingPrice")!.name = "Asking price";
    w.entities.find(e => e.id === "owners")!.name = "Owners"; w.entities.find(e => e.id === "leads")!.name = "Leads";
    w.configurationHistory = [{ version: 1, configuration: configurationOf(w), publishedAt: "2026-10-17", userId: w.currentUserId }];
    const before = structuredClone(w), next = localizeRealEstateNames(w), property = next.entities.find(e => e.id === "properties")!;
    expect(property.name).toBe("Immobili"); expect(property.fields.find(f => f.id === "reference")!.name).toBe("Riferimento"); expect(property.fields.find(f => f.id === "address")!.name).toBe("Indirizzo"); expect(property.fields.find(f => f.id === "askingPrice")!.name).toBe("Prezzo richiesto");
    expect(next.entities.find(e => e.id === "owners")!.name).toBe("Proprietari"); expect(next.entities.find(e => e.id === "leads")!.name).toBe("Potenziali clienti");
    expect(next.entities.map(e => [e.id, e.records, e.fields.map(f => f.id)])).toEqual(before.entities.map(e => [e.id, e.records, e.fields.map(f => f.id)]));
    expect(next.configurationHistory![0].configuration.entities.find(e => e.id === "properties")!.name).toBe("Immobili");
    expect(w).toEqual(before); expect(next.version).toBe(w.version); expect(localizeRealEstateNames(next)).toBe(next);
    property.name = "Portafoglio premium"; property.fields[0].name = "Codice interno";
    expect(localizeRealEstateNames(next).entities.find(e => e.id === "properties")!.name).toBe("Portafoglio premium");
    // Localized once: a later rename back to the English default is the user's choice and is kept.
    const renamed = { ...next, entities: next.entities.map(e => e.id === "owners" ? { ...e, name: "Owners" } : e) };
    expect(localizeRealEstateNames(renamed).entities.find(e => e.id === "owners")!.name).toBe("Owners");
  });
  it("backs up an existing schema-5 workspace before migrating names", () => {
    const w = fixture(); w.entities.find(e => e.id === "properties")!.name = "Properties";
    const data = new Map<string, string>([[WORKSPACE_KEY, JSON.stringify(w)]]), storage: Record<string, unknown> = {};
    Object.defineProperties(storage, { getItem: { value: (key: string) => data.get(key) ?? null }, setItem: { value: (key: string, value: string) => { data.set(key, value); storage[key] = value; } }, removeItem: { value: (key: string) => data.delete(key) } });
    vi.stubGlobal("localStorage", storage);
    expect(localWorkspaceRepository.load()!.entities.find(e => e.id === "properties")!.name).toBe("Immobili");
    expect(localWorkspaceRepository.backupKeys()).toHaveLength(1);
    expect(JSON.parse(data.get(localWorkspaceRepository.backupKeys()[0])!).entities.find((e: { id: string }) => e.id === "properties").name).toBe("Properties");
    localWorkspaceRepository.load(); expect(localWorkspaceRepository.backupKeys()).toHaveLength(1);
  });
});
