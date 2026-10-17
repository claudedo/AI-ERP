import type { DashboardWidget, Workspace } from "../types";

export const WIDGET_KINDS: DashboardWidget["kind"][] = ["record-count", "sum", "status", "assigned", "due", "approvals"];
export function widgetMetric(workspace: Workspace, widget: DashboardWidget): { label: string; value: string; detail: string } {
  const entity = workspace.entities.find(e => e.id === widget.entityId);
  const entities = entity ? [entity] : workspace.entities;
  const records = entities.flatMap(e => e.records);
  if (widget.kind === "record-count") return { label: entity ? `${entity.name} records` : "Records", value: String(records.length), detail: entity ? "current module" : `${workspace.entities.length} modules` };
  if (widget.kind === "sum") {
    const target = entity || workspace.entities.find(e => e.fields.some(f => f.type === "currency" || f.type === "number"));
    const field = target?.fields.find(f => f.id === widget.fieldId) || target?.fields.find(f => f.type === "currency" || f.type === "number");
    if (!target || !field) return { label: "Value", value: "—", detail: "No numeric field available" };
    const sum = target.records.reduce((total, record) => total + (Number(record[field.id]) || 0), 0);
    return { label: `Sum · ${field.name}`, value: field.type === "currency" ? new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", notation: sum > 999999 ? "compact" : "standard", maximumFractionDigits: 0 }).format(sum) : new Intl.NumberFormat("en-IE").format(sum), detail: `${target.records.length} records · ${target.name}` };
  }
  if (widget.kind === "status") {
    const target = entity || workspace.entities.find(e => e.fields.some(f => f.type === "status"));
    const field = target?.fields.find(f => f.id === widget.fieldId) || target?.fields.find(f => f.type === "status");
    if (!target || !field) return { label: "Status distribution", value: "—", detail: "No status field available" };
    const groups = new Map<string, number>();
    for (const record of target.records) { const status = String(record[field.id] || "Unspecified"); groups.set(status, (groups.get(status) || 0) + 1); }
    return { label: "Status distribution", value: String(groups.size), detail: [...groups].slice(0, 3).map(([status, count]) => `${status}: ${count}`).join(" · ") || "No records" };
  }
  if (widget.kind === "assigned") return { label: "Assigned to me", value: String(records.filter(record => record.assigneeId === workspace.currentUserId).length), detail: "Current demo user" };
  if (widget.kind === "due") {
    const today = new Date().toISOString().slice(0, 10), next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const count = entities.reduce((total, source) => total + source.records.filter(record => source.fields.some(field => field.type === "date" && /due|scadenz|delivery|date/i.test(field.name) && String(record[field.id] || "") >= today && String(record[field.id] || "") <= next)).length, 0);
    return { label: "Due in 7 days", value: String(count), detail: "Based on current date fields" };
  }
  return { label: "Pending approvals", value: String((workspace.approvals || []).filter(approval => approval.status === "pending").length), detail: "Browser-only approval queue" };
}
