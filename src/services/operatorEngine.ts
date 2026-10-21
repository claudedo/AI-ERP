import type { AiAction, DataRecord, Entity, Workspace } from "../types";
import { isModuleKind } from "./moduleKinds";

export interface OperatorResult { answer: string; criteria: string; count: number; records: { entityId: string; recordId: string; label: string }[] }
const label = (entity: Entity, record: DataRecord) => String(record[entity.fields.find(f => f.type === "text")?.id || "id"] || record.id);
export function answerOperator(action: AiAction, workspace: Workspace): OperatorResult {
  const orders = workspace.entities.find(entity => isModuleKind(entity, "orders"));
  if (action.type === "filter-delayed") {
    const records = orders?.records.filter(record => /delayed|late|ritard/i.test(String(record.status || ""))) || [];
    return { answer: orders ? `${records.length} ordini in ritardo trovati nei record attuali.` : "Questo workspace non ha un modulo Ordini.", criteria: "Ordini con stato contenente In ritardo, Delayed o Late", count: records.length, records: orders ? records.map(record => ({ entityId: orders.id, recordId: record.id, label: label(orders, record) })) : [] };
  }
  if (action.type === "pending-approvals") {
    const pending = (workspace.approvals || []).filter(approval => approval.status === "pending");
    return { answer: `${pending.length} approvazioni in attesa. Le approvazioni non hanno una data di scadenza, quindi NODUS non può dire se scadano oggi.`, criteria: "Stato approvazione = in attesa; nessuna ipotesi sulle date", count: pending.length, records: pending.map(approval => ({ entityId: approval.entityId, recordId: approval.recordId, label: workspace.entities.find(e => e.id === approval.entityId)?.records.find(r => r.id === approval.recordId)?.id || approval.recordId })) };
  }
  if (action.type === "my-tasks") {
    const user = workspace.users.find(item => item.id === workspace.currentUserId);
    const matches = workspace.entities.flatMap(entity => entity.records.filter(record => record.assigneeId === user?.id || (/(task|operation|attivit)/i.test(entity.name) && String(record.owner || "").toLowerCase() === user?.name.toLowerCase())).map(record => ({ entityId: entity.id, recordId: record.id, label: label(entity, record) })));
    return { answer: `${matches.length} record assegnati a ${user?.name || "l’utente demo corrente"}.`, criteria: "Assegnati all’utente demo corrente o con responsabile dell’attività corrispondente", count: matches.length, records: matches };
  }
  if (action.type === "orders-by-customer") {
    if (!orders) return { answer: "Questo workspace non ha un modulo Ordini.", criteria: "Ordini raggruppati per cliente collegato o testo cliente", count: 0, records: [] };
    const customerField = orders.fields.find(field => /customer|client/i.test(field.name));
    if (!customerField) return { answer: "Ordini non ha un campo cliente per il raggruppamento.", criteria: "Campo cliente mancante", count: 0, records: [] };
    const groups = new Map<string, number>();
    for (const record of orders.records) {
      const related = workspace.entities.find(e => e.id === customerField.relationEntityId)?.records.find(r => r.id === record[customerField.id]);
      const name = related ? String(related.name || related.id) : String(record[customerField.id] || "Unassigned");
      groups.set(name, (groups.get(name) || 0) + 1);
    }
    return { answer: [...groups].map(([name, count]) => `${name}: ${count}`).join(" · ") || "Nessun ordine.", criteria: `Ordini raggruppati per ${customerField.name}; conteggio dei record attuali`, count: orders.records.length, records: orders.records.map(record => ({ entityId: orders.id, recordId: record.id, label: label(orders, record) })) };
  }
  if (action.type === "attention-summary") return { answer: workspace.alerts.length ? `${workspace.alerts.length} elementi richiedono attenzione. ${workspace.alerts[0].detail}` : "Al momento nulla richiede attenzione urgente.", criteria: "Avvisi derivati dallo stato attuale dei record", count: workspace.alerts.length, records: workspace.alerts.filter(alert => alert.entityId && alert.recordId).map(alert => ({ entityId: alert.entityId!, recordId: alert.recordId!, label: alert.detail })) };
  return { answer: "Questa richiesta non è supportata dal motore di regole locale. Prova con ordini in ritardo, approvazioni in attesa, le mie attività, ordini per cliente o attenzione.", criteria: "Nessun comando locale corrispondente", count: 0, records: [] };
}
