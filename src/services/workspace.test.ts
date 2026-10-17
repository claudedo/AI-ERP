import { beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, applyProposal, createProposal, generateArchitectureOptions, generateWorkspace, interpretCommand } from "./aiEngine";
import { executeImport, parseCsv, parseDate, parseItalianNumber, previewImport } from "./importExport";
import { deleteRecord, DomainError, saveRecord, undoAiChange } from "./workspaceDomain";
import { localWorkspaceRepository, WORKSPACE_KEY } from "./workspaceStorage";
import { queryRecords } from "./viewQuery";
import type { Workspace } from "../types";

const workspace = () => {
  const analysis = analyzeBusiness("A company manages customers and orders");
  return generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]);
};

describe("import and data validation", () => {
  it("parses quoted CSV cells, European amounts and strict dates", () => {
    const sheet = parseCsv('Name;Amount;Note\r\n"North; Studio";1.234,50;"Said ""yes"""\r\n');
    expect(sheet.rows[0]).toEqual(["North; Studio", "1.234,50", 'Said "yes"']);
    expect(parseItalianNumber("€ 1.234,50")).toBe(1234.5);
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("2026-02-31")).toBeNull();
    expect(parseDate("16/10/2026")).toBe("2026-10-16");
  });

  it("previews skipped rows and imports valid records without overwriting a duplicate", () => {
    const w = workspace();
    const sheet = parseCsv("Customer;Value;Status\nNordhaus;1200;Active\nNew Atelier;2.450,50;Active\nBad Atelier;not a number;Active\n");
    const plan = { sheet, entityId: "customers", mappings: [{ column: 0, fieldId: "name", type: "text" as const }, { column: 1, fieldId: "lifetimeValue", type: "currency" as const }, { column: 2, fieldId: "status", type: "status" as const }], duplicateFieldId: "name", duplicateStrategy: "skip" as const };
    const preview = previewImport(plan, w);
    expect(preview.accepted).toBe(1);
    expect(preview.skipped).toBe(2);
    const imported = executeImport(plan, w).workspace;
    expect(imported.entities.find(e => e.id === "customers")?.records.find(r => r.name === "New Atelier")?.lifetimeValue).toBe(2450.5);
    expect(w.entities.find(e => e.id === "customers")?.records.length).toBe(2);
  });

  it("enforces relation integrity and role permissions for record writes", () => {
    const w = workspace();
    expect(() => saveRecord(w, "orders", { id: "NEW-1", orderNo: "NEW-1", customer: "missing", status: "Draft" })).toThrow(DomainError);
    w.currentUserId = "usr-viewer";
    expect(() => saveRecord(w, "customers", { id: "NEW-2", name: "New" })).toThrow(/demo role/);
  });

  it("clears incoming links when a record is explicitly deleted", () => {
    const w = workspace();
    const linked = w.entities.find(e => e.id === "orders")!.records[0];
    const result = deleteRecord(w, "customers", String(linked.customer));
    expect(result.entities.find(e => e.id === "orders")!.records[0].customer).toBeNull();
    expect(w.entities.find(e => e.id === "orders")!.records[0].customer).not.toBeNull();
  });
});

describe("views, workflows and AI changes", () => {
  it("combines search, filters and numeric sorting", () => {
    const entity = workspace().entities.find(e => e.id === "orders")!;
    const filtered = queryRecords(entity, "ORD", [{ fieldId: "status", operator: "not-equals", value: "Draft" }], { fieldId: "value", direction: "desc" });
    expect(filtered.map(row => row.id)).toEqual(["ORD-1047", "ORD-1048"]);
  });

  it("fires an approval once for a threshold crossing and never for an unchanged status", () => {
    const w = workspace();
    w.workflows.push({ id: "high-value-approval", name: "High-value approval", trigger: "Value > 20000", actions: ["Request approval"], active: true, runs: [] });
    const order = w.entities.find(e => e.id === "orders")!.records[0];
    const crossed = saveRecord(w, "orders", { ...order, value: 25000 });
    expect(crossed.approvals).toHaveLength(1);
    expect(crossed.workflows.find(flow => flow.id === "high-value-approval")?.runs).toHaveLength(1);
    const repeated = saveRecord(crossed, "orders", { ...order, value: 25000 });
    expect(repeated.approvals).toHaveLength(1);
    expect(repeated.workflows.find(flow => flow.id === "high-value-approval")?.runs).toHaveLength(1);
  });

  it("rejects stale Builder proposals and permits undo only before later edits", () => {
    const w = workspace();
    const proposal = createProposal(interpretCommand("add priority to orders", "builder"), w)!;
    const newer = saveRecord(w, "customers", { id: "NEW", name: "New" });
    expect(applyProposal(newer, proposal)).toBe(newer);
    const applied = applyProposal(w, proposal);
    expect(applied.entities.find(e => e.id === "orders")?.fields.some(f => f.id === "priority")).toBe(true);
    const reverted = undoAiChange(applied, applied.changeHistory[0].id);
    expect(reverted.entities.find(e => e.id === "orders")?.fields.some(f => f.id === "priority")).toBe(false);
    const modified = saveRecord(applied, "customers", { id: "NEW", name: "New" });
    expect(() => undoAiChange(modified, applied.changeHistory[0].id)).toThrow(/later workspace change/);
  });
});

describe("versioned local persistence", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    const storage = {} as Record<string, unknown>;
    Object.defineProperties(storage, {
      getItem: { value: (key: string) => data.get(key) ?? null },
      setItem: { value: (key: string, value: string) => { data.set(key, value); storage[key] = value; } },
      removeItem: { value: (key: string) => { data.delete(key); delete storage[key]; } },
      key: { value: (index: number) => [...data.keys()][index] ?? null },
      length: { get: () => data.size }
    });
    vi.stubGlobal("localStorage", storage);
  });

  it("preserves the previous format as a backup before migration", () => {
    const old = { ...workspace(), version: 2, revision: undefined, comments: undefined, workflows: [{ id: "legacy", name: "Legacy", trigger: "manual", actions: [], active: true }] } as unknown as Workspace;
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(old));
    const loaded = localWorkspaceRepository.load()!;
    expect(loaded.version).toBe(5);
    expect(loaded.workflows[0].runs).toEqual([]);
    expect(localWorkspaceRepository.backupKeys()).toHaveLength(1);
    expect(JSON.parse(data.get(localWorkspaceRepository.backupKeys()[0])!).version).toBe(2);
  });

  it("does not erase damaged saved data", () => {
    localStorage.setItem(WORKSPACE_KEY, "{damaged");
    expect(() => localWorkspaceRepository.load()).toThrow(/damaged/);
    expect(localWorkspaceRepository.raw()).toBe("{damaged");
  });
});
