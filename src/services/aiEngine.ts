import type {
  AiAction,
  AiActionType,
  Analysis,
  ArchitectureOption,
  ChangeProposal,
  Entity,
  Workspace,
} from "../types";
import { localizeRealEstateNames } from "./realEstateLabels";
import {
  cloneEntities,
  demoWorkflows,
  relationsFor,
  roles,
  users,
} from "../data/templates";
import { isModuleKind } from "./moduleKinds";
import { localizeTemplateEntity } from "./realEstateLabels";

const profiles = {
  fashion: {
    terms: ["fashion", "collection", "garment", "clothing", "moda", "abbigliamento", "collezioni", "tessile"],
    process: [
      "Collections",
      "Products",
      "Production",
      "Wholesale Orders",
      "Deliveries",
    ],
    branches: ["Materials", "Suppliers", "Quality Control"],
  },
  realestate: {
    terms: ["real estate", "property", "properties", "immobiliare", "immobili", "compravendita"],
    process: ["Leads", "Appointments", "Offers", "Contracts"],
    branches: ["Properties", "Owners"],
  },
  consulting: {
    terms: ["consulting", "consultant", "advisory", "consulenza", "consulenti", "studio professionale"],
    process: ["Clients", "Opportunities", "Projects", "Tasks", "Billing"],
    branches: ["Timesheets", "Resources"],
  },
  furniture: {
    terms: ["furniture", "manufacturing", "factory", "arredamento", "mobilificio", "manifatturiera"],
    process: [
      "Collections",
      "Products",
      "Production",
      "Wholesale Orders",
      "Deliveries",
    ],
    branches: ["Materials", "Suppliers", "Quality Control"],
  },
  generic: {
    terms: [],
    process: ["Customers", "Orders", "Operations", "Deliveries"],
    branches: ["Suppliers", "Tasks"],
  },
};
const detect = (description: string) =>
  (Object.entries(profiles).find(([, p]) =>
    p.terms.some((t) => description.toLowerCase().includes(t)),
  )?.[0] as keyof typeof profiles) || "generic";
