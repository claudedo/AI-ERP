import { useState } from "react";
import type { DataRecord, Workspace } from "../types";
import { RecordDrawer, recordLabel } from "./RecordDrawer";
export const companyTabs = [
  "Panoramica",
  "Contatti",
  "Sedi",
  "Operazioni",
  "Documenti",
  "Attività",
];
export function CompanyPanel({
  tab,
  company,
  workspace,
  canEdit,
  onSave,
  onOpen,
}: {
  tab: string;
  company: DataRecord;
  workspace: Workspace;
  canEdit: boolean;
  onSave?: (entityId: string, record: DataRecord) => boolean | Promise<boolean>;
  onOpen: (entityId: string, recordId: string) => void;
}) {
  const [editing, setEditing] = useState<{
    entityId: string;
    record: DataRecord | null;
  } | null>(null);
  const id = tab === "Contatti" ? "company-contacts" : "company-sites",
    entity = workspace.entities.find((e) => e.id === id);
  if (tab === "Contatti" || tab === "Sedi")
    return (
      <section className="company-related">
        <h3>{tab}</h3>
        {canEdit && onSave && (
          <button
            className="secondary"
            onClick={() => setEditing({ entityId: id, record: null })}
          >
            Aggiungi {tab === "Contatti" ? "contatto" : "sede"}
          </button>
        )}
        {entity?.records
          .filter((r) => r.company === company.id)
          .map((r) => (
            <button
              className="company-related-row"
              key={r.id}
              onClick={() => setEditing({ entityId: id, record: r })}
            >
              <strong>
                {String(r.name || r.id)} {String(r.surname || "")}
              </strong>
              <span>
                {String(r.email || r.city || r.department || "")}
                {r.primary ? " · Principale" : ""}
              </span>
            </button>
          ))}
        {!entity?.records.some((r) => r.company === company.id) && (
          <p>
            Nessun elemento collegato. Aggiungine uno per completare
            l’anagrafica.
          </p>
        )}
        {editing && entity && (
          <RecordDrawer
            key={editing.record?.id || "new"}
            entity={entity}
            workspace={workspace}
            record={editing.record}
            initialValues={{ company: company.id }}
            canEdit={canEdit}
            canDelete={false}
            onSave={async (r) => {
              const saved = await onSave?.(entity.id, r);
              if (saved) setEditing(null);
              return !!saved;
            }}
            onClose={() => setEditing(null)}
            onDelete={() => false}
            onComment={() => false}
            onAttach={async () => false}
            onRemoveAttachment={() => false}
            onOpenRelated={onOpen}
          />
        )}
      </section>
    );
  if (tab === "Operazioni") {
    const rows = workspace.entities
      .filter(
        (e) =>
          !["company-sites", "company-contacts", "companies"].includes(e.id),
      )
      .flatMap((e) =>
        e.records
          .filter((r) =>
            e.fields.some(
              (f) =>
                f.type === "relation" &&
                f.relationEntityId === "companies" &&
                r[f.id] === company.id,
            ),
          )
          .map((r) => ({ entity: e, record: r })),
      );
    return (
      <section>
        <h3>Operazioni collegate</h3>
        {rows.map(({ entity, record }) => (
          <button
            className="company-related-row"
            key={`${entity.id}:${record.id}`}
            onClick={() => onOpen(entity.id, record.id)}
          >
            {entity.name} · {recordLabel(entity, record)} ↗
          </button>
        ))}
        {!rows.length && (
          <p>Nessuna operazione collegata nello schema attuale.</p>
        )}
      </section>
    );
  }
  if (tab === "Attività")
    return (
      <section>
        <h3>Attività azienda</h3>
        {(workspace.activity || [])
          .filter(
            (a) =>
              a.recordId === company.id ||
              workspace.entities.some((e) =>
                e.records.some(
                  (r) => r.id === a.recordId && r.company === company.id,
                ),
              ),
          )
          .map((a) => (
            <p key={a.id}>
              {a.summary} · {new Date(a.at).toLocaleString()}
            </p>
          ))}
        {!(workspace.activity || []).some((a) => a.recordId === company.id) && (
          <p>Nessuna attività diretta registrata.</p>
        )}
      </section>
    );
  return null;
}
