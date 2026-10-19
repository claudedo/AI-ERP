import { describe, expect, it } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "./aiEngine";
import { configurationOf, publishConfiguration, saveConfigurationDraft, stageProposal, restoreConfigurationDraft } from "./configuration";
import { dispatchWorkspaceAction } from "./workspaceActions";
import { saveRecord } from "./workspaceDomain";
import { evaluateFormula, calculateFields } from "./formulas";
import { localConfigurationProvider } from "../ai/configurationProvider";

const base = () => { const analysis = analyzeBusiness("customers and orders"); return generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]); };
const moduleOperation = { type: "createEntity" as const, entity: { id: "samples", name: "Campionari", fields: [{ id: "code", name: "Codice", type: "text" as const, required: true }, { id: "supplier", name: "Fornitore", type: "relation" as const, relationEntityId: "suppliers", cardinality: "many-to-one" as const }] } };

describe("generic configuration and publication", () => {
  it("keeps operational modules unchanged until publication and preserves linked records on rename", () => {
    const original = base(), draft = saveConfigurationDraft(original, [moduleOperation]);
    expect(draft.entities.some(entity => entity.id === "samples")).toBe(false);
    const published = publishConfiguration(draft);
    const populated = saveRecord(published, "samples", { id: "sample-1", code: "S001", supplier: "SUP-01" });
    const renamed = publishConfiguration(saveConfigurationDraft(populated, [{ type: "renameEntity", entityId: "suppliers", name: "Fornitori" }]));
    expect(renamed.entities.find(entity => entity.id === "samples")?.records[0].supplier).toBe("SUP-01");
    expect(renamed.configurationHistory).toHaveLength(2);
    expect(original.configurationDraft).toBeUndefined();
  });
  it("rejects an atomic batch with duplicate names without partial changes", () => {
    const workspace = base(), before = JSON.stringify(workspace);
    expect(() => saveConfigurationDraft(workspace, [moduleOperation, { ...moduleOperation, entity: { ...moduleOperation.entity, id: "another" } }])).toThrow(/duplicato/);
    expect(JSON.stringify(workspace)).toBe(before);
  });
  it("rejects unsafe payloads, missing references and unauthorized structural actions", () => {
    const workspace = base();
    expect(() => dispatchWorkspaceAction(workspace, { type: "configure", operations: [{ type: "execute", code: "alert(1)" }] })).toThrow();
    expect(() => saveConfigurationDraft(workspace, [{ type: "createRelation", entityId: "orders", fieldId: "customer", targetEntityId: "missing", cardinality: "many-to-one" }])).toThrow(/missing/);
    workspace.currentUserId = "usr-viewer";
    expect(() => saveConfigurationDraft(workspace, [moduleOperation])).toThrow(/ruolo/);
  });
  it("blocks data-losing type changes and incompatible restoration", () => {
    const workspace = base(), order = workspace.entities.find(entity => entity.id === "orders")!;
    const field = order.fields.find(item => item.id === "value")!;
    const draft = saveConfigurationDraft(workspace, [{ type: "updateField", entityId: order.id, field: { ...field, type: "text" } }]);
    expect(() => publishConfiguration(draft)).toThrow(/contiene dati/);
    const published = publishConfiguration(saveConfigurationDraft(workspace, [moduleOperation]));
    const populated = saveRecord(published, "samples", { id: "sample-1", code: "S001", supplier: "SUP-01" });
    expect(() => publishConfiguration(restoreConfigurationDraft(populated, 1))).toThrow(/Archivialo/);
  });
  it("enforces one-to-one relationships at record save", () => {
    const workspace = publishConfiguration(saveConfigurationDraft(base(), [moduleOperation]));
    const entity = workspace.entities.find(item => item.id === "samples")!;
    entity.fields[1].cardinality = "one-to-one";
    const saved = saveRecord(workspace, entity.id, { id: "sample-1", code: "S001", supplier: "SUP-01" });
    expect(() => saveRecord(saved, entity.id, { id: "sample-2", code: "S002", supplier: "SUP-01" })).toThrow(/già collegato/);
  });
  it("archives modules without deleting records or relationships", () => {
    const workspace = base();
    const next = publishConfiguration(saveConfigurationDraft(workspace, [{ type: "archiveEntity", entityId: "suppliers", archived: true }]));
    expect(next.entities.find(entity => entity.id === "suppliers")?.records).toEqual(workspace.entities.find(entity => entity.id === "suppliers")?.records);
    expect(() => saveRecord(next, "suppliers", { id: "NEW", name: "New" })).toThrow(/archiviato/);
  });
});

describe("structured AI and safe formulas", () => {
  it("creates request-specific fields and a real supplier relation", async () => {
    const workspace = base();
    const proposal = await localConfigurationProvider.propose("Crea un modulo Campionari con codice, collezione, stagione, stato e collegamento al fornitore", workspace);
    expect(proposal.ambiguities).toEqual([]);
    const staged = stageProposal(workspace, proposal), created = staged.configurationDraft!.configuration.entities.at(-1)!;
    expect(created.name).toBe("Campionari");
    expect(created.fields.map(field => field.name)).toEqual(["codice", "collezione", "stagione", "stato", "fornitore"]);
    expect(created.fields.at(-1)?.relationEntityId).toBe("suppliers");
    expect(() => stageProposal({ ...workspace, revision: 10 }, proposal)).toThrow(/non è più aggiornata/);
  });
  it("does not apply ambiguous AI proposals", async () => {
    const workspace = base();
    const proposal = await localConfigurationProvider.propose("Crea un modulo Campionari con codice e collegamento al laboratorio", workspace);
    expect(proposal.ambiguities.length).toBeGreaterThan(0);
    expect(() => stageProposal(workspace, proposal)).toThrow(/ambiguità/);
    expect(configurationOf(workspace).entities).toHaveLength(5);
  });
  it("evaluates arithmetic but rejects arbitrary code, cycles and division by zero", () => {
    expect(evaluateFormula("[quantity] * ([price] + 2)", { id: "1", quantity: 3, price: 10 })).toBe(36);
    expect(() => evaluateFormula("globalThis.alert(1)", { id: "1" })).toThrow();
    expect(() => evaluateFormula("1 / 0", { id: "1" })).toThrow(/zero/);
    expect(() => calculateFields([{ id: "a", name: "A", type: "number", formula: "[b]" }, { id: "b", name: "B", type: "number", formula: "[a]" }], { id: "1" })).toThrow(/ciclo/);
  });
});
