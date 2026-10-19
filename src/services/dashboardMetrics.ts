import type { DashboardWidget, Workspace } from "../types";

export const WIDGET_KINDS: DashboardWidget["kind"][] = ["record-count", "sum", "status", "assigned", "due", "approvals"];
export function widgetMetric(workspace: Workspace, widget: DashboardWidget): { label: string; value: string; detail: string } {
  const entity = workspace.entities.find(e => e.id === widget.entityId);
  const entities = entity ? [entity] : workspace.entities;
  const records = entities.flatMap(e => e.records);
  if (widget.kind === "record-count") return { label: entity ? `Record di ${entity.name}` : "Record", value: String(records.length), detail: entity ? "modulo corrente" : `${workspace.entities.length} moduli` };
  if (widget.kind === "sum") {
    const target = entity || workspace.entities.find(e => e.fields.some(f => f.type === "currency" || f.type === "number"));
    const field = target?.fields.find(f => f.id === widget.fieldId) || target?.fields.find(f => f.type === "currency" || f.type === "number");
    if (!target || !field) return { label: "Valore", value: "—", detail: "Nessun campo numerico disponibile" };
    const sum = target.records.reduce((total, record) => total + (Number(record[field.id]) || 0), 0);
    return { label: `Somma · ${field.name}`, value: field.type === "currency" ? new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", notation: sum > 999999 ? "compact" : "standard", maximumFractionDigits: 0 }).format(sum) : new Intl.NumberFormat("it-IT").format(sum), detail: `${target.records.length} record · ${target.name}` };
  }
  if (widget.kind === "status") {
    const target = entity || workspace.entities.find(e => e.fields.some(f => f.type === "status"));
    const field = target?.fields.find(f => f.id === widget.fieldId) || target?.fields.find(f => f.type === "status");
    if (!target || !field) return { label: "Distribuzione stati", value: "—", detail: "Nessun campo stato disponibile" };
    const groups = new Map<string, number>();
    for (const record of target.records) { const status = String(record[field.id] || "Non specificato"); groups.set(status, (groups.get(status) || 0) + 1); }
    return { label: "Distribuzione stati", value: String(groups.size), detail: [...groups].slice(0, 3).map(([status, count]) => `${status}: ${count}`).join(" · ") || "Nessun record" };
  }
  if (widget.kind === "assigned") return { label: "Assegnati a me", value: String(records.filter(record => record.assigneeId === workspace.currentUserId).length), detail: "Utente demo corrente" };
  if (widget.kind === "due") {
    const today = new Date().toISOString().slice(0, 10), next = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const count = entities.reduce((total, source) => total + source.records.filter(record => source.fields.some(field => field.type === "date" && /due|scadenz|deliver|consegn|date|\bdat[ao]\b|arriv|\beta\b/i.test(`${field.id} ${field.name}`) && String(record[field.id] || "") >= today && String(record[field.id] || "") <= next)).length, 0);
    return { label: "In scadenza entro 7 giorni", value: String(count), detail: "In base ai campi data attuali" };
  }
  return { label: "Approvazioni in attesa", value: String((workspace.approvals || []).filter(approval => approval.status === "pending").length), detail: "Coda di approvazione solo nel browser" };
}
