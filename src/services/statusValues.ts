import type { Entity } from "../types";
import { normaliseStatus } from "./statusTone";

/**
 * Status values that business logic reacts to, in both languages.
 * New workspaces use the Italian demo values; workspaces saved before that keep their
 * English values (they are never rewritten), so every comparison must accept both.
 */
export const DELAYED = ["Delayed", "In ritardo"] as const;
export const CONFIRMED = ["Confirmed", "Confermato", "Confermata"] as const;
export const ACTIVE = ["Active", "Attivo", "Attiva"] as const;
export const INACTIVE = ["Inactive", "Non attivo", "Non attiva"] as const;
export const ON_HOLD = ["On hold", "In sospeso"] as const;

/**
 * [English demo values, Italian translations]: used to compare configured workflow conditions
 * across languages only. Gendered Italian forms are listed together. Values on the same side
 * are NOT equivalent to each other (e.g. "Done" ≠ "Completed", "Completato" ≠ "Completata").
 */
const TRANSLATIONS: readonly (readonly [readonly string[], readonly string[]])[] = [
  [["Delayed"], ["In ritardo"]], [["Confirmed"], ["Confermato", "Confermata"]], [["Active"], ["Attivo", "Attiva"]],
  [["Inactive"], ["Non attivo", "Non attiva"]], [["On hold"], ["In sospeso"]],
  [["Blocked"], ["Bloccato", "Bloccata"]], [["Overdue"], ["Scaduto", "Scaduta"]], [["At risk"], ["A rischio"]],
  [["Delivered"], ["Consegnato", "Consegnata"]], [["In production", "Production"], ["In produzione"]], [["Draft"], ["Bozza"]],
  [["Pending"], ["In attesa"]], [["Approved"], ["Approvato", "Approvata"]], [["Review"], ["In revisione"]],
  [["Prospect"], ["Potenziale"]], [["To do"], ["Da fare"]], [["In progress"], ["In corso"]],
  [["Done", "Complete", "Completed"], ["Completato", "Completata"]], [["On track"], ["In linea"]], [["Planning"], ["In pianificazione"]],
  [["Paid"], ["Pagato", "Pagata"]], [["Sent", "Submitted"], ["Inviato", "Inviata"]], [["New"], ["Nuovo"]], [["Qualified"], ["Qualificato"]],
  [["Viewing"], ["Visita"]], [["Offer made"], ["Offerta fatta"]], [["Lost"], ["Perso", "Persa"]], [["Won"], ["Vinto", "Vinta"]],
  [["Negotiating"], ["In trattativa"]], [["Negotiation"], ["Trattativa"]], [["Accepted"], ["Accettato", "Accettata"]],
  [["Declined"], ["Rifiutato", "Rifiutata"]], [["Scheduled"], ["Programmato", "Programmata"]], [["Cancelled"], ["Annullato", "Annullata"]],
  [["Legal review"], ["Verifica legale"]], [["Exchanged"], ["Rogitato"]], [["Proposal"], ["Proposta"]], [["Discovery"], ["Analisi"]],
  [["Onboarding"], ["Avvio"]], [["Paused"], ["In pausa"]], [["Sampling"], ["Campionatura"]], [["Available"], ["Disponibile"]],
  [["Low stock"], ["Scorta bassa"]], [["Ordered"], ["Ordinato"]], [["Preparing"], ["In preparazione"]], [["In transit"], ["In viaggio"]],
  [["Passed"], ["Superato", "Superata"]], [["Issues found"], ["Problemi rilevati"]], [["Launched"], ["Lanciata", "Lanciato"]],
  [["In development"], ["In sviluppo"]], [["Queued"], ["In coda"]], [["Valuation"], ["In valutazione"]], [["Listed"], ["In vendita"]],
  [["Under offer"], ["Proposta in corso"]], [["Sold"], ["Venduto", "Venduta"]],
];

/** True when `value` is one of `values`, ignoring case, accents and separators. */
export const isStatus = (value: unknown, values: readonly string[]) => {
  const key = normaliseStatus(value);
  return Boolean(key) && values.some(candidate => normaliseStatus(candidate) === key);
};

/**
 * Same status: exact match (case-sensitive, as before), or an exact English demo value and
 * one of its exact Italian translations (e.g. "Confirmed" and "Confermato"). Same-language
 * synonyms never match.
 */
export function sameStatus(a: unknown, b: unknown): boolean {
  const x = String(a ?? ""), y = String(b ?? "");
  if (x === y) return true;
  return TRANSLATIONS.some(([english, italian]) => (english.includes(x) && italian.includes(y)) || (italian.includes(x) && english.includes(y)));
}

// English terms keep their historical substring match; Italian terms need word boundaries
// so that e.g. "Sbloccato" or "In scadenza" do not raise an alert, and negated forms
// ("Non in ritardo", "non a rischio") do not either.
const ATTENTION = /delayed|blocked|overdue|at risk|(?:^|[^a-z])(?<!non )(?:in ritardo|bloccat[oaie]|scadut[oaie]|a rischio)(?![a-z])/;

/** Record status that deserves a dashboard alert ("Da gestire"). */
export const needsAttention = (value: unknown) => ATTENTION.test(normaliseStatus(value));

/** The option of the entity's status field that belongs to `values`, so filters use the stored spelling. */
export function pickStatusOption(entity: Pick<Entity, "fields" | "records"> | undefined, values: readonly string[]): string {
  const field = entity?.fields.find(f => f.id === "status");
  const candidates = [...(field?.options || []), ...(entity?.records.map(r => String(r.status ?? "")) || [])];
  return candidates.find(option => isStatus(option, values)) ?? values[values.length > 1 ? 1 : 0];
}
