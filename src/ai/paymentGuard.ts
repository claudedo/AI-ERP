import type { DataRecord, Workspace } from "../types";
import type { ChatResponse } from "./chatContract";
import { absoluteDate, applyEntry, type EntryProposal } from "../services/smartEntry";
import { currentRole, newId } from "../services/workspaceDomain";
import { parseItalianNumber } from "../services/importExport";
import { normalize } from "./chatContext";
import { isChatQuestion } from "../services/nodusChat";

/** High-risk financial extraction is deterministic; the model cannot choose an ambiguous link. */
export function paymentGuard(message: string, workspace: Workspace, source: "local" | "openai" = "local"): ChatResponse | null {
  // A write is an explicit insert verb, or a "received" statement that carries an amount.
  const writes = /\b(?:nuov[oa]|registra|aggiungi|inserisci)\b/i.test(message) || (/ricevut/i.test(message) && /\d[\d.,]*\s*(?:mila|milion[ei])?\s*(?:euro|€)/i.test(message));
  if (isChatQuestion(message) || !/pagament|incasso/i.test(message) || !writes) return null;
  const match = message.match(/(\d[\d.,]*)\s*(mila|milion[ei])?\s*(?:euro|€)/i),
    parsed = match ? parseItalianNumber(match[1]) : null,
    amount = parsed === null ? null : parsed * (match?.[2]?.toLowerCase() === "mila" ? 1000 : /milion/i.test(match?.[2] || "") ? 1000000 : 1),
    place = message.match(/(?:casa|immobile|abitazione)\s+(?:a|in)\s+([A-Za-zÀ-ÿ'-]+)/i)?.[1];
  const extracted = [...(amount !== null ? [{ label: "Importo (€)", value: amount }] : []), ...(place ? [{ label: "Località", value: place }] : [])];
  const clarify = (question: string): ChatResponse => ({ type: "clarification", source, message: question, questions: [question], extracted });
  if (!currentRole(workspace).permissions.editRecords) return { type: "unsupported", source, message: "Il tuo ruolo consente la consultazione, ma non l’inserimento di pagamenti." };
  if (amount === null || amount <= 0) return clarify("Qual è l’importo esatto del pagamento ricevuto?");
  const entities = workspace.entities.filter(e => !e.archived && /pagament|payment|incass/i.test(`${e.id} ${e.name}`));
  if (entities.length !== 1) return clarify("Ho estratto l’importo e il riferimento, ma non è disponibile un unico modulo Pagamenti. In quale modulo vuoi registrarlo? Nessun dato è stato salvato.");
  const entity = entities[0], amounts = entity.fields.filter(f => f.type === "currency" || /amount|importo/i.test(f.id));
  if (amounts.length !== 1) return clarify("Quale campo deve contenere l’importo del pagamento?");
  const record: DataRecord = { id: newId("payment"), [amounts[0].id]: amount };
  const mentions = (id: string) => new RegExp(`(^|[^a-zA-Z0-9_-])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-zA-Z0-9_-])`, "i").test(message);
  const relations = entity.fields.filter(f => f.type === "relation" && f.relationEntityId);
  if (!relations.length) return clarify("A quale immobile, trattativa, cliente o fattura va collegato il pagamento? Lo schema attuale non contiene un collegamento utilizzabile.");
  let linked = 0;
  for (const field of relations) {
    const target = workspace.entities.find(e => e.id === field.relationEntityId);
    const candidates = target?.records.filter(r => place ? Object.entries(r).some(([key, value]) => /city|citta|address|indirizzo|name|reference|title/i.test(key) && normalize(value).includes(normalize(place))) : mentions(r.id)) || [];
    const explicit = target?.records.filter(r => mentions(r.id)) || [];
    if (candidates.length > 1 && explicit.length !== 1) return clarify(`Ci sono più riferimenti compatibili${place ? ` a ${place}` : ""}: ${candidates.slice(0, 5).map(r => `${r.reference || r.name || r.id} (${r.id})`).join(", ")}. Quale vuoi collegare? Specifica l’ID del record.`);
    const selected = explicit.length === 1 ? explicit[0] : candidates.length === 1 ? candidates[0] : null;
    if (selected) { record[field.id] = selected.id; linked++; }
    else if (field.required) return clarify(`Quale ${field.name} vuoi collegare al pagamento${place ? ` di ${place}` : ""}? Non ho trovato una corrispondenza univoca.`);
  }
  if (!linked) return clarify(`Non ho trovato un collegamento univoco${place ? ` per ${place}` : ""}. Indica l’immobile, la trattativa, il cliente o la fattura con il relativo ID.`);
  for (const field of entity.fields) {
    if (field.type === "date") { const date = absoluteDate(message); if (date) record[field.id] = date; }
    if (field.type === "status" || field.type === "select") {
      const received = /ricevut/i.test(message) ? field.options?.filter(option => /ricevut|received|paid|pagato|incassat/i.test(option)) : [];
      if (received?.length === 1) record[field.id] = received[0];
    }
  }
  const proposal: EntryProposal = { id: newId("entry"), request: message, baseRevision: workspace.revision || 0, operations: [{ entityId: entity.id, kind: "create", record }], questions: [], builder: false };
  try { applyEntry(workspace, proposal, true); }
  catch { return clarify("Il pagamento è identificato, ma mancano campi obbligatori (ad esempio data o causale). Specifica i dati mancanti: nessun valore verrà inventato."); }
  return { type: "entry_proposal", source, message: `Pagamento di ${amount.toLocaleString("it-IT", { style: "currency", currency: "EUR" })}${place ? ` · ${place}` : ""}. Verifica il collegamento nella proposta; nulla è stato salvato.`, proposal };
}
