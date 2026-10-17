import { describe, expect, it, vi } from "vitest";
import {
  analyzeBusiness,
  generateArchitectureOptions,
  generateWorkspace,
} from "./aiEngine";
import { upgradeCompanies } from "./companies";
import { applyEntry, absoluteDate, proposeEntry } from "./smartEntry";
import { saveRecord } from "./workspaceDomain";
import { queryRecords } from "./viewQuery";
import { ONBOARDING_KEY, loadOnboarding } from "./onboarding";
const base = () => {
  const a = analyzeBusiness("customers and orders");
  return upgradeCompanies(
    generateWorkspace(a, generateArchitectureOptions(a)[2]),
  );
};
describe("customer journey and unified companies", () => {
  it("preserves legacy statuses and relationships while consolidating a shared VAT", () => {
    const a = analyzeBusiness("customers and orders"),
      old = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    const customer = old.entities.find((e) => e.id === "customers")!.records[0],
      supplier = old.entities.find((e) => e.id === "suppliers")!.records[0];
    customer.vat = "IT12345678901";
    supplier.vat = "12345678901";
    customer.status = "Onboarding";
    const next = upgradeCompanies(old),
      company = next.entities
        .find((e) => e.id === "companies")!
        .records.find((r) => r.vat === "IT12345678901")!;
    expect(company.partyRole).toBe("Entrambi");
    expect(company.legacyStatus).toBe("Onboarding");
    expect(
      next.entities.find((e) => e.id === "orders")!.records[0].customer,
    ).toBe(company.id);
    expect(String(company.legacyDetails)).toContain("suppliers");
    expect(
      old.entities.find((e) => e.id === "suppliers")!.records,
    ).toHaveLength(1);
  });
  it("updates a supplied address without inventing missing site fields", () => {
    let w = base();
    w = saveRecord(w, "companies", {
      id: "bianchi",
      name: "Bianchi",
      partyRole: "Cliente",
    });
    const p = proposeEntry(
      "Il cliente Bianchi ha cambiato indirizzo: Via Roma 12, Milano.",
      w,
    );
    expect(p.questions).toEqual([]);
    const next = applyEntry(w, p),
      site = next.entities.find((e) => e.id === "company-sites")!.records[0];
    expect(site.address).toBe("Via Roma 12");
    expect(site.city).toBe("Milano");
    expect(site.postcode).toBeUndefined();
    expect(site.company).toBe("bianchi");
  });
  it("supports explicit task values and rejects inconsistent financial previews", () => {
    const a = analyzeBusiness("consulenza"),
      w = upgradeCompanies(
        generateWorkspace(a, generateArchitectureOptions(a)[2]),
      );
    const p = proposeEntry(
      "Crea attività Rivedere contratto, scadenza domani",
      w,
      "tasks",
      new Date(2026, 9, 17),
    );
    expect(p.operations[0].record.due).toBe("2026-10-18");
    expect(
      applyEntry(w, p).entities.find((e) => e.id === "tasks")!.records[0].name,
    ).toBe("Rivedere contratto");
    const orders = base(),
      batch = proposeEntry(
        "Crea un ordine per il cliente Rossi: 2 sedie a 10 euro",
        orders,
      );
    batch.operations.at(-1)!.record.value = 999;
    expect(() => applyEntry(orders, batch)).toThrow(/totale/);
  });
  it("promotes an existing customer to both without creating a second company", () => {
    let w = base();
    w = saveRecord(w, "companies", {
      id: "both-existing",
      name: "QA Shared",
      partyRole: "Cliente",
    });
    const p = proposeEntry("Aggiungi il fornitore QA Shared", w);
    const next = applyEntry(w, p),
      rows = next.entities
        .find((e) => e.id === "companies")!
        .records.filter((r) => r.name === "QA Shared");
    expect(rows).toHaveLength(1);
    expect(rows[0].partyRole).toBe("Entrambi");
  });
  it("recognizes Italian sectors and asks before generic or conflicting fallback", () => {
    expect(
      analyzeBusiness("società di consulenza con clienti progetti fatture")
        .industry,
    ).toBe("consulting");
    expect(analyzeBusiness("azienda moda abbigliamento").industry).toBe(
      "fashion",
    );
    expect(analyzeBusiness("agenzia immobiliare").industry).toBe("realestate");
    expect(
      analyzeBusiness("un team con necessità diverse").needsConfirmation,
    ).toBe(true);
    expect(analyzeBusiness("consulenza moda").needsConfirmation).toBe(true);
    expect(analyzeBusiness("team generico", "generic").needsConfirmation).toBe(
      false,
    );
  });
  it("migrates to one company base and remaps all relation records without erasing source values", () => {
    const w = base();
    expect(
      w.entities.some((e) =>
        ["customers", "clients", "suppliers"].includes(e.id),
      ),
    ).toBe(false);
    const companies = w.entities.find((e) => e.id === "companies")!;
    expect(companies.records.some((r) => r.name === "Nordhaus")).toBe(true);
    expect(
      w.entities
        .find((e) => e.id === "orders")!
        .fields.find((f) => f.id === "customer")!.relationEntityId,
    ).toBe("companies");
    expect(upgradeCompanies(w)).toBe(w);
    expect(companies.records[0].legacyDetails).toBeTruthy();
  });
  it("requires identification, rejects duplicate VAT, accepts foreign companies without Italian VAT", () => {
    let w = base();
    expect(() =>
      saveRecord(w, "companies", { id: "blank", partyRole: "Cliente" }),
    ).toThrow(/sociale|name|required/);
    w = saveRecord(w, "companies", {
      id: "uk",
      name: "Foreign Ltd",
      partyRole: "Entrambi",
      vat: "GB123456789",
    });
    expect(() =>
      saveRecord(w, "companies", {
        id: "dup",
        name: "Other",
        partyRole: "Cliente",
        vat: "GB 123456789",
      }),
    ).toThrow(/IVA/);
    expect(
      queryRecords(
        w.entities.find((e) => e.id === "companies")!,
        "Foreign",
        [{ fieldId: "partyRole", operator: "contains", value: "Fornitore" }],
      ),
    ).toHaveLength(1);
  });
  it("creates an explicitly named company, legal site and contact atomically", () => {
    const w = base(),
      p = proposeEntry(
        "Aggiungi Rossi Srl, P.IVA 12345678901, sede legale a Milano, referente acquisti Marco Bianchi, email marco@rossi.it.",
        w,
      );
    expect(p.questions).toEqual([]);
    expect(p.operations).toHaveLength(3);
    const next = applyEntry(w, p),
      company = next.entities
        .find((e) => e.id === "companies")!
        .records.find((r) => r.name === "Rossi Srl")!;
    expect(
      next.entities.find((e) => e.id === "company-sites")!.records[0],
    ).toMatchObject({ company: company.id, city: "Milano" });
    expect(
      next.entities.find((e) => e.id === "company-contacts")!.records[0],
    ).toMatchObject({
      company: company.id,
      name: "Marco",
      surname: "Bianchi",
      email: "marco@rossi.it",
    });
    expect(
      w.entities.find((e) => e.id === "company-sites")!.records,
    ).toHaveLength(0);
  });
  it("creates two priced orders and rejects replay, partial batches and duplicates", () => {
    const w = base(),
      p = proposeEntry(
        "Crea due ordini per il cliente Rossi: 20 sedie a 150 euro e 5 tavoli a 800 euro.",
        w,
      );
    expect(p.operations).toHaveLength(3);
    const next = applyEntry(w, p),
      orders = next.entities.find((e) => e.id === "orders")!;
    expect(
      orders.records
        .slice(0, 2)
        .map((r) => r.value)
        .sort(),
    ).toEqual([3000, 4000]);
    expect(applyEntry(next, p)).toBe(next);
    const bad = structuredClone(p);
    bad.operations[2].record.customer = "missing";
    expect(() => applyEntry(w, bad)).toThrow();
    expect(w.entities.find((e) => e.id === "orders")!.records).toHaveLength(2);
    const repeat = proposeEntry(p.request, next);
    expect(() => applyEntry(next, repeat)).toThrow(/duplicato/);
  });
  it("asks for ambiguity, blocks Viewer and stale proposals, records AI origin", () => {
    let w = base();
    w = saveRecord(w, "companies", {
      id: "rossi1",
      name: "Rossi",
      partyRole: "Cliente",
    });
    w = saveRecord(w, "companies", {
      id: "rossi2",
      name: "Rossi",
      partyRole: "Cliente",
    });
    const request = "Crea un ordine per il cliente Rossi: 2 sedie a 10 euro",
      p = proposeEntry(request, w);
    expect(p.questions.length).toBeGreaterThan(0);
    expect(() => applyEntry(w, p)).toThrow();
    const selected = proposeEntry(request, w, undefined, new Date(), {
      company: "rossi1",
    });
    expect(selected.questions).toEqual([]);
    const next = applyEntry(w, selected);
    expect(next.activity?.[0].source).toBe("ai");
    expect(() => applyEntry({ ...w, revision: 100 }, selected)).toThrow(
      /cambiato/,
    );
    expect(() =>
      applyEntry({ ...w, currentUserId: "usr-viewer" }, selected),
    ).toThrow(/role/);
  });
  it("keeps relative dates explicit and updates the existing order", () => {
    const w = base(),
      p = proposeEntry(
        "Sposta la consegna dell’ordine ORD-1048 a venerdì.",
        w,
        undefined,
        new Date(2026, 9, 17),
      );
    expect(absoluteDate("venerdì", new Date(2026, 9, 17))).toBe("2026-10-23");
    expect(p.operations[0].record.delivery).toBe("2026-10-23");
    expect(
      applyEntry(w, p)
        .entities.find((e) => e.id === "orders")!
        .records.find((r) => r.id === "ORD-1048")!.delivery,
    ).toBe("2026-10-23");
  });
  it("fires a workflow exactly once after confirmation", () => {
    const w = base();
    w.workflows = [
      {
        id: "entry-notify",
        name: "Entry",
        trigger: "create",
        actions: ["notify"],
        runs: [],
        active: true,
        config: { entityId: "orders", event: "create", action: "notify" },
      },
    ];
    const p = proposeEntry(
      "Crea un ordine per il cliente Rossi: 2 sedie a 10 euro",
      w,
    );
    const next = applyEntry(w, p);
    expect(next.workflows[0].runs).toHaveLength(1);
    expect(applyEntry(next, p).workflows[0].runs).toHaveLength(1);
  });
  it("enforces site ownership and a single primary contact or site per company", () => {
    let w = base();
    const company = w.entities.find((e) => e.id === "companies")!.records[0].id;
    w = saveRecord(w, "company-sites", {
      id: "s1",
      name: "Legale",
      company,
      primary: true,
    });
    w = saveRecord(w, "company-sites", {
      id: "s2",
      name: "Magazzino",
      company,
      primary: true,
    });
    expect(
      w.entities
        .find((e) => e.id === "company-sites")!
        .records.find((r) => r.id === "s1")!.primary,
    ).toBe(false);
    expect(() =>
      saveRecord(w, "company-contacts", {
        id: "c1",
        name: "Marco",
        company: "another",
        site: "s2",
      }),
    ).toThrow();
  });
  it("recovers compatible onboarding and restarts safely for incompatible drafts", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) || null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    localStorage.setItem(
      ONBOARDING_KEY,
      JSON.stringify({
        version: 1,
        description: "azienda consulenza",
        stage: "suggestions",
        analysis: analyzeBusiness("consulenza"),
        selected: null,
        automation: false,
        sector: "consulting",
      }),
    );
    expect(loadOnboarding().description).toBe("azienda consulenza");
    localStorage.setItem(
      ONBOARDING_KEY,
      JSON.stringify({
        version: 99,
        description: "future",
        stage: "discovery",
      }),
    );
    expect(loadOnboarding().description).toBe("");
    vi.unstubAllGlobals();
  });
});
