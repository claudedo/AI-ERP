import type { DataRecord, Workspace } from "../types";
import { currentRole } from "../services/workspaceDomain";
import { chatContextSchema, type ChatContext } from "./chatContract";

export const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const groups = [ /pagament|incass|payment|fattur|invoice/, /immobil|casa|propert|trattativ|deal|offer|contract/, /aziend|client|fornitor|compan|customer|supplier|contatt|contact|sede|site/, /ordin|order/, /attivit|task|workflow|approv/ ];
export function selectChatContext(workspace: Workspace, message: string, contextId?: string): ChatContext {
  const text = normalize(message), tokens = text.match(/[a-z0-9-]{3,}/g) || [];
  const active = workspace.entities.filter(e => !e.archived);
  // Normalize and score once, not repeatedly inside sort comparators.
  const scores = new Map(active.map(entity => [entity.id, entity.records.map(record => {
    const values = Object.values(record).filter((v): v is string => typeof v === "string").map(normalize);
    const matching = tokens.filter(token => values.some(value => value.includes(token)));
    return { record, score: matching.length, relevant: matching.some(token => !/^(abbiamo|ricevuto|nuovo|della|delle|cliente|mostrami|quanto|questo|mese|euro)$/.test(token)), entityScore: matching.filter(token => !/^(abbiamo|ricevuto|nuovo|della|delle|cliente|mostrami|quanto|questo|mese|euro|pagamento)$/.test(token)).length };
  })]));
  const relevant = new Set(active.filter(e => e.id === contextId || groups.some(group => group.test(text) && group.test(normalize(`${e.id} ${e.name}`))) || scores.get(e.id)!.some(item => item.relevant)).map(e => e.id));
  // One relation hop supplies candidate links, not an indiscriminate database dump.
  active.filter(e => relevant.has(e.id)).forEach(e => e.fields.filter(f => f.type === "relation" && f.relationEntityId).forEach(f => relevant.add(f.relationEntityId!)));
  let budget = 40;
  const entityScores = new Map(active.map(e => [e.id, (relevant.has(e.id) ? 10 : 0) + (e.id === contextId ? 2 : 0) + scores.get(e.id)!.reduce((max, item) => Math.max(max, item.entityScore), 0)]));
  const entities = [...active].sort((a, b) => entityScores.get(b.id)! - entityScores.get(a.id)!).slice(0, 50).map(entity => {
    const ranked = relevant.has(entity.id) ? [...scores.get(entity.id)!].sort((a, b) => b.score - a.score).slice(0, Math.min(12, budget)).map(item => item.record) : [];
    budget -= ranked.length;
    const records = ranked.map(record => {
      const projected: Record<string, string | number | boolean | null> = { id: record.id };
      for (const field of entity.fields) {
        if (/iban|password|token|secret|legacy/i.test(`${field.id} ${field.name}`)) continue;
        if (/note|email|phone|telefono|vat|fiscal/i.test(`${field.id} ${field.name}`) && !normalize(message).includes(normalize(field.name)) && !/contatt|contact|p\.?\s*iva|email|telefon/.test(text)) continue;
        const value = record[field.id];
        if (value !== undefined) projected[field.id] = typeof value === "string" ? value.slice(0, 800) : value;
      }
      return projected;
    });
    return { id: entity.id, name: entity.name, fields: entity.fields.filter(f => !/password|secret|token|iban|legacy/i.test(`${f.id} ${f.name}`)).map(({ defaultValue: _default, ...field }) => field), records, total: entity.records.length };
  });
  const role = currentRole(workspace);
  return chatContextSchema.parse({ workspaceId: workspace.id, revision: workspace.revision || 0, user: { id: workspace.currentUserId, role: role.id, permissions: role.permissions }, entities });
}

export function contextWorkspace(context: ChatContext): Workspace {
  return { id: context.workspaceId, revision: context.revision, companyName: "NODUS", industry: "", architecture: "", version: 5,
    entities: context.entities.map(e => ({ id: e.id, name: e.name, fields: e.fields, records: e.records as DataRecord[] })),
    currentUserId: context.user.id, users: [{ id: context.user.id, roleId: context.user.role, name: "Utente", initials: "U", email: "", title: "" }], roles: [{ id: context.user.role, name: context.user.role, permissions: context.user.permissions }],
    relations: [], views: [], workflows: [], changeHistory: [], alerts: [] };
}
