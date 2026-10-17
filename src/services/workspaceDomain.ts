import type { Approval, AttachmentRef, DashboardWidget, DataRecord, Entity, RecordComment, Role, View, Workflow, Workspace } from "../types";
import { deriveAlerts } from "./aiEngine";
import { calculateFields } from "./formulas";
import { isCompanyEntity, normalizedVat } from "./companies";

export class DomainError extends Error {}
export const newId = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
export const currentRole = (w: Workspace): Role => {
  const user = w.users.find(u => u.id === w.currentUserId);
  const role = w.roles.find(r => r.id === user?.roleId);
  if (!role) throw new DomainError("The current demo user has no valid role.");
  return role;
};
export function requirePermission(w: Workspace, permission: keyof Role["permissions"]) {
  if (!currentRole(w).permissions[permission]) throw new DomainError("Your demo role does not allow this action.");
}
const entityById = (w: Workspace, id: string) => {
  const entity = w.entities.find(e => e.id === id);
  if (!entity) throw new DomainError("This module no longer exists.");
  return entity;
};
export function validateRecord(w: Workspace, entity: Entity, record: DataRecord): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!record.id?.trim()) errors.id = "Record identifier is required.";
  if(isCompanyEntity(entity) && !String(record.name || record.tradeName || "").trim()) errors.name="Inserisci una ragione sociale o un nome commerciale.";
  if(entity.id==="companies" && record.vat && entity.records.some(other=>other.id!==record.id && normalizedVat(other.vat)===normalizedVat(record.vat))) errors.vat="Partita IVA già presente: usa l’azienda esistente.";
  if(entity.id==="companies"&&record.vat&&!/^[A-Z0-9]{2,24}$/.test(normalizedVat(record.vat)))errors.vat="Verifica il formato della partita IVA (sono ammessi identificativi esteri).";
  for(const id of ["email","website"]) if(record[id] && entity.fields.some(f=>f.id===id) && !(id==="email"?/^[^\s@]+@[^\s@]+\.[^\s@]+$/:/^https?:\/\/[^\s.]+\.[^\s]+$/).test(String(record[id]))) errors[id]=id==="email"?"Inserisci un’email valida.":"Inserisci un URL completo (https://…).";
  if(entity.id==="company-contacts" && record.site){const site=w.entities.find(e=>e.id==="company-sites")?.records.find(r=>r.id===record.site);if(site?.company!==record.company)errors.site="La sede deve appartenere alla stessa azienda."}
  if (record.assigneeId && !w.users.some(user => user.id === record.assigneeId)) errors.assigneeId = "Choose an existing workspace member.";
  for (const field of entity.fields) {
    const value = record[field.id];
    if ((field.required || field.requiredWhen && record[field.requiredWhen.fieldId] === field.requiredWhen.equals) && (value == null || String(value).trim() === "" || (field.type === "checkbox" && value !== true))) {
      errors[field.id] = `${field.name} is required.`;
      continue;
    }
    if (value == null || value === "") continue;
    if ((field.type === "number" || field.type === "currency") && (typeof value !== "number" || !Number.isFinite(value))) errors[field.id] = `${field.name} must be a valid number.`;
    if (field.type === "date") { const date = new Date(`${String(value)}T00:00:00Z`); if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(date.getTime()) || date.toISOString().slice(0,10) !== value) errors[field.id] = `${field.name} must be a valid date.`; }
    if (field.type === "checkbox" && typeof value !== "boolean") errors[field.id] = `${field.name} must be a checkbox value.`;
    if ((field.type === "status" || field.type === "select") && field.options?.length && !field.options.includes(String(value))) errors[field.id] = `${field.name} must match an available option.`;
    if (field.type === "relation" && field.relationEntityId && !w.entities.find(e => e.id === field.relationEntityId)?.records.some(r => r.id === value)) errors[field.id] = `${field.name} must link to an existing record.`;
    if (field.type === "relation" && field.cardinality === "one-to-one" && entity.records.some(other => other.id !== record.id && other[field.id] === value)) errors[field.id] = `${field.name} is already linked to another record.`;
  }
  return errors;
}
const log = (w: Workspace, source: "manual" | "import" | "ai" | "workflow", summary: string, entityId?: string, recordId?: string) => {
  w.activity ??= [];
  w.activity.unshift({ id: newId("activity"), at: new Date().toISOString(), userId: w.currentUserId, source, summary, entityId, recordId });
  w.activity = w.activity.slice(0, 500);
};
const notify = (w: Workspace, title: string, detail: string, entityId?: string, recordId?: string) => {
  w.notifications ??= [];
  w.notifications.unshift({ id: newId("notification"), title, detail, at: new Date().toISOString(), entityId, recordId });
};
const valueOf = (entity: Entity, record: DataRecord) => {
  const field = entity.fields.find(f => f.type === "currency") || entity.fields.find(f => f.type === "number");
  return field ? Number(record[field.id] || 0) : 0;
};
const labelOf = (entity: Entity, record: DataRecord) => String(record[entity.fields.find(f => f.type === "text")?.id || "id"] || record.id);

