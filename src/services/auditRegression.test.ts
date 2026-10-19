import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
import { deleteRecord, saveRecord, saveRecords } from "./workspaceDomain";
import { executeImport, exportCsv, previewImport, type ImportPlan } from "./importExport";
import { localWorkspaceRepository as repository, WORKSPACE_KEY } from "./workspaceStorage";
import { dispatchWorkspaceAction } from "./workspaceActions";
import type { Entity } from "../types";
import { upgradeCompanies } from "./companies";

const fixture = () => {
  const analysis = analyzeBusiness("customers and orders");
  const workspace = upgradeCompanies(generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]));
  workspace.workflows = [];
  workspace.entities.push(
    { id: "parents", name: "Parents", fields: [{ id: "name", name: "Name", type: "text" }], records: [{ id: "p1", name: "Same" }, { id: "p2", name: "Same" }] },
    { id: "children", name: "Children", fields: [{ id: "name", name: "Name", type: "text" }, { id: "parent", name: "Parent", type: "relation", required: true, relationEntityId: "parents" }], records: [{ id: "c1", name: "Existing", parent: "p1" }] },
  );
  return workspace;
};
const plan = (raw = "Same"): ImportPlan => ({ entityId: "children", sheet: { name: "CSV", headers: ["Name", "Parent"], rows: [["New", raw]] }, mappings: [{ column: 0, fieldId: "name", type: "text" }, { column: 1, fieldId: "parent", type: "relation" }], duplicateFieldId: "name", duplicateStrategy: "skip" });
afterEach(() => vi.unstubAllGlobals());

describe("audit: relation integrity and atomic batches", () => {
  it("blocks deletion of a required parent without changing the source", () => {
    const workspace = fixture(), before = JSON.stringify(workspace);
    expect(() => deleteRecord(workspace, "parents", "p1")).toThrow(/richiede questo record/);
    expect(JSON.stringify(workspace)).toBe(before);
  });
  it("also protects conditional requirements", () => {
    const workspace = fixture(), entity = workspace.entities.find(e => e.id === "children")!;
    entity.fields[1].required = false;
    entity.fields[1].requiredWhen = { fieldId: "name", equals: "Existing" };
    expect(() => deleteRecord(workspace, "parents", "p1")).toThrow(/richiede questo record/);
    entity.records[0].name = "Optional";
    expect(deleteRecord(workspace, "parents", "p1").entities.find(e => e.id === "children")!.records[0].parent).toBeNull();
  });
  it("batch writes have the same result as individual writes, including revisions", () => {
    const workspace = fixture(), records = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const batch = saveRecords(workspace, "parents", records, "import");
    const sequential = records.reduce((w, record) => saveRecord(w, "parents", record, "import"), workspace);
    expect(batch.entities).toEqual(sequential.entities);
    expect(batch.revision).toBe(sequential.revision);
    expect(workspace.entities.find(e => e.id === "parents")!.records).toHaveLength(2);
  });
  it("a later invalid record never partially commits a batch", () => {
    const workspace = fixture(), before = JSON.stringify(workspace);
    expect(() => saveRecords(workspace, "children", [{ id: "new", name: "New", parent: "p2" }, { id: "bad", name: "Bad", parent: "missing" }])).toThrow();
    expect(JSON.stringify(workspace)).toBe(before);
  });
});