const companyNames: Record<string, string> = {
  fashion: "Atelier North",
  furniture: "Forma Works",
  realestate: "Stone & Key",
  consulting: "Northstar Advisory",
  generic: "Your Company",
};
export function analyzeBusiness(description: string, confirmedIndustry?: string): Analysis {
  const industry = confirmedIndustry && confirmedIndustry in profiles ? confirmedIndustry as keyof typeof profiles : detect(description),
    p = profiles[industry];
  return {
    industry,
    needsConfirmation: !confirmedIndustry && (industry === "generic" || Object.values(profiles).filter(profile => profile.terms.some(term => description.toLowerCase().includes(term))).length > 1),
    companyName: companyNames[industry],
    process: p.process,
    branches: p.branches,
    insight:
      "Il processo principale attraversa più team, ma oggi le informazioni sono sparse in strumenti scollegati.",
  };
}
export function generateArchitectureOptions(a: Analysis): ArchitectureOption[] {
  const full = [...a.process, ...a.branches];
  return [
    {
      id: "simple",
      label: "Opzione A",
      title: "Essenziale",
      description: "Un sistema mirato per i dati essenziali e il lavoro quotidiano.",
      modules: full.slice(0, 4),
      advantages: ["Adozione rapida", "Manutenzione minima"],
      complexity: 1,
    },
    {
      id: "process",
      label: "Opzione B",
      title: "Per processi",
      description: "Organizzato attorno al modo in cui il lavoro passa tra i team.",
      modules: a.process,
      advantages: ["Responsabilità chiare", "Passaggi più fluidi"],
      complexity: 2,
    },
    {
      id: "advanced",
      label: "Opzione C",
      title: "Avanzata",
      description:
        "Un sistema operativo connesso, con analisi e automazioni.",
      modules: full,
      advantages: ["Visibilità completa", "Pronto a crescere"],
      complexity: 3,
    },
  ];
}
export function deriveAlerts(entities: Entity[]) {
  return entities.flatMap((e) =>
    e.records
      .filter((r) =>
        ["delayed", "blocked", "overdue", "at risk"].some((v) =>
          String(r.status).toLowerCase().includes(v),
        ),
      )
      .map((r) => ({
        id: `alert-${e.id}-${r.id}`,
        title: `${e.name}: ${String(r.status)}`,
        detail: String(
          r.orderNo || r.deliveryNo || r.name || r.reference || r.id,
        ),
        severity: "high" as const,
        entityId: e.id,
        recordId: r.id,
      })),
  );
}
export function generateWorkspace(
  a: Analysis,
  option: ArchitectureOption,
): Workspace {
  const all = cloneEntities(a.industry),
    wanted = new Set(option.modules);
  let entities =
    option.id === "advanced" ? all : all.filter((e) => wanted.has(e.name));
  if (!entities.length) entities = all.slice(0, 4);
  const generated = localizeRealEstateNames({
    id: `workspace-${crypto.randomUUID()}`,
    companyName: a.companyName,
    industry: a.industry,
    architecture: option.id,
    entities,
    relations: relationsFor(entities),
    views: [],
    workflows: structuredClone(demoWorkflows).filter(flow => flow.id === "confirmed-order-task" ? entities.some(e=>isModuleKind(e,"orders")) : entities.some(e=>isModuleKind(e,"deliveries"))).map(flow=>({...flow,runs:flow.runs.map(run=>({...run,demo:true}))})),
    users: structuredClone(users),
    roles: structuredClone(roles),
    currentUserId: "usr-admin",
    changeHistory: [],
    alerts: deriveAlerts(entities),
    version: 3,
    revision: 0,
    comments: [],
    attachments: [],
    notifications: [],
    approvals: [],
    activity: [],
    dashboardWidgets: [
      { id: "records", kind: "record-count" },
      { id: "value", kind: "sum" },
      { id: "status", kind: "status" },
      { id: "assigned", kind: "assigned" },
      { id: "due", kind: "due" },
      { id: "approvals", kind: "approvals" },
    ],
  });
  // Relation labels and alert titles embed module names: derive them from the localized names.
  return { ...generated, relations: relationsFor(generated.entities), alerts: deriveAlerts(generated.entities) };
}

export function interpretCommand(
  command: string,
  mode: "operator" | "builder" = "operator",
): AiAction {
  const c = command.toLowerCase();
  let type: AiActionType = "unknown";
  if (mode === "operator") {
    if (/(delayed|late|ritard)/.test(c) && /(order|ordin)/.test(c))
      type = "filter-delayed";
    else if (/(approve|approval|approv)/.test(c)) type = "pending-approvals";
    else if (/(task|attivit)/.test(c) && /(me|my|mie|assegn)/.test(c))
      type = "my-tasks";
    else if (/(order|ordin)/.test(c) && /(customer|client)/.test(c))
      type = "orders-by-customer";
    else if (/(attention|attenzion)/.test(c)) type = "attention-summary";
  } else {
    if (c.includes("priority") && c.includes("order")) type = "add-priority";
    else if (
      c.includes("quality") &&
      (c.includes("module") || c.includes("create"))
    )
      type = "add-quality";
    else if (
      c.includes("approval") &&
      (c.includes("20,000") || c.includes("20000") || c.includes("order"))
    )
      type = "add-approval";
    else if (c.includes("supplier") && c.includes("module"))
      type = "add-suppliers";
    else if (
      c.includes("relation") &&
      c.includes("order") &&
      c.includes("customer")
    )
      type = "add-order-customer-relation";
    else if (c.includes("status") && c.includes("order")) type = "add-status";
    else if (c.includes("view") && c.includes("order")) type = "add-view";
  }
  return { type, mode, command };
}
const findOrder = (w: Workspace) =>
  w.entities.find((e) => isModuleKind(e, "orders"));
