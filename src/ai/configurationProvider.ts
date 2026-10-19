import type { Workspace } from "../types";
import { configurationOf, proposalSchema, type StructuredProposal, type ConfigurationOperation } from "../services/configuration";
import { newId } from "../services/workspaceDomain";

export interface ConfigurationProvider { propose(request: string, workspace: Workspace): Promise<StructuredProposal> }
const slug = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const localConfigurationProvider: ConfigurationProvider = {
  async propose(request, workspace) {
    const match = request.trim().match(/^(?:crea|create)\s+(?:un\s+|a\s+)?(?:modulo|module)\s+(.+?)\s+(?:con|with)\s+(.+?)\.?$/i);
    if (!match) throw new Error('La modalità locale supporta richieste come «Crea un modulo Campionari con codice, collezione, stagione, stato e collegamento al fornitore». Per altre modifiche usa l’editor delle proprietà.');
    const config = workspace.configurationDraft?.configuration || configurationOf(workspace);
    const ambiguities: string[] = [], entityId = newId("module"), fields: Extract<ConfigurationOperation, { type: "createEntity" }>["entity"]["fields"] = [];
    const names = match[2].split(/\s*,\s*|\s+e\s+|\s+and\s+/i).filter(Boolean);
    for (const raw of names) {
      const relation = raw.match(/^(?:collegamento\s+(?:al|alla|a)|relazione\s+(?:al|alla|a|con)|link\s+to|relation\s+to)\s+(.+)$/i);
      const fieldName = relation ? relation[1] : raw.trim(), fieldId = slug(fieldName);
      if (!fieldId || ["id", "assigneeId", "constructor", "prototype"].includes(fieldId)) { ambiguities.push(`Scegli un altro nome per “${fieldName}”: l’identificativo è riservato.`); continue; }
      if (relation) {
        const needle = slug(fieldName), targets = config.entities.filter(entity => !entity.archived && (slug(entity.name) === needle || /fornitor|supplier|cliente|customer/.test(needle) && (entity.id==="companies"||/fornitor|supplier/i.test(entity.name)) || slug(entity.name).replace(/s$/, "") === needle.replace(/s$/, "")));
        if (targets.length !== 1) { ambiguities.push(`Scegli un modulo di destinazione univoco per “${fieldName}” nell’editor manuale.`); fields.push({ id: fieldId, name: fieldName, type: "text" }); }
        else fields.push({ id: fieldId, name: fieldName, type: "relation", relationEntityId: targets[0].id, cardinality: "many-to-one" });
      } else if (/stato|status/i.test(fieldName)) fields.push({ id: fieldId, name: fieldName, type: "status", options: ["Nuovo", "In corso", "Completato"], defaultValue: "Nuovo" });
      else fields.push({ id: fieldId, name: fieldName, type: /prezzo|importo|price|amount/i.test(fieldName) ? "currency" : /quantit|numero|quantity|number/i.test(fieldName) ? "number" : /data|date|scadenza/i.test(fieldName) ? "date" : "text" });
    }
    return proposalSchema.parse({ id: newId("proposal"), request, interpretation: `Crea ${match[1]} con ${fields.length} campi configurabili`, baseRevision: workspace.revision || 0, operations: [{ type: "createEntity", entity: { id: entityId, name: match[1].trim(), fields } }], ambiguities, impact: "Crea un modulo in bozza. I record esistenti non cambiano. Le opzioni di stato sono suggerimenti locali e possono essere modificate prima della pubblicazione." });
  }
};

export class ServerConfigurationProvider implements ConfigurationProvider {
  constructor(private token: () => Promise<string>) {}
  async propose(request: string, workspace: Workspace): Promise<StructuredProposal> {
    const response = await fetch("/.netlify/functions/api", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.token()}` }, body: JSON.stringify({ action: "propose", request, expectedRevision: workspace.revision || 0 }) });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "AI provider request failed.");
    return proposalSchema.parse(body.proposal);
  }
}
