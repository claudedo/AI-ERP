import { useMemo, useState } from "react";
import { Check, FileSpreadsheet, Upload, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { FieldType, Workspace } from "../types";
import {
  downloadText,
  executeImport,
  fieldIdFromHeader,
  inferFieldType,
  parseFile,
  previewImport,
  type ImportMapping,
  type ImportPlan,
  type ParsedSheet,
} from "../services/importExport";

const types: FieldType[] = [
  "text",
  "number",
  "currency",
  "date",
  "status",
  "select",
  "checkbox",
];
import { GuardedEditor } from "./ui/GuardedEditor";
type ImportProps = {
  workspace: Workspace;
  defaultEntityId?: string;
  onClose: () => void;
  onImport: (next: Workspace) => boolean;
};
export function ImportWizard(props: ImportProps) {
  return (
    <GuardedEditor onClose={props.onClose}>
      {(close, saved) => (
        <ImportWizardForm
          {...props}
          onClose={close}
          onImport={(next) => {
            const result = props.onImport(next);
            if (result) saved();
            return result;
          }}
        />
      )}
    </GuardedEditor>
  );
}
function ImportWizardForm({
  workspace,
  defaultEntityId,
  onClose,
  onImport,
}: ImportProps) {
  const [sheets, setSheets] = useState<ParsedSheet[]>([]),
    [sheetName, setSheetName] = useState(""),
    [fileName, setFileName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [entityId, setEntityId] = useState(defaultEntityId || ""),
    [newModuleName, setNewModuleName] = useState(""),
    [mappings, setMappings] = useState<ImportMapping[]>([]),
    [duplicateFieldId, setDuplicateFieldId] = useState("");
  const [step, setStep] = useState(0),
    [result, setResult] = useState<{
      accepted: number;
      skipped: number;
      issues: { row: number; reason: string }[];
    } | null>(null);
  const sheet = sheets.find((s) => s.name === sheetName) || sheets[0];
  const target = workspace.entities.find((e) => e.id === entityId);
  const plan: ImportPlan | null = sheet
    ? {
        sheet,
        entityId: entityId || undefined,
        newModuleName,
        mappings,
        duplicateFieldId:
          duplicateFieldId || mappings.find((m) => m.fieldId)?.fieldId || "",
        duplicateStrategy: "skip",
      }
    : null;
  const preview = useMemo(() => {
    if (!plan) return null;
    try {
      return { report: previewImport(plan, workspace), error: "" };
    } catch (cause) {
      return {
        report: null,
        error:
          cause instanceof Error ? cause.message : "Anteprima dell'importazione non riuscita.",
      };
    }
  }, [
    plan?.sheet,
    entityId,
    newModuleName,
    mappings,
    duplicateFieldId,
    workspace,
  ]);
  const load = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const parsed = await parseFile(file);
      setSheets(parsed);
      setSheetName(parsed[0]?.name || "");
      setFileName(file.name);
      setStep(1);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Impossibile aprire il file.",
      );
    } finally {
      setBusy(false);
    }
  };
  const prepareMapping = () => {
    if (!sheet) return;
    const used = new Set<string>();
    const next = sheet.headers.map((header, column) => {
      const inferred = inferFieldType(
        header,
        sheet.rows.map((row) => row[column] || ""),
      );
      const match = target?.fields.find(
        (field) =>
          field.name.toLowerCase() === header.toLowerCase() ||
          field.id === fieldIdFromHeader(header),
      );
      let fieldId = match?.id || "";
      if (!target) {
        const base = fieldIdFromHeader(header);
        let candidate = base,
          suffix = 2;
        while (used.has(candidate)) candidate = `${base}-${suffix++}`;
        fieldId = candidate;
        used.add(candidate);
      }
      return { column, fieldId, type: match?.type || inferred };
    });
    setMappings(next);
    setDuplicateFieldId(next.find((m) => m.fieldId)?.fieldId || "");
    setStep(2);
  };
  const commit = () => {
    if (!plan || !preview?.report || preview.report.accepted === 0) return;
    try {
      const imported = executeImport(plan, workspace);
      if (!onImport(imported.workspace))
        throw new Error(
          "Non è stato possibile salvare l'area di lavoro. Nessuna importazione è stata applicata.",
        );
      setResult({
        accepted: imported.report.accepted,
        skipped: imported.report.skipped,
        issues: imported.report.issues,
      });
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Importazione non riuscita.");
    }
  };
  const issuesCsv = result
    ? `row;reason\r\n${result.issues.map((issue) => `${issue.row};"${issue.reason.replace(/"/g, '""')}"`).join("\r\n")}`
    : "";
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="alert-overlay" />
        <Dialog.Content
          className="import-dialog"
          aria-describedby="import-description"
        >
          <header>
            <div>
              <Dialog.Title>Importa dati</Dialog.Title>
              <Dialog.Description id="import-description">
                CSV o Excel · suggerimenti locali deterministici · nessuna
                modifica ai dati prima della conferma
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Chiudi importazione">
                <X size={18} />
              </button>
            </Dialog.Close>
          </header>
          <div className="import-steps" aria-label="Avanzamento importazione">
            {["File", "Modulo", "Mappatura", "Revisione", "Risultato"].map(
              (name, index) => (
                <span
                  key={name}
                  className={
                    step === index ? "active" : step > index ? "done" : ""
                  }
                >
                  {index + 1}. {name}
                </span>
              ),
            )}
          </div>
          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
          {step === 0 && (
            <div className="import-body">
              <label className="import-drop">
                <Upload />
                <strong>Scegli un file CSV o XLSX</strong>
                <small>Fino a 10 MB. I file vengono elaborati in questo browser.</small>
                <input
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => void load(event.target.files?.[0])}
                />
              </label>
              {busy && <p role="status">Lettura del file…</p>}
            </div>
          )}
          {step === 1 && sheet && (
            <div className="import-body">
              <p>
                <FileSpreadsheet size={16} /> {fileName} · {sheet.rows.length}{" "}
                righe
              </p>
              {sheets.length > 1 && (
                <label>
                  Foglio
                  <select
                    value={sheetName}
                    onChange={(event) => setSheetName(event.target.value)}
                  >
                    {sheets.map((s) => (
                      <option key={s.name}>{s.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <div className="import-preview">
                <table>
                  <thead>
                    <tr>
                      {sheet.headers.map((header, i) => (
                        <th key={i}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 5).map((row, i) => (
                      <tr key={i}>
                        {sheet.headers.map((_, c) => (
                          <td key={c}>{row[c] || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="import-choice">
                <label>
                  Destinazione
                  <select
                    value={entityId}
                    onChange={(event) => setEntityId(event.target.value)}
                  >
                    <option value="">Nuovo modulo</option>
                    {workspace.entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
                {!entityId && (
                  <label>
                    Nome del nuovo modulo
                    <input
                      value={newModuleName}
                      onChange={(event) => setNewModuleName(event.target.value)}
                      placeholder="es. Magazzino"
                    />
                  </label>
                )}
              </div>
            </div>
          )}
          {step === 2 && sheet && (
            <div className="import-body">
              <p>
                Controlla le associazioni di colonna suggerite. Sono regole
                locali, non un modello di IA.
              </p>
              <div className="import-map">
                {mappings.map((mapping) => (
                  <div key={mapping.column}>
                    <strong>{sheet.headers[mapping.column]}</strong>
                    <select
                      aria-label={`Campo per ${sheet.headers[mapping.column]}`}
                      value={mapping.fieldId}
                      onChange={(event) =>
                        setMappings((current) =>
                          current.map((m) =>
                            m.column === mapping.column
                              ? {
                                  ...m,
                                  fieldId: event.target.value,
                                  type:
                                    target?.fields.find(
                                      (f) => f.id === event.target.value,
                                    )?.type || m.type,
                                }
                              : m,
                          ),
                        )
                      }
                    >
                      <option value="">Salta colonna</option>
                      {target ? (
                        target.fields.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))
                      ) : (
                        <option value={mapping.fieldId}>
                          {mapping.fieldId}
                        </option>
                      )}
                    </select>
                    <select
                      aria-label={`Tipo per ${sheet.headers[mapping.column]}`}
                      value={mapping.type}
                      disabled={Boolean(target)}
                      onChange={(event) =>
                        setMappings((current) =>
                          current.map((m) =>
                            m.column === mapping.column
                              ? { ...m, type: event.target.value as FieldType }
                              : m,
                          ),
                        )
                      }
                    >
                      {types.map((type) => (
                        <option key={type} value={type}>{({ text: "testo", number: "numero", currency: "valuta", date: "data", status: "stato", select: "selezione", checkbox: "casella" } as Record<string, string>)[type] ?? type}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <label>
                Campo per il controllo dei duplicati
                <select
                  value={duplicateFieldId}
                  onChange={(event) => setDuplicateFieldId(event.target.value)}
                >
                  {mappings
                    .filter((m) => m.fieldId)
                    .map((m) => (
                      <option key={m.column} value={m.fieldId}>
                        {target?.fields.find((f) => f.id === m.fieldId)?.name ||
                          sheet.headers[m.column]}
                      </option>
                    ))}
                </select>
              </label>
              <p className="import-note">
                I duplicati vengono saltati, mai sovrascritti.
              </p>
            </div>
          )}
          {step === 3 && preview && (
            <div className="import-body">
              <h3>Pronto per l'importazione</h3>
              {preview.error ? (
                <p role="alert">{preview.error}</p>
              ) : (
                preview.report && (
                  <>
                    <p>
                      <strong>{preview.report.accepted}</strong> righe valide ·{" "}
                      <strong>{preview.report.skipped}</strong> righe saltate ·{" "}
                      {plan?.entityId ? "modulo esistente" : "nuovo modulo"}
                    </p>
                    <p>
                      Con la conferma i record verranno salvati e verranno
                      eseguite le automazioni del browser applicabili.
                    </p>
                    {preview.report.issues.length > 0 && (
                      <div className="import-issues">
                        <strong>Righe da saltare</strong>
                        {preview.report.issues.slice(0, 30).map((issue) => (
                          <p key={issue.row}>
                            Riga {issue.row}: {issue.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                )
              )}
            </div>
          )}
          {step === 4 && result && (
            <div className="import-body import-finish">
              <Check />
              <h3>Importazione salvata</h3>
              <p>
                {result.accepted} record importati; {result.skipped} righe
                saltate.
              </p>
              {result.skipped > 0 && (
                <button
                  className="secondary"
                  onClick={() =>
                    downloadText(issuesCsv, "nodus-import-issues.csv")
                  }
                >
                  Scarica il report delle righe saltate
                </button>
              )}
            </div>
          )}
          <footer>
            {step > 0 && step < 4 && (
              <button
                className="secondary"
                onClick={() => {
                  setError("");
                  setStep(step - 1);
                }}
              >
                Indietro
              </button>
            )}
            <span />
            {step === 1 && (
              <button
                className="primary"
                onClick={prepareMapping}
                disabled={!entityId && !newModuleName.trim()}
              >
                Mappa le colonne
              </button>
            )}
            {step === 2 && (
              <button
                className="primary"
                onClick={() => {
                  setError("");
                  setStep(3);
                }}
                disabled={!mappings.some((m) => m.fieldId)}
              >
                Rivedi importazione
              </button>
            )}
            {step === 3 && (
              <button
                className="primary"
                onClick={commit}
                disabled={!preview?.report?.accepted}
              >
                Conferma importazione
              </button>
            )}
            {step === 4 && (
              <button className="primary" onClick={onClose}>
                Fatto
              </button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
