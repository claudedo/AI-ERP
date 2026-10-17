import type { DataRecord, Workspace } from "../src/types";
import { runWorkflows } from "../src/services/workspaceDomain";
import { deriveAlerts } from "../src/services/aiEngine";

const businessState = (w: Workspace) => JSON.stringify([w.entities.map(e => ({ id: e.id, records: e.records })), w.notifications || [], w.approvals || []]);
/** No business effects means no aggregate persistence and no revision bump. */
export function executeWorkflowEvent(workspace: Workspace, entityId: string, recordId: string, previous?: DataRecord): Workspace | null {
  const next = structuredClone(workspace), entity = next.entities.find(e => e.id === entityId), record = entity?.records.find(r => r.id === recordId);
  if (!entity || !record) return null;
  const before = businessState(next), runs = new Set(next.workflows.flatMap(flow => flow.runs.map(run => run.id)));
  next.revision = (workspace.revision || 0) + 1;
  runWorkflows(next, entity, record, previous);
  const failure = next.workflows.flatMap(flow => flow.runs).find(run => !runs.has(run.id) && run.status === "failed");
  if (failure) throw new Error(failure.summary);
  if (businessState(next) === before) return null;
  next.alerts = deriveAlerts(next.entities);
  return next;
}
