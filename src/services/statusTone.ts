/**
 * Maps a status or select value to one of the four state tones used by status pills.
 * Pure and presentation-only: it never changes the stored value, it only decides how the
 * value is drawn (success green, warning amber, danger red-orange, or neutral anthracite).
 * Matching is exact on the normalised value (case, accents, dashes and extra spaces ignored),
 * so free-text options that are not listed here stay neutral instead of being guessed.
 */
export type StatusTone = "success" | "warning" | "danger" | "neutral";

const TONES: Record<Exclude<StatusTone, "neutral">, readonly string[]> = {
  success: [
    "done", "complete", "completed", "delivered", "approved", "paid", "won", "sold", "active",
    "confirmed", "passed", "on track", "accepted", "signed", "closed won", "received", "resolved",
    "ricevuto", "ricevuta", "pagato", "pagata", "completato", "completata", "consegnato", "consegnata",
    "approvato", "approvata", "venduto", "venduta", "attivo", "attiva", "confermato", "confermata",
    "firmato", "firmata", "accettato", "accettata", "concluso", "conclusa", "evaso", "evasa", "superato", "vinto", "vinta",
    "superata", "in linea", "rogitato", "launched", "lanciata", "lanciato",
  ],
  warning: [
    "pending", "in progress", "review", "in review", "legal review", "draft", "negotiating", "negotiation",
    "under offer", "on hold", "waiting", "in production", "quality check", "low stock", "awaiting approval",
    "in attesa", "in corso", "in revisione", "bozza", "trattativa", "in trattativa", "in lavorazione",
    "sospeso", "sospesa", "da approvare", "da verificare", "scorte basse",
    "in sospeso", "proposta in corso", "verifica legale", "in produzione", "scorta bassa",
  ],
  danger: [
    "delayed", "blocked", "overdue", "late", "lost", "declined", "rejected", "cancelled", "canceled",
    "at risk", "failed", "issues found", "urgent", "closed lost", "expired",
    "in ritardo", "ritardo", "bloccato", "bloccata", "scaduto", "scaduta", "perso", "persa",
    "rifiutato", "rifiutata", "annullato", "annullata", "a rischio", "urgente", "fallito", "fallita",
    "problemi rilevati",
  ],
};

const LOOKUP = new Map<string, StatusTone>(
  (Object.entries(TONES) as [StatusTone, readonly string[]][]).flatMap(([tone, values]) =>
    values.map((value) => [value, tone] as const),
  ),
);

export function normaliseStatus(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-–—]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function statusTone(value: unknown): StatusTone {
  return LOOKUP.get(normaliseStatus(value)) ?? "neutral";
}
