import type { Entity, Field, Workspace } from "../types";
import type { Configuration } from "../types/configuration";

/** Template module id → [English default name, Italian name]. */
const MODULES: Record<string, [string, string]> = {
  appointments: ["Appointments", "Appuntamenti"], billing: ["Billing", "Fatturazione"], clients: ["Clients", "Clienti"],
  collections: ["Collections", "Collezioni"], contracts: ["Contracts", "Contratti"], customers: ["Customers", "Clienti"],
  deliveries: ["Deliveries", "Consegne"], leads: ["Leads", "Potenziali clienti"], materials: ["Materials", "Materiali"],
  offers: ["Offers", "Offerte"], operations: ["Operations", "Operazioni"], opportunities: ["Opportunities", "Opportunità"],
  orders: ["Orders", "Ordini"], owners: ["Owners", "Proprietari"], production: ["Production", "Produzione"],
  products: ["Products", "Prodotti"], projects: ["Projects", "Progetti"], properties: ["Properties", "Immobili"],
  "quality-control": ["Quality Control", "Controllo qualità"], suppliers: ["Suppliers", "Fornitori"],
  tasks: ["Tasks", "Attività"], timesheets: ["Timesheets", "Fogli ore"], "wholesale-orders": ["Wholesale Orders", "Ordini wholesale"],
};

/** Template field defaults: "fieldId|English" → Italian; "entityId.fieldId|English" wins when meaning differs by module. */
const FIELDS: Record<string, string> = {
  "agent|Agent": "Agente", "date|Date": "Data", "lead|Lead": "Potenziale cliente", "property|Property": "Immobile",
  "status|Status": "Stato", "subject|Appointment": "Appuntamento", "amount|Amount": "Importo", "client|Client": "Cliente",
  "due|Due date": "Scadenza", "invoice|Invoice": "Fattura", "project|Project": "Progetto", "annualValue|Annual value": "Valore annuo",
  "name|Client": "Cliente", "partner|Partner": "Partner", "sector|Sector": "Settore", "launch|Launch date": "Data di lancio",
  "name|Collection": "Collezione", "season|Season": "Stagione", "buyer|Buyer": "Acquirente", "exchangeDate|Exchange date": "Data del rogito",
  "solicitor|Solicitor": "Notaio", "contact|Primary contact": "Contatto principale", "email|Email": "Email",
  "lifetimeValue|Lifetime value": "Valore cliente", "name|Customer": "Cliente", "carrier|Carrier": "Corriere",
  "deliveryNo|Delivery": "Consegna", "destination|Destination": "Destinazione", "eta|ETA": "Arrivo previsto", "order|Order": "Ordine",
  "area|Preferred area": "Zona preferita", "budget|Budget": "Budget", "name|Lead": "Potenziale cliente",
  "code|Material code": "Codice materiale", "composition|Composition": "Composizione", "name|Material": "Materiale",
  "stock|Stock (m)": "Scorta (m)", "supplier|Supplier": "Fornitore", "amount|Offer amount": "Importo offerta",
  "submitted|Submitted": "Data invio", "name|Work item": "Attività", "owner|Owner": "Responsabile",
  "closeDate|Expected close": "Chiusura prevista", "name|Opportunity": "Opportunità", "probability|Probability %": "Probabilità %",
  "value|Value": "Valore", "customer|Customer": "Cliente", "delivery|Expected delivery": "Consegna prevista", "orderNo|Order ID": "N. ordine",
  "phone|Phone": "Telefono", "properties|Properties": "Immobili", "name|Owner": "Proprietario", "batch|Batch": "Lotto",
  "completion|Expected completion": "Completamento previsto", "factory|Factory": "Stabilimento", "product|Product": "Prodotto",
  "units|Units": "Unità", "category|Category": "Categoria", "collection|Collection": "Collezione", "name|Product": "Prodotto",
  "retail|Retail price": "Prezzo al pubblico", "sku|SKU": "SKU", "deadline|Deadline": "Scadenza", "lead|Project lead": "Responsabile progetto",
  "name|Project": "Progetto", "address|Address": "Indirizzo", "askingPrice|Asking price": "Prezzo richiesto", "bedrooms|Bedrooms": "Camere",
  "reference|Reference": "Riferimento", "batch|Production batch": "Lotto di produzione", "inspection|Inspection": "Ispezione",
  "inspector|Inspector": "Ispettore", "country|Country": "Paese", "leadTime|Lead time (days)": "Tempi di consegna (giorni)",
  "name|Supplier": "Fornitore", "paymentTerms|Payment terms": "Termini di pagamento", "assignee|Assignee": "Assegnatario",
  "billable|Billable": "Fatturabile", "name|Task": "Attività", "approved|Approved": "Approvato", "consultant|Consultant": "Consulente",
  "hours|Hours": "Ore", "priority|Priority": "Priorità", "sourceRecord|Source record": "Record di origine",
  "properties.owner|Owner": "Proprietario",
};

/** Italian label for an English template module name (e.g. onboarding maps); unknown names pass through. */
export function templateModuleLabel(name: string): string {
  return Object.values(MODULES).find(([english]) => english === name)?.[1] ?? name;
}

const fieldLabel = (entityId: string, field: Pick<Field, "id" | "name">) =>
  FIELDS[`${entityId}.${field.id}|${field.name}`] ?? FIELDS[`${field.id}|${field.name}`];

function localizeEntity<T extends Pick<Entity, "id" | "name" | "fields">>(entity: T): T {
  const module = MODULES[entity.id], name = module && entity.name === module[0] ? module[1] : entity.name;
  let changed = name !== entity.name;
  const fields = entity.fields.map(field => {
    const italian = fieldLabel(entity.id, field);
    if (!italian) return field;
    changed = true;
    return { ...field, name: italian };
  });
  return changed ? { ...entity, name, fields } : entity;
}

/** Localize one system-created template module (AI proposals, workflow-created Tasks). Never use on user modules. */
export const localizeTemplateEntity = localizeEntity;

/**
 * Label-only migration, run ONCE per workspace: renames template modules/fields that still
 * carry their English default. Afterwards (`labelsLocalized` set) nothing is renamed again,
 * so names the user chooses or modules the user creates/imports — even with a template id
 * such as "products" — are never rewritten. IDs, records, options and schema version never change.
 */
export function localizeTemplateNames(workspace: Workspace): Workspace {
  if (workspace.labelsLocalized) return workspace;
  const apply = <T extends Pick<Entity, "id" | "name" | "fields">>(list: T[]) => list.map(localizeEntity);
  const config = (configuration: Configuration): Configuration => ({ ...configuration, entities: apply(configuration.entities) });
  const next: Workspace = { ...workspace, entities: apply(workspace.entities), labelsLocalized: workspace.entities.map(e => e.id) };
  if (workspace.configurationDraft) next.configurationDraft = { ...workspace.configurationDraft, configuration: config(workspace.configurationDraft.configuration) };
  if (workspace.configurationHistory) next.configurationHistory = workspace.configurationHistory.map(item => ({ ...item, configuration: config(item.configuration) }));
  return next;
}

/** @deprecated kept for existing callers; covers every template, not only real estate. */
export const localizeRealEstateNames = localizeTemplateNames;
