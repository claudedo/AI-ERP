import type { DataRecord, Entity, Field, FieldType, RecordValue, Workspace } from "../types";
import { currentRole, DomainError, newId, saveRecords, validateRecord } from "./workspaceDomain";
import { calculateFields } from "./formulas";

export interface ParsedSheet { name: string; headers: string[]; rows: string[][] }
export interface ImportMapping { column: number; fieldId: string; type: FieldType }
export interface ImportPlan { sheet: ParsedSheet; entityId?: string; newModuleName?: string; mappings: ImportMapping[]; duplicateFieldId: string; duplicateStrategy: "skip" }
export interface ImportIssue { row: number; reason: string }
export interface ImportPreview { accepted: number; skipped: number; issues: ImportIssue[]; records: DataRecord[]; entity: Entity }
const limit = 10 * 1024 * 1024;
const slug = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "field";
const textOf = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : value == null ? "" : String(value).trim();

export function parseCsv(text: string): ParsedSheet {
  const source = text.replace(/^\uFEFF/, "");
  const delimiters = [";", ",", "\t"];
  const score = (d: string) => {
    let count = 0, quoted = false;
    for (const char of source.slice(0, 3000)) { if (char === '"') quoted = !quoted; else if (!quoted && char === d) count++; else if (!quoted && char === "\n") break; }
    return count;
  };
  const separator = delimiters.sort((a, b) => score(b) - score(a))[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '"') { if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (char === separator && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && source[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  if (quoted) throw new DomainError("Il CSV contiene un valore tra virgolette non chiuso.");
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (!rows.length || !rows[0].some(Boolean)) throw new DomainError("Il file non contiene la riga di intestazione.");
  return { name: "CSV", headers: rows[0].map((h, i) => h || `Colonna ${i + 1}`), rows: rows.slice(1) };
}
export async function parseFile(file: File): Promise<ParsedSheet[]> {
  if (file.size > limit) throw new DomainError("I file devono essere di massimo 10 MB.");
  if (/\.csv$/i.test(file.name)) return [parseCsv(await file.text())];
  if (!/\.xlsx$/i.test(file.name)) throw new DomainError("Scegli un file CSV o XLSX.");
  try {
    const { default: readExcelFile } = await import("read-excel-file/browser");
    const sheets = await readExcelFile(file);
    return sheets.map(sheet => {
      const rows = sheet.data.map(row => row.map(textOf));
      return { name: sheet.sheet, headers: (rows[0] || []).map((h, i) => h || `Colonna ${i + 1}`), rows: rows.slice(1).filter(row => row.some(Boolean)) };
    });
  } catch (error) { throw new DomainError(error instanceof Error ? `Impossibile leggere il file Excel: ${error.message}` : "Impossibile leggere il file Excel."); }
}
export function inferFieldType(header: string, values: string[]): FieldType {
  const h = header.toLowerCase(), sample = values.filter(Boolean).slice(0, 30);
  if (/(data|date|scadenza|due)/.test(h)) return "date";
  if (/(importo|prezzo|price|amount|value|total|costo|cost|€)/.test(h)) return "currency";
  if (/(status|stato)/.test(h)) return "status";
  if (sample.length && sample.every(v => /^(si|sì|no|yes|true|false|0|1)$/i.test(v))) return "checkbox";
  if (sample.length && sample.every(v => parseItalianNumber(v) !== null)) return "number";
  if (sample.length && sample.every(v => parseDate(v) !== null)) return "date";
  return "text";
}
export function parseItalianNumber(raw: string): number | null {
  let value = raw.replace(/[\s\u00A0€]/g, "").trim();
  if (!value) return null;
  if (value.includes(",") && value.includes(".")) value = value.lastIndexOf(",") > value.lastIndexOf(".") ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  else if (value.includes(",")) value = value.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replace(/\./g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
export function parseDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const date = new Date(`${raw}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw ? raw : null;
  }
  const match = raw.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCDate() !== Number(day) || date.getUTCMonth() !== Number(month) - 1) return null;
  return date.toISOString().slice(0, 10);
}
function convert(raw: string, field: Field, workspace: Workspace): RecordValue {
  if (!raw) return "";
  if (field.type === "number" || field.type === "currency") { const value = parseItalianNumber(raw); if (value == null) throw new DomainError(`${field.name}: invalid number “${raw}”.`); return value; }
  if (field.type === "date") { const value = parseDate(raw); if (!value) throw new DomainError(`${field.name}: invalid date “${raw}”.`); return value; }
  if (field.type === "checkbox") { if (/^(si|sì|yes|true|1)$/i.test(raw)) return true; if (/^(no|false|0)$/i.test(raw)) return false; throw new DomainError(`${field.name}: invalid checkbox “${raw}”.`); }
  if (field.type === "relation") {
    const target = workspace.entities.find(e => e.id === field.relationEntityId);
    const exact = target?.records.find(r => r.id === raw);
    const matches = exact ? [exact] : target?.records.filter(r => target.fields.some(f => f.type === "text" && String(r[f.id]).toLowerCase() === raw.toLowerCase())) || [];
    if (matches.length > 1) throw new DomainError(`${field.name}: “${raw}” matches multiple records. Use the exact record ID.`);
    const linked = matches[0];
    if (!linked) throw new DomainError(`${field.name}: linked record “${raw}” was not found.`);
    return linked.id;
  }
  if ((field.type === "status" || field.type === "select") && field.options?.length && !field.options.includes(raw)) throw new DomainError(`${field.name}: “${raw}” is not an available option.`);
  return raw;
}
function targetEntity(plan: ImportPlan, w: Workspace): Entity {
  if (plan.entityId) {
    const existing = w.entities.find(e => e.id === plan.entityId);
    if (!existing) throw new DomainError("Il modulo di destinazione non esiste più.");
    return existing;
  }
  const name = plan.newModuleName?.trim();
  if (!name) throw new DomainError("Inserisci un nome per il nuovo modulo.");
  const id = slug(name);
  if (w.entities.some(e => e.id === id || e.name.toLowerCase() === name.toLowerCase())) throw new DomainError("Esiste già un modulo con questo nome.");
  const fields: Field[] = plan.mappings.filter(m => m.fieldId).map(m => {
    const values = plan.sheet.rows.map(r => r[m.column] || "").filter(Boolean);
    return { id: m.fieldId, name: plan.sheet.headers[m.column], type: m.type, ...(m.type === "status" || m.type === "select" ? { options: [...new Set(values)].slice(0, 100) } : {}) };
  });
  if (!fields.length) throw new DomainError("Associa almeno una colonna.");
  if (new Set(fields.map(f => f.id)).size !== fields.length) throw new DomainError("Due colonne non possono essere associate allo stesso campo.");
  if (fields.some(f => ["id", "assigneeId", "__proto__", "constructor", "prototype"].includes(f.id))) throw new DomainError("Questo identificativo di campo è riservato. Rinomina il campo associato.");
  return { id, name, fields, records: [] };
}
export function previewImport(plan: ImportPlan, w: Workspace): ImportPreview {
  const entity = targetEntity(plan, w), issues: ImportIssue[] = [], records: DataRecord[] = [];
  const validationEntity = { ...entity, records: [...entity.records] };
  const validationWorkspace = { ...w, entities: [...w.entities.filter(e => e.id !== entity.id), validationEntity] };
  const duplicateField = entity.fields.find(f => f.id === plan.duplicateFieldId) || entity.fields[0];
  const keys = new Set(entity.records.map(r => String(r[duplicateField.id] ?? "").trim().toLowerCase()).filter(Boolean));
  for (let i = 0; i < plan.sheet.rows.length; i++) {
    const source = plan.sheet.rows[i], record: DataRecord = { id: newId("record") };
    try {
      for (const mapping of plan.mappings.filter(m => m.fieldId)) {
        const field = entity.fields.find(f => f.id === mapping.fieldId);
        if (!field) throw new DomainError(`Il campo associato ${mapping.fieldId} non esiste più.`);
        record[field.id] = convert(source[mapping.column] || "", field, w);
      }
      const calculated = calculateFields(entity.fields, record);
      const errors = validateRecord(validationWorkspace, validationEntity, calculated);
      if (Object.keys(errors).length) throw new DomainError(Object.values(errors).join(" "));
      const key = String(calculated[duplicateField.id] ?? "").trim().toLowerCase();
      if (key && keys.has(key)) throw new DomainError(`${duplicateField.name} duplicato: ${record[duplicateField.id]}. Riga saltata.`);
      if (key) keys.add(key);
      records.push(calculated);
      validationEntity.records.push(calculated);
    } catch (error) { issues.push({ row: i + 2, reason: error instanceof Error ? error.message : "Riga non valida." }); }
  }
  return { accepted: records.length, skipped: issues.length, issues, records, entity };
}
export function executeImport(plan: ImportPlan, w: Workspace): { workspace: Workspace; report: ImportPreview } {
  const role = currentRole(w);
  if (!role.permissions.editRecords || (!plan.entityId && !role.permissions.editStructure)) throw new DomainError("Il tuo ruolo demo non può importare in questo modulo.");
  const report = previewImport(plan, w);
  let next = structuredClone(w);
  if (!plan.entityId) { next.entities.push(report.entity); next.revision = (next.revision || 0) + 1; }
  next = saveRecords(next, report.entity.id, report.records, "import");
  return { workspace: next, report };
}
export function exportCsv(entity: Entity, rows: DataRecord[], columns: string[]): string {
  const fields = columns.flatMap(id => entity.fields.find(f => f.id === id) || []);
  const quote = (value: unknown) => {
    const text = String(value ?? "");
    // Quoting alone does not prevent spreadsheet formula execution. Preserve numeric cells.
    const safe = typeof value === "string" && /^[\s\uFEFF]*[=+@\-\t\r\n]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return `\uFEFF${[fields.map(f => quote(f.name)), ...rows.map(r => fields.map(f => quote(r[f.id])))].map(row => row.join(";")).join("\r\n")}`;
}
export function downloadText(text: string, filename: string, mime = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const fieldIdFromHeader = slug;
