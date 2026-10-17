import { useEffect, useRef, useState } from "react";
import { Check, Command, GitBranch, Info, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { SmartEntry } from "./SmartEntry";
import { applyEntry, proposeEntry, type EntryProposal } from "../services/smartEntry";
import type { ChangeProposal, Workspace } from "../types";
import {
  applyProposal,
  createProposal,
  getProposalInapplicability,
  interpretCommand,
} from "../services/aiEngine";
import { NodusLogo } from "./NodusLogo";
import {
  answerOperator,
  type OperatorResult,
} from "../services/operatorEngine";
import { requirePermission } from "../services/workspaceDomain";
import { useCloseGuard } from "./ui/useCloseGuard";
import { chatIntent, loadConversation } from "../services/nodusChat";

export function AssistantPanel({
  workspace,
  setWorkspace,
  canBuild,
  setActiveEntity,
  setDelayedOnly,
  onOpenResult,
  onClose,
  onToast,
  contextId,
  onApplyEntry,
}: {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => boolean;
  canBuild: boolean;
  setActiveEntity: (id: string) => void;
  setDelayedOnly: (v: boolean) => void;
  onOpenResult: (entityId: string, recordId: string) => void;
  onClose: () => void;
  onToast: (m: string, error?: boolean) => void;
  contextId?: string;
  onApplyEntry?: (proposal: EntryProposal) => boolean | Promise<boolean>;
}) {
  const conversationKey = `nodus-ai-${workspace.id}`;
  const [conversation] = useState(() => loadConversation(localStorage, workspace.id));
  const [conversationError, setConversationError] = useState("");
  const [entry, setEntry] = useState<EntryProposal | null>(conversation.entry);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState(conversation.input);
  const [messages, setMessages] = useState<
    { q: string; a: string; result?: OperatorResult }[]
  >(conversation.messages);
  useEffect(() => {
    try {
      localStorage.setItem(
        conversationKey,
        JSON.stringify({ input, messages: messages.slice(-30), entry }),
      );
    } catch {
      setConversationError(
        "Conversazione non salvata: memoria browser insufficiente.",
      );
    }
  }, [input, messages, conversationKey, entry]);
  const [proposal, setProposal] = useState<ChangeProposal | null>(null);
  const suggestions = [ ...(canBuild ? [
          "Add a Priority field to Orders",
          "Create a Quality Control module",
          "Add an approval workflow for orders above €20,000",
          "Create a Suppliers module with name, country, payment terms and status",
          "Add a relation between Orders and Customers",
          "Add a status to Orders",
          "Create a view for Orders",
        ] : []), ...[
          "Show me delayed orders",
          "What needs attention today?",
          "What do I need to approve?",
          "Which tasks are assigned to me?",
          "Summarize orders by customer",
        ]];
  const run = (text = input) => {
    if (!text.trim() || proposal || (entry && !entry.questions.length && !entry.builder)) return;
    const intent = chatIntent(text);
    const structure = intent === "structure";
    if (entry && structure) {
      setConversationError("Annulla la proposta dati prima di preparare una modifica alla struttura.");
      return;
    }
    setConversationError("");
    const request = entry ? `${entry.request}\n${text}` : text;
    const candidate = structure ? null : proposeEntry(request, workspace, contextId);
    if (!structure && (entry || intent === "records" || candidate?.operations.length)) {
      try {
        requirePermission(workspace, "editRecords");
        setEntry(candidate);
        setMessages(m => [...m, { q: text, a: "Ho preparato una proposta qui nella chat. Verifica i valori e conferma: nessun dato è ancora stato salvato." }]);
        setInput("");
      } catch {
        onToast("Il tuo ruolo consente solo la consultazione dei dati.", true);
      }
      return;
    }
    const action = interpretCommand(text, structure ? "builder" : "operator");
    let answer =
        "I couldn’t match that request yet. Try one of the suggested commands.",
      result: OperatorResult | undefined;
    if (structure) {
      if (!canBuild) {
        answer =
          "Your current role can use business data, but only an Admin can change workspace structure.";
      } else {
        const p = createProposal(action, workspace);
        if (p) {
          setProposal(p);
          answer =
            "I prepared a change proposal. Review its scope before confirming.";
        } else {
          const reason = getProposalInapplicability(action, workspace);
          if (reason)
            answer = `This change doesn't apply to this workspace: ${reason}`;
        }
      }
    } else {
      result = answerOperator(action, workspace);
      answer = result.answer;
    }
    setMessages((m) => [...m.slice(-29), { q: text, a: answer, result }]);
    setInput("");
  };
  const confirm = () => {
    if (!proposal) return;
    try {
      requirePermission(workspace, "editStructure");
      const reason = getProposalInapplicability(
        { type: proposal.action, mode: "builder", command: proposal.command },
        workspace,
      );
      if (reason || proposal.baseRevision !== (workspace.revision || 0)) {
        setMessages((m) => [
          ...m,
          {
            q: "Change not applied",
            a:
              reason ||
              "The workspace changed after this proposal. Create a fresh proposal.",
          },
        ]);
        setProposal(null);
        return;
      }
      const next = applyProposal(workspace, proposal);
      if (next === workspace || !setWorkspace(next)) {
        onToast("Change could not be saved.", true);
        return;
      }
      setMessages((m) => [
        ...m,
        {
          q: "Change confirmed",
          a: `Done. ${proposal.title} is now active and saved to change history.`,
        },
      ]);
      onToast(`${proposal.title} applied`);
      setProposal(null);
    } catch (error) {
      onToast(
        error instanceof Error ? error.message : "Change could not be applied.",
        true,
      );
    }
  };
  const cancel = () => {
    if (!proposal) return;
    if (
      !setWorkspace({
        ...workspace,
        changeHistory: [
          {
            id: `change-${crypto.randomUUID()}`,
            at: new Date().toISOString(),
            userId: workspace.currentUserId,
            command: proposal.command,
            summary: proposal.title,
            status: "cancelled",
            affectedEntityIds: proposal.affectedEntityIds,
          },
          ...workspace.changeHistory,
        ],
      })
    ) {
      onToast("Cancellation history could not be saved.", true);
      return;
    }
    setMessages((m) => [
      ...m,
      {
        q: "Change cancelled",
        a: "No workspace data or structure was changed.",
      },
    ]);
    setProposal(null);
  };
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, entry, proposal]);
  const guard = useCloseGuard(!!input.trim() || !!proposal || !!entry, onClose);
  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && guard.requestClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="assistant-overlay" />
          <Dialog.Content
            className="assistant-panel unified-ai"
            aria-describedby="assistant-description"
            onCloseAutoFocus={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement)
                .querySelector("textarea")
                ?.focus();
            }}
          >
            <header>
              <div>
                <span>
                  <NodusLogo variant="mark" />
                </span>
                <div>
                  <Dialog.Title>NODUS AI</Dialog.Title>
                  <Dialog.Description id="assistant-description">
                    Una conversazione per tutto il workspace
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button aria-label="Close">
                  <X />
                </button>
              </Dialog.Close>
            </header>
            <div className="assistant-content" ref={scrollRef}>
              {conversationError && <p role="alert">{conversationError}</p>}
              <div className="assistant-capability">
                Demo locale a regole · modello esterno non attivo
              </div>
              <div className="ai-message">
                <span>
                  <NodusLogo variant="mark" />
                </span>
                <p>
                  Chiedimi informazioni, incolla dati da inserire o descrivi una modifica al gestionale. Le proposte restano nella stessa conversazione.
                </p>
              </div>
              <div role="log" aria-label="Conversazione NODUS AI" aria-live="polite">{messages.map((m, i) => (
                <div className="conversation" key={i}>
                  <div className="user-message">{m.q}</div>
                  <div className="ai-message">
                    <span>
                      <NodusLogo variant="mark" />
                    </span>
                    <p>{m.a}</p>
                  </div>
                  {m.result && (
                    <div className="operator-evidence">
                      <small>
                        Criteria: {m.result.criteria} · {m.result.count} records
                      </small>
                      {m.result.records.slice(0, 10).map((record) => (
                        <button
                          key={`${record.entityId}:${record.recordId}`}
                          onClick={() =>
                            onOpenResult(record.entityId, record.recordId)
                          }
                        >
                          {record.label} ↗
                        </button>
                      ))}
                      {interpretCommand(m.q, "operator").type ===
                        "filter-delayed" &&
                        workspace.entities.some((e) =>
                          /orders/i.test(e.name),
                        ) && (
                          <button
                            onClick={() => {
                              const order = workspace.entities.find((e) =>
                                /orders/i.test(e.name),
                              )!;
                              setActiveEntity(order.id);
                              setDelayedOnly(true);
                            }}
                          >
                            Apply delayed-order filter →
                          </button>
                        )}
                    </div>
                  )}
                </div>
              ))}</div>
              {entry && <SmartEntry key={entry.id} embedded workspace={workspace} contextId={contextId} initialText={entry.request} initialProposal={entry} onDraftChange={setEntry} onClose={() => setEntry(null)} onBuilder={() => {
                setEntry(null);
                setMessages(m => [...m, { q: "Modifica dello schema", a: "Proposta dati annullata senza salvare. Descrivi qui i moduli o campi da aggiungere." }]);
              }} onApply={async next => {
                const ok = onApplyEntry ? await onApplyEntry(next) : setWorkspace(applyEntry(workspace, next));
                if (ok) { setMessages(m => [...m, { q: "Proposta confermata", a: "Dati salvati. Puoi continuare qui nella stessa conversazione." }]); onToast("Dati salvati"); }
                return ok;
              }} />}
              {proposal && (
                <div className="proposal-card">
                  <div className="proposal-label">
                    <GitBranch />
                    CHANGE PREVIEW
                  </div>
                  <h3>{proposal.title}</h3>
                  <p>{proposal.summary}</p>
                  <div className="proposal-scope">
                    <small>Request: {proposal.command}</small>
                    <small>
                      Scope: {proposal.affectedEntityIds.join(", ")}
                    </small>
                    <small>Workspace revision: {proposal.baseRevision}</small>
                  </div>
                  <ul>
                    {proposal.details.map((d) => (
                      <li key={d}>
                        <Check />
                        {d}
                      </li>
                    ))}
                  </ul>
                  <div className="proposal-impact">
                    <Info />
                    <span>
                      <strong>Impact</strong>
                      {proposal.impact}
                    </span>
                  </div>
                  <div className="proposal-actions">
                    <button className="secondary" onClick={cancel}>
                      Cancel
                    </button>
                    <button className="primary" onClick={confirm}>
                      Confirm change
                    </button>
                  </div>
                </div>
              )}
              {messages.length === 0 && !proposal && !entry && (
                <div className="prompt-list">
                  <label>TRY ASKING</label>
                  {suggestions.map((s) => (
                    <button key={s} onClick={() => run(s)}>
                      {s}
                      <span>↗</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="assistant-input">
              <textarea
                aria-label="Messaggio per NODUS AI"
                value={input}
                maxLength={10000}
                disabled={!!proposal || (!!entry && !entry.questions.length && !entry.builder)}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    run();
                  }
                }}
                placeholder={proposal || (entry && !entry.questions.length && !entry.builder) ? "Conferma o annulla la proposta per continuare" : entry ? "Aggiungi i dettagli mancanti alla richiesta…" : "Fai una domanda, inserisci dati o descrivi una modifica…"}
              />
              <div>
                <span>
                  <Command />
                  Enter to send
                </span>
                <button
                  aria-label="Invia messaggio"
                  onClick={() => run()}
                  disabled={!input.trim() || !!proposal || (!!entry && !entry.questions.length && !entry.builder)}
                >
                  ↑
                </button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {guard.confirmation}
    </>
  );
}