export function workflowApplies(flow: Workflow, entity: Entity, record: DataRecord, previous?: DataRecord): boolean {
  if (!flow.active) return false;
  const changed = (fieldId: string) => previous?.[fieldId] !== record[fieldId];
  const config = flow.config;
    let shouldRun = false;
    if (config) {
      shouldRun = config.entityId === entity.id && (config.event === "create" ? !previous : config.event === "update" ? Boolean(previous && (!config.fieldId || changed(config.fieldId))) : Boolean(previous && changed(config.fieldId || "status")));
      if (shouldRun && config.conditionFieldId) {
        const actual = record[config.conditionFieldId];
        shouldRun = config.conditionOperator === "greater-than" ? Number(actual) > Number(config.conditionValue) : String(actual ?? "") === String(config.conditionValue ?? "");
      }
    } else if (flow.id === "confirmed-order-task") shouldRun = /orders/i.test(entity.name) && record.status === "Confirmed" && previous?.status !== "Confirmed";
    else if (flow.id === "delayed-delivery-alert") shouldRun = /deliver/i.test(entity.name) && record.status === "Delayed" && previous?.status !== "Delayed";
    else if (flow.id === "high-value-approval") shouldRun = /orders/i.test(entity.name) && valueOf(entity, record) > 20000 && (!previous || valueOf(entity, previous) <= 20000);
  return shouldRun;
}
export const applicableWorkflows = (w: Workspace, entity: Entity, record: DataRecord, previous?: DataRecord) => w.workflows.filter(flow => workflowApplies(flow, entity, record, previous));

