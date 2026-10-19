import type { Entity, Workspace } from "../types";
import type { ChatQuery, ChatResponse } from "./chatContract";
import { normalize } from "./chatContext";
import { executeChatQuery } from "./chatQueries";

const moduleAliases: [RegExp, string[]][] = [
  [/propert|immobil/, ["immobili", "immobile", "proprietà", "case", "properties", "property"]],
  [/compan|aziend/, ["aziende", "azienda", "companies", "company"]], [/order|ordin/, ["ordini", "ordine", "orders"]],
  [/payment|pagament|incass/, ["pagamenti", "pagamento", "payments", "incassi"]], [/task|attivit/, ["attività", "task", "tasks"]],
  [/owner|proprietar/, ["proprietari", "proprietario", "owners"]], [/lead|potenzial/, ["lead", "leads", "potenziali clienti"]],
];
const statusGroups = [/vendita|for sale|on market|available|disponibil/, /vendut|sold/, /affitto|for rent|to rent/, /ricevut|received|paid|pagat|incassat/, /in attesa|pending|awaiting/, /ritard|delayed|late/, /completat|completed|done/, /in corso|in progress/];
const mentions = (text: string, term: string) => (` ${text.replace(/[^a-z0-9]+/g, " ")} `).includes(` ${normalize(term).replace(/[^a-z0-9]+/g, " ")} `);
function terms(entity: Entity) {
  return [entity.name, entity.id.replace(/[-_]/g, " "), ...(entity.singularName ? [entity.singularName] : []), ...moduleAliases.filter(([pattern]) => pattern.test(normalize(`${entity.id} ${entity.name}`))).flatMap(([, aliases]) => aliases)];
}
export function localQuery(message: string, workspace: Workspace, contextId?: string): ChatResponse | null {
  const text = normalize(message);
  if (!/\b(?:quant[ioe]|quali|mostra(?:mi)?|elenca|totale|somma|show|list|count)\b/.test(text) && !message.includes("?")) return null;
  const active = workspace.entities.filter(e => !e.archived), matching = active.filter(e => terms(e).some(term => mentions(text, term)));
  const entity = matching.length === 1 ? matching[0] : !matching.length ? active.find(e => e.id === contextId) : undefined;
  const clarify = (question: string): ChatResponse => ({ type: "clarification", source: "local", message: question, questions: [question], extracted: [] });
  if (!entity) return matching.length > 1 ? clarify(`Quale modulo vuoi consultare: ${matching.map(e => e.name).join(", ")}?`) : null;
  const states = entity.fields.filter(f => f.type === "status" || f.type === "select").flatMap(field => (field.options || [...new Set(entity.records.map(r => String(r[field.id] || "")).filter(Boolean))]).map(option => ({ field, option })));
  const selected = states.filter(({ option }) => mentions(text, option) || statusGroups.some(pattern => pattern.test(text) && pattern.test(normalize(option))));
  if (selected.length > 1) return clarify(`Quale stato intendi? ${selected.map(s => `${s.field.name}: ${s.option}`).join(", ")}.`);
  if (!selected.length && (/\bstato\b/.test(text) || statusGroups.some(pattern => pattern.test(text)))) return clarify(`Quale stato di ${entity.name} vuoi usare? ${states.map(s => `${s.field.name}: ${s.option}`).join(", ") || "Non è presente un campo stato utilizzabile."}`);
  const filters: ChatQuery["filters"] = selected.map(({ field, option }) => ({ fieldId: field.id, operator: "equals", value: option }));
  if (/questo mese|mese corrente|this month/.test(text)) {
    const dates = entity.fields.filter(f => f.type === "date");
    if (dates.length !== 1) return clarify(`Quale campo data di ${entity.name} devo usare per il mese corrente?`);
    filters.push({ fieldId: dates[0].id, operator: "this-month", value: null });
  }
  const numeric = entity.fields.filter(f => f.type === "currency");
  const sum = /\bsomma\b|totale.*(?:importo|valore)|quanto.*(?:incass|euro)/.test(text);
  if (sum && numeric.length !== 1) return clarify(`Quale campo importo di ${entity.name} vuoi sommare?`);
  // Fail closed: the local engine supports a small grammar, not arbitrary NL.
  // Remove only clauses we actually translated. Any remaining content may be
  // a location, comparison, negation or date restriction and must not disappear.
  const removePhrase = (source: string, phrase: string) => {
    const words = normalize(phrase).replace(/[^a-z0-9]+/g, " ").trim();
    if (!words) return source;
    const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return source.replace(new RegExp(`(^| )${escaped}(?= |$)`, "g"), " ");
  };
  let residual = text.replace(/[^a-z0-9]+/g, " ");
  for (const term of terms(entity).sort((a,b) => b.length - a.length)) residual = removePhrase(residual, term);
  for (const { option } of selected) residual = removePhrase(residual, option);
  for (const group of statusGroups) if (selected.some(({ option }) => group.test(normalize(option)))) {
    residual = residual.replace(new RegExp(`\\b(?:${group.source})[a-z]*\\b`, "g"), " ");
  }
  if (filters.some(f => f.operator === "this-month")) for (const phrase of ["questo mese", "mese corrente", "this month"]) residual = removePhrase(residual, phrase);
  // Structural words, not filter values. Deliberately do NOT remove non/not,
  // location names, numbers, comparisons or unhandled temporal expressions.
  residual = residual.replace(/\b(?:quanti|quante|quali|quanto|quale|mostra|mostrami|elenca|totale|somma|show|list|count|record|records|i|le|gli|il|la|lo|l|un|una|di|dei|delle|degli|del|della|dello|dell|abbiamo|sono|ci|in|con|stato|fase|nel|nella|al|alla|a|per|the|of|all|with|status|we|have|do|how|many)\b/g, " ").trim();
  if (sum) residual = residual.replace(/\b(?:importo|valore|incass[a-z]*|euro)\b/g, " ").trim();
  if (residual.trim()) return clarify(`Non riesco a interpretare tutte le condizioni di questa richiesta su ${entity.name}. Specifica i filtri con i nomi e i valori dei campi; non mostrerò un totale che li ignora.`);
  const query: ChatQuery = { entityId: entity.id, filters, metric: sum ? "sum" : "count", fieldId: sum ? numeric[0].id : null, groupBy: null };
  executeChatQuery(workspace, query);
  return { type: "query_results", source: "local", message: `Consultazione di ${entity.name}: risultati calcolati dal gestionale.`, query };
}

export function localExamples(workspace: Workspace): string[] {
  const entities = workspace.entities.filter(e => !e.archived);
  if (!entities.length) return ["Cosa richiede attenzione oggi?", "Crea un modulo Attività con nome e data", "Crea un modulo Contatti con nome e email"];
  const first = entities[0], second = entities[1] || first, state = first.fields.find(f => (f.type === "status" || f.type === "select") && f.options?.length);
  return [`Quanti record abbiamo in ${first.name}?`, state ? `Elenca ${first.name} con stato ${state.options![0]}` : `Elenca i record di ${first.name}`, `Mostrami i record di ${second.name}`];
}
