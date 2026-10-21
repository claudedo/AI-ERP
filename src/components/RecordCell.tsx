import { ArrowUpRight } from "lucide-react";
import type { Field, RecordValue } from "../types";
import { StatusPill } from "./StatusPill";

const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function RecordCell({ value, field, relations }: { value: RecordValue | undefined; field: Field; relations: ReadonlyMap<string, ReadonlyMap<string, string>> }) {
  if (value == null || value === "") return <span>—</span>;
  if (field.type === "currency") return <strong>{currency.format(Number(value))}</strong>;
  if (field.type === "date") {
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? String(value) : date.format(parsed);
  }
  if (field.type === "checkbox") return <span className={value ? "boolean yes" : "boolean"}>{value ? "Sì" : "No"}</span>;
  if (field.type === "status" || field.type === "select") return <StatusPill value={value} />;
  if (field.type === "relation" && field.relationEntityId) {
    const label = relations.get(field.relationEntityId)?.get(String(value));
    return label ? <span className="relation-cell"><ArrowUpRight aria-hidden="true" focusable="false" />{label}</span> : <span className="relation-missing">Record mancante</span>;
  }
  return String(value);
}
