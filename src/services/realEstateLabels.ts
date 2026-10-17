import type { Entity, Workspace } from "../types";
import type { Configuration } from "../types/configuration";

const modules: Record<string, [string, string]> = { properties: ["Properties", "Immobili"], owners: ["Owners", "Proprietari"], leads: ["Leads", "Potenziali clienti"] };
const propertyFields: Record<string, [string, string]> = { reference: ["Reference", "Riferimento"], address: ["Address", "Indirizzo"], askingPrice: ["Asking price", "Prezzo richiesto"] };
function entitiesWithItalianNames<T extends Omit<Entity, "records">>(entities: T[]): T[] {
  return entities.map(entity => {
    const label = modules[entity.id], name = label && entity.name === label[0] ? label[1] : entity.name;
    const fields = entity.id === "properties" ? entity.fields.map(field => {
      const translation = propertyFields[field.id];
      return translation && field.name === translation[0] ? { ...field, name: translation[1] } : field;
    }) : entity.fields;
    return name === entity.name && fields.every((field, index) => field === entity.fields[index]) ? entity : { ...entity, name, fields };
  });
}
function configurationWithItalianNames(config: Configuration): Configuration {
  const entities = entitiesWithItalianNames(config.entities);
  return entities.every((entity, index) => entity === config.entities[index]) ? config : { ...config, entities };
}
/** Idempotent label-only migration: no version, IDs, records, options or custom names change. */
export function localizeRealEstateNames(workspace: Workspace): Workspace {
  if (workspace.industry !== "realestate" && !workspace.entities.some(e => e.id === "properties")) return workspace;
  const entities = entitiesWithItalianNames(workspace.entities);
  const draft = workspace.configurationDraft ? configurationWithItalianNames(workspace.configurationDraft.configuration) : undefined;
  const history = workspace.configurationHistory?.map(item => {
    const configuration = configurationWithItalianNames(item.configuration);
    return configuration === item.configuration ? item : { ...item, configuration };
  });
  if (entities.every((entity, index) => entity === workspace.entities[index]) && (!draft || draft === workspace.configurationDraft?.configuration) && (!history || history.every((item, index) => item === workspace.configurationHistory![index]))) return workspace;
  const next = { ...workspace, entities };
  if (workspace.configurationDraft && draft) next.configurationDraft = { ...workspace.configurationDraft, configuration: draft };
  if (history) next.configurationHistory = history;
  return next;
}
