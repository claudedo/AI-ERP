import type { DataRecord, Entity, ViewFilter } from "../types";
import { DELAYED, isStatus } from "./statusValues";

export function queryRecords(entity: Entity, search: string, filters: ViewFilter[], sort?: { fieldId: string; direction: "asc" | "desc" }, delayedOnly = false): DataRecord[] {
  const needle = search.trim().toLocaleLowerCase();
  const rows = entity.records.filter(record => {
    if (delayedOnly && !isStatus(record.status, DELAYED)) return false;
    if (needle && !entity.fields.some(field => String(record[field.id] ?? "").toLocaleLowerCase().includes(needle))) return false;
    return filters.every(filter => {
      const actual = record[filter.fieldId], expected = filter.value;
      if(filter.fieldId==="partyRole"&&actual==="Entrambi"&&["contains","equals"].includes(filter.operator)&&["Cliente","Fornitore"].includes(String(expected)))return true;
      if (filter.operator === "truthy") return Boolean(actual);
      if (filter.operator === "contains") return String(actual ?? "").toLocaleLowerCase().includes(String(expected ?? "").toLocaleLowerCase());
      if (filter.operator === "not-equals") return String(actual ?? "") !== String(expected ?? "");
      if (filter.operator === "greater-than") return Number(actual) > Number(expected);
      if (filter.operator === "less-than") return Number(actual) < Number(expected);
      return String(actual ?? "") === String(expected ?? "");
    });
  });
  if (!sort) return rows;
  const direction = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[sort.fieldId], bv = b[sort.fieldId];
    if (av === bv) return 0;
    if (av == null || av === "") return 1;
    if (bv == null || bv === "") return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * direction;
  });
}
