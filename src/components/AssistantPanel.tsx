import { useEffect, useState } from "react";
import { Check, Command, GitBranch, Info, Search, X } from "lucide-react";
import { Dialog, Tabs } from "radix-ui";
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

export function AssistantPanel({
  initialMode = "operator",
  workspace,
  setWorkspace,
  canBuild,
  setActiveEntity,
  setDelayedOnly,
  onOpenResult,
  onClose,
  onToast,
  onSmartEntry,
}: {
  initialMode?: "operator" | "builder";
  workspace: Workspace;
  setWorkspace: (w: Workspace) => boolean;
  canBuild: boolean;
  setActiveEntity: (id: string) => void;
  setDelayedOnly: (v: boolean) => void;
  onOpenResult: (entityId: string, recordId: string) => void;
  onClose: () => void;
  onToast: (m: string, error?: boolean) => void;
  onSmartEntry?: (text: string) => void;
}) {
  const conversationKey = `nodus-conversation-${workspace.id}-${initialMode}`;
  const [conversation] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(conversationKey) || "null");
      return {
        input: typeof value?.input === "string" ? value.input : "",
        messages: Array.isArray(value?.messages)
          ? value.messages
              .filter(
                (m: unknown) =>
                  !!m &&
                  typeof m === "object" &&
                  "q" in m &&
                  typeof m.q === "string" &&
                  "a" in m &&
                  typeof m.a === "string",
              )
              .slice(-30)
              .map((m: { q: string; a: string }) => ({ q: m.q, a: m.a }))
          : [],
      };
    } catch {
      return { input: "", messages: [] };
    }
  });
  const [conversationError, setConversationError] = useState("");
  const [mode, setMode] = useState<"operator" | "builder">(
    initialMode === "builder" && canBuild ? "builder" : "operator",
  );
  const [input, setInput] = useState(conversation.input);
  const [messages, setMessages] = useState<
    { q: string; a: string; result?: OperatorResult }[]
  >(conversation.messages);
  useEffect(() => {
    try {
      localStorage.setItem(
        conversationKey,
        JSON.stringify({ input, messages: messages.slice(-30) }),
      );
    } catch {
      setConversationError(
        "Conversazione non salvata: memoria browser insufficiente.",
      );
    }
  }, [input, messages, conversationKey]);
  const [proposal, setProposal] = useState<ChangeProposal | null>(null);
  const suggestions =
    mode === "builder"
      ? [
          "Add a Priority field to Orders",
          "Create a Quality Control module",
          "Add an approval workflow for orders above €20,000",
          "Create a Suppliers module with name, country, payment terms and status",
          "Add a relation between Orders and Customers",
          "Add a status to Orders",
          "Create a view for Orders",
        ]
      : [
          "Show me delayed orders",
          "What needs attention today?",
          "What do I need to approve?",
          "Which tasks are assigned to me?",
          "Summarize orders by customer",
        ];
  const run = (text = input) => {
    if (!text.trim()) return;
    if (
      mode === "operator" &&
      onSmartEntry &&
      /\b(crea|aggiungi|inserisci|registra|sposta|aggiorna|cambiato|modifica|create|add)\b/i.test(
        text,
      )
    ) {
      try {
        requirePermission(workspace, "editRecords");
        try {
          localStorage.setItem(
            conversationKey,
            JSON.stringify({
              input: "",
              messages: [
                ...messages,
                {
                  q: text,
                  a: "Proposta aperta in Inserisci con AI: verifica e conferma i dati prima del salvataggio.",
                },
              ].slice(-30),
            }),
          );
        } catch {
          onToast("Conversazione non salvata nel browser.", true);
        }
        onSmartEntry(text);
      } catch {
        onToast("Il tuo ruolo consente solo la consultazione dei dati.", true);
      }
      return;
    }
    const action = interpretCommand(text, mode);
    let answer =
        "I couldn’t match that request yet. Try one of the suggested commands.",
      result: OperatorResult | undefined;
    if (mode === "builder") {
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
    setMessages((m) => [...m, { q: text, a: answer, result }]);
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
  const switchMode = (value: string) => {
    const next = value as "operator" | "builder";
    setMode(next);
    setProposal(null);
  };
  const guard = useCloseGuard(!!input.trim() || !!proposal, onClose);
  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && guard.requestClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="assistant-overlay" />
          <Dialog.Content
            className="assistant-panel"
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
                    Your connected workspace
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button aria-label="Close">
                  <X />
                </button>
              </Dialog.Close>
            </header>
            <Tabs.Root value={mode} onValueChange={switchMode}>
              <Tabs.List className="mode-switch" aria-label="AI mode">
                <Tabs.Trigger value="operator">
                  <Search />
                  Operator<small>Use your data</small>
                </Tabs.Trigger>
                <Tabs.Trigger value="builder" disabled={!canBuild}>
                  <GitBranch />
                  Builder
                  <small>
                    {canBuild ? "Change your system" : "Admin only"}
                  </small>
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs.Root>
            <div className="assistant-content">
              {conversationError && <p role="alert">{conversationError}</p>}
              <div className="assistant-capability">
                Local rules engine · no external AI service connected
              </div>
              <div className="ai-message">
                <span>
                  <NodusLogo variant="mark" />
                </span>
                <p>
                  {mode === "operator"
                    ? "Ask about records, exceptions and daily operations."
                    : "Describe a change. I’ll show a proposal before anything is applied."}
                </p>
              </div>
              {messages.map((m, i) => (
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
              ))}
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
              {messages.length === 0 && !proposal && (
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
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    run();
                  }
                }}
                placeholder={
                  mode === "builder"
                    ? "Describe a workspace change..."
                    : "Ask about your business..."
                }
              />
              <div>
                <span>
                  <Command />
                  Enter to send
                </span>
                <button
                  aria-label="Invia messaggio"
                  onClick={() => run()}
                  disabled={!input.trim()}
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
