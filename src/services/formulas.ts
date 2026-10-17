import type { DataRecord, Field } from "../types";

// Deliberately small arithmetic grammar: numbers, [field-id], + - * / and parentheses.
export function formulaReferences(source: string): string[] {
  return [...source.matchAll(/\[([a-zA-Z0-9_-]+)\]/g)].map(match => match[1]);
}
export function evaluateFormula(source: string, record: DataRecord): number {
  if (source.length > 500) throw new Error("Formula is too long.");
  const tokens = source.match(/\[[a-zA-Z0-9_-]+\]|\d+(?:\.\d+)?|[()+*/-]|\S/g) || [];
  let cursor = 0;
  const primary = (): number => {
    const token = tokens[cursor++];
    if (token === "-") return -primary();
    if (token === "+") return primary();
    if (token === "(") { const result = sum(); if (tokens[cursor++] !== ")") throw new Error("Missing closing parenthesis."); return result; }
    if (/^\d+(?:\.\d+)?$/.test(token || "")) return Number(token);
    if (/^\[[a-zA-Z0-9_-]+\]$/.test(token || "")) {
      const value = record[token.slice(1, -1)];
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Formula needs a number in ${token}.`);
      return value;
    }
    throw new Error("Unsupported formula syntax.");
  };
  const product = (): number => { let value = primary(); while (["*", "/"].includes(tokens[cursor])) { const operator = tokens[cursor++], right = primary(); if (operator === "/" && right === 0) throw new Error("Division by zero."); value = operator === "*" ? value * right : value / right; } return value; };
  const sum = (): number => { let value = product(); while (["+", "-"].includes(tokens[cursor])) { const operator = tokens[cursor++], right = product(); value = operator === "+" ? value + right : value - right; } return value; };
  const value = sum();
  if (cursor !== tokens.length || !Number.isFinite(value)) throw new Error("Invalid formula result.");
  return value;
}
export function calculateFields(fields: Field[], incoming: DataRecord): DataRecord {
  const record = { ...incoming }, pending = new Set(fields.filter(field => field.formula).map(field => field.id));
  const visiting = new Set<string>();
  const calculate = (id: string) => {
    if (!pending.has(id)) return;
    if (visiting.has(id)) throw new Error("Calculated fields contain a cycle.");
    visiting.add(id);
    const field = fields.find(item => item.id === id)!;
    for (const ref of formulaReferences(field.formula!)) calculate(ref);
    record[id] = evaluateFormula(field.formula!, record);
    visiting.delete(id); pending.delete(id);
  };
  for (const id of [...pending]) calculate(id);
  return record;
}
