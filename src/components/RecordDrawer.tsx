import { useRef, useState } from "react";
import { AlertTriangle, Trash2, X } from "lucide-react";
import { AlertDialog, Dialog } from "radix-ui";
import type { DataRecord, Entity, Field, Workspace } from "../types";
import { Select } from "./ui/Select";
import { RecordDetails } from "./RecordDetails";
import { newId, validateRecord } from "../services/workspaceDomain";
import { calculateFields } from "../services/formulas";
import { useCloseGuard } from "./ui/useCloseGuard";
import { CompanyPanel, companyTabs } from "./CompanyPanel";

export function RecordDrawer({
  entity,
  workspace,
  record,
  canEdit,
  canDelete,
  onSave,
  onDelete,
  onClose,
  onComment,
  onAttach,
  onRemoveAttachment,
  onOpenRelated,
  onOpenAttachment,
  onSaveRelated,
  initialValues,
}: {
  entity: Entity;
  workspace: Workspace;
  record: DataRecord | null;
  canEdit: boolean;
  canDelete: boolean;
  onSave: (r: DataRecord) => void | boolean | Promise<void | boolean>;
  onDelete: (id: string) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
  onComment: (recordId: string, body: string) => boolean | Promise<boolean>;
  onAttach: (recordId: string, file: File) => Promise<boolean>;
  onRemoveAttachment: (id: string) => boolean | Promise<boolean>;
  onOpenAttachment?: (
    id: string,
    name: string,
    download: boolean,
  ) => Promise<void>;
  onOpenRelated: (entityId: string, recordId: string) => void;
  onSaveRelated?: (
    entityId: string,
    record: DataRecord,
  ) => boolean | Promise<boolean>;
  initialValues?: Partial<DataRecord>;
}) {
  const blank = Object.fromEntries(
    entity.fields.map((f) => [
      f.id,
      f.defaultValue ?? (f.type === "checkbox" ? false : ""),
    ]),
  ) as DataRecord;
  const [draft, setDraft] = useState<DataRecord>(
    record
      ? structuredClone(record)
      : ({ ...blank, ...initialValues, id: newId("record") } as DataRecord),
  );
  const [initial] = useState(() => JSON.stringify(draft));
  const [originalRecord] = useState(() => record ? JSON.stringify(record) : null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [tab, setTab] = useState("Panoramica");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changeField = (id: string, value: DataRecord[string]) => {
    setDraft((current) => ({ ...current, [id]: value }));
    setErrors((current) => ({ ...current, [id]: "" }));
  };
  const save = async () => {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const latest = workspace.entities.find(e => e.id === entity.id)?.records.find(r => r.id === draft.id);
      if (originalRecord !== null && JSON.stringify(latest) !== originalRecord) throw new Error("Questo record è cambiato mentre lo modificavi. Riaprilo prima di salvare: la tua bozza non è stata applicata.");
      const calculated = calculateFields(entity.fields, draft);
      const next = validateRecord(workspace, entity, calculated);
      setErrors(next);
      if (
        Object.keys(next).length === 0 &&
        (await onSave(calculated)) !== false
      ) {
        guard.finish();
        return true;
      }
      return false;
    } catch (error) {
      setErrors({
        form: error instanceof Error ? error.message : "Calcolo non riuscito.",
      });
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const guard = useCloseGuard(
    canEdit && JSON.stringify(draft) !== initial,
    onClose,
    save,
  );
  const linkedCount = record
    ? workspace.entities.reduce(
        (total, source) =>
          total +
          source.records.filter((r) =>
            source.fields.some(
              (f) =>
                f.type === "relation" &&
                f.relationEntityId === entity.id &&
                r[f.id] === record.id,
            ),
          ).length,
        0,
      )
    : 0;
  const input = (field: Field) => {
    const value = draft[field.id];
    if (field.type === "checkbox")
      return (
        <label className="check-input">
          <input
            type="checkbox"
            checked={Boolean(value)}
            aria-invalid={Boolean(errors[field.id])}
            disabled={!canEdit}
            onChange={(e) => changeField(field.id, e.target.checked)}
          />
          <span>Sì, attivo</span>
        </label>
      );
    if (field.type === "status" || field.type === "select")
      return (
        <Select
          ariaLabel={field.name}
          ariaInvalid={Boolean(errors[field.id])}
          value={String(value ?? "")}
          disabled={!canEdit}
          onChange={(v) => changeField(field.id, v)}
          options={field.options || []}
        />
      );
    if (field.type === "relation") {
      const target = workspace.entities.find(
        (e) => e.id === field.relationEntityId,
      );
      return (
        <Select
          ariaLabel={field.name}
          ariaInvalid={Boolean(errors[field.id])}
          value={String(value ?? "")}
          disabled={!canEdit}
          onChange={(v) => changeField(field.id, v)}
          options={
            target
              ? target.records.map((r) => ({
                  value: r.id,
                  label: recordLabel(target, r),
                }))
              : []
          }
        />
      );
    }
    return (
      <input
        type={
          field.type === "date"
            ? "date"
            : field.type === "number" || field.type === "currency"
              ? "number"
              : "text"
        }
        value={String(value ?? "")}
        aria-invalid={Boolean(errors[field.id])}
        disabled={!canEdit || !!field.formula}
        onChange={(e) =>
          changeField(
            field.id,
            (field.type === "number" || field.type === "currency") &&
              e.target.value !== ""
              ? Number(e.target.value)
              : e.target.value,
          )
        }
      />
    );
  };
  return (
    <>
      <Dialog.Root open onOpenChange={(open) => !open && guard.requestClose()}>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content
            className="record-drawer"
            aria-describedby="record-drawer-description"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <header>
              <div>
                <span>{record ? "DETTAGLI RECORD" : "NUOVO RECORD"}</span>
                <Dialog.Title>
                  {record
                    ? recordLabel(entity, record)
                    : `Aggiungi ${entity.singularName || "record"}`}
                </Dialog.Title>
                <Dialog.Description id="record-drawer-description">
                  {record
                    ? "Controlla e aggiorna questo record."
                    : "Compila i campi per creare un nuovo record."}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button aria-label="Chiudi">
                  <X />
                </button>
              </Dialog.Close>
            </header>
            {entity.id === "companies" && record && (
              <div
                className="company-tabs"
                role="tablist"
                aria-label="Scheda azienda"
              >
                {companyTabs.map((t) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    key={t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div
              className={`drawer-fields form-columns-${entity.ui?.formColumns || 1}`}
            >
              {errors.form && (
                <p className="field-error" role="alert">
                  {errors.form}
                </p>
              )}
              {(entity.id !== "companies" || tab === "Panoramica"
                ? [...entity.fields]
                : []
              )
                .sort(
                  (a, b) =>
                    (entity.ui?.formOrder.indexOf(a.id) ?? 0) -
                    (entity.ui?.formOrder.indexOf(b.id) ?? 0),
                )
                .filter(
                  (f) =>
                    f.id !== "legacyDetails" &&
                    (!f.visibleWhen ||
                      draft[f.visibleWhen.fieldId] === f.visibleWhen.equals),
                )
                .map((f) =>
                  ["status", "select", "relation"].includes(f.type) ? (
                    <div className={`field field-${f.type}`} key={f.id}>
                      <span>
                        {f.name}
                        {f.required && <em>*</em>}
                      </span>
                      {input(f)}
                      {errors[f.id] && (
                        <small className="field-error" role="alert">
                          {errors[f.id]}
                        </small>
                      )}
                    </div>
                  ) : (
                    <label className={`field field-${f.type}`} key={f.id}>
                      <span>
                        {f.name}
                        {f.required && <em>*</em>}
                      </span>
                      {input(f)}
                      {errors[f.id] && (
                        <small className="field-error" role="alert">
                          {errors[f.id]}
                        </small>
                      )}
                    </label>
                  ),
                )}
              <div className="field">
                <span>Assegnato a</span>
                <Select
                  ariaLabel="Assegnato a"
                  value={String(draft.assigneeId || "")}
                  disabled={!canEdit}
                  onChange={(value) => changeField("assigneeId", value)}
                  options={workspace.users.map((user) => ({
                    value: user.id,
                    label: user.name,
                  }))}
                  emptyLabel="Non assegnato"
                />
              </div>
              {entity.id === "companies" && record && (
                <CompanyPanel
                  tab={tab}
                  company={record}
                  workspace={workspace}
                  canEdit={canEdit}
                  onSave={onSaveRelated}
                  onOpen={onOpenRelated}
                />
              )}
              {record && (entity.id !== "companies" || tab === "Documenti") && (
                <RecordDetails
                  entity={entity}
                  record={record}
                  workspace={workspace}
                  canEdit={canEdit}
                  onComment={onComment}
                  onAttach={onAttach}
                  onRemoveAttachment={onRemoveAttachment}
                  onOpenRelated={onOpenRelated}
                  onOpenAttachment={onOpenAttachment}
                />
              )}
            </div>
            <footer>
              {record && canDelete ? (
                <AlertDialog.Root
                  open={confirmDelete}
                  onOpenChange={setConfirmDelete}
                >
                  <AlertDialog.Trigger asChild>
                    <button className="danger-button">
                      <Trash2 />
                      Elimina
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay className="alert-overlay" />
                    <AlertDialog.Content className="confirm-box">
                      <AlertTriangle />
                      <AlertDialog.Title>Eliminare questo record?</AlertDialog.Title>
                      <AlertDialog.Description>
                        Questa azione rimuove il record dall'area di lavoro
                        corrente.
                        {linkedCount > 0 && (
                          <> {linkedCount} collegamenti in entrata verranno cancellati.</>
                        )}{" "}
                        Verranno rimossi anche i commenti e gli allegati locali.
                      </AlertDialog.Description>
                      <div>
                        <AlertDialog.Cancel asChild>
                          <button className="secondary">Mantieni record</button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <button
                            className="danger-solid"
                            onClick={async () => {
                              if ((await onDelete(draft.id)) !== false)
                                guard.finish();
                            }}
                          >
                            Elimina record
                          </button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              ) : (
                <span />
              )}
              <div>
                <Dialog.Close asChild>
                  <button className="secondary">Annulla</button>
                </Dialog.Close>
                {canEdit && (
                  <button className="primary" onClick={save} disabled={saving} aria-busy={saving}>
                    Salva record
                  </button>
                )}
              </div>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {guard.confirmation}
    </>
  );
}
export function recordLabel(entity: Entity, record: DataRecord) {
  if (record.name) return String(record.name);
  const first = entity.fields.find((f) =>
    ["text", "relation"].includes(f.type),
  );
  return String(
    record[first?.id || "id"] || `Senza identificazione · ${record.id}`,
  );
}