export function getProposalInapplicability(
  action: AiAction,
  w: Workspace,
): string | null {
  const order = findOrder(w);
  switch (action.type) {
    case "add-priority":
      return !order
        ? "Il modulo Orders non esiste."
        : order.fields.some((f) => f.id === "priority")
          ? "Orders ha già un campo Priority."
          : null;
    case "add-approval":
      return !order
        ? "Il modulo Orders non esiste."
        : w.workflows.some((flow) => flow.id === "high-value-approval")
          ? "Il workflow di approvazione esiste già."
          : null;
    case "add-order-customer-relation":
      if(w.entities.some(e=>e.id==="companies"))return "Gli ordini usano l’anagrafica unica Aziende. Configura i collegamenti nel Visual Builder senza duplicare clienti.";
      return !order
        ? "Il modulo Orders non esiste."
        : order.fields.some(
              (f) =>
                f.id === "customer" &&
                f.type === "relation" &&
                f.relationEntityId === "customers",
            ) && w.entities.some((e) => e.id === "customers")
          ? "Orders è già collegato a Customers."
          : null;
    case "add-quality":
      return w.entities.some((e) => e.id === "quality-control")
        ? "Il modulo Quality Control esiste già."
        : null;
    case "add-suppliers":
      if(w.entities.some(e=>e.id==="companies"))return "I fornitori sono nella vista Fornitori di Aziende. Aggiungi l’azienda con tipo Fornitore o Entrambi.";
      return w.entities.some((e) => e.id === "suppliers")
        ? "Il modulo Suppliers esiste già."
        : null;
    case "add-status":
      return !order
        ? "Il modulo Orders non esiste."
        : !order.fields.some((f) => f.id === "status")
          ? "Orders non ha un campo Status."
          : order.fields
                .find((f) => f.id === "status")
                ?.options?.includes("On hold")
            ? "On hold è già uno stato degli ordini."
            : null;
    case "add-view":
      return !order
        ? "Il modulo Orders non esiste."
        : w.views.some(
              (v) => v.entityId === order.id && v.name === "Orders to review",
            )
          ? "La vista Orders to review esiste già."
          : null;
    default:
      return null;
  }
}
export function createProposal(
  action: AiAction,
  w: Workspace,
): ChangeProposal | null {
  const issue = getProposalInapplicability(action, w);
  if (issue) return null;
  const order = findOrder(w);
  const map: Partial<
    Record<AiActionType, Omit<ChangeProposal, "id" | "command">>
  > = {
    "add-priority": {
      action: "add-priority",
      title: "Aggiungi Priority a Orders",
      summary: "Crea un campo a scelta che i team possono usare per classificare gli ordini.",
      details: [
        "Campo: Priority",
        "Opzioni: Low, Normal, High, Urgent",
        "I record esistenti ricevono Normal",
      ],
      impact: "Nessun dato esistente verrà rimosso.",
      affectedEntityIds: [order?.id || "orders"],
    },
    "add-quality": {
      action: "add-quality",
      title: "Crea il modulo Quality Control",
      summary: "Aggiungi un registro ispezioni strutturato, collegato alla produzione.",
      details: [
        "Campi: Inspection, Production batch, Inspector, Due date, Status",
        "Include un’ispezione di esempio",
        "Aggiunge una relazione Production → Quality Control",
      ],
      impact: "Verranno creati un nuovo modulo e una relazione.",
      affectedEntityIds: ["quality-control"],
    },
    "add-approval": {
      action: "add-approval",
      title: "Crea approvazione per ordini di valore elevato",
      summary: "Richiedi l’approvazione di un manager quando un ordine supera 20.000 €.",
      details: [
        "Trigger: valore ordine > 20.000 €",
        "Azioni: richiedi approvazione, avvisa il responsabile",
        "Il workflow parte attivo",
      ],
      impact: "Gli ordini di valore elevato esistenti potrebbero richiedere approvazione.",
      affectedEntityIds: [order?.id || "orders"],
    },
    "add-suppliers": {
      action: "add-suppliers",
      title: "Crea il modulo Suppliers",
      summary: "Aggiungi un elenco fornitori pronto per i workflow di acquisto.",
      details: [
        "Campi: Name, Country, Payment terms, Status",
        "Include due fornitori di esempio",
      ],
      impact: "Un nuovo modulo comparirà nella barra laterale.",
      affectedEntityIds: ["suppliers"],
    },
    "add-order-customer-relation": {
      action: "add-order-customer-relation",
      title: "Collega Orders a Customers",
      summary:
        "Sostituisci i valori cliente in testo libero con record cliente collegati.",
      details: [
        "Aggiunge a Orders un campo relazione Customer",
        "Crea il modulo Customers se mancante",
        "I nomi esistenti vengono associati dove possibile",
      ],
      impact: "I valori non associati restano visibili e potranno essere collegati in seguito.",
      affectedEntityIds: [order?.id || "orders", "customers"],
    },
    "add-status": {
      action: "add-status",
      title: "Aggiungi lo stato ordine On hold",
      summary: "Amplia le scelte di stato degli ordini esistenti.",
      details: [
        "Aggiunge On hold a Orders → Status",
        "I valori dei record esistenti non cambiano",
      ],
      impact: "Nessun dato esistente verrà rimosso.",
      affectedEntityIds: [order?.id || "orders"],
    },
    "add-view": {
      action: "add-view",
      title: "Crea la vista Orders to review",
      summary: "Salva una vista ordini mirata con i campi attuali.",
      details: [
        "Vista: Orders to review",
        "Mostra le colonne ordini attuali",
        "Ordinata per Status",
      ],
      impact: "Nessun record verrà modificato.",
      affectedEntityIds: [order?.id || "orders"],
    },
  };
  const p = map[action.type];
  if (!p) return null;
  const tailored =
    action.type === "add-quality" &&
    !w.entities.some((e) => e.id === "production")
      ? {
          ...p,
          summary: "Aggiungi un registro ispezioni strutturato.",
          details: [
            "Campi: Inspection, Production batch, Inspector, Due date, Status",
            "Include un’ispezione di esempio",
            "Production batch è salvato come testo perché non esiste il modulo Production",
          ],
          impact: "Verrà creato un nuovo modulo.",
        }
      : p;
  return {
    ...tailored,
    id: `proposal-${crypto.randomUUID()}`,
    command: action.command,
    baseRevision: w.revision || 0,
    ambiguities: [],
  };
}

