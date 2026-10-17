import type { Field, Workspace } from "../types";
import type { ConfigurationOperation, StructuredProposal } from "../services/configuration";

const dataTypes: Record<Field["type"], string> = { text: "Testo", number: "Numero", currency: "Importo", date: "Data", status: "Stato", relation: "Relazione", select: "Selezione", checkbox: "Casella di controllo" };
export function StructureOperations({ proposal, workspace, excluded, onToggle, disabled }: { proposal: StructuredProposal; workspace: Workspace; excluded: string[]; onToggle: (key: string) => void; disabled?: boolean }) {
  const moduleName = (id: string) => workspace.entities.find(e => e.id === id)?.name || proposal.operations.find((op): op is Extract<ConfigurationOperation, { type: "createEntity" }> => op.type === "createEntity" && op.entity.id === id)?.entity.name || id;
  const fieldDetails = (field: Field) => `${field.name} · ${dataTypes[field.type]}${field.required ? " · Obbligatorio" : ""}${field.options?.length ? ` · Opzioni: ${field.options.join(", ")}` : ""}${field.relationEntityId ? ` · Collegato a: ${moduleName(field.relationEntityId)} (${field.cardinality === "one-to-one" ? "uno a uno" : "molti a uno"})` : ""}`;
  const describe = (op: ConfigurationOperation): string => {
    switch (op.type) {
      case "createEntity": return `Crea modulo · ${op.entity.name}`;
      case "addField": return `Aggiungi campo · ${moduleName(op.entityId)} · ${fieldDetails(op.field)}`;
      case "updateField": return `Modifica campo · ${moduleName(op.entityId)} · ${fieldDetails(op.field)}`;
      case "renameEntity": return `Rinomina modulo · ${moduleName(op.entityId)} → ${op.name}`;
      case "reorderEntity": return `Riordina modulo · ${moduleName(op.entityId)} · Posizione ${op.index + 1}`;
      case "archiveEntity": return `${op.archived ? "Archivia" : "Ripristina"} modulo · ${moduleName(op.entityId)}`;
      case "createRelation": return `Crea relazione · ${moduleName(op.entityId)} · ${workspace.entities.find(e => e.id === op.entityId)?.fields.find(f => f.id === op.fieldId)?.name || op.fieldId} → ${moduleName(op.targetEntityId)} · ${op.cardinality === "one-to-one" ? "Uno a uno" : "Molti a uno"}`;
      case "configureEntity": return `Configura modulo · ${moduleName(op.entityId)} · ${op.ui.columns.length} colonne · ${op.ui.formColumns} colonne nel modulo di modifica`;
      case "createView": return `Crea vista · ${moduleName(op.view.entityId)} · ${op.view.name} · ${op.view.filters.length} filtri`;
      case "setDashboard": return `Configura dashboard · ${op.widgets.length} indicatori`;
      case "setRole": return `Configura permessi · ${op.roleId} · ${Object.entries(op.permissions).filter(([, enabled]) => enabled).map(([key]) => ({ editRecords: "modifica record", deleteRecords: "eliminazione record", editStructure: "modifica struttura", manageUsers: "gestione utenti" })[key]).join(", ") || "sola consultazione"}`;
      case "createWorkflow": return `Crea automazione · ${op.workflow.name} · ${moduleName(op.workflow.config.entityId)} · ${op.workflow.trigger}`;
    }
  };
  return <ul aria-label="Operazioni strutturali proposte">{proposal.operations.map((op, index) => <li key={index}><label><input type="checkbox" checked={!excluded.includes(`operation:${index}`)} disabled={disabled} onChange={() => onToggle(`operation:${index}`)} />{describe(op)}</label>{op.type === "createEntity" && <ul aria-label={`Campi di ${op.entity.name}`}>{op.entity.fields.map(field => <li key={field.id}><label><input type="checkbox" aria-label={`Includi campo ${field.name}`} checked={!excluded.includes(`field:${index}:${field.id}`)} disabled={disabled || excluded.includes(`operation:${index}`)} onChange={() => onToggle(`field:${index}:${field.id}`)} />{fieldDetails(field)}</label></li>)}</ul>}</li>)}</ul>;
}