describe("audit: safe imports and exports", () => {
  it("rejects ambiguous names and accepts an exact ID", () => {
    const ambiguous = previewImport(plan(), fixture());
    expect(ambiguous.accepted).toBe(0);
    expect(ambiguous.issues[0].reason).toMatch(/multiple records/);
    expect(previewImport(plan("p2"), fixture()).records[0].parent).toBe("p2");
  });
  it("uses domain validation for required checkbox values", () => {
    const workspace = fixture();
    workspace.entities.push({ id: "consents", name: "Consents", fields: [{ id: "consent", name: "Consent", type: "checkbox", required: true }], records: [] });
    const consent: ImportPlan = { ...plan(), entityId: "consents", sheet: { name: "CSV", headers: ["Consent"], rows: [["false"], ["true"]] }, mappings: [{ column: 0, fieldId: "consent", type: "checkbox" }], duplicateFieldId: "consent" };
    const preview = previewImport(consent, workspace);
    expect(preview.accepted).toBe(1);
    expect(preview.issues[0].reason).toMatch(/obbligatorio/);
    expect(executeImport(consent, workspace).workspace.entities.find(e => e.id === "consents")!.records).toHaveLength(1);
  });
  it("validates one-to-one relations between accepted rows", () => {
    const workspace = fixture();
    workspace.entities.find(e => e.id === "children")!.fields[1].cardinality = "one-to-one";
    const input = plan("p2"); input.sheet.rows.push(["Another", "p2"]);
    const result = previewImport(input, workspace);
    expect(result.accepted).toBe(1);
    expect(result.issues[0].reason).toMatch(/già collegato/);
  });
  it("rejects reserved identifiers in new modules", () => {
    const input: ImportPlan = { ...plan(), entityId: undefined, newModuleName: "New module", mappings: [{ column: 0, fieldId: "id", type: "text" }] };
    expect(() => previewImport(input, fixture())).toThrow(/riservato/);
  });
  const exportEntity: Entity = { id: "x", name: "X", fields: [{ id: "name", name: "Name", type: "text" }, { id: "amount", name: "Amount", type: "currency" }], records: [] };
  it.each(["=1+1", "+SUM(A1)", "-1+1", "@SUM(A1)", "\t=1+1", "  =1+1", "\n=1+1"])("neutralizes spreadsheet formulas: %j", name => {
    expect(exportCsv(exportEntity, [{ id: "r", name }], ["name"])).toContain(`"'${name}"`);
  });
  it("preserves numeric negative values and visual column order", () => {
    const csv = exportCsv(exportEntity, [{ id: "r", name: 'A "quote"', amount: -25 }], ["amount", "name"]);
    expect(csv).toBe('\uFEFF"Amount";"Name"\r\n"-25";"A ""quote"""');
  });
});

describe("audit: storage recovery and stale tabs", () => {
  const data = new Map<string, string>();
  beforeEach(() => {
    data.clear();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) });
  });
  it("rejects malformed current-version data without erasing it", () => {
    const raw = JSON.stringify({ version: 5, companyName: "Broken", entities: [] });
    localStorage.setItem(WORKSPACE_KEY, raw);
    expect(() => repository.load()).toThrow(/dati non validi/);
    expect(repository.raw()).toBe(raw);
  });
  it("preserves unknown future-compatible properties", () => {
    const workspace = { ...fixture(), customExtension: { preserved: true } };
    repository.save(workspace);
    expect(repository.load()).toHaveProperty("customExtension.preserved", true);
  });
  it("rejects duplicate record IDs", () => {
    const workspace = fixture();
    workspace.entities[0].records.push(workspace.entities[0].records[0]);
    repository.save(workspace);
    expect(() => repository.load()).toThrow(/dati non validi/);
  });
  it("rejects stale writes from another tab, preserving the first edit", () => {
    repository.save(fixture());
    // Like useWorkspace: the snapshot is taken after load, which may rewrite storage (migrations).
    repository.load();
    const snapshot = repository.raw(), first = repository.load()!, second = repository.load()!;
    repository.save(saveRecord(first, "parents", { id: "p1", name: "Updated A" }), snapshot);
    expect(() => repository.save(saveRecord(second, "parents", { id: "p2", name: "Updated B" }), snapshot)).toThrow(/altra scheda/);
    expect(repository.load()!.entities.find(e => e.id === "parents")!.records[0].name).toBe("Updated A");
  });
  it("does not recreate data deleted in another tab", () => {
    repository.save(fixture());
    const snapshot = repository.raw(), next = repository.load()!;
    repository.clear();
    expect(() => repository.save(next, snapshot)).toThrow(/altra scheda/);
    expect(repository.raw()).toBeNull();
  });
});

describe("audit: configuration publication", () => {
  it("applies and publishes a configuration in one dispatch", () => {
    const workspace = fixture();
    const next = dispatchWorkspaceAction(workspace, { type: "configureAndPublish", operations: [{ type: "renameEntity", entityId: "parents", name: "Renamed parents" }] });
    expect(next.entities.find(e => e.id === "parents")!.name).toBe("Renamed parents");
    expect(next.configurationDraft).toBeUndefined();
    expect(workspace.entities.find(e => e.id === "parents")!.name).toBe("Parents");
  });
  it("failed publication leaves no partial draft in the original workspace", () => {
    const workspace = fixture(), before = JSON.stringify(workspace);
    expect(() => dispatchWorkspaceAction(workspace, { type: "configureAndPublish", operations: [{ type: "addField", entityId: "parents", field: { id: "mandatory", name: "Mandatory", type: "text", required: true } }] })).toThrow();
    expect(JSON.stringify(workspace)).toBe(before);
  });
});
