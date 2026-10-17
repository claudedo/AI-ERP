import type { TransactionSql } from "postgres";
import type { Workspace } from "../src/types";
import { configurationOf } from "../src/services/configuration";

// A transactional workspace aggregate plus queryable tenant-scoped projections.
// Suitable for small organizations; large datasets should use per-entity pagination.
export async function persistWorkspace(sql: TransactionSql, organizationId: string, userId: string, workspace: Workspace) {
  if (workspace.entities.reduce((sum, entity) => sum + entity.records.length, 0) > 5000) throw new Error("Connected workspaces currently support at most 5,000 records.");
  await sql`UPDATE workspaces SET payload=${sql.json(workspace as never)}, revision=${workspace.revision || 0}, updated_at=now() WHERE organization_id=${organizationId}::uuid`;
  await sql`INSERT INTO configuration_versions(organization_id,version,configuration,created_by) VALUES(${organizationId}::uuid,${workspace.configurationVersion || 1},${sql.json(configurationOf(workspace) as never)},${userId}::uuid) ON CONFLICT DO NOTHING`;
  await sql`DELETE FROM entities WHERE organization_id=${organizationId}::uuid`;
  for (const entity of workspace.entities) {
    const { records, ...schema } = entity;
    await sql`INSERT INTO entities(organization_id,id,schema) VALUES(${organizationId}::uuid,${entity.id},${sql.json(schema as never)})`;
    if (records.length) await sql`INSERT INTO records(organization_id,entity_id,id,payload) SELECT ${organizationId}::uuid,${entity.id},item->>'id',item FROM jsonb_array_elements(${sql.json(records as never)}) item`;
  }
  await sql`DELETE FROM relations WHERE organization_id=${organizationId}::uuid`;
  if (workspace.relations.length) await sql`INSERT INTO relations(organization_id,id,configuration) SELECT ${organizationId}::uuid,item->>'id',item FROM jsonb_array_elements(${sql.json(workspace.relations as never)}) item`;
  await sql`DELETE FROM comments WHERE organization_id=${organizationId}::uuid`;
  if (workspace.comments?.length) await sql`INSERT INTO comments(organization_id,id,entity_id,record_id,payload) SELECT ${organizationId}::uuid,item->>'id',item->>'entityId',item->>'recordId',item FROM jsonb_array_elements(${sql.json(workspace.comments as never)}) item`;
  await sql`DELETE FROM workflows WHERE organization_id=${organizationId}::uuid`;
  if (workspace.workflows.length) await sql`INSERT INTO workflows(organization_id,id,payload) SELECT ${organizationId}::uuid,item->>'id',item FROM jsonb_array_elements(${sql.json(workspace.workflows as never)}) item`;
  await sql`DELETE FROM approvals WHERE organization_id=${organizationId}::uuid`;
  if (workspace.approvals?.length) await sql`INSERT INTO approvals(organization_id,id,payload) SELECT ${organizationId}::uuid,item->>'id',item FROM jsonb_array_elements(${sql.json(workspace.approvals as never)}) item`;
}
