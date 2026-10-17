import { useMemo, useState } from "react";
import { FileUp, GitBranch, LayoutDashboard, Search, Zap, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { Workspace } from "../types";
import { recordLabel } from "./RecordDrawer";

export function CommandPalette({ workspace, canEdit, canBuild, onClose, onNavigate, onRecord, onAssistant, onImport }: { workspace: Workspace; canEdit: boolean; canBuild: boolean; onClose: () => void; onNavigate: (id: string) => void; onRecord: (entityId: string, recordId: string) => void; onAssistant: (mode: "operator" | "builder") => void; onImport: () => void }) {
  const [query, setQuery] = useState(""), [selected, setSelected] = useState(0);
  const commands = useMemo(() => {
    const actions = [
      { id: "dashboard", label: "Dashboard", detail: "Navigate", icon: <LayoutDashboard size={15}/>, run: () => onNavigate("dashboard") },
      { id: "automations", label: "Automations", detail: "Navigate", icon: <Zap size={15}/>, run: () => onNavigate("automations") },
      { id: "approvals", label: "Approvals", detail: "Pending decisions", icon: <Zap size={15}/>, run: () => onNavigate("approvals") },
      { id: "operator", label: "NODUS AI · Operator", detail: "Ask about live data", icon: <Search size={15}/>, run: () => onAssistant("operator") },
      ...(canBuild ? [{ id: "builder", label: "NODUS AI · Builder", detail: "Preview a structural change", icon: <GitBranch size={15}/>, run: () => onAssistant("builder") }] : []),
      ...(canEdit ? [{ id: "import", label: "Import CSV or Excel", detail: "Local data import", icon: <FileUp size={15}/>, run: onImport }] : []),
      ...workspace.entities.map(entity => ({ id: `entity:${entity.id}`, label: entity.name, detail: `${entity.records.length} records · module`, icon: <LayoutDashboard size={15}/>, run: () => onNavigate(entity.id) })),
      ...workspace.entities.flatMap(entity => entity.records.map(record => ({ id: `record:${entity.id}:${record.id}`, label: recordLabel(entity, record), detail: `${entity.name} · record`, icon: <Search size={15}/>, run: () => onRecord(entity.id, record.id) })))
    ];
    return actions.filter(action => `${action.label} ${action.detail}`.toLowerCase().includes(query.toLowerCase())).slice(0, 20);
  }, [query, workspace, canEdit, canBuild, onNavigate, onRecord, onAssistant, onImport]);
  const invoke = (index: number) => { commands[index]?.run(); onClose(); };
  return <Dialog.Root open onOpenChange={open => !open && onClose()}><Dialog.Portal><Dialog.Overlay className="alert-overlay"/><Dialog.Content className="command-dialog" aria-describedby="command-description"><Dialog.Title className="sr-only">Command palette</Dialog.Title><Dialog.Description id="command-description" className="sr-only">Search modules, records and available actions.</Dialog.Description><div className="command-input"><Search size={18}/><input autoFocus value={query} onChange={event => { setQuery(event.target.value); setSelected(0); }} onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); setSelected(current => Math.min(current + 1, commands.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setSelected(current => Math.max(0, current - 1)); } if (event.key === "Enter") invoke(selected); }} placeholder="Search modules, records, actions…" aria-label="Search commands"/><Dialog.Close asChild><button aria-label="Close"><X size={16}/></button></Dialog.Close></div><div className="command-results">{commands.length ? commands.map((command, index) => <button key={command.id} className={selected === index ? "selected" : ""} onMouseEnter={() => setSelected(index)} onClick={() => invoke(index)}>{command.icon}<span><strong>{command.label}</strong><small>{command.detail}</small></span></button>) : <p>No matching command or record.</p>}</div><footer>↑ ↓ Navigate · Enter Open · Esc Close</footer></Dialog.Content></Dialog.Portal></Dialog.Root>;
}
