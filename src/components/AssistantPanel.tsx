import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowUpRight, CornerDownLeft, GitBranch, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { Workspace } from "../types";
import { SmartEntry } from "./SmartEntry";
import { NodusLogo } from "./NodusLogo";
import { useCloseGuard } from "./ui/useCloseGuard";
import { applyEntry, type EntryProposal } from "../services/smartEntry";
import { loadConversation } from "../services/nodusChat";
import { currentRole, requirePermission } from "../services/workspaceDomain";
import { publishConfiguration, proposalSchema, stageProposal, type StructuredProposal } from "../services/configuration";
import { ChatRequestError, requestChat } from "../ai/chatClient";
import { executeChatQuery } from "../ai/chatQueries";
import type { OperatorResult } from "../services/operatorEngine";
import { StructureOperations } from "./StructureOperations";
import { reviewStructure } from "../services/structureReview";
import { chatErrorMessage } from "../ai/chatLanguage";

type Message = { q: string; a: string; result?: OperatorResult };
export function AssistantPanel({ workspace, setWorkspace, canBuild, onOpenResult, onClose, onToast, contextId, onApplyEntry, onApplyStructure, token }: {
  workspace: Workspace; setWorkspace: (w: Workspace) => boolean; canBuild: boolean;
  setActiveEntity: (id: string) => void; setDelayedOnly: (v: boolean) => void;
  onOpenResult: (entityId: string, recordId: string) => void; onClose: () => void;
  onToast: (message: string, error?: boolean) => void; contextId?: string;
  onApplyEntry?: (proposal: EntryProposal) => boolean | Promise<boolean>;
  onApplyStructure?: (proposal: StructuredProposal) => boolean | Promise<boolean>;
  token?: () => Promise<string>;
}) {
  const key = `nodus-ai-${workspace.id}`;
  const [saved] = useState(() => loadConversation(localStorage, workspace.id, workspace));
  const [messages, setMessages] = useState<Message[]>(saved.messages), [input, setInput] = useState(saved.input);
  const [entry, setEntry] = useState<EntryProposal | null>(saved.entry);
  const [structure, setStructure] = useState<StructuredProposal | null>(() => {
    try { const p = proposalSchema.safeParse(JSON.parse(localStorage.getItem(key) || "null")?.structure); return p.success ? p.data : null; } catch { return null; }
  });
  const [clarification, setClarification] = useState("");
  const [excluded, setExcluded] = useState<string[]>(() => {
    try { const value = JSON.parse(localStorage.getItem(key) || "null")?.structureExcluded; return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; } catch { return []; }
  });
  const reviewed = useMemo(() => {
    if (!structure) return null;
    try { return reviewStructure(workspace, structure, excluded); } catch { return null; }
  }, [workspace, structure, excluded]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [source, setSource] = useState<"openai" | "local" | null>(null);
  const lock = useRef(false), alive = useRef(true), scrollRef = useRef<HTMLDivElement>(null);
  const role = currentRole(workspace), pending = !!structure || !!entry;
  const canClarify = !!entry && (!!entry.questions.length || entry.builder) || !!structure?.ambiguities.length;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify({ input, messages: messages.slice(-30), entry, structure, structureExcluded: excluded })); }
    catch { setError("Conversazione non salvata: memoria del browser insufficiente."); }
  }, [input, messages, entry, structure, excluded, key]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, entry, structure, busy]);
  const append = (q: string, a: string, result?: OperatorResult) => setMessages(m => [...m.slice(-29), { q, a, result }]);
  const guard = useCloseGuard(!!input.trim() || pending || busy, onClose);
  const run = async (text = input) => {
    if (!text.trim() || lock.current || (pending && !canClarify)) return;
    const request = [entry?.request || structure?.request || clarification, text].filter(Boolean).join("\n");
    if (request.length > 6000) { setError("La richiesta è troppo lunga. Riassumi i dettagli prima di inviare."); return; }
    lock.current = true; setBusy(true); setError("");
    try {
      const reply = await requestChat(workspace, request, messages, contextId, token);
      if (!alive.current) return;
      setSource(reply.source);
      if (reply.type === "query_results") {
        const result = executeChatQuery(workspace, reply.query);
        append(text, result.answer, result); setClarification(""); setEntry(null);
      } else {
        append(text, reply.message + (reply.type === "clarification" ? "\n" + reply.questions.filter(q => q !== reply.message).join("\n") + (reply.extracted.length ? "\n" + reply.extracted.map(v => `${v.label}: ${typeof v.value === "number" ? v.value.toLocaleString("it-IT") : v.value}`).join(" · ") : "") : ""));
        if (reply.type === "entry_proposal" || reply.type === "update_proposal") { setEntry(reply.proposal); setStructure(null); setClarification(""); }
        else if (reply.type === "structure_proposal") { setStructure(reply.proposal); setExcluded([]); setEntry(null); setClarification(""); }
        else if (reply.type === "clarification") { setClarification(request); setEntry(null); setStructure(null); }
        else { setClarification(""); }
      }
      setInput("");
    } catch (cause) { if (alive.current) { setSource(null); setError(cause instanceof ChatRequestError ? cause.message : chatErrorMessage(cause)); } }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const confirmStructure = async () => {
    if (!structure || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      requirePermission(workspace, "editStructure");
      if (role.id !== "admin") throw new Error("Serve il ruolo di amministratore");
      const selected = reviewStructure(workspace, structure, excluded);
      const ok = onApplyStructure ? await onApplyStructure(selected) : setWorkspace(publishConfiguration(stageProposal(workspace, selected)));
      if (!ok) throw new Error("Salvataggio non riuscito");
      append("Proposta confermata", "Struttura aggiornata e salvata nella cronologia del gestionale.");
      setStructure(null); onToast("Struttura aggiornata");
    } catch (cause) { setError(chatErrorMessage(cause)); }
    finally { lock.current = false; setBusy(false); }
  };
  const suggestions = ["Cosa richiede attenzione oggi?", ...(workspace.entities.some(e => /order|ordin/i.test(e.name)) ? ["Quali ordini sono in ritardo?"] : []), ...(canBuild && role.id === "admin" ? ["Crea un modulo Controllo qualità con nome, esito e data"] : [])];
  return <><Dialog.Root open onOpenChange={open => !open && guard.requestClose()}><Dialog.Portal>
    <Dialog.Overlay className="assistant-overlay" />
    <Dialog.Content className="assistant-panel unified-ai" aria-describedby="assistant-description" onCloseAutoFocus={e => e.preventDefault()} onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).querySelector("textarea")?.focus(); }}>
      <header><div><span><NodusLogo variant="mark" /></span><div><Dialog.Title>NODUS AI</Dialog.Title><Dialog.Description id="assistant-description">Una conversazione per tutto il workspace</Dialog.Description></div></div><button aria-label="Chiudi NODUS AI" onClick={guard.requestClose}><X /></button></header>
      <div className="assistant-content" ref={scrollRef} aria-busy={busy}>
        <div className="assistant-capability" role="status">{source === "openai" ? "NODUS AI connesso" : source === "local" ? "Modalità locale temporanea" : "NODUS AI · modifiche solo dopo conferma"}</div>
        {!messages.length && <div className="ai-message"><span><NodusLogo variant="mark" /></span><p>Chiedimi informazioni, incolla dati da inserire o descrivi una modifica al gestionale. Le proposte restano qui, nella stessa conversazione.</p></div>}
        <div role="log" aria-label="Conversazione NODUS AI" aria-live="polite" aria-relevant="additions text">{messages.map((m, i) => <div className="conversation" key={i}><div className="user-message">{m.q}</div><div className="ai-message"><span><NodusLogo variant="mark" /></span><p>{m.a}</p></div>{m.result && <div className="operator-evidence"><small>Criteri: {m.result.criteria} · {m.result.count} record</small>{m.result.records.slice(0, 10).map(record => <button key={`${record.entityId}:${record.recordId}`} onClick={() => onOpenResult(record.entityId, record.recordId)}>Apri record · {record.label} ↗</button>)}</div>}</div>)}</div>
        {entry && <SmartEntry key={entry.id} embedded workspace={workspace} contextId={contextId} initialText={entry.request} initialProposal={entry} onDraftChange={setEntry} onClose={() => setEntry(null)} onBuilder={() => { setEntry(null); append("Modifica dello schema", "Proposta dati annullata senza salvare. Descrivi i moduli o campi da aggiungere."); }} onApply={async next => {
          requirePermission(workspace, "editRecords");
          const ok = onApplyEntry ? await onApplyEntry(next) : setWorkspace(applyEntry(workspace, next));
          if (ok) { append("Proposta confermata", "Dati salvati. Dashboard e cronologia sono aggiornate; puoi continuare qui."); onToast("Dati salvati"); }
          return ok;
        }} />}
        {structure && <section className="proposal-card"><div className="proposal-label"><GitBranch />PROPOSTA STRUTTURA</div><h3>{structure.interpretation}</h3><p>{structure.impact}</p><p>{reviewed?.operations.length || 0} modifiche selezionate · revisione {structure.baseRevision}</p><StructureOperations proposal={structure} workspace={workspace} excluded={excluded} disabled={busy} onToggle={key => setExcluded(previous => previous.includes(key) ? previous.filter(item => item !== key) : [...previous, key])} />{structure.ambiguities.map(question => <p role="alert" key={question}>{question}</p>)}{!reviewed && !structure.ambiguities.length && <p role="alert">Seleziona almeno un’operazione valida. Controlla dipendenze e revisione del workspace.</p>}<div className="proposal-actions"><button className="secondary" disabled={busy} onClick={() => { setStructure(null); append("Proposta annullata", "Nessuna modifica applicata."); }}>Annulla</button><button className="primary" disabled={busy || !reviewed || !!structure.ambiguities.length || role.id !== "admin"} onClick={() => void confirmStructure()}>Conferma</button></div></section>}
        {busy && <p role="status">NODUS AI sta elaborando…</p>}
        {error && <div role="alert" className="field-error"><p>{error}</p>{input.trim() && <button className="secondary" disabled={busy} onClick={() => void run()}>Riprova</button>}</div>}
        {!messages.length && !pending && <div className="prompt-list"><label>PROVA A CHIEDERE</label>{suggestions.map(s => <button key={s} disabled={busy} onClick={() => void run(s)}>{s}<ArrowUpRight aria-hidden="true" /></button>)}</div>}
      </div>
      <div className="assistant-input"><textarea aria-label="Messaggio per NODUS AI" value={input} maxLength={6000} disabled={busy || (pending && !canClarify)} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void run(); } }} placeholder={pending && !canClarify ? "Conferma o annulla la proposta per continuare" : "Fai una domanda, inserisci dati o descrivi una modifica…"} /><div><span><CornerDownLeft aria-hidden="true" />Invio per inviare · ⇧ Invio a capo</span><button aria-label="Invia messaggio" disabled={!input.trim() || busy || (pending && !canClarify)} onClick={() => void run()}><ArrowUp aria-hidden="true" /></button></div></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>{guard.confirmation}</>;
}
