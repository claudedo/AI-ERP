import type { Entity, Workspace } from "../types";
import type { EntryProposal } from "./smartEntry";

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function creationTarget(request: string): "property" | "company" | "other" | null {
  const object = normalized(request).replace(/\bun['’](?=\w)/g, "una ").match(/\b(?:aggiungi|aggiungere|crea|creare|inserisci|inserire|registra|registrare|add|create)\s+(?:(?:un|una|uno|il|la|nuovo|nuova|nuovi|nuove|new|a|an)\s+)*(\S+)/)?.[1]?.replace(/[,:;.?!]+$/, "");
  if (!object) return null;
  if (/^(proprieta|immobile|immobili|appartamento|appartamenti|casa|case|property|properties)$/.test(object)) return "property";
  if (/^(azienda|aziende|cliente|clienti|fornitore|fornitori|company|customer|supplier)$/.test(object)) return "company";
  if (/^(pagamento|pagamenti|fattura|fatture|contatto|contatti|sede|sedi|ordine|ordini|attivita|task|progetto|progetti|lead|trattativa|trattative|payment|invoice|contact|order|deal)$/.test(object)) return "other";
  return null;
}
export const isPropertyEntity = (entity: Pick<Entity, "id" | "name">) => /\b(propert(?:y|ies)|immobil[ei]|proprieta|appartament[oi])\b/.test(normalized(`${entity.id} ${entity.name}`).replace(/[-_]/g, " "));
export function entryMatchesIntent(proposal: EntryProposal, workspace?: Workspace): boolean {
  if (creationTarget(proposal.request) !== "property" || !proposal.operations.length) return true;
  return proposal.operations.some(operation => {
    const entity = workspace?.entities.find(e => e.id === operation.entityId);
    return entity ? isPropertyEntity(entity) : isPropertyEntity({ id: operation.entityId, name: operation.entityId });
  });
}
