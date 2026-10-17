import type { Workspace } from "../types";
import type { ChatQuery } from "./chatContract";
import { querySchema } from "./chatContract";
import { normalize } from "./chatContext";
import type { OperatorResult } from "../services/operatorEngine";

export function executeChatQuery(workspace: Workspace, input: ChatQuery, now = new Date()): OperatorResult {
  const query = querySchema.parse(input), entity = workspace.entities.find(e => e.id === query.entityId && !e.archived);
  if (!entity) throw new Error("Il modulo richiesto non è disponibile.");
  const resolveField = (path: string) => {
    const parts = path.split("."), field = entity.fields.find(f => f.id === parts[0]);
    if (!field || parts.length > 2) throw new Error("Filtro non disponibile nello schema.");
    if (parts.length === 1) return { field, relation: null };
    const target = workspace.entities.find(e => e.id === field.relationEntityId && !e.archived), nested = target?.fields.find(f => f.id === parts[1]);
    if (field.type !== "relation" || !nested || !target) throw new Error("Collegamento del filtro non disponibile.");
    return { field: nested, relation: { field, target } };
  };
  for (const filter of query.filters) resolveField(filter.fieldId);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`, today = `${month}-${String(now.getDate()).padStart(2, "0")}`;
  const rows = entity.records.filter(record => query.filters.every(filter => {
    const resolved = resolveField(filter.fieldId), actual = resolved.relation ? resolved.relation.target.records.find(r => r.id === record[resolved.relation!.field.id])?.[resolved.field.id] : record[resolved.field.id], expected = filter.value;
    switch (filter.operator) {
      case "this-month": return typeof actual === "string" && actual.startsWith(month);
      case "before-today": return typeof actual === "string" && /^\d{4}-\d{2}-\d{2}$/.test(actual) && actual < today;
      case "contains": return normalize(actual).includes(normalize(expected));
      case "not-equals": return normalize(actual) !== normalize(expected);
      case "greater-than": return typeof actual === "number" && actual > Number(expected);
      case "less-than": return typeof actual === "number" && actual < Number(expected);
      default: return normalize(actual) === normalize(expected) || filter.fieldId === "partyRole" && actual === "Entrambi" && ["Cliente", "Fornitore"].includes(String(expected));
    }
  }));
  let answer = `${rows.length} record trovati in ${entity.name}.`;
  if (query.metric === "sum") {
    const field = entity.fields.find(f => f.id === query.fieldId && ["currency", "number"].includes(f.type));
    if (!field) throw new Error("Specifica un campo numerico disponibile.");
    const sum = rows.reduce((total, r) => total + (typeof r[field.id] === "number" ? Number(r[field.id]) : 0), 0);
    answer = `${field.name}: ${new Intl.NumberFormat("it-IT", field.type === "currency" ? { style: "currency", currency: "EUR" } : {}).format(sum)} · ${rows.length} record.`;
  }
  if (query.metric === "group-count") {
    const field = entity.fields.find(f => f.id === query.groupBy);
    if (!field) throw new Error("Specifica un raggruppamento disponibile.");
    const counts = new Map<string, number>(); rows.forEach(r => { const key = String(r[field.id] || "Non specificato"); counts.set(key, (counts.get(key) || 0) + 1); });
    answer = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, count]) => {
      const target = workspace.entities.find(e => e.id === field.relationEntityId), record = target?.records.find(r => r.id === id);
      return `${record ? String(record.name || record.reference || id) : id}: ${count}`;
    }).join("; ") || "Nessun record trovato.";
  }
  const operators = { equals: "uguale a", "not-equals": "diverso da", contains: "contiene", "greater-than": "maggiore di", "less-than": "minore di", "this-month": "nel mese corrente", "before-today": "prima di oggi" };
  const criteria = `${entity.name} · ${query.filters.length ? query.filters.map(f => `${resolveField(f.fieldId).field.name} ${operators[f.operator]} ${f.value ?? ""}`).join("; ") : "tutti i record"}`;
  return { answer, criteria, count: rows.length, records: rows.slice(0, 30).map(r => ({ entityId: entity.id, recordId: r.id, label: String(r.name || r.reference || r.orderNo || r[entity.fields.find(f => f.type === "text")?.id || "id"] || r.id) })) };
}
