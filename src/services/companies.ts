import type { DataRecord, Entity, Field, Workspace } from "../types";
import { relationsFor } from "../data/templates";

const text = (id: string, name: string, required = false): Field => ({
  id,
  name,
  type: "text",
  required,
});
export const companyEntities = (): Entity[] => [
  {
    id: "companies",
    name: "Aziende",
    singularName: "azienda",
    navigationGroup: "Anagrafiche",
    records: [],
    fields: [
      text("name", "Ragione sociale", true),
      text("tradeName", "Nome commerciale"),
      {
        id: "partyRole",
        name: "Tipo",
        type: "select",
        required: true,
        options: ["Cliente", "Fornitore", "Entrambi"],
      },
      text("vat", "Partita IVA"),
      text("taxCode", "Codice fiscale"),
      text("country", "Paese"),
      text("sector", "Settore"),
      text("website", "Sito web"),
      text("notes", "Note"),
      {
        id: "status",
        name: "Stato",
        type: "status",
        options: ["Active", "Inactive"],
        defaultValue: "Active",
      },
      text("legacyDetails", "Dati originali (migrazione)"),
      text("legacyStatus", "Stato gestionale precedente"),
    ],
  },
  {
    id: "company-sites",
    name: "Sedi",
    singularName: "sede",
    navigationGroup: "Anagrafiche",
    records: [],
    fields: [
      {
        id: "company",
        name: "Azienda",
        type: "relation",
        required: true,
        relationEntityId: "companies",
      },
      text("name", "Etichetta", true),
      text("kind", "Tipo sede"),
      text("address", "Indirizzo"),
      text("postcode", "CAP"),
      text("city", "Città"),
      text("region", "Provincia / regione"),
      text("country", "Paese"),
      { id: "primary", name: "Sede principale", type: "checkbox" },
      text("notes", "Note"),
    ],
  },
  {
    id: "company-contacts",
    name: "Contatti",
    singularName: "contatto",
    navigationGroup: "Anagrafiche",
    records: [],
    fields: [
      {
        id: "company",
        name: "Azienda",
        type: "relation",
        required: true,
        relationEntityId: "companies",
      },
      text("name", "Nome", true),
      text("surname", "Cognome"),
      text("role", "Ruolo"),
      text("department", "Reparto"),
      text("email", "Email"),
      text("phone", "Telefono"),
      text("mobile", "Cellulare"),
      {
        id: "site",
        name: "Sede associata",
        type: "relation",
        relationEntityId: "company-sites",
      },
      { id: "primary", name: "Contatto principale", type: "checkbox" },
      text("notes", "Note"),
    ],
  },
];
export const normalizedVat = (value: unknown) =>
  String(value || "")
    .replace(/[\s.-]/g, "")
    .toUpperCase()
    .replace(/^IT(?=\d{11}$)/, "");
export const isCompanyEntity = (entity: Entity) =>
  ["companies", "customers", "clients", "suppliers"].includes(entity.id);

