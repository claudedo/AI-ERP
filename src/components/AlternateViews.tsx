import { useState } from "react";
import type { DataRecord, Entity, ViewLayout, Workspace } from "../types";
import { recordLabel } from "./RecordDrawer";

export function AlternateViews({ entity, workspace, rows, layout, canEdit, onOpen, onSaveRecord }: { entity: Entity; workspace: Workspace; rows: DataRecord[]; layout: ViewLayout; canEdit: boolean; onOpen: (record: DataRecord) => void; onSaveRecord: (record: DataRecord) => boolean | Promise<boolean> }) {
  const statusFields = entity.fields.filter(field => field.type === "status" || field.type === "select"), dateFields = entity.fields.filter(field => field.type === "date");
  const [groupFieldId, setGroupFieldId] = useState(statusFields[0]?.id || ""), [dateFieldId, setDateFieldId] = useState(dateFields[0]?.id || "");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const groupField = entity.fields.find(field => field.id === groupFieldId), dateField = entity.fields.find(field => field.id === dateFieldId);
  const update = (record: DataRecord, fieldId: string, value: string) => { if (canEdit) onSaveRecord({ ...record, [fieldId]: value }); };
  if (layout === "list") return <div className="record-list">{rows.map(record => <button key={record.id} onClick={() => onOpen(record)}><strong>{recordLabel(entity, record)}</strong><span>{entity.fields.slice(1, 5).map(field => {
    const value = record[field.id];
    const linked = field.type === "relation" ? workspace.entities.find(e => e.id === field.relationEntityId)?.records.find(r => r.id === value) : null;
    return `${field.name}: ${linked ? String(linked.name || linked.id) : String(value ?? "—")}`;
  }).join(" · ")}</span></button>)}</div>;
  if (layout === "kanban" && groupField) {
    const keyOf=(record:DataRecord)=>String(record[groupField.id]??"").trim();
    const groups = [...new Set([...(groupField.options || []), ...rows.map(keyOf), ""])];
    return <div className="kanban-board"><label>Raggruppa per<select value={groupFieldId} onChange={event => setGroupFieldId(event.target.value)}>{statusFields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><div className="kanban-lanes">{groups.map(group => <section key={group} onDragOver={event => canEdit && event.preventDefault()} onDrop={event => { event.preventDefault(); const record = rows.find(row => row.id === event.dataTransfer.getData("text/plain")); if (record) update(record, groupField.id, group); }}><h3>{group||"Non assegnati"}<small>{rows.filter(record => keyOf(record) === group).length}</small></h3>{rows.filter(record => keyOf(record) === group).map(record => <article key={record.id} draggable={canEdit} onDragStart={event => event.dataTransfer.setData("text/plain", record.id)}><button onClick={() => onOpen(record)}>{recordLabel(entity, record)}</button>{canEdit && <select aria-label={`Sposta ${recordLabel(entity, record)}`} value={group} onChange={event => update(record, groupField.id, event.target.value)}>{groups.map(option => <option key={option} value={option}>{option||"Non assegnati"}</option>)}</select>}</article>)}</section>)}</div></div>;
  }
  if (layout === "calendar" && dateField) {
    const first = new Date(month.getFullYear(), month.getMonth(), 1), offset = (first.getDay() + 6) % 7, days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - offset + 1));
    return <div className="calendar-view"><header><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mese precedente">←</button><strong>{month.toLocaleString("it-IT", { month: "long", year: "numeric" })}</strong><button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mese successivo">→</button><label>Campo data<select value={dateFieldId} onChange={event => setDateFieldId(event.target.value)}>{dateFields.map(field => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label></header><div className="calendar-grid">{["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"].map(day => <strong key={day}>{day}</strong>)}{cells.map(day => { const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`; return <div key={iso} className={day.getMonth() !== month.getMonth() ? "outside" : ""}><time dateTime={iso}>{day.getDate()}</time>{rows.filter(record => record[dateField.id] === iso).map(record => <div className="calendar-event" key={record.id}><button onClick={() => onOpen(record)}>{recordLabel(entity, record)}</button>{canEdit && <input type="date" value={iso} aria-label={`Cambia data di ${recordLabel(entity, record)}`} onChange={event => update(record, dateField.id, event.target.value)}/>}</div>)}</div>; })}</div></div>;
  }
  return null;
}
