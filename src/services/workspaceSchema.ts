import { z } from "zod";

// Validate persisted data without stripping unknown, forward-compatible properties.
const id = z.string().min(1);
const value = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const record = z.record(z.string(), value).refine(r => typeof r.id === "string" && r.id.length > 0);
const condition = z.object({ fieldId: id, equals: value });
const field = z.object({ id, name: z.string(), type: z.enum(["text", "number", "currency", "date", "status", "relation", "select", "checkbox"]), required: z.boolean().optional(), options: z.array(z.string()).optional(), relationEntityId: id.optional(), formula: z.string().optional(), defaultValue: value.optional(), visibleWhen: condition.optional(), requiredWhen: condition.optional() });
const permissions = z.object({ editRecords: z.boolean(), deleteRecords: z.boolean(), editStructure: z.boolean(), manageUsers: z.boolean() });
const entity = z.object({ id, name: z.string(), fields: z.array(field), records: z.array(record), ui: z.object({ columns: z.array(id), formOrder: z.array(id), formColumns: z.union([z.literal(1), z.literal(2)]), actions: z.array(z.enum(["create", "export"])) }).optional() });
const view = z.object({ id, entityId: id, name: z.string(), columns: z.array(id), filters: z.array(z.object({ fieldId: id, operator: z.enum(["equals", "contains", "truthy", "not-equals", "greater-than", "less-than"]), value })), createdBy: id, layout: z.enum(["table", "list", "kanban", "calendar"]).optional(), sort: z.object({ fieldId: id, direction: z.enum(["asc", "desc"]) }).optional() });
const workflow = z.object({ id, name: z.string(), trigger: z.string(), actions: z.array(z.string()), active: z.boolean(), runs: z.array(z.object({ id, at: z.string(), status: z.enum(["success", "pending", "failed"]), summary: z.string() })) });
export const storedWorkspaceSchema = z.object({
  id, companyName: z.string(), industry: z.string(), architecture: z.string(), version: z.number().int().positive(), revision: z.number().int().nonnegative().optional(),
  entities: z.array(entity), relations: z.array(z.object({ id, fromEntityId: id, fromFieldId: id, toEntityId: id, label: z.string(), kind: z.enum(["one-to-many", "many-to-one", "many-to-many"]) })), views: z.array(view), workflows: z.array(workflow),
  users: z.array(z.object({ id, name: z.string(), initials: z.string(), email: z.string(), roleId: id, title: z.string() })), roles: z.array(z.object({ id, name: z.string(), permissions })), currentUserId: id,
  changeHistory: z.array(z.object({ id, at: z.string(), userId: id, command: z.string(), summary: z.string(), status: z.enum(["applied", "cancelled", "reverted"]), affectedEntityIds: z.array(id) })),
  alerts: z.array(z.object({ id, title: z.string(), detail: z.string(), severity: z.enum(["high", "medium", "low"]) })),
  comments: z.array(z.object({ id, entityId: id, recordId: id, userId: id, body: z.string(), at: z.string() })).optional(),
  attachments: z.array(z.object({ id, entityId: id, recordId: id, name: z.string(), mime: z.string(), size: z.number().nonnegative(), at: z.string() })).optional(),
  notifications: z.array(z.object({ id, title: z.string(), detail: z.string(), at: z.string(), read: z.boolean().optional() })).optional(),
  approvals: z.array(z.object({ id, entityId: id, recordId: id, workflowId: id, status: z.enum(["pending", "approved", "rejected"]), requestedAt: z.string() })).optional(),
  activity: z.array(z.object({ id, at: z.string(), userId: id, source: z.enum(["manual", "import", "ai", "workflow"]), summary: z.string() })).optional(),
  dashboardWidgets: z.array(z.object({ id, kind: z.enum(["record-count", "sum", "status", "assigned", "due", "approvals"]) })).optional(),
}).superRefine((workspace, ctx) => {
  const user = workspace.users.find(u => u.id === workspace.currentUserId);
  if (!user || !workspace.roles.some(role => role.id === user.roleId)) ctx.addIssue({ code: "custom", message: "Current workspace user has no valid role." });
  if (new Set(workspace.entities.map(e => e.id)).size !== workspace.entities.length) ctx.addIssue({ code: "custom", message: "Duplicate module identifiers." });
  for (const entity of workspace.entities) {
    if (new Set(entity.fields.map(f => f.id)).size !== entity.fields.length || new Set(entity.records.map(r => r.id)).size !== entity.records.length) ctx.addIssue({ code: "custom", message: "Duplicate field or record identifiers." });
  }
});

export function assertStoredWorkspace(value: unknown) {
  const result = storedWorkspaceSchema.safeParse(value);
  if (!result.success) throw new Error("Saved workspace has invalid data. Download a backup before resetting or repairing it.");
}
