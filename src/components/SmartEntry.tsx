import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import type { DataRecord, Workspace } from "../types";
import {
  applyEntry,
  proposeEntry,
  entrySchema,
  type EntryProposal,
} from "../services/smartEntry";
import { useCloseGuard } from "./ui/useCloseGuard";
import { chatErrorMessage } from "../ai/chatLanguage";

export function SmartEntry({
  workspace,
  contextId,
  initialText = "",
  onApply,
  onClose,
  onBuilder,
  embedded = false,
  initialProposal,
  onDraftChange,
}: {
  workspace: Workspace;
  contextId?: string;
  initialText?: string;
  onApply: (proposal: EntryProposal) => boolean | Promise<boolean>;
  onClose: () => void;
  onBuilder: () => void;
  embedded?: boolean;
  initialProposal?: EntryProposal;
  onDraftChange?: (proposal: EntryProposal | null) => void;
}) {
  const key = `nodus-entry-${workspace.id}`;
  const [saved] = useState(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (!value || typeof value.text !== "string") return null;
      const parsed = entrySchema.safeParse(value.proposal);
      return {
        text: value.text,
        proposal: parsed.success ? parsed.data : null,
      };
    } catch {
      return null;
    }
  });
  const [text, setText] = useState(initialText || saved?.text || ""),
    [proposal, setProposal] = useState<EntryProposal | null>(
      initialProposal || (embedded ? null : saved?.proposal) || null,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [company, setCompany] = useState("");
  const lock = useRef(false);
  const needsCompany = !embedded || [proposal, initialProposal].some(p => p?.operations.some(op => op.entityId === "companies" || workspace.entities.find(e => e.id === op.entityId)?.fields.some(f => f.relationEntityId === "companies")));
  const guard = useCloseGuard(!embedded && Boolean(text || proposal), onClose);
  useEffect(() => { if (embedded && proposal) onDraftChange?.(proposal); }, [embedded, proposal, onDraftChange]);
  useEffect(() => {
    if (embedded) return;
    try {
      localStorage.setItem(key, JSON.stringify({ text, proposal }));
    } catch {
      setError("Bozza non salvata: memoria browser insufficiente.");
    }
  }, [text, proposal, key, embedded]);
  const generate = () => {
    try {
      const next = proposeEntry(text, workspace, contextId, new Date(), {
        company,
      });
      if (!next.questions.length && !next.builder && next.operations.length) {
        try {
          applyEntry(workspace, next, true);
        } catch (cause) {
          next.questions.push(
            chatErrorMessage(cause),
          );
        }
      }
      setProposal(next);
      setError("");
    } catch (cause) {
      setError(
        chatErrorMessage(cause),
      );
    }
  };
  const patch = (index: number, field: string, value: DataRecord[string]) =>
    setProposal((p) =>
      p
        ? {
            ...p,
            questions: [
              "Valori modificati: verifica valori e collegamenti prima di confermare.",
            ],
            operations: p.operations.map((op, i) =>
              i === index
                ? (() => {
                    const record = { ...op.record, [field]: value };
                    if (
                      ["units", "unitPrice"].includes(field) &&
                      typeof record.units === "number" &&
                      typeof record.unitPrice === "number" &&
                      workspace.entities
                        .find((e) => e.id === op.entityId)
                        ?.fields.some(
                          (f) => f.id === "value" && f.type === "currency",
                        )
                    )
                      record.value =
                        Math.round(record.units * record.unitPrice * 100) / 100;
                    return { ...op, record };
                  })()
                : op,
            ),
          }
        : p,
    );
  const recheck = () => {
    if (!proposal) return;
    try {
      const next = { ...proposal, questions: [], builder: false };
      applyEntry(workspace, next, true);
      setProposal(next);
      setError("");
    } catch (cause) {
      setError(
        chatErrorMessage(cause),
      );
    }
  };
  const confirm = async () => {
    if (!proposal || lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      if (await onApply(proposal)) {
        localStorage.removeItem(key);
        if (embedded) onClose();
        else guard.finish();
      } else setError("Salvataggio non riuscito. La proposta è conservata.");
    } catch (cause) {
      setError(
        chatErrorMessage(cause),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const content = <>
          {!embedded && (
            <header>
              <div>
                <Dialog.Title>Inserisci con AI</Dialog.Title>
                <Dialog.Description id="entry-description">
                  Interprete locale a regole: aziende, sedi, contatti, ordini e
                  aggiornamenti espliciti. Nessun dato viene salvato prima della
                  conferma.
                </Dialog.Description>
              </div>
              <button
                aria-label="Chiudi inserimento"
                onClick={guard.requestClose}
              >
                ×
              </button>
            </header>
          )}
            <div className="workflow-editor-fields">
              {!embedded && <>
              <label>
                Testo, email o dati da inserire
                <textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setProposal(null);
                  }}
                  rows={5}
                />
              </label>
              </>}
              {needsCompany && <label>
                Azienda di riferimento (per omonimie)
                <select
                  value={company}
                  onChange={(e) => {
                    setCompany(e.target.value);
                    setProposal(null);
                  }}
                >
                  <option value="">Riconosci dal testo</option>
                  {workspace.entities
                    .find((e) => e.id === "companies")
                    ?.records.map((r) => (
                      <option key={r.id} value={r.id}>
                        {String(r.name || r.id)} · {String(r.vat || r.id)}
                      </option>
                    ))}
                </select>
              </label>}
              <button
                className="primary"
                disabled={!text.trim() || busy}
                onClick={generate}
              >
                Prepara proposta
              </button>
              {proposal && (
                <>
                  <p role="status">
                    Anteprima modificabile · {proposal.operations.length}{" "}
                    operazioni · revisione {proposal.baseRevision}
                  </p>
                  {proposal.questions.map((q) => (
                    <p key={q} role="alert">
                      {q}
                    </p>
                  ))}
                  {proposal.builder && (
                    <button
                      className="secondary"
                      onClick={() => {
                        if (!embedded) guard.finish();
                        onBuilder();
                      }}
                    >
                      {embedded ? "Richiedi una modifica allo schema" : "Apri Builder per adattare lo schema"}
                    </button>
                  )}
                  {proposal.operations.map((op, index) => {
                    const entity = workspace.entities.find(
                      (e) => e.id === op.entityId,
                    );
                    return (
                      <fieldset key={`${op.entityId}-${op.record.id}`} disabled={busy}>
                        <legend>
                          {op.kind === "create" ? "Crea" : "Aggiorna"} ·{" "}
                          {entity?.name}
                          {op.kind === "update" ? ` · ${op.record.id}` : ""}
                        </legend>
                        {entity?.fields
                          .filter((f) => f.id !== "legacyDetails" && !f.formula)
                          .map((f) => (
                            <label key={f.id}>
                              {f.name}
                              {f.required ? " *" : ""}
                              {f.type === "relation" ? (
                                <select
                                  aria-label={f.name}
                                  value={String(op.record[f.id] || "")}
                                  onChange={(e) =>
                                    patch(index, f.id, e.target.value)
                                  }
                                >
                                  <option value="">Scegli record</option>
                                  {[
                                    ...(workspace.entities.find(
                                      (e) => e.id === f.relationEntityId,
                                    )?.records || []),
                                    ...proposal.operations
                                      .filter(
                                        (o) =>
                                          o.entityId === f.relationEntityId &&
                                          o.kind === "create",
                                      )
                                      .map((o) => o.record),
                                  ].map((r) => (
                                    <option
                                      key={String(r.id)}
                                      value={String(r.id)}
                                    >
                                      {String(r.name || r.orderNo || r.id)}
                                      {` · ${r.id}`}
                                      {proposal.operations.some(
                                        (o) => o.record.id === r.id,
                                      )
                                        ? " (proposto)"
                                        : ""}
                                    </option>
                                  ))}
                                </select>
                              ) : f.options ? (
                                <select
                                  aria-label={f.name}
                                  value={String(op.record[f.id] || "")}
                                  onChange={(e) =>
                                    patch(index, f.id, e.target.value)
                                  }
                                >
                                  <option value="">Non specificato</option>
                                  {f.options.map((v) => (
                                    <option key={v}>{v}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  aria-label={f.name}
                                  type={
                                    f.type === "checkbox"
                                      ? "checkbox"
                                      : f.type === "date"
                                        ? "date"
                                        : ["number", "currency"].includes(
                                              f.type,
                                            )
                                          ? "number"
                                          : "text"
                                  }
                                  checked={
                                    f.type === "checkbox"
                                      ? !!op.record[f.id]
                                      : undefined
                                  }
                                  value={
                                    f.type === "checkbox"
                                      ? undefined
                                      : String(op.record[f.id] ?? "")
                                  }
                                  onChange={(e) =>
                                    patch(
                                      index,
                                      f.id,
                                      f.type === "checkbox"
                                        ? e.target.checked
                                        : ["number", "currency"].includes(
                                              f.type,
                                            ) && e.target.value !== ""
                                          ? Number(e.target.value)
                                          : e.target.value,
                                    )
                                  }
                                />
                              )}
                            </label>
                          ))}
                        <button
                          className="danger-button"
                          onClick={() =>
                            setProposal({
                              ...proposal,
                              operations: proposal.operations.filter(
                                (_, i) => i !== index,
                              ),
                            })
                          }
                        >
                          Rimuovi dalla proposta
                        </button>
                      </fieldset>
                    );
                  })}
                  <button
                    className="secondary"
                    onClick={recheck}
                    disabled={!proposal.operations.length}
                  >
                    Verifica valori e collegamenti
                  </button>
                </>
              )}
              {error && (
                <p role="alert" className="field-error">
                  {error}
                </p>
              )}
            </div>
            <footer>
              <button className="secondary" disabled={busy} onClick={embedded ? onClose : guard.requestClose}>
                Annulla
              </button>
              <button
                className="primary"
                disabled={
                  busy ||
                  !proposal?.operations.length ||
                  !!proposal.questions.length ||
                  proposal.builder
                }
                onClick={() => void confirm()}
              >
                {busy ? "Salvataggio…" : embedded ? "Conferma" : "Conferma e salva"}
              </button>
            </footer>
          </>;
  if (embedded) return <section className="smart-entry ai-entry-preview" aria-label="Proposta dati">{content}</section>;
  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && guard.requestClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="smart-entry workflow-editor" aria-describedby="entry-description">{content}</Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {guard.confirmation}
    </>
  );
}
