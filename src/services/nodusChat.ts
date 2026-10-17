import { entrySchema, type EntryProposal } from "./smartEntry";
import { entryMatchesIntent } from "./entryIntent";
import type { Workspace } from "../types";

export function chatIntent(text: string): "structure" | "records" | "question" {
  const modification = /\b(crea|aggiungi|inserisci|registra|sposta|aggiorna|cambiato|modifica|cambia|ricevuto|ricevuta|segna|create|add|update|change|rename|remove|rimuovi)\b/i.test(text);
  const schema = /\b(modul[oi]|module|field|camp[oi]|workflow|schema|relation|relazion[ei]|view|vista)\b/i.test(text) || /\b(?:add|aggiungi)\s+(?:a |an |un |uno )?(?:status|stato)\s+(?:to|a|agli|al)\b/i.test(text);
  return modification ? schema ? "structure" : "records" : "question";
}

export function loadConversation(storage: Pick<Storage, "getItem">, workspaceId: string, workspace?: Workspace): { input: string; messages: { q: string; a: string }[]; entry: EntryProposal | null } {
  const read = (key: string) => { try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; } };
  const unified = read(`nodus-ai-${workspaceId}`);
  const old = unified ? [] : ["operator", "builder"].map(mode => read(`nodus-conversation-${workspaceId}-${mode}`));
  const draft = unified ? null : read(`nodus-entry-${workspaceId}`);
  const value = unified || { input: old.find(c => typeof c?.input === "string" && c.input)?.input || draft?.text || "", messages: old.flatMap(c => Array.isArray(c?.messages) ? c.messages : []), entry: draft?.proposal };
  const parsed = entrySchema.safeParse(value.entry);
  const mismatched = parsed.success && !entryMatchesIntent(parsed.data, workspace);
  return {
    input: mismatched ? parsed.data.request.slice(0, 6000) : typeof value.input === "string" ? value.input.slice(0, 10000) : "",
    messages: Array.isArray(value.messages) ? value.messages.filter((m: unknown): m is { q: string; a: string } => !!m && typeof m === "object" && "q" in m && typeof m.q === "string" && "a" in m && typeof m.a === "string").slice(-30).map((m: { q: string; a: string }) => ({ q: m.q, a: m.a })) : [],
    entry: parsed.success && !mismatched ? parsed.data : null,
  };
}
