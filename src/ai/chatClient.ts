import type { Workspace } from "../types";
import { chatErrorSchema, chatResponseSchema, type ChatResponse } from "./chatContract";
import { selectChatContext } from "./chatContext";
import { localChat } from "./localChat";
import { applyEntry } from "../services/smartEntry";
import { currentRole } from "../services/workspaceDomain";
import { chatIntent } from "../services/nodusChat";
import { entryMatchesIntent } from "../services/entryIntent";
export class ChatRequestError extends Error {
  constructor(public reason: "rate_limit" | "forbidden") {
    super(reason === "rate_limit" ? "Troppe richieste, riprova tra un minuto." : "Richiesta non autorizzata. Accedi di nuovo o riapri NODUS dal sito ufficiale.");
  }
}

export function validateChatResponse(input: unknown, workspace: Workspace, request: string): ChatResponse {
  const response = chatResponseSchema.parse(input), role = currentRole(workspace);
  if (response.type === "entry_proposal" || response.type === "update_proposal") {
    if (!entryMatchesIntent({ ...response.proposal, request }, workspace)) throw new Error("La proposta non corrisponde al modulo richiesto.");
    if (!role.permissions.editRecords) throw new Error("Il tuo ruolo consente solo la consultazione.");
    if (response.proposal.baseRevision !== (workspace.revision || 0)) throw new Error("Il workspace è cambiato. Rigenera la proposta.");
    response.proposal.operations.forEach(operation => {
      if (operation.kind === "update") {
        const previous = workspace.entities.find(e => e.id === operation.entityId)?.records.find(r => r.id === operation.record.id);
        if (!previous) throw new Error("Record non disponibile.");
        operation.record = { ...previous, ...operation.record };
      }
    });
    if (!response.proposal.questions.length && !response.proposal.builder) {
      try { applyEntry(workspace, response.proposal, true); }
      catch { response.proposal.questions.push("Verifica i campi obbligatori e i collegamenti prima di confermare."); }
    }
  }
  if (response.type === "structure_proposal" && (role.id !== "admin" || !role.permissions.editStructure || chatIntent(request) !== "structure")) throw new Error("La modifica richiede una richiesta esplicita di un Admin.");
  return response;
}

export async function requestChat(workspace: Workspace, message: string, history: { q: string; a: string }[], contextId?: string, token?: () => Promise<string>, fetcher: typeof fetch = fetch): Promise<ChatResponse> {
  try {
    const response = await fetcher("/.netlify/functions/nodus-ai", { method: "POST", signal: AbortSignal.timeout(26000), headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${await token()}` } : {}) }, body: JSON.stringify({ requestId: crypto.randomUUID(), message, history: history.slice(-6).map(turn => ({ q: turn.q.slice(0, 1000), a: turn.a.slice(0, 1000) })), contextId, mode: token ? "connected" : "demo", ...(token ? {} : { context: selectChatContext(workspace, message, contextId) }) }) });
    if ([401, 403, 429].includes(response.status)) {
      let reason: "rate_limit" | "forbidden" = response.status === 429 ? "rate_limit" : "forbidden";
      try { const parsed = chatErrorSchema.safeParse(await response.json()); if (parsed.success) reason = parsed.data.reason; } catch { /* Netlify may return an HTML 429. */ }
      throw new ChatRequestError(reason);
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("Unavailable");
    const raw = await response.text(); if (raw.length > 180000) throw new Error("Too large");
    return validateChatResponse(JSON.parse(raw), workspace, message);
  } catch (error) {
    if (error instanceof ChatRequestError) throw error;
    return validateChatResponse(await localChat(message, workspace, contextId), workspace, message);
  }
}