export function runWorkflows(w: Workspace, entity: Entity, record: DataRecord, previous?: DataRecord) {
  for (const flow of applicableWorkflows(w, entity, record, previous)) {
    const config = flow.config;
    const eventKey = `${flow.id}:${entity.id}:${record.id}:${w.revision || 0}`;
    if (flow.runs.some(run => run.eventKey === eventKey)) continue;
    try {
      const action = config?.action || (flow.id === "confirmed-order-task" ? "create-task" : flow.id === "high-value-approval" ? "request-approval" : "notify");
      if (action === "create-task") {
        let target = w.entities.find(e => e.id === config?.targetEntityId) || w.entities.find(e => e.id === "tasks" || /operations/i.test(e.name));
        if (!target && !config) {
          target = { id: "tasks", name: "Tasks", fields: [{ id: "name", name: "Task", type: "text" }, { id: "sourceRecord", name: "Source record", type: "text" }, { id: "owner", name: "Owner", type: "text" }, { id: "due", name: "Due date", type: "date" }, { id: "status", name: "Status", type: "status", options: ["To do", "In progress", "Done"] }], records: [] };
          w.entities.push(target);
        }
        if (!target) throw new DomainError("The target task module is missing.");
        if (!target.records.some(r => r.sourceRecord === record.id)) {
          const task: DataRecord = { id: newId("task") };
          for (const field of target.fields) task[field.id] = field.defaultValue ?? (field.id === "name" ? `Prepare ${record.orderNo || record.id}` : field.id === "sourceRecord" || field.type === "relation" && field.relationEntityId === entity.id ? record.id : field.id === "owner" ? String(record.owner || "") : field.id === "due" ? String(record.delivery || "") : field.type === "status" ? field.options?.[0] || "To do" : field.type === "checkbox" ? false : "");
          const errors = validateRecord(w, target, task);
          if (Object.keys(errors).length) throw new DomainError(Object.values(errors).join(" "));
          target.records.unshift(task);
          log(w, "workflow", `Created task for ${labelOf(entity, record)}`, target.id, task.id);
        }
      } else if (action === "update-field") {
        const field = entity.fields.find(f => f.id === config?.targetFieldId);
        if (!field) throw new DomainError("The workflow target field is missing.");
        const raw = config?.targetValue || "", value = ["number", "currency"].includes(field.type) ? Number(raw) : field.type === "checkbox" ? raw === "true" : raw;
        const candidate = calculateFields(entity.fields, { ...record, [field.id]: value });
        const errors = validateRecord(w, entity, candidate);
        if (Object.keys(errors).length) throw new DomainError(Object.values(errors).join(" "));
        Object.assign(record, candidate);
      } else if (action === "request-approval") {
        w.approvals ??= [];
        if (!w.approvals.some(a => a.workflowId === flow.id && a.entityId === entity.id && a.recordId === record.id && a.status === "pending")) w.approvals.unshift({ id: newId("approval"), entityId: entity.id, recordId: record.id, workflowId: flow.id, status: "pending", requestedAt: new Date().toISOString() });
        notify(w, "Approval requested", labelOf(entity, record), entity.id, record.id);
      } else notify(w, "Workflow alert", `${entity.name}: ${labelOf(entity, record)}`, entity.id, record.id);
      flow.runs.unshift({ id: newId("run"), at: new Date().toISOString(), status: "success", summary: `${flow.name}: ${labelOf(entity, record)}`, eventKey });
      log(w, "workflow", `${flow.name} ran`, entity.id, record.id);
    } catch (error) {
      flow.runs.unshift({ id: newId("run"), at: new Date().toISOString(), status: "failed", summary: error instanceof Error ? error.message : "Workflow failed", eventKey });
    }
  }
}

export function saveRecord(w: Workspace, entityId: string, incoming: DataRecord, source: "manual" | "import" | "ai" = "manual", deferWorkflows = false): Workspace {
  return saveRecords(w, entityId, [incoming], source, deferWorkflows);
}

/** A batch is atomic to callers and clones the aggregate only once. */
export function saveRecords(w: Workspace, entityId: string, records: DataRecord[], source: "manual" | "import" | "ai" = "manual", deferWorkflows = false): Workspace {
  requirePermission(w, "editRecords");
  const next = structuredClone(w);
  for (const incoming of records) saveRecordInPlace(next, entityId, incoming, source, deferWorkflows);
  next.alerts = deriveAlerts(next.entities);
  return next;
}

