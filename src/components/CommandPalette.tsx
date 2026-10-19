import { useMemo, useState } from "react";
import { FileUp, LayoutDashboard, Search, Zap, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { Workspace } from "../types";
import { recordLabel } from "./RecordDrawer";

export function CommandPalette({ workspace, canEdit, canBuild, onClose, onNavigate, onRecord, onAssistant, onImport }: { workspace: Workspace; canEdit: boolean; canBuild: boolean; onClose: () => void; onNavigate: (id: string) => void; onRecord: (entityId: string, recordId: string) => void; onAssistant: (mode: "operator" | "builder") => void; onImport: () => void }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(0);
  const commands = useMemo(() => {
    // Archived modules keep their data but are hidden from navigation and search.
    const active = workspace.entities.filter(entity => !entity.archived);
    const actions = [
      { id: "dashboard", label: "Dashboard", detail: "Vai a", icon: <LayoutDashboard size={15}/>, run: () => onNavigate("dashboard") },
      { id: "automations", label: "Automazioni", detail: "Vai a", icon: <Zap size={15}/>, run: () => onNavigate("automations") },
      { id: "approvals", label: "Approvazioni", detail: "Decisioni in attesa", icon: <Zap size={15}/>, run: () => onNavigate("approvals") },
      { id: "operator", label: "NODUS AI", detail: "Domande, dati e modifiche in una chat", icon: <Search size={15}/>, run: () => onAssistant("operator") },
      ...(canEdit ? [{ id: "import", label: "Importa CSV o Excel", detail: "Importazione dati locale", icon: <FileUp size={15}/>, run: onImport }] : []),
      ...active.map(entity => ({ id: `entity:${entity.id}`, label: entity.name, detail: `${entity.records.length} record · modulo`, icon: <LayoutDashboard size={15}/>, run: () => onNavigate(entity.id) })),
      ...active.flatMap(entity => entity.records.map(record => ({ id: `record:${entity.id}:${record.id}`, label: recordLabel(entity, record), detail: `${entity.name} · record`, icon: <Search size={15}/>, run: () => onRecord(entity.id, record.id) })))
    ];
    return actions.filter(action => `${action.label} ${action.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20);
  }, [query, workspace, canEdit, canBuild, onNavigate, onRecord, onAssistant, onImport]);
  const invoke = (index: number) => { commands[index]?.run(); onClose(); };
  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="alert-overlay"/><Dialog.Content className="command-dialog" aria-describedby="command-description"><Dialog.Title className="sr-only">Comandi</Dialog.Title><Dialog.Description id="command-description" className="sr-only">Cerca moduli, record e azioni disponibili.</Dialog.Description><div className="command-input"><Search size={18}/><input autoFocus value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected(current => Math.min(current + 1, commands.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected(current => Math.max(0, current - 1)); } if (event.key === "Enter") invoke(selected); }} placeholder="Cerca moduli, record, azioni…" aria-label="Cerca comandi"/><Dialog.Close asChild><button aria-label="Chiudi"><X size={16}/></button></Dialog.Close></div><div className="command-results">{commands.length ? commands.map((command, index) => <button key={command.id} className={selected === index ? "selected" : ""} onMouseEnter={() => setSelected(index)} onClick={() => invoke(index)}>{command.icon}<span><strong>{command.label}</strong><small>{command.detail}</small></span></button>) : <p>Nessun comando o record trovato.</p>}</div><footer>↑ ↓ Vai a · Invio Apri · Esc Chiudi</footer></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
