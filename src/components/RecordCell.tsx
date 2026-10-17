import type { Field, RecordValue } from "../types";

const currency = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function RecordCell({ value, field, relations }: { value: RecordValue | undefined; field: Field; relations: ReadonlyMap<string, ReadonlyMap<string, string>> }) {
  if (value == null || value === "") return <span>—</span>;
  if (field.type === "currency") return <strong>{currency.format(Number(value))}</strong>;
  if (field.type === "date") {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : date.format(parsed);
  }
  if (field.type === "checkbox") return <span className={value ? "boolean yes" : "boolean"}>{value ? "Yes" : "No"}</span>;
  if (field.type === "status" || field.type === "select") return <span className={`status-pill ${String(value).toLowerCase().replace(/\s/g, "-")}`}>{String(value)}</span>;
  if (field.type === "relation" && field.relationEntityId) {
    const label = relations.get(field.relationEntityId)?.get(String(value));
    return label ? <span className="relation-cell">↗ {label}</span> : <span className="relation-missing">Missing record</span>;
  }
  return String(value);
}