// Operational companies are stored once. The pre-migration local JSON is backed up by the repository.
export function upgradeCompanies(input: Workspace): Workspace {
  if (input.entities.some((e) => e.id === "companies") && input.version >= 5)
    return input;
  const next = structuredClone(input),
    schemas = companyEntities();
  const companies =
    next.entities.find((e) => e.id === "companies") || schemas[0];
  const legacy = next.entities.filter((e) =>
    ["clients", "customers", "suppliers"].includes(e.id),
  );
  const mapping = new Map<string, string>();
  for (const source of legacy)
    for (const record of source.records) {
      const role = source.id === "suppliers" ? "Fornitore" : "Cliente";
      const vat = normalizedVat(record.vat);
      const existing = companies.records.find((r) =>
        vat
          ? normalizedVat(r.vat) === vat
          : String(r.name || "").trim() &&
            String(r.name).trim().toLowerCase() ===
              String(record.name || "")
                .trim()
                .toLowerCase(),
      );
      const id =
        existing?.id ||
        (companies.records.some((r) => r.id === record.id)
          ? `${source.id}-${record.id}`
          : record.id);
      mapping.set(`${source.id}:${record.id}`, id);
      if (existing) {
        if (existing.partyRole !== role) existing.partyRole = "Entrambi";
        existing.legacyDetails = `${existing.legacyDetails || ""}\n${JSON.stringify({ module: source.id, record })}`;
        for (const [key, value] of Object.entries(record))
          if (existing[key] == null || existing[key] === "")
            existing[key] = value;
      } else
        companies.records.push({
          ...record,
          id,
          name: String(record.name || ""),
          partyRole: role,
          status: record.status === "Inactive" ? "Inactive" : "Active",
          legacyStatus: String(record.status || ""),
          legacyDetails: JSON.stringify({ module: source.id, record }),
        });
      for (const field of source.fields)
        if (!companies.fields.some((f) => f.id === field.id))
          companies.fields.push({ ...field, required: false });
    }
  next.entities = [
    companies,
    ...next.entities.filter(
      (e) => !legacy.includes(e) && e.id !== companies.id,
    ),
  ];
  for (const schema of schemas.slice(1))
    if (!next.entities.some((e) => e.id === schema.id))
      next.entities.push(schema);
  next.entities = [
    ...next.entities.filter((e) =>
      ["companies", "company-sites", "company-contacts"].includes(e.id),
    ),
    ...next.entities.filter(
      (e) => !["companies", "company-sites", "company-contacts"].includes(e.id),
    ),
  ];
  for (const entity of next.entities)
    for (const field of entity.fields)
      if (
        field.type === "relation" &&
        legacy.some((e) => e.id === field.relationEntityId)
      ) {
        const sourceId = field.relationEntityId!;
        field.relationEntityId = "companies";
        for (const record of entity.records)
          if (record[field.id])
            record[field.id] =
              mapping.get(`${sourceId}:${record[field.id]}`) ||
              record[field.id];
      }
  // Preserve textual customer references by converting their existing, explicit names to company records.
  for (const entity of next.entities)
    if (/orders/i.test(entity.name)) {
      for (const field of [
        text("item", "Descrizione ordine"),
        { id: "units", name: "Quantità", type: "number" as const },
        { id: "unitPrice", name: "Prezzo unitario", type: "currency" as const },
      ])
        if (!entity.fields.some((f) => f.id === field.id))
          entity.fields.push(field);
      const field = entity.fields.find(
        (f) => f.id === "customer" && f.type === "text",
      );
      if (field) {
        field.type = "relation";
        field.relationEntityId = "companies";
        for (const record of entity.records) {
          if (!record.customer) continue;
          const name = String(record.customer);
          let match = companies.records.find(
            (r) =>
              String(r.name).trim().toLowerCase() === name.trim().toLowerCase(),
          );
          if (!match) {
            match = {
              id: `company-${record.id}`,
              name,
              partyRole: "Cliente",
              status: "Active",
            };
            companies.records.push(match);
          }
          record.customer = match.id;
        }
      }
    }
  for (const key of [
    "comments",
    "attachments",
    "activity",
    "notifications",
    "approvals",
    "alerts",
  ] as const)
    for (const item of next[key] || []) {
      if (item.entityId && legacy.some((e) => e.id === item.entityId)) {
        item.recordId =
          mapping.get(`${item.entityId}:${item.recordId}`) || item.recordId;
        item.entityId = "companies";
      }
    }
  next.views = next.views.map((view) =>
    legacy.some((e) => e.id === view.entityId)
      ? {
          ...view,
          entityId: "companies",
          filters: [
            ...view.filters.map((filter) =>
              filter.fieldId === "status"
                ? { ...filter, fieldId: "legacyStatus" }
                : filter,
            ),
            {
              fieldId: "partyRole",
              operator: "contains" as const,
              value: view.entityId === "suppliers" ? "Fornitore" : "Cliente",
            },
          ],
        }
      : view,
  );
  for (const [id, label, role] of [
    ["company-clients", "Clienti", "Cliente"],
    ["company-suppliers", "Fornitori", "Fornitore"],
  ])
    if (!next.views.some((v) => v.id === id))
      next.views.push({
        id,
        entityId: "companies",
        name: label,
        columns: companies.fields
          .filter((f) => f.id !== "legacyDetails")
          .map((f) => f.id),
        filters: [{ fieldId: "partyRole", operator: "contains", value: role }],
        createdBy: next.currentUserId,
      });
  for (const flow of next.workflows) {
    if (flow.config && legacy.some((e) => e.id === flow.config!.entityId)) {
      flow.config.entityId = "companies";
      for (const key of [
        "fieldId",
        "conditionFieldId",
        "targetFieldId",
      ] as const)
        if (flow.config[key] === "status") flow.config[key] = "legacyStatus";
    }
    flow.runs = flow.runs.map((run) =>
      /^run-[12]$/.test(run.id) ? { ...run, demo: true } : run,
    );
  }
  next.workflows = next.workflows.filter(
    (flow) =>
      flow.config ||
      (flow.id === "confirmed-order-task"
        ? next.entities.some((e) => /orders/i.test(e.name))
        : flow.id === "delayed-delivery-alert"
          ? next.entities.some((e) => /deliver/i.test(e.name))
          : true),
  );
  for (const widget of next.dashboardWidgets || [])
    if (legacy.some((e) => e.id === widget.entityId))
      widget.entityId = "companies";
  next.relations = relationsFor(next.entities);
  // Configuration snapshots use the former schemas: retain them as recoverable history, and require a new draft after migration.
  if (next.configurationDraft) {
    next.companyMigrationDraft = JSON.stringify(next.configurationDraft);
    next.configurationDraft = undefined;
  }
  next.version = 5;
  return next;
}
