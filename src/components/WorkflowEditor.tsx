import { useState } from "react";
import { Dialog } from "radix-ui";
import { GitBranch, X } from "lucide-react";
import type { Workflow, WorkflowConfig, Workspace } from "../types";
import { newId } from "../services/workspaceDomain";
import { GuardedEditor } from "./ui/GuardedEditor";

export function WorkflowEditor(props: {
  workspace: Workspace;
  onClose: () => void;
  onSave: (flow: Workflow) => boolean;
}) {
  return (
    <GuardedEditor onClose={props.onClose}>
      {(close, saved) => (
        <WorkflowEditorForm
          {...props}
          onClose={close}
          onSave={(flow) => {
            const result = props.onSave(flow);
            if (result) saved();
            return result;
          }}
        />
      )}
    </GuardedEditor>
  );
}
function WorkflowEditorForm({
  workspace,
  onClose,
  onSave,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSave: (flow: Workflow) => boolean;
}) {
  const [name, setName] = useState(""),
    [entityId, setEntityId] = useState(workspace.entities[0]?.id || ""),
    [event, setEvent] = useState<WorkflowConfig["event"]>("create");
  const [fieldId, setFieldId] = useState(""),
    [conditionFieldId, setConditionFieldId] = useState(""),
    [conditionOperator, setConditionOperator] = useState<
      "equals" | "greater-than"
    >("equals"),
    [conditionValue, setConditionValue] = useState("");
  const [action, setAction] = useState<WorkflowConfig["action"]>("notify"),
    [targetEntityId, setTargetEntityId] = useState(""),
    [targetFieldId, setTargetFieldId] = useState(""),
    [targetValue, setTargetValue] = useState("");
  const [error, setError] = useState("");
  const entity = workspace.entities.find((item) => item.id === entityId);
  const create = () => {
    if (!name.trim() || !entity) {
      setError("Nome e modulo di origine sono obbligatori.");
      return;
    }
    if ((event === "update" || event === "status") && !fieldId) {
      setError("Scegli il campo dell'evento.");
      return;
    }
    if (action === "create-task" && !targetEntityId) {
      setError("Scegli il modulo di destinazione delle attività.");
      return;
    }
    if (action === "update-field" && !targetFieldId) {
      setError("Scegli il campo da aggiornare.");
      return;
    }
    const config: WorkflowConfig = {
      entityId,
      event,
      fieldId: fieldId || undefined,
      conditionFieldId: conditionFieldId || undefined,
      conditionOperator: conditionFieldId ? conditionOperator : undefined,
      conditionValue: conditionFieldId ? conditionValue : undefined,
      action,
      targetEntityId: targetEntityId || undefined,
      targetFieldId: targetFieldId || undefined,
      targetValue: targetValue || undefined,
    };
    const flow: Workflow = {
      id: newId("workflow"),
      name: name.trim(),
      trigger: `${entity.name}: ${event}${fieldId ? ` ${entity.fields.find((field) => field.id === fieldId)?.name}` : ""}`,
      actions: [action.replace(/-/g, " ")],
      active: true,
      runs: [],
      config,
    };
    if (onSave(flow)) onClose();
    else setError("Non è stato possibile salvare l'automazione.");
  };
  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="alert-overlay" />
        <Dialog.Content
          className="workflow-editor"
          aria-describedby="workflow-editor-description"
        >
          <header>
            <div>
              <Dialog.Title>Crea automazione</Dialog.Title>
              <Dialog.Description id="workflow-editor-description">
                Si esegue in questo browser quando i record cambiano. Nessun
                servizio in background e nessuna email inviata.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Chiudi">
                <X />
              </button>
            </Dialog.Close>
          </header>
          <div className="workflow-editor-fields">
            <label>
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="es. Segnala gli ordini di importo elevato"
              />
            </label>
            <section>
              <h3>
                <GitBranch size={15} /> Quando
              </h3>
              <label>
                Modulo
                <select
                  value={entityId}
                  onChange={(event) => {
                    setEntityId(event.target.value);
                    setFieldId("");
                    setConditionFieldId("");
                    setTargetFieldId("");
                  }}
                >
                  {workspace.entities.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Evento
                <select
                  value={event}
                  onChange={(event) =>
                    setEvent(event.target.value as WorkflowConfig["event"])
                  }
                >
                  <option value="create">Record creato</option>
                  <option value="update">Campo aggiornato</option>
                  <option value="status">Stato cambiato</option>
                </select>
              </label>
              {event !== "create" && (
                <label>
                  Campo
                  <select
                    value={fieldId}
                    onChange={(event) => setFieldId(event.target.value)}
                  >
                    <option value="">Scegli campo</option>
                    {entity?.fields
                      .filter(
                        (field) =>
                          event !== "status" ||
                          field.type === "status" ||
                          field.type === "select",
                      )
                      .map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </section>
            <section>
              <h3>Se (facoltativo)</h3>
              <label>
                Campo della condizione
                <select
                  value={conditionFieldId}
                  onChange={(event) => setConditionFieldId(event.target.value)}
                >
                  <option value="">Esegui sempre</option>
                  {entity?.fields.map((field) => (
                    <option key={field.id} value={field.id}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </label>
              {conditionFieldId && (
                <>
                  <label>
                    Confronto
                    <select
                      value={conditionOperator}
                      onChange={(event) =>
                        setConditionOperator(
                          event.target.value as "equals" | "greater-than",
                        )
                      }
                    >
                      <option value="equals">Uguale a</option>
                      <option value="greater-than">Maggiore di</option>
                    </select>
                  </label>
                  <label>
                    Valore
                    <input
                      value={conditionValue}
                      onChange={(event) =>
                        setConditionValue(event.target.value)
                      }
                    />
                  </label>
                </>
              )}
            </section>
            <section>
              <h3>Allora</h3>
              <label>
                Azione
                <select
                  value={action}
                  onChange={(event) =>
                    setAction(event.target.value as WorkflowConfig["action"])
                  }
                >
                  <option value="notify">Crea notifica interna</option>
                  <option value="create-task">Crea attività</option>
                  <option value="update-field">Aggiorna campo</option>
                  <option value="request-approval">Richiedi approvazione</option>
                </select>
              </label>
              {action === "create-task" && (
                <label>
                  Modulo di destinazione
                  <select
                    value={targetEntityId}
                    onChange={(event) => setTargetEntityId(event.target.value)}
                  >
                    <option value="">Scegli modulo delle attività</option>
                    {workspace.entities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {action === "update-field" && (
                <>
                  <label>
                    Campo di destinazione
                    <select
                      value={targetFieldId}
                      onChange={(event) => setTargetFieldId(event.target.value)}
                    >
                      <option value="">Scegli campo</option>
                      {entity?.fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Nuovo valore
                    <input
                      value={targetValue}
                      onChange={(event) => setTargetValue(event.target.value)}
                    />
                  </label>
                </>
              )}
            </section>
            {error && (
              <p role="alert" className="field-error">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button className="secondary" onClick={onClose}>
              Annulla
            </button>
            <button className="primary" onClick={create}>
              Crea automazione
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