export function applyProposal(
  workspace: Workspace,
  p: ChangeProposal,
): Workspace {
  if (p.baseRevision != null && p.baseRevision !== (workspace.revision || 0))
    return workspace;
  if (
    getProposalInapplicability(
      { type: p.action, mode: "builder", command: p.command },
      workspace,
    )
  )
    return workspace;
  const existingIds = new Set(workspace.entities.map((e) => e.id));
  const next = structuredClone(workspace),
    order = findOrder(next);
  if (
    p.action === "add-priority" &&
    order &&
    !order.fields.some((f) => f.id === "priority")
  ) {
    order.fields.push({
      id: "priority",
      name: "Priorità",
      type: "select",
      options: ["Low", "Normal", "High", "Urgent"],
    });
    order.records = order.records.map((r, i) => ({
      ...r,
      priority: i === 1 ? "High" : "Normal",
    }));
  }
  if (
    p.action === "add-quality" &&
    !next.entities.some((e) => e.id === "quality-control")
  ) {
    next.entities.push({
      id: "quality-control",
      name: "Quality Control",
      fields: [
        { id: "inspection", name: "Inspection", type: "text" },
        {
          id: "batch",
          name: "Production batch",
          ...(next.entities.some((e) => e.id === "production")
            ? { type: "relation" as const, relationEntityId: "production" }
            : { type: "text" as const }),
        },
        { id: "inspector", name: "Inspector", type: "text" },
        { id: "due", name: "Due date", type: "date" },
        {
          id: "status",
          name: "Status",
          type: "status",
          options: ["Pending", "Passed", "Issues found"],
        },
      ],
      records: [
        {
          id: "QC-01",
          inspection: "Final inspection",
          batch: "BAT-882",
          inspector: "Noah King",
          due: "2026-09-29",
          status: "Pending",
        },
      ],
    });
    next.relations = relationsFor(next.entities);
  }
  if (
    p.action === "add-approval" &&
    !next.workflows.some((w) => w.id === "high-value-approval")
  )
    next.workflows.push({
      id: "high-value-approval",
      name: "High-value order approval",
      trigger: "Order value > €20,000",
      actions: ["Request manager approval", "Notify order owner"],
      active: true,
      runs: [],
    });
  if (
    p.action === "add-suppliers" &&
    !next.entities.some((e) => e.id === "suppliers")
  )
    next.entities.push({
      id: "suppliers",
      name: "Suppliers",
      fields: [
        { id: "name", name: "Name", type: "text" },
        { id: "country", name: "Country", type: "text" },
        {
          id: "paymentTerms",
          name: "Payment terms",
          type: "select",
          options: ["30 days", "60 days", "90 days"],
        },
        {
          id: "status",
          name: "Status",
          type: "status",
          options: ["Approved", "Review", "Inactive"],
        },
      ],
      records: [
        {
          id: "SUP-01",
          name: "Arco Materials",
          country: "Italy",
          paymentTerms: "60 days",
          status: "Approved",
        },
        {
          id: "SUP-02",
          name: "Northline Works",
          country: "Portugal",
          paymentTerms: "30 days",
          status: "Review",
        },
      ],
    });
  if (p.action === "add-order-customer-relation" && order) {
    if (!next.entities.some((e) => e.id === "customers"))
      next.entities.unshift({
        id: "customers",
        name: "Customers",
        fields: [
          { id: "name", name: "Customer", type: "text" },
          {
            id: "status",
            name: "Status",
            type: "status",
            options: ["Active", "Prospect"],
          },
        ],
        records: [...new Set(order.records.map((r) => String(r.customer)))].map(
          (name, i) => ({ id: `CUS-${i + 1}`, name, status: "Active" }),
        ),
      });
    const customers = next.entities.find((e) => e.id === "customers")!;
    const fld = order.fields.find((f) => f.id === "customer");
    if (fld) {
      fld.type = "relation";
      fld.relationEntityId = "customers";
    } else
      order.fields.splice(1, 0, {
        id: "customer",
        name: "Customer",
        type: "relation",
        relationEntityId: "customers",
      });
    order.records = order.records.map((r) => ({
      ...r,
      customer:
        customers.records.find((c) => c.name === r.customer)?.id || r.customer,
    }));
    next.relations = relationsFor(next.entities);
  }
  if (p.action === "add-status" && order) {
    order.fields.find((f) => f.id === "status")?.options?.push("On hold");
  }
  if (p.action === "add-view" && order)
    next.views.push({
      id: `view-${crypto.randomUUID()}`,
      entityId: order.id,
      name: "Orders to review",
      columns: order.fields.map((f) => f.id),
      filters: [],
      sort: { fieldId: "status", direction: "asc" },
      layout: "table",
      createdBy: next.currentUserId,
    });
  next.revision = (workspace.revision || 0) + 1;
  next.changeHistory.unshift({
    id: `change-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    userId: next.currentUserId,
    command: p.command,
    summary: p.title,
    status: "applied",
    affectedEntityIds: p.affectedEntityIds,
    action: p.action,
    appliedRevision: next.revision,
  });
  next.activity = [
    {
      id: `activity-${crypto.randomUUID()}`,
      at: new Date().toISOString(),
      userId: next.currentUserId,
      source: "ai",
      summary: p.title,
    },
    ...(next.activity || []),
  ];
  // System-created template modules start with Italian names, like generated workspaces.
  next.entities = next.entities.map((e) => (existingIds.has(e.id) ? e : localizeTemplateEntity(e)));
  return next;
}
