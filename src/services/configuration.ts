import { z } from "zod";
import type { DataRecord, Entity, Field, Workspace } from "../types";
import type { Configuration } from "../types/configuration";
import { relationsFor } from "../data/templates";
import { DomainError, newId, requirePermission, validateRecord } from "./workspaceDomain";
import { calculateFields, evaluateFormula, formulaReferences } from "./formulas";

const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/).refine(value => !["__proto__", "constructor", "prototype"].includes(value));
const name = z.string().trim().min(1).max(100);
const value = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
const condition = z.object({ fieldId: id, equals: value }).strict();
export const fieldSchema = z.object({ id, name, type: z.enum(["text", "number", "currency", "date", "status", "relation", "select", "checkbox"]), required: z.boolean().optional(), options: z.array(name).max(100).optional(), relationEntityId: id.optional(), cardinality: z.enum(["many-to-one", "one-to-one"]).optional(), defaultValue: value.optional(), formula: z.string().max(500).optional(), visibleWhen: condition.optional(), requiredWhen: condition.optional() }).strict();
const uiSchema = z.object({ columns: z.array(id).max(100), formOrder: z.array(id).max(100), formColumns: z.union([z.literal(1), z.literal(2)]), actions: z.array(z.enum(["create", "export"])) }).strict();
export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createEntity"), entity: z.object({ id, name, fields: z.array(fieldSchema).max(100), navigationGroup: name.optional() }).strict() }).strict(),
  z.object({ type: z.literal("renameEntity"), entityId: id, name }).strict(),
  z.object({ type: z.literal("reorderEntity"), entityId: id, index: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal("archiveEntity"), entityId: id, archived: z.boolean() }).strict(),
  z.object({ type: z.literal("addField"), entityId: id, field: fieldSchema }).strict(),
  z.object({ type: z.literal("updateField"), entityId: id, field: fieldSchema }).strict(),
  z.object({ type: z.literal("createRelation"), entityId: id, fieldId: id, targetEntityId: id, cardinality: z.enum(["many-to-one", "one-to-one"]) }).strict(),
  z.object({ type: z.literal("configureEntity"), entityId: id, ui: uiSchema, navigationGroup: z.string().max(100) }).strict(),
  z.object({ type: z.literal("createView"), view: z.object({ id, entityId: id, name, columns: z.array(id), filters: z.array(z.object({ fieldId: id, operator: z.enum(["equals", "not-equals", "contains", "truthy", "greater-than", "less-than"]), value }).strict()), layout: z.enum(["table", "list", "kanban", "calendar"]).optional(), sort: z.object({ fieldId: id, direction: z.enum(["asc", "desc"]) }).optional(), createdBy: id }).strict() }).strict(),
  z.object({ type: z.literal("setDashboard"), widgets: z.array(z.object({ id, kind: z.enum(["record-count", "sum", "status", "assigned", "due", "approvals"]), entityId: id.optional(), fieldId: id.optional() }).strict()).max(24) }).strict(),
  z.object({ type: z.literal("setRole"), roleId: z.enum(["admin", "manager", "operator", "viewer"]), permissions: z.object({ editRecords: z.boolean(), deleteRecords: z.boolean(), editStructure: z.boolean(), manageUsers: z.boolean() }).strict() }).strict(),
  z.object({ type: z.literal("createWorkflow"), workflow: z.object({ id, name, trigger: z.string().max(500), actions: z.array(z.string().max(200)).max(10), active: z.boolean(), runs: z.array(z.never()), config: z.object({ entityId: id, event: z.enum(["create", "update", "status"]), fieldId: id.optional(), conditionFieldId: id.optional(), conditionOperator: z.enum(["equals", "greater-than"]).optional(), conditionValue: z.string().max(1000).optional(), action: z.enum(["notify", "request-approval", "create-task", "update-field"]), targetEntityId: id.optional(), targetFieldId: id.optional(), targetValue: z.string().max(1000).optional() }).strict() }).strict() }).strict()
]);
export type ConfigurationOperation = z.infer<typeof operationSchema>;
export const proposalSchema = z.object({ id, request: z.string().min(1).max(4000), interpretation: z.string().max(2000), baseRevision: z.number().int().nonnegative(), operations: z.array(operationSchema).min(1).max(100), ambiguities: z.array(z.string().max(500)).max(20), impact: z.string().max(2000) }).strict();
export type StructuredProposal = z.infer<typeof proposalSchema>;

