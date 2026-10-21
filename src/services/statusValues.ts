import type { Entity } from "../types";
import { normaliseStatus } from "./statusTone";

/**
 * Status values that business logic reacts to, in both languages.
 * New workspaces use the Italian demo values; workspaces saved before that keep their
 * English values (they are never rewritten), so every comparison must accept both.
 */
export const DELAYED = ["Delayed", "In ritardo"] as const;
export const CONFIRMED = ["Confirmed", "Confermato", "Confermata"] as const;
export const INACTIVE = ["Inactive", "Non attivo", "Non attiva"] as const;
export const ON_HOLD = ["On hold", "In sospeso"] as const;

/**
 * English demo value ↔ Italian equivalents, used to compare configured workflow
 * conditions across languages. Gendered Italian forms are listed together.
 */
const EQUIVALENTS: readonly (readonly string[])[] = [
  DELAYED, CONFIRMED, INACTIVE, ON_HOLD,
  ["Blocked", "Bloccato", "Bloccata"], ["Overdue", "Scaduto", "Scaduta"], ["At risk", "A rischio"],
  ["Delivered", "Consegnato", "Consegnata"], ["In production", "Production", "In produzione"], ["Draft", "Bozza"],
  ["Pending", "In attesa"], ["Approved", "Approvato", "Approvata"], ["Review", "In revisione"], ["Active", "Attivo", "Attiva"],
  ["Prospect", "Potenziale"], ["To do", "Da fare"], ["In progress", "In corso"],
  ["Done", "Complete", "Completed", "Completato", "Completata"], ["On track", "In linea"], ["Planning", "In pianificazione"],
  ["Paid", "Pagato", "Pagata"], ["Sent", "Submitted", "Inviato", "Inviata"], ["New", "Nuovo"], ["Qualified", "Qualificato"],
  ["Viewing", "Visita"], ["Offer made", "Offerta fatta"], ["Lost", "Perso", "Persa"], ["Won", "Vinto", "Vinta"],
  ["Negotiating", "In trattativa"], ["Negotiation", "Trattativa"], ["Accepted", "Accettato", "Accettata"],
  ["Declined", "Rifiutato", "Rifiutata"], ["Scheduled", "Programmato", "Programmata"], ["Cancelled", "Annullato", "Annullata"],
  ["Legal review", "Verifica legale"], ["Exchanged", "Rogitato"], ["Proposal", "Proposta"], ["Discovery", "Analisi"],
  ["Onboarding", "Avvio"], ["Paused", "In pausa"], ["Sampling", "Campionatura"], ["Available", "Disponibile"],
  ["Low stock", "Scorta bassa"], ["Ordered", "Ordinato"], ["Preparing", "In preparazione"], ["In transit", "In viaggio"],
  ["Passed", "Superato", "Superata"], ["Issues found", "Problemi rilevati"], ["Launched", "Lanciata", "Lanciato"],
  ["In development", "In sviluppo"], ["Queued", "In coda"], ["Valuation", "In valutazione"], ["Listed", "In vendita"],
  ["Under offer", "Proposta in corso"], ["Sold", "Venduto", "Venduta"],
];
const CANONICAL = new Map<string, number>(EQUIVALENTS.flatMap((group, index) => group.map(value => [normaliseStatus(value), index] as const)));

/** True when `value` is one of `values`, ignoring case, accents and separators. */
export const isStatus = (value: unknown, values: readonly string[]) => {
  const key = normaliseStatus(value);
  return Boolean(key) && values.some(candidate => normaliseStatus(candidate) === key);
};

/**
 * Same status, possibly in the other language (e.g. "Confirmed" and "Confermato").
 * Values outside the known demo vocabulary only match when identical, as before.
 */
export function sameStatus(a: unknown, b: unknown): boolean {
  if (String(a ?? "") === String(b ?? "")) return true;
  const group = CANONICAL.get(normaliseStatus(a));
  return group !== undefined && group === CANONICAL.get(normaliseStatus(b));
}

// English terms keep their historical substring match; Italian terms need word boundaries
// so that e.g. "Sbloccato" or "In scadenza" do not raise an alert.
const ATTENTION = /delayed|blocked|overdue|at risk|(?:^|[^a-z])(?:in ritardo|bloccat[oaie]|scadut[oaie]|a rischio)(?![a-z])/;

/** Record status that deserves a dashboard alert ("Da gestire"). */
export const needsAttention = (value: unknown) => ATTENTION.test(normaliseStatus(value));

/** The option of the entity's status field that belongs to `values`, so filters use the stored spelling. */
export function pickStatusOption(entity: Pick<Entity, "fields" | "records"> | undefined, values: readonly string[]): string {
  const field = entity?.fields.find(f => f.id === "status");
  const candidates = [...(field?.options || []), ...(entity?.records.map(r => String(r.status ?? "")) || [])];
  return candidates.find(option => isStatus(option, values)) ?? values[values.length > 1 ? 1 : 0];
}
