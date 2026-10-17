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
      setError("Name and source module are required.");
      return;
    }
    if ((event === "update" || event === "status") && !fieldId) {
      setError("Choose a trigger field.");
      return;
    }
    if (action === "create-task" && !targetEntityId) {
      setError("Choose the target task module.");
      return;
    }
    if (action === "update-field" && !targetFieldId) {
      setError("Choose the field to update.");
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
    else setError("Workflow could not be saved.");
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
              <Dialog.Title>Create workflow</Dialog.Title>
              <Dialog.Description id="workflow-editor-description">
                Runs in this browser when records change. No background service
                or email is sent.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button aria-label="Close">
                <X />
              </button>
            </Dialog.Close>
          </header>
          <div className="workflow-editor-fields">
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Escalate large orders"
              />
            </label>
            <section>
              <h3>
                <GitBranch size={15} /> When
              </h3>
              <label>
                Module
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
                Event
                <select
                  value={event}
                  onChange={(event) =>
                    setEvent(event.target.value as WorkflowConfig["event"])
                  }
                >
                  <option value="create">Record created</option>
                  <option value="update">Field updated</option>
                  <option value="status">Status changed</option>
                </select>
              </label>
              {event !== "create" && (
                <label>
                  Field
                  <select
                    value={fieldId}
                    onChange={(event) => setFieldId(event.target.value)}
                  >
                    <option value="">Choose field</option>
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
              <h3>If (optional)</h3>
              <label>
                Condition field
                <select
                  value={conditionFieldId}
                  onChange={(event) => setConditionFieldId(event.target.value)}
                >
                  <option value="">Always run</option>
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
                    Comparison
                    <select
                      value={conditionOperator}
                      onChange={(event) =>
                        setConditionOperator(
                          event.target.value as "equals" | "greater-than",
                        )
                      }
                    >
                      <option value="equals">Equals</option>
                      <option value="greater-than">Greater than</option>
                    </select>
                  </label>
                  <label>
                    Value
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
              <h3>Then</h3>
              <label>
                Action
                <select
                  value={action}
                  onChange={(event) =>
                    setAction(event.target.value as WorkflowConfig["action"])
                  }
                >
                  <option value="notify">Create internal notification</option>
                  <option value="create-task">Create task</option>
                  <option value="update-field">Update field</option>
                  <option value="request-approval">Request approval</option>
                </select>
              </label>
              {action === "create-task" && (
                <label>
                  Target module
                  <select
                    value={targetEntityId}
                    onChange={(event) => setTargetEntityId(event.target.value)}
                  >
                    <option value="">Choose task module</option>
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
                    Target field
                    <select
                      value={targetFieldId}
                      onChange={(event) => setTargetFieldId(event.target.value)}
                    >
                      <option value="">Choose field</option>
                      {entity?.fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    New value
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
              Cancel
            </button>
            <button className="primary" onClick={create}>
              Create workflow
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
