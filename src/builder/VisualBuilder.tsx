import { useState } from "react";
import { AlertDialog } from "radix-ui";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Plus, Send } from "lucide-react";
import type { Entity, Field, FieldType, Workspace } from "../types";
import {
  configurationOf,
  previewConfiguration,
  type ConfigurationOperation,
  type StructuredProposal,
} from "../services/configuration";
import { type WorkspaceAction } from "../services/workspaceActions";
import { currentRole, newId } from "../services/workspaceDomain";
import {
  localConfigurationProvider,
  type ConfigurationProvider,
} from "../ai/configurationProvider";
import { EntityTable } from "../components/EntityTable";
import { Dashboard } from "../components/Dashboard";
import { WorkflowEditor } from "../components/WorkflowEditor";
import { NodusLogo } from "../components/NodusLogo";

type Props = {
  workspace: Workspace;
  onAction: (action: WorkspaceAction) => Promise<boolean> | boolean;
  onClose: () => void;
  provider?: ConfigurationProvider;
};
export function VisualBuilder({
  workspace,
  onAction,
  onClose,
  provider = localConfigurationProvider,
}: Props) {
  const config =
    workspace.configurationDraft?.configuration || configurationOf(workspace);
  const previewWorkspace = previewConfiguration(workspace, config);
  const [selection, setSelection] = useState(
    config.entities[0]?.id || "dashboard",
  );
  const [panel, setPanel] = useState("fields"),
    [preview, setPreview] = useState(false),
    [feedback, setFeedback] = useState(""),
    [busy, setBusy] = useState(false);
  const [moduleName, setModuleName] = useState(""),
    [fieldId, setFieldId] = useState(""),
    [request, setRequest] = useState(""),
    [proposal, setProposal] = useState<StructuredProposal | null>(null);
  const [confirmation, setConfirmation] = useState<{
      title: string;
      description: string;
      action: WorkspaceAction;
    } | null>(null),
    [workflowOpen, setWorkflowOpen] = useState(false);
  const entity = previewWorkspace.entities.find(
      (item) => item.id === selection,
    ),
    selectedField = entity?.fields.find((field) => field.id === fieldId);
  const canBuild = currentRole(workspace).permissions.editStructure;
  const perform = async (
    action: WorkspaceAction,
    message = "Draft saved. Publish to update the operational workspace.",
  ) => {
    setBusy(true);
    setFeedback("");
    try {
      if (!(await onAction(action)))
        throw new Error("The change could not be saved.");
      setFeedback(message);
      return true;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const configure = (operations: ConfigurationOperation[]) =>
    perform({ type: "configure", operations });
  const entityUI = entity?.ui || {
    columns: entity?.fields.map((field) => field.id) || [],
    formOrder: entity?.fields.map((field) => field.id) || [],
    formColumns: 1 as const,
    actions: ["create", "export"] as ("create" | "export")[],
  };
  const setUI = (
    ui: NonNullable<Entity["ui"]>,
    group = entity?.navigationGroup || "",
  ) =>
    entity &&
    configure([
      {
        type: "configureEntity",
        entityId: entity.id,
        ui,
        navigationGroup: group,
      },
    ]);
  const reorder = (items: string[], index: number, direction: number) => {
    const next = [...items],
      target = index + direction;
    if (target >= 0 && target < next.length)
      [next[index], next[target]] = [next[target], next[index]];
    return next;
  };
  const ask = async () => {
    setBusy(true);
    setFeedback("");
    try {
      setProposal(await provider.propose(request, workspace));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Proposal failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`visual-builder ${preview ? "preview-mode" : ""}`}>
      <header className="builder-topbar">
        <NodusLogo variant="lockup" />
        <span>
          Visual Builder · Published v{workspace.configurationVersion || 1}
          {workspace.configurationDraft ? " · Draft saved" : ""}
        </span>
        <div>
          <button className="secondary" onClick={onClose}>
            <ArrowLeft size={15} />
            Workspace
          </button>
          <button className="secondary" onClick={() => setPreview(!preview)}>
            <Eye size={15} />
            {preview ? "Edit" : "Preview"}
          </button>
          <button
            className="primary"
            disabled={!canBuild || !workspace.configurationDraft || busy}
            onClick={() =>
              setConfirmation({
                title: "Publish configuration?",
                description: `${config.entities.length} modules, ${config.entities.reduce((sum, item) => sum + item.fields.length, 0)} fields. Existing records are validated against this draft. Incompatible type changes are rejected. The previous configuration is kept in version history.`,
                action: { type: "publish" },
              })
            }
          >
            Publish
          </button>
        </div>
      </header>
      {feedback && (
        <div className="builder-feedback" role="status">
          {feedback}
        </div>
      )}
      <div className="builder-layout">
        {!preview && (
          <aside className="builder-library">
            <h2>Structure</h2>
            <button
              className={selection === "dashboard" ? "active" : ""}
              onClick={() => setSelection("dashboard")}
            >
              Dashboard
            </button>
            {config.entities.map((item, index) => (
              <div
                className="builder-module"
                key={item.id}
                draggable={canBuild && !busy}
                onDragStart={(event) =>
                  event.dataTransfer.setData("text/plain", item.id)
                }
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const entityId = event.dataTransfer.getData("text/plain");
                  if (config.entities.some((module) => module.id === entityId))
                    void configure([
                      { type: "reorderEntity", entityId, index },
                    ]);
                }}
              >
                <button
                  className={selection === item.id ? "active" : ""}
                  onClick={() => {
                    setSelection(item.id);
                    setFieldId("");
                  }}
                >
                  {item.name}
                  {item.archived ? " · archived" : ""}
                </button>
                <button
                  aria-label={`Move ${item.name} up`}
                  disabled={!canBuild || busy || index === 0}
                  onClick={() =>
                    configure([
                      {
                        type: "reorderEntity",
                        entityId: item.id,
                        index: index - 1,
                      },
                    ])
                  }
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  aria-label={`Move ${item.name} down`}
                  disabled={
                    !canBuild || busy || index === config.entities.length - 1
                  }
                  onClick={() =>
                    configure([
                      {
                        type: "reorderEntity",
                        entityId: item.id,
                        index: index + 1,
                      },
                    ])
                  }
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            ))}
            {canBuild && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  const id = newId("module");
                  if (
                    await configure([
                      {
                        type: "createEntity",
                        entity: { id, name: moduleName, fields: [] },
                      },
                    ])
                  ) {
                    setSelection(id);
                    setModuleName("");
                  }
                }}
              >
                <label>
                  New module
                  <input
                    value={moduleName}
                    onChange={(event) => setModuleName(event.target.value)}
                    required
                    maxLength={100}
                  />
                </label>
                <button
                  className="secondary"
                  disabled={busy || !moduleName.trim()}
                >
                  <Plus size={14} />
                  Create module
                </button>
              </form>
            )}
            <h3>Versions</h3>
            {workspace.configurationHistory?.map((version) => (
              <button
                key={version.version}
                disabled={!canBuild || busy}
                onClick={() =>
                  perform(
                    { type: "restoreVersion", version: version.version },
                    "Version loaded as draft. Publication will check compatibility with current records.",
                  )
                }
              >
                Restore v{version.version} as draft
              </button>
            ))}
            {workspace.configurationDraft && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  setConfirmation({
                    title: "Discard draft?",
                    description:
                      "Only unpublished configuration changes will be removed. Operational records remain unchanged.",
                    action: { type: "discardDraft" },
                  })
                }
              >
                Discard draft
              </button>
            )}
          </aside>
        )}
        <main className="builder-canvas">
          <div className="preview-caption">
            Interactive preview · published records · editing disabled
          </div>
          {selection === "dashboard" ? (
            <Dashboard
              workspace={previewWorkspace}
              onAsk={() => setPanel("ai")}
              onOpen={setSelection}
              canCustomize={canBuild && !preview}
              onWidgetsChange={(widgets) => {
                void configure([{ type: "setDashboard", widgets }]);
                return true;
              }}
            />
          ) : entity ? (
            <EntityTable
              key={`${entity.id}-${workspace.revision}`}
              entity={entity}
              workspace={previewWorkspace}
              canEdit={false}
              canDelete={false}
              delayedOnly={false}
              onClearDelayed={() => {}}
              onSaveRecord={() => false}
              onDeleteRecord={() => false}
              onSaveView={() => false}
              onImport={() => {}}
              onComment={() => false}
              onAttach={async () => false}
              onRemoveAttachment={() => false}
              onOpenRelated={setSelection}
            />
          ) : (
            <p>Select a module.</p>
          )}
        </main>
        {!preview && (
          <aside className="builder-properties">
            <h2>Properties</h2>
            <nav className="builder-property-tabs">
              {[
                "fields",
                "layout",
                "views",
                "workflow",
                "access",
                "advanced",
                "ai",
              ].map((tab) => (
                <button
                  key={tab}
                  aria-pressed={panel === tab}
                  onClick={() => setPanel(tab)}
                >
                  {tab}
                </button>
              ))}
            </nav>
            {entity && panel === "fields" && (
              <>
                <form
                  key={entity.id + entity.name}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void configure([
                      {
                        type: "renameEntity",
                        entityId: entity.id,
                        name: String(data.get("moduleName")),
                      },
                    ]);
                  }}
                >
                  <label>
                    Module name
                    <input
                      name="moduleName"
                      defaultValue={entity.name}
                      required
                    />
                  </label>
                  <button className="secondary" disabled={!canBuild || busy}>
                    Rename
                  </button>
                </form>
                <button
                  className="secondary"
                  disabled={!canBuild || busy}
                  onClick={() =>
                    setConfirmation({
                      title: entity.archived
                        ? "Restore module?"
                        : "Archive module?",
                      description: `${entity.records.length} records and all relationships are retained. Archived modules are hidden from operational navigation after publishing.`,
                      action: {
                        type: "configure",
                        operations: [
                          {
                            type: "archiveEntity",
                            entityId: entity.id,
                            archived: !entity.archived,
                          },
                        ],
                      },
                    })
                  }
                >
                  {entity.archived ? "Restore module" : "Archive module"}
                </button>
                <h3>Fields</h3>
                <select
                  aria-label="Choose field"
                  value={fieldId}
                  onChange={(event) => setFieldId(event.target.value)}
                >
                  <option value="">New field</option>
                  {entity.fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
                <FieldEditor
                  key={`${entity.id}-${fieldId}-${selectedField ? "existing" : entity.fields.length}`}
                  field={selectedField}
                  entity={entity}
                  workspace={previewWorkspace}
                  disabled={!canBuild || busy}
                  onSave={(field) =>
                    configure([
                      {
                        type: selectedField ? "updateField" : "addField",
                        entityId: entity.id,
                        field,
                      },
                    ])
                  }
                />
              </>
            )}
            {entity && panel === "layout" && (
              <>
                <label>
                  Sidebar group
                  <input
                    value={entity.navigationGroup || ""}
                    onChange={(event) => {
                      void setUI(entityUI, event.target.value);
                    }}
                  />
                </label>
                <label>
                  Form columns
                  <select
                    value={entityUI.formColumns}
                    onChange={(event) =>
                      setUI({
                        ...entityUI,
                        formColumns: Number(event.target.value) as 1 | 2,
                      })
                    }
                  >
                    <option value={1}>One</option>
                    <option value={2}>Two</option>
                  </select>
                </label>
                <h3>Form order</h3>
                {entityUI.formOrder.map((id, index) => (
                  <div className="builder-order" key={id}>
                    <span>
                      {entity.fields.find((field) => field.id === id)?.name}
                    </span>
                    <button
                      aria-label={`Move form field ${id} up`}
                      disabled={index === 0 || busy}
                      onClick={() =>
                        setUI({
                          ...entityUI,
                          formOrder: reorder(entityUI.formOrder, index, -1),
                        })
                      }
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move form field ${id} down`}
                      disabled={index === entityUI.formOrder.length - 1 || busy}
                      onClick={() =>
                        setUI({
                          ...entityUI,
                          formOrder: reorder(entityUI.formOrder, index, 1),
                        })
                      }
                    >
                      ↓
                    </button>
                  </div>
                ))}
                <h3>Table columns</h3>
                {entity.fields.map((field) => (
                  <label className="builder-check" key={field.id}>
                    <input
                      type="checkbox"
                      checked={entityUI.columns.includes(field.id)}
                      onChange={(event) =>
                        setUI({
                          ...entityUI,
                          columns: event.target.checked
                            ? [...entityUI.columns, field.id]
                            : entityUI.columns.filter((id) => id !== field.id),
                        })
                      }
                    />
                    {field.name}
                  </label>
                ))}
                <h3>Supported buttons</h3>
                {(["create", "export"] as const).map((action) => (
                  <label className="builder-check" key={action}>
                    <input
                      type="checkbox"
                      checked={entityUI.actions.includes(action)}
                      onChange={(event) =>
                        setUI({
                          ...entityUI,
                          actions: event.target.checked
                            ? [...entityUI.actions, action]
                            : entityUI.actions.filter(
                                (item) => item !== action,
                              ),
                        })
                      }
                    />
                    {action}
                  </label>
                ))}
              </>
            )}
            {entity && panel === "views" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void configure([
                    {
                      type: "createView",
                      view: {
                        id: newId("view"),
                        entityId: entity.id,
                        name: String(data.get("name")),
                        columns: entityUI.columns,
                        filters: [],
                        layout: String(data.get("layout")) as "table",
                        createdBy: workspace.currentUserId,
                      },
                    },
                  ]);
                }}
              >
                <label>
                  View name
                  <input name="name" required />
                </label>
                <label>
                  Layout
                  <select name="layout">
                    {[
                      "table",
                      "list",
                      ...(entity.fields.some((field) =>
                        ["status", "select"].includes(field.type),
                      )
                        ? ["kanban"]
                        : []),
                      ...(entity.fields.some((field) => field.type === "date")
                        ? ["calendar"]
                        : []),
                    ].map((layout) => (
                      <option key={layout}>{layout}</option>
                    ))}
                  </select>
                </label>
                <p>
                  The view uses the configured columns. Operational filters and
                  sorting can be saved from its toolbar.
                </p>
                <button className="primary" disabled={busy || !canBuild}>
                  Create view
                </button>
              </form>
            )}
            {panel === "workflow" && (
              <>
                <p>
                  Workflows use the same published records and supported actions
                  as the workspace.
                </p>
                <button
                  className="secondary"
                  disabled={!canBuild}
                  onClick={() => setWorkflowOpen(true)}
                >
                  Add workflow to draft
                </button>
                {config.workflows.map((flow) => (
                  <p key={flow.id}>{flow.name}</p>
                ))}
              </>
            )}
            {panel === "access" && (
              <>
                {config.roles.map((role) => (
                  <fieldset key={role.id}>
                    <legend>{role.name}</legend>
                    {Object.entries(role.permissions).map(
                      ([permission, allowed]) => (
                        <label className="builder-check" key={permission}>
                          <input
                            type="checkbox"
                            checked={allowed}
                            disabled={!canBuild || busy || role.id === "admin"}
                            onChange={(event) =>
                              configure([
                                {
                                  type: "setRole",
                                  roleId: role.id,
                                  permissions: {
                                    ...role.permissions,
                                    [permission]: event.target.checked,
                                  },
                                },
                              ])
                            }
                          />
                          {permission}
                        </label>
                      ),
                    )}
                  </fieldset>
                ))}
                <p>
                  Local roles are demonstrations. Connected mode enforces
                  permissions on the server.
                </p>
              </>
            )}
            {panel === "advanced" && (
              <>
                <h3>Safe formulas</h3>
                <p>
                  Select a number or currency field in Fields. Use arithmetic
                  and stable field IDs: <code>[quantity] * [price]</code>.
                  Functions and JavaScript are unsupported.
                </p>
                {entity?.fields.map((field) => (
                  <p key={field.id}>
                    {field.name}: <code>{field.id}</code>
                  </p>
                ))}
                <h3>Conditional forms</h3>
                <p>
                  Visibility and required rules are configured on each field and
                  evaluated by the shared record renderer and validator.
                </p>
                <a href="/api-reference.html" target="_blank" rel="noreferrer">
                  Backend API reference
                </a>
                <h3>Events</h3>
                {(workspace.activity || []).slice(0, 10).map((event) => (
                  <p key={event.id}>
                    <small>{event.source}</small> · {event.summary}
                  </p>
                ))}
                <p>
                  Outbound webhooks are not enabled. No external requests are
                  simulated.
                </p>
              </>
            )}
            {panel === "ai" && (
              <>
                <p>
                  {provider === localConfigurationProvider
                    ? "Local parser · creates modules from named fields. Other operations are available in the manual builder."
                    : "Server provider · proposals are validated before staging."}
                </p>
                <label>
                  Configuration request
                  <textarea
                    value={request}
                    onChange={(event) => setRequest(event.target.value)}
                    placeholder="Crea un modulo Campionari con codice, collezione, stagione, stato e collegamento al fornitore"
                  />
                </label>
                <button
                  className="primary"
                  disabled={!request.trim() || busy || !canBuild}
                  onClick={ask}
                >
                  <Send size={14} />
                  Propose
                </button>
                {proposal && (
                  <section className="builder-proposal">
                    <h3>{proposal.interpretation}</h3>
                    <p>{proposal.impact}</p>
                    <pre>{JSON.stringify(proposal.operations, null, 2)}</pre>
                    {proposal.ambiguities.map((item) => (
                      <p key={item} role="alert">
                        {item}
                      </p>
                    ))}
                    <button
                      className="primary"
                      disabled={busy || !!proposal.ambiguities.length}
                      onClick={async () => {
                        if (await perform({ type: "stageProposal", proposal }))
                          setProposal(null);
                      }}
                    >
                      Confirm in draft
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setProposal(null)}
                    >
                      Cancel
                    </button>
                  </section>
                )}
              </>
            )}
            {!entity &&
              !["ai", "access", "advanced", "workflow"].includes(panel) && (
                <p>
                  Use Widgets in the dashboard preview to configure its content,
                  or select a module.
                </p>
              )}
          </aside>
        )}
      </div>
      {workflowOpen && (
        <WorkflowEditor
          workspace={previewWorkspace}
          onClose={() => setWorkflowOpen(false)}
          onSave={(flow) => {
            void configure([
              {
                type: "createWorkflow",
                workflow: { ...flow, runs: [], config: flow.config! },
              },
            ]).then((saved) => {
              if (saved) setWorkflowOpen(false);
            });
            return false;
          }}
        />
      )}
      <AlertDialog.Root
        open={!!confirmation}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="alert-overlay" />
          <AlertDialog.Content className="confirm-box">
            <AlertDialog.Title>{confirmation?.title}</AlertDialog.Title>
            <AlertDialog.Description>
              {confirmation?.description}
            </AlertDialog.Description>
            <div>
              <AlertDialog.Cancel asChild>
                <button className="secondary">Cancel</button>
              </AlertDialog.Cancel>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    confirmation &&
                    (await perform(
                      confirmation.action,
                      confirmation.action.type === "publish"
                        ? "Configuration published. Operational records are preserved."
                        : "Configuration updated.",
                    ))
                  )
                    setConfirmation(null);
                }}
              >
                Confirm
              </button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

function FieldEditor({
  field,
  entity,
  workspace,
  disabled,
  onSave,
}: {
  field?: Field;
  entity: Entity;
  workspace: Workspace;
  disabled: boolean;
  onSave: (field: Field) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Field>(
      field || { id: newId("field"), name: "", type: "text" },
    ),
    [options, setOptions] = useState(field?.options?.join(", ") || ""),
    [initial, setInitial] = useState(String(field?.defaultValue ?? ""));
  const rule = (key: "visibleWhen" | "requiredWhen") => (
    <fieldset>
      <legend>
        {key === "visibleWhen" ? "Visible when" : "Required when"}
      </legend>
      <select
        aria-label={`${key} field`}
        value={draft[key]?.fieldId || ""}
        onChange={(event) =>
          setDraft({
            ...draft,
            [key]: event.target.value
              ? { fieldId: event.target.value, equals: "" }
              : undefined,
          })
        }
      >
        <option value="">No condition</option>
        {entity.fields
          .filter((item) => item.id !== draft.id)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
      {draft[key] && (
        <input
          aria-label={`${key} equals`}
          value={String(draft[key]!.equals)}
          onChange={(event) =>
            setDraft({
              ...draft,
              [key]: { ...draft[key]!, equals: event.target.value },
            })
          }
        />
      )}
    </fieldset>
  );
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const next: Field = {
          ...draft,
          options: ["status", "select"].includes(draft.type)
            ? options
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
            : undefined,
          defaultValue:
            initial === ""
              ? undefined
              : ["number", "currency"].includes(draft.type)
                ? Number(initial)
                : draft.type === "checkbox"
                  ? initial === "true"
                  : initial,
        };
        await onSave(next);
      }}
    >
      <label>
        Field name
        <input
          value={draft.name}
          required
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </label>
      <label>
        Type
        <select
          value={draft.type}
          onChange={(event) =>
            setDraft({
              ...draft,
              type: event.target.value as FieldType,
              formula: undefined,
            })
          }
        >
          {[
            "text",
            "number",
            "currency",
            "date",
            "status",
            "select",
            "checkbox",
            "relation",
          ].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <label className="builder-check">
        <input
          type="checkbox"
          checked={!!draft.required}
          onChange={(event) =>
            setDraft({ ...draft, required: event.target.checked })
          }
        />
        Required
      </label>
      {["status", "select"].includes(draft.type) && (
        <label>
          Options, comma separated
          <input
            value={options}
            onChange={(event) => setOptions(event.target.value)}
          />
        </label>
      )}
      {draft.type === "relation" && (
        <>
          <label>
            Related module
            <select
              value={draft.relationEntityId || ""}
              required
              onChange={(event) =>
                setDraft({
                  ...draft,
                  relationEntityId: event.target.value,
                  cardinality: draft.cardinality || "many-to-one",
                })
              }
            >
              <option value="">Choose module</option>
              {workspace.entities.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cardinality
            <select
              value={draft.cardinality || "many-to-one"}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  cardinality: event.target.value as
                    "many-to-one" | "one-to-one",
                })
              }
            >
              <option value="many-to-one">
                Many records → one related record
              </option>
              <option value="one-to-one">One-to-one, unique link</option>
            </select>
          </label>
        </>
      )}
      <label>
        Initial value
        <input
          value={initial}
          onChange={(event) => setInitial(event.target.value)}
        />
      </label>
      {["number", "currency"].includes(draft.type) && (
        <label>
          Formula (optional)
          <input
            value={draft.formula || ""}
            onChange={(event) =>
              setDraft({ ...draft, formula: event.target.value || undefined })
            }
          />
        </label>
      )}
      {rule("visibleWhen")}
      {rule("requiredWhen")}
      <small>Stable ID: {draft.id}</small>
      <button className="primary" disabled={disabled}>
        {field ? "Update field in draft" : "Add field to draft"}
      </button>
    </form>
  );
}
