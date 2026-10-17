import { database, authorizeMembership, withMembers, respond } from "../../server/platform";
import { persistWorkspace } from "../../server/repository";
import { requirePermission, runWorkflows } from "../../src/services/workspaceDomain";
import type { DataRecord, Workspace } from "../../src/types";

export const config = { schedule: "* * * * *" };
export default async function worker() {
  if (!process.env.DATABASE_URL || !process.env.SUPABASE_URL) return respond({ configured: false }, 503);
  const sql = database();
  let processed = 0;
  for (let index = 0; index < 10; index++) {
    const found = await sql.begin(async tx => {
      const [event] = await tx`SELECT * FROM workflow_events WHERE status='pending' AND available_at<=now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`;
      if (!event) return false;
      // A savepoint ensures a failed action rolls back all workflow side effects, while recording retry metadata.
      try {
        await tx.savepoint(async job => {
          const members = await job`SELECT * FROM memberships WHERE organization_id=${event.organization_id}::uuid AND user_id=${event.actor_id}::uuid`;
          const principal = authorizeMembership(event.actor_id, members as unknown as Parameters<typeof authorizeMembership>[1]);
          const [row] = await job`SELECT payload FROM workspaces WHERE organization_id=${event.organization_id}::uuid FOR UPDATE`;
          if (!row) throw new Error("Workspace no longer exists.");
          const workspace = await withMembers(row.payload as Workspace, principal);
          requirePermission(workspace, "editRecords");
          const entity = workspace.entities.find(item => item.id === event.entity_id), record = entity?.records.find(item => item.id === event.record_id);
          if (!entity || !record || JSON.stringify(record) !== JSON.stringify(event.record)) {
            await job`UPDATE workflow_events SET status='superseded',error='Record changed before execution; stale side effects were skipped.' WHERE id=${event.id}::uuid AND organization_id=${event.organization_id}::uuid`;
            return;
          }
          workspace.revision = (workspace.revision || 0) + 1;
          const previousRunIds = new Set(workspace.workflows.flatMap(flow => flow.runs.map(run => run.id)));
          runWorkflows(workspace, entity, record, event.previous_record as DataRecord | undefined);
          const failure = workspace.workflows.flatMap(flow => flow.runs).find(run => !previousRunIds.has(run.id) && run.status === "failed");
          if (failure) throw new Error(failure.summary);
          await persistWorkspace(job, event.organization_id, event.actor_id, workspace);
          await job`UPDATE workflow_events SET status='complete',attempts=attempts+1 WHERE id=${event.id}::uuid AND organization_id=${event.organization_id}::uuid`;
          await job`INSERT INTO audit_log(organization_id,actor_id,action,detail) VALUES(${event.organization_id}::uuid,${event.actor_id}::uuid,'workflow-event',${job.json({ eventId: event.id })})`;
        });
      } catch {
        await tx`UPDATE workflow_events SET attempts=attempts+1,status=CASE WHEN attempts+1>=3 THEN 'failed' ELSE 'pending' END,available_at=now()+interval '1 minute'*(attempts+1),error='Workflow failed validation or authorization. Review configuration and membership.' WHERE id=${event.id}::uuid AND organization_id=${event.organization_id}::uuid`;
      }
      return true;
    });
    if (!found) break;
    processed++;
  }
  return respond({ processed });
}
