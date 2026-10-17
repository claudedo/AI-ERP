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
      "Your core process crosses multiple teams, but the information currently lives in disconnected tools.",
  };
}
export function generateArchitectureOptions(a: Analysis): ArchitectureOption[] {
  const full = [...a.process, ...a.branches];
  return [
    {
      id: "simple",
      label: "Option A",
      title: "Simple",
      description: "A focused system for essential records and daily work.",
      modules: full.slice(0, 4),
      advantages: ["Fast adoption", "Low maintenance"],
      complexity: 1,
    },
    {
      id: "process",
      label: "Option B",
      title: "Process-based",
      description: "Organized around the way work moves between teams.",
      modules: a.process,
      advantages: ["Clear ownership", "Better handoffs"],
      complexity: 2,
    },
    {
      id: "advanced",
      label: "Option C",
      title: "Advanced",
      description:
        "A connected operating system with analytics and automation.",
      modules: full,
      advantages: ["End-to-end visibility", "Built to scale"],
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
  return localizeRealEstateNames({
    id: `workspace-${crypto.randomUUID()}`,
    companyName: a.companyName,
    industry: a.industry,
    architecture: option.id,
    entities,
    relations: relationsFor(entities),
    views: [],
    workflows: structuredClone(demoWorkflows).filter(flow => flow.id === "confirmed-order-task" ? entities.some(e=>/orders/i.test(e.name)) : entities.some(e=>/deliver/i.test(e.name))).map(flow=>({...flow,runs:flow.runs.map(run=>({...run,demo:true}))})),
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
  w.entities.find((e) => /orders/i.test(e.name));
export function getProposalInapplicability(
  action: AiAction,
  w: Workspace,
): string | null {
  const order = findOrder(w);
  switch (action.type) {
    case "add-priority":
      return !order
        ? "Orders module is missing."
        : order.fields.some((f) => f.id === "priority")
          ? "Orders already has a Priority field."
          : null;
    case "add-approval":
      return !order
        ? "Orders module is missing."
        : w.workflows.some((flow) => flow.id === "high-value-approval")
          ? "The approval workflow already exists."
          : null;
    case "add-order-customer-relation":
      if(w.entities.some(e=>e.id==="companies"))return "Gli ordini usano l’anagrafica unica Aziende. Configura i collegamenti nel Visual Builder senza duplicare clienti.";
      return !order
        ? "Orders module is missing."
        : order.fields.some(
              (f) =>
                f.id === "customer" &&
                f.type === "relation" &&
                f.relationEntityId === "customers",
            ) && w.entities.some((e) => e.id === "customers")
          ? "Orders is already connected to Customers."
          : null;
    case "add-quality":
      return w.entities.some((e) => e.id === "quality-control")
        ? "Quality Control module already exists."
        : null;
    case "add-suppliers":
      if(w.entities.some(e=>e.id==="companies"))return "I fornitori sono nella vista Fornitori di Aziende. Aggiungi l’azienda con tipo Fornitore o Entrambi.";
      return w.entities.some((e) => e.id === "suppliers")
        ? "Suppliers module already exists."
        : null;
    case "add-status":
      return !order
        ? "Orders module is missing."
        : !order.fields.some((f) => f.id === "status")
          ? "Orders has no Status field."
          : order.fields
                .find((f) => f.id === "status")
                ?.options?.includes("On hold")
            ? "On hold is already an order status."
            : null;
    case "add-view":
      return !order
        ? "Orders module is missing."
        : w.views.some(
              (v) => v.entityId === order.id && v.name === "Orders to review",
            )
          ? "Orders to review already exists."
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
      title: "Add Priority to Orders",
      summary: "Create a select field that teams can use to triage orders.",
      details: [
        "Field: Priority",
        "Options: Low, Normal, High, Urgent",
        "Existing records receive Normal",
      ],
      impact: "No existing data will be removed.",
      affectedEntityIds: [order?.id || "orders"],
    },
    "add-quality": {
      action: "add-quality",
      title: "Create Quality Control module",
      summary: "Add a structured inspection register connected to production.",
      details: [
        "Fields: Inspection, Production batch, Inspector, Due date, Status",
        "Includes one sample inspection",
        "Adds a Production → Quality Control relation",
      ],
      impact: "A new module and relationship will be created.",
      affectedEntityIds: ["quality-control"],
    },
    "add-approval": {
      action: "add-approval",
      title: "Create high-value order approval",
      summary: "Require manager approval when an order exceeds €20,000.",
      details: [
        "Trigger: Order value > €20,000",
        "Actions: request approval, notify owner",
        "Workflow starts active",
      ],
      impact: "Existing high-value orders may require approval.",
      affectedEntityIds: [order?.id || "orders"],
    },
    "add-suppliers": {
      action: "add-suppliers",
      title: "Create Suppliers module",
      summary: "Add a supplier directory ready for procurement workflows.",
      details: [
        "Fields: Name, Country, Payment terms, Status",
        "Includes two sample suppliers",
      ],
      impact: "A new module will appear in the sidebar.",
      affectedEntityIds: ["suppliers"],
    },
    "add-order-customer-relation": {
      action: "add-order-customer-relation",
      title: "Connect Orders to Customers",
      summary:
        "Replace free-text customer values with linked customer records.",
      details: [
        "Adds Customer relation field to Orders",
        "Creates Customers module if missing",
        "Existing names are matched where possible",
      ],
      impact: "Unmatched values remain visible and can be linked later.",
      affectedEntityIds: [order?.id || "orders", "customers"],
    },
    "add-status": {
      action: "add-status",
      title: "Add On hold order status",
      summary: "Extend the existing order status choices.",
      details: [
        "Adds On hold to Orders → Status",
        "Existing record values are unchanged",
      ],
      impact: "No existing data will be removed.",
      affectedEntityIds: [order?.id || "orders"],
    },
    "add-view": {
      action: "add-view",
      title: "Create Orders to review view",
      summary: "Save a focused order view using current fields.",
      details: [
        "View: Orders to review",
        "Shows current order columns",
        "Sorted by Status",
      ],
      impact: "No records will be changed.",
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
          summary: "Add a structured inspection register.",
          details: [
            "Fields: Inspection, Production batch, Inspector, Due date, Status",
            "Includes one sample inspection",
            "Production batch is stored as text because there is no Production module",
          ],
          impact: "A new module will be created.",
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
  const next = structuredClone(workspace),
    order = findOrder(next);
  if (
    p.action === "add-priority" &&
    order &&
    !order.fields.some((f) => f.id === "priority")
  ) {
    order.fields.push({
      id: "priority",
      name: "Priority",
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
  return next;
}
