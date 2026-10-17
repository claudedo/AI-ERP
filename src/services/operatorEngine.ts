import type { AiAction, DataRecord, Entity, Workspace } from "../types";

export interface OperatorResult { answer: string; criteria: string; count: number; records: { entityId: string; recordId: string; label: string }[] }
const label = (entity: Entity, record: DataRecord) => String(record[entity.fields.find(f => f.type === "text")?.id || "id"] || record.id);
export function answerOperator(action: AiAction, workspace: Workspace): OperatorResult {
  const orders = workspace.entities.find(entity => /orders/i.test(entity.name));
  if (action.type === "filter-delayed") {
    const records = orders?.records.filter(record => /delayed|late|ritard/i.test(String(record.status || ""))) || [];
    return { answer: orders ? `${records.length} delayed orders found in live records.` : "This workspace has no Orders module.", criteria: "Orders where Status contains Delayed, Late or Ritardo", count: records.length, records: orders ? records.map(record => ({ entityId: orders.id, recordId: record.id, label: label(orders, record) })) : [] };
  }
  if (action.type === "pending-approvals") {
    const pending = (workspace.approvals || []).filter(approval => approval.status === "pending");
    return { answer: `${pending.length} approvals are pending. There is no due-date field on approvals, so NODUS cannot claim they are due today.`, criteria: "Approval status = pending; no date assumption", count: pending.length, records: pending.map(approval => ({ entityId: approval.entityId, recordId: approval.recordId, label: workspace.entities.find(e => e.id === approval.entityId)?.records.find(r => r.id === approval.recordId)?.id || approval.recordId })) };
  }
  if (action.type === "my-tasks") {
    const user = workspace.users.find(item => item.id === workspace.currentUserId);
    const matches = workspace.entities.flatMap(entity => entity.records.filter(record => record.assigneeId === user?.id || (/(task|operation|attivit)/i.test(entity.name) && String(record.owner || "").toLowerCase() === user?.name.toLowerCase())).map(record => ({ entityId: entity.id, recordId: record.id, label: label(entity, record) })));
    return { answer: `${matches.length} records are assigned to ${user?.name || "the current demo user"}.`, criteria: "Assigned to current demo user or matching task owner", count: matches.length, records: matches };
  }
  if (action.type === "orders-by-customer") {
    if (!orders) return { answer: "This workspace has no Orders module.", criteria: "Orders grouped by linked customer or customer text", count: 0, records: [] };
    const customerField = orders.fields.find(field => /customer|client/i.test(field.name));
    if (!customerField) return { answer: "Orders has no customer field to group by.", criteria: "Customer field missing", count: 0, records: [] };
    const groups = new Map<string, number>();
    for (const record of orders.records) {
      const related = workspace.entities.find(e => e.id === customerField.relationEntityId)?.records.find(r => r.id === record[customerField.id]);
      const name = related ? String(related.name || related.id) : String(record[customerField.id] || "Unassigned");
      groups.set(name, (groups.get(name) || 0) + 1);
    }
    return { answer: [...groups].map(([name, count]) => `${name}: ${count}`).join(" · ") || "No orders yet.", criteria: `Orders grouped by ${customerField.name}; count of current records`, count: orders.records.length, records: orders.records.map(record => ({ entityId: orders.id, recordId: record.id, label: label(orders, record) })) };
  }
  if (action.type === "attention-summary") return { answer: workspace.alerts.length ? `${workspace.alerts.length} items need attention. ${workspace.alerts[0].detail}` : "Nothing urgent needs attention right now.", criteria: "Alerts derived from current record status", count: workspace.alerts.length, records: workspace.alerts.filter(alert => alert.entityId && alert.recordId).map(alert => ({ entityId: alert.entityId!, recordId: alert.recordId!, label: alert.detail })) };
  return { answer: "This request is not supported by the local rules engine. Try delayed orders, pending approvals, my tasks, orders by customer, or attention.", criteria: "No matching local command", count: 0, records: [] };
}