function saveRecordInPlace(next: Workspace, entityId: string, incoming: DataRecord, source: "manual" | "import" | "ai", deferWorkflows: boolean) {
  const entity = entityById(next, entityId);
  if (entity.archived) throw new DomainError("This module is archived.");
  incoming = calculateFields(entity.fields, incoming);
  const errors = validateRecord(next, entity, incoming);
  if (Object.keys(errors).length) throw new DomainError(Object.values(errors).join(" "));
  next.revision = (next.revision || 0) + 1;
  const target = entityById(next, entityId);
  const previous = target.records.find(r => r.id === incoming.id);
  if(["company-sites","company-contacts"].includes(entityId) && incoming.primary) target.records.filter(r=>r.company===incoming.company && r.id!==incoming.id).forEach(r=>{r.primary=false});
  if (previous) target.records = target.records.map(r => r.id === incoming.id ? structuredClone(incoming) : r);
  else target.records.unshift(structuredClone(incoming));
  if (!deferWorkflows) runWorkflows(next, target, target.records.find(r => r.id === incoming.id)!, previous);
  log(next, source, `${previous ? "Updated" : "Created"} ${entity.name} record`, entityId, incoming.id);
}
export function deleteRecord(w: Workspace, entityId: string, recordId: string): Workspace {
  requirePermission(w, "deleteRecords");
  const next = structuredClone(w), entity = entityById(next, entityId);
  if (!entity.records.some(r => r.id === recordId)) throw new DomainError("This record no longer exists.");
  for (const source of next.entities) for (const field of source.fields) {
    if (field.type !== "relation" || field.relationEntityId !== entityId) continue;
    const dependent = source.records.find(record => !(source.id === entityId && record.id === recordId) && record[field.id] === recordId && (field.required || field.requiredWhen && record[field.requiredWhen.fieldId] === field.requiredWhen.equals));
    if (dependent) throw new DomainError(`Cannot delete: ${source.name} requires this record through ${field.name}. Update the dependent records first.`);
  }
  entity.records = entity.records.filter(r => r.id !== recordId);
  for (const source of next.entities) for (const field of source.fields.filter(f => f.type === "relation" && f.relationEntityId === entityId)) for (const record of source.records) if (record[field.id] === recordId) record[field.id] = null;
  next.comments = (next.comments || []).filter(c => c.entityId !== entityId || c.recordId !== recordId);
  next.attachments = (next.attachments || []).filter(a => a.entityId !== entityId || a.recordId !== recordId);
  next.approvals = (next.approvals || []).filter(a => a.entityId !== entityId || a.recordId !== recordId);
  next.alerts = deriveAlerts(next.entities);
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `Deleted ${entity.name} record and cleared incoming links`, entityId, recordId);
  return next;
}
export function addComment(w: Workspace, entityId: string, recordId: string, body: string): Workspace {
  requirePermission(w, "editRecords");
  if (!body.trim()) throw new DomainError("Comment cannot be empty.");
  if (!entityById(w, entityId).records.some(r => r.id === recordId)) throw new DomainError("This record no longer exists.");
  const next = structuredClone(w), comment: RecordComment = { id: newId("comment"), entityId, recordId, userId: w.currentUserId, body: body.trim(), at: new Date().toISOString() };
  next.comments = [comment, ...(next.comments || [])];
  for (const user of next.users.filter(u => u.id !== w.currentUserId && (body.toLowerCase().includes(`@${u.name.toLowerCase()}`) || body.toLowerCase().includes(`@${u.name.split(" ")[0].toLowerCase()}`)))) {
    next.notifications ??= [];
    next.notifications.unshift({ id: newId("mention"), title: "You were mentioned", detail: body.trim().slice(0, 120), at: new Date().toISOString(), userId: user.id, entityId, recordId });
  }
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", "Added a comment", entityId, recordId);
  return next;
}
export function addAttachment(w: Workspace, attachment: AttachmentRef): Workspace {
  requirePermission(w, "editRecords");
  if (!entityById(w, attachment.entityId).records.some(r => r.id === attachment.recordId)) throw new DomainError("Save the record before attaching a file.");
  const next = structuredClone(w);
  next.attachments = [attachment, ...(next.attachments || [])];
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `Attached ${attachment.name}`, attachment.entityId, attachment.recordId);
  return next;
}
export function removeAttachment(w: Workspace, id: string): Workspace {
  requirePermission(w, "editRecords");
  const next = structuredClone(w), attachment = next.attachments?.find(a => a.id === id);
  if (!attachment) throw new DomainError("Attachment not found.");
  next.attachments = next.attachments?.filter(a => a.id !== id);
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `Removed ${attachment.name}`, attachment.entityId, attachment.recordId);
  return next;
}
export function saveView(w: Workspace, view: View): Workspace {
  requirePermission(w, "editRecords");
  if (!entityById(w, view.entityId)) throw new DomainError("Module not found.");
  const next = structuredClone(w);
  if (next.views.some(v => v.id === view.id)) throw new DomainError("View identifier already exists.");
  next.views.push(view);
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `Saved view ${view.name}`, view.entityId);
  return next;
}
export function saveDashboardWidgets(w: Workspace, widgets: DashboardWidget[]): Workspace {
  requirePermission(w, "editRecords");
  if (new Set(widgets.map(widget => widget.id)).size !== widgets.length) throw new DomainError("Duplicate widget identifiers are not allowed.");
  const next = structuredClone(w);
  next.dashboardWidgets = widgets;
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", "Updated dashboard widgets");
  return next;
}
export function saveWorkflow(w: Workspace, flow: Workflow): Workspace {
  requirePermission(w, "editStructure");
  const next = structuredClone(w);
  if (next.workflows.some(x => x.id === flow.id)) throw new DomainError("Workflow identifier already exists.");
  if (flow.config) {
    const source = entityById(next, flow.config.entityId);
    if (flow.config.fieldId && !source.fields.some(f => f.id === flow.config?.fieldId)) throw new DomainError("Trigger field is missing.");
    if (flow.config.conditionFieldId && !source.fields.some(f => f.id === flow.config?.conditionFieldId)) throw new DomainError("Condition field is missing.");
    if (flow.config.action === "update-field" && !source.fields.some(f => f.id === flow.config?.targetFieldId)) throw new DomainError("Update target field is missing.");
    if (flow.config.action === "create-task" && flow.config.targetEntityId && !next.entities.some(e => e.id === flow.config?.targetEntityId)) throw new DomainError("Task target module is missing.");
  }
  next.workflows.push(flow);
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `Created workflow ${flow.name}`);
  return next;
}
export function toggleWorkflow(w: Workspace, workflowId: string): Workspace {
  requirePermission(w, "editStructure");
  const next = structuredClone(w), flow = next.workflows.find(item => item.id === workflowId);
  if (!flow) throw new DomainError("Workflow no longer exists.");
  flow.active = !flow.active;
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `${flow.active ? "Activated" : "Paused"} ${flow.name}`);
  return next;
}
export function markNotificationRead(w: Workspace, notificationId: string): Workspace {
  const next = structuredClone(w), notification = next.notifications?.find(item => item.id === notificationId);
  if (!notification || (notification.userId && notification.userId !== w.currentUserId)) throw new DomainError("Notification is unavailable.");
  notification.read = true;
  next.revision = (w.revision || 0) + 1;
  return next;
}
export function setApproval(w: Workspace, approvalId: string, status: "approved" | "rejected"): Workspace {
  if (!["admin", "manager"].includes(currentRole(w).id)) throw new DomainError("Only a demo Admin or Manager can decide approvals.");
  const next = structuredClone(w), approval = next.approvals?.find(a => a.id === approvalId) as Approval | undefined;
  if (!approval || approval.status !== "pending") throw new DomainError("This approval is no longer pending.");
  approval.status = status;
  approval.decidedAt = new Date().toISOString();
  approval.decidedBy = w.currentUserId;
  next.revision = (w.revision || 0) + 1;
  log(next, "manual", `Approval ${status}`, approval.entityId, approval.recordId);
  return next;
}
export function undoAiChange(w: Workspace, changeId: string): Workspace {
  requirePermission(w, "editStructure");
  const change = w.changeHistory.find(item => item.id === changeId);
  if (!change || change.status !== "applied" || change.appliedRevision !== (w.revision || 0)) throw new DomainError("Undo is only available before any later workspace change.");
  if (!["add-priority", "add-quality", "add-suppliers", "add-approval", "add-status", "add-view"].includes(change.action || "")) throw new DomainError("This structural change cannot be safely undone.");
  const next = structuredClone(w), order = next.entities.find(e => /orders/i.test(e.name));
  if (change.action === "add-priority" && order) { order.fields = order.fields.filter(f => f.id !== "priority"); order.records.forEach(r => { delete r.priority; }); }
  if (change.action === "add-quality") { next.entities = next.entities.filter(e => e.id !== "quality-control"); next.relations = next.relations.filter(r => r.fromEntityId !== "quality-control" && r.toEntityId !== "quality-control"); }
  if (change.action === "add-suppliers") next.entities = next.entities.filter(e => e.id !== "suppliers");
  if (change.action === "add-approval") { next.workflows = next.workflows.filter(flow => flow.id !== "high-value-approval"); next.approvals = (next.approvals || []).filter(approval => approval.workflowId !== "high-value-approval"); }
  if (change.action === "add-status") { const field = order?.fields.find(f => f.id === "status"); if (field) field.options = field.options?.filter(option => option !== "On hold"); }
  if (change.action === "add-view") next.views = next.views.filter(view => !(view.entityId === order?.id && view.name === "Orders to review"));
  next.changeHistory.find(item => item.id === changeId)!.status = "reverted";
  next.revision = (w.revision || 0) + 1;
  log(next, "ai", `Undid ${change.summary}`);
  return next;
}
