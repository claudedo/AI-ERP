import type { Entity } from "../types";

/**
 * Recognise template modules by their stable id first, then by English or Italian name.
 * Display names are localized and user-editable, so logic must never depend on the
 * English name alone (e.g. "Orders" becomes "Ordini").
 */
const KINDS = {
  orders: { ids: ["orders", "wholesale-orders"], name: /\b(?:orders?|ordini)\b/i },
  deliveries: { ids: ["deliveries"], name: /deliver|consegn/i },
  operations: { ids: ["operations"], name: /\boperations?\b|operazion/i },
  projects: { ids: ["projects"], name: /project|progett/i },
  offers: { ids: ["offers"], name: /\boffers?\b|offert/i },
  leads: { ids: ["leads"], name: /\bleads?\b|potenziali clienti/i },
} as const;

export type ModuleKind = keyof typeof KINDS;

export function isModuleKind(entity: Pick<Entity, "id" | "name">, kind: ModuleKind): boolean {
  const { ids, name } = KINDS[kind];
  return (ids as readonly string[]).includes(entity.id) || name.test(entity.name);
}