export function configurationOf(w: Workspace): Configuration {
  return structuredClone({ entities: w.entities.map(({ records: _records, ...entity }) => entity), views: w.views, workflows: w.workflows.map(flow => ({ ...flow, runs: [] })), dashboardWidgets: w.dashboardWidgets || [], roles: w.roles });
}
const unique = (values: string[], label: string) => { if (new Set(values.map(item => item.toLocaleLowerCase())).size !== values.length) throw new DomainError(`Duplicate ${label}.`); };
export function validateConfiguration(config: Configuration) {
  unique(config.entities.map(entity => entity.id), "module identifier"); unique(config.entities.map(entity => entity.name.trim()), "module name");
  unique(config.views.map(view => view.id), "view identifier"); unique(config.workflows.map(flow => flow.id), "workflow identifier");
  for (const entity of config.entities) {
    id.parse(entity.id); name.parse(entity.name);
    unique(entity.fields.map(field => field.id), "field identifier"); unique(entity.fields.map(field => field.name.trim()), "field name");
    for (const field of entity.fields) {
      fieldSchema.parse(field);
      if (["id", "assigneeId"].includes(field.id)) throw new DomainError("This field identifier is reserved.");
      if (field.type === "relation" && !config.entities.some(target => target.id === field.relationEntityId)) throw new DomainError(`${entity.name} → ${field.name}: target module is missing.`);
      if (field.options) unique(field.options, "field option");
      for (const rule of [field.visibleWhen, field.requiredWhen]) if (rule && !entity.fields.some(item => item.id === rule.fieldId)) throw new DomainError("Conditional rule references a missing field.");
      if (field.formula) {
        if (!["number", "currency"].includes(field.type)) throw new DomainError("Calculated fields must be numeric.");
        for (const ref of formulaReferences(field.formula)) if (!entity.fields.some(item => item.id === ref && ["number", "currency"].includes(item.type))) throw new DomainError(`Formula references missing or nonnumeric field ${ref}.`);
        // Parse syntax without accepting identifiers or function calls. Data-dependent errors are checked on save.
        try { evaluateFormula(field.formula, Object.fromEntries(entity.fields.map(item => [item.id, 1])) as DataRecord); } catch (error) { if (!(error instanceof Error && error.message === "Division by zero.")) throw error; }
      }
    }
    const visit = (field: Field, path: Set<string>) => { if (path.has(field.id)) throw new DomainError("Calculated fields contain a cycle."); for (const ref of formulaReferences(field.formula || "")) visit(entity.fields.find(item => item.id === ref)!, new Set([...path, field.id])); };
    entity.fields.filter(field => field.formula).forEach(field => visit(field, new Set()));
    if (entity.ui) { uiSchema.parse(entity.ui); for (const ref of [...entity.ui.columns, ...entity.ui.formOrder]) if (!entity.fields.some(field => field.id === ref)) throw new DomainError("Layout references a missing field."); unique(entity.ui.columns, "column"); unique(entity.ui.formOrder, "form field"); }
  }
  for (const view of config.views) {
    const entity = config.entities.find(item => item.id === view.entityId);
    if (!entity || [...view.columns, ...view.filters.map(filter => filter.fieldId), ...(view.sort ? [view.sort.fieldId] : [])].some(ref => !entity.fields.some(field => field.id === ref))) throw new DomainError(`View ${view.name} references a missing module or field.`);
  }
  for (const flow of config.workflows) if (flow.config) {
    const c = flow.config, entity = config.entities.find(item => item.id === c.entityId);
    if (!entity || [c.fieldId, c.conditionFieldId, c.targetFieldId].filter(Boolean).some(ref => !entity.fields.some(field => field.id === ref) && ref !== "assigneeId")) throw new DomainError(`Workflow ${flow.name} references a missing module or field.`);
    if (c.action === "create-task" && !config.entities.some(item => item.id === c.targetEntityId)) throw new DomainError("Task target module is missing.");
  }
  for (const widget of config.dashboardWidgets) if (widget.entityId) { const entity = config.entities.find(item => item.id === widget.entityId); if (!entity || widget.fieldId && !entity.fields.some(field => field.id === widget.fieldId)) throw new DomainError("Widget references a missing module or field."); }
  if (!config.roles.find(role => role.id === "admin")?.permissions.editStructure) throw new DomainError("Admin must retain structural access.");
}
export function applyConfigurationOperations(base: Configuration, input: unknown): Configuration {
  const operations = z.array(operationSchema).min(1).max(100).parse(input), next = structuredClone(base);
  for (const operation of operations) {
    const entity = "entityId" in operation ? next.entities.find(item => item.id === operation.entityId) : undefined;
    if ("entityId" in operation && !entity) throw new DomainError("The target module does not exist.");
    switch (operation.type) {
      case "createEntity": next.entities.push(operation.entity); break;
      case "renameEntity": entity!.name = operation.name; break;
      case "archiveEntity": entity!.archived = operation.archived; break;
      case "reorderEntity": next.entities.splice(next.entities.indexOf(entity!), 1); next.entities.splice(operation.index, 0, entity!); break;
      case "addField": entity!.fields.push(operation.field); if (entity!.ui) { entity!.ui.columns.push(operation.field.id); entity!.ui.formOrder.push(operation.field.id); } break;
      case "updateField": { const index = entity!.fields.findIndex(field => field.id === operation.field.id); if (index < 0) throw new DomainError("Field not found."); entity!.fields[index] = operation.field; break; }
      case "createRelation": { const field = entity!.fields.find(item => item.id === operation.fieldId); if (!field) throw new DomainError("Relationship field not found."); Object.assign(field, { type: "relation", relationEntityId: operation.targetEntityId, cardinality: operation.cardinality }); break; }
      case "configureEntity": entity!.ui = operation.ui; entity!.navigationGroup = operation.navigationGroup; break;
      case "createView": next.views.push(operation.view); break;
      case "setDashboard": next.dashboardWidgets = operation.widgets; break;
      case "setRole": { const role = next.roles.find(item => item.id === operation.roleId); if (!role) throw new DomainError("Role not found."); role.permissions = operation.permissions; break; }
      case "createWorkflow": next.workflows.push(operation.workflow); break;
    }
  }
  validateConfiguration(next);
  return next;
}
export function previewConfiguration(w: Workspace, config: Configuration): Workspace {
  return { ...w, ...config, entities: config.entities.map(entity => ({ ...entity, records: w.entities.find(item => item.id === entity.id)?.records || [] })), relations: relationsFor(config.entities.map(entity => ({ ...entity, records: [] }))) };
}
export function saveConfigurationDraft(w: Workspace, operations: unknown): Workspace {
  requirePermission(w, "editStructure");
  const configuration = applyConfigurationOperations(w.configurationDraft?.configuration || configurationOf(w), operations);
  return { ...w, revision: (w.revision || 0) + 1, configurationDraft: { id: w.configurationDraft?.id || newId("draft"), baseVersion: w.configurationDraft?.baseVersion ?? w.configurationVersion ?? 1, configuration, updatedAt: new Date().toISOString() } };
}
export function stageProposal(w: Workspace, input: unknown): Workspace {
  requirePermission(w, "editStructure");
  const proposal = proposalSchema.parse(input);
  if (proposal.baseRevision !== (w.revision || 0)) throw new DomainError("This proposal is stale. Generate it again.");
  if (proposal.ambiguities.length) throw new DomainError("Resolve the proposal ambiguities before applying it.");
  const next = saveConfigurationDraft(w, proposal.operations);
  next.activity = [{ id: newId("activity"), at: new Date().toISOString(), userId: w.currentUserId, source: "ai", summary: `Staged: ${proposal.interpretation}` }, ...(w.activity || [])];
  return next;
}
export function publishConfiguration(w: Workspace): Workspace {
  requirePermission(w, "editStructure");
  const draft = w.configurationDraft;
  if (!draft) throw new DomainError("There is no draft to publish.");
  if (draft.baseVersion !== (w.configurationVersion || 1)) throw new DomainError("The published configuration changed. Rebase the draft first.");
  validateConfiguration(draft.configuration);
  const next = structuredClone(previewConfiguration(w, draft.configuration));
  for (const old of w.entities) {
    const entity = next.entities.find(item => item.id === old.id);
    if (!entity && old.records.length) throw new DomainError(`Cannot remove ${old.name}: records exist. Archive it instead.`);
    if (entity) for (const field of old.fields) {
      const replacement = entity.fields.find(item => item.id === field.id), populated = old.records.some(record => record[field.id] != null && record[field.id] !== "");
      if (populated && (!replacement || replacement.type !== field.type && ![field.type, replacement.type].every(type => ["number", "currency"].includes(type)))) throw new DomainError(`${old.name} → ${field.name} contains data. Keep the field and migrate to a new one before changing its type.`);
    }
  }
  for (const entity of next.entities) {
    entity.records = entity.records.map(record => {
      const updated = { ...record };
      for (const field of entity.fields) if (updated[field.id] == null && field.defaultValue !== undefined) updated[field.id] = field.defaultValue;
      return calculateFields(entity.fields, updated);
    });
    for (const record of entity.records) {
      const errors = validateRecord(next, entity as Entity, record);
      if (Object.keys(errors).length) throw new DomainError(`${entity.name} / ${record.id}: ${Object.values(errors).join(" ")}`);
    }
  }
  next.workflows = next.workflows.map(flow => ({ ...flow, runs: w.workflows.find(item => item.id === flow.id)?.runs || [] }));
  next.configurationHistory = [...(w.configurationHistory || []), { version: w.configurationVersion || 1, configuration: configurationOf(w), publishedAt: new Date().toISOString(), userId: w.currentUserId }].slice(-20);
  next.configurationVersion = (w.configurationVersion || 1) + 1; next.configurationDraft = undefined;
  next.revision = (w.revision || 0) + 1;
  next.activity = [{ id: newId("activity"), at: new Date().toISOString(), userId: w.currentUserId, source: "manual", summary: `Published configuration v${next.configurationVersion}` }, ...(w.activity || [])];
  return next;
}
export function restoreConfigurationDraft(w: Workspace, version: number): Workspace {
  requirePermission(w, "editStructure");
  const previous = w.configurationHistory?.find(item => item.version === version);
  if (!previous) throw new DomainError("Configuration version is unavailable.");
  return { ...w, revision: (w.revision || 0) + 1, configurationDraft: { id: newId("draft"), baseVersion: w.configurationVersion || 1, configuration: structuredClone(previous.configuration), updatedAt: new Date().toISOString() } };
}
