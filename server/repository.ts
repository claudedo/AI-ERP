import type { TransactionSql } from "postgres";
import type { Workspace } from "../src/types";
import { configurationOf } from "../src/services/configuration";

/** Diff projections by stable ID; never delete/reinsert an entire tenant on each edit. */
export function projectionDelta<T extends { id: string }>(next: T[], previous: T[] = []) {
  const before = new Map(previous.map(item => [item.id, item]));
  const after = new Set(next.map(item => item.id));
  return { changed: next.filter(item => JSON.stringify(before.get(item.id)) !== JSON.stringify(item)), removed: previous.filter(item => !after.has(item.id)).map(item => item.id) };
}

export async function persistWorkspace(sql: TransactionSql, organizationId: string, userId: string, workspace: Workspace, previous?: Workspace) {
  if (workspace.entities.reduce((sum, entity) => sum + entity.records.length, 0) > 5000) throw new Error("Connected workspaces currently support at most 5,000 records.");
  await sql`UPDATE workspaces SET payload=${sql.json(workspace as never)}, revision=${workspace.revision || 0}, updated_at=now() WHERE organization_id=${organizationId}::uuid`;
  if (!previous || previous.configurationVersion !== workspace.configurationVersion) await sql`INSERT INTO configuration_versions(organization_id,version,configuration,created_by) VALUES(${organizationId}::uuid,${workspace.configurationVersion || 1},${sql.json(configurationOf(workspace) as never)},${userId}::uuid) ON CONFLICT DO NOTHING`;
  const schemas = (w?: Workspace) => w?.entities.map(({ records: _records, ...schema }) => schema) || [];
  const entities = projectionDelta(schemas(workspace), schemas(previous));
  if (entities.removed.length) await sql`DELETE FROM entities WHERE organization_id=${organizationId}::uuid AND id IN ${sql(entities.removed)}`;
  for (const schema of entities.changed) await sql`INSERT INTO entities(organization_id,id,schema) VALUES(${organizationId}::uuid,${schema.id},${sql.json(schema as never)}) ON CONFLICT(organization_id,id) DO UPDATE SET schema=EXCLUDED.schema`;
  for (const entity of workspace.entities) {
    const records = projectionDelta(entity.records, previous?.entities.find(item => item.id === entity.id)?.records);
    if (records.removed.length) await sql`DELETE FROM records WHERE organization_id=${organizationId}::uuid AND entity_id=${entity.id} AND id IN ${sql(records.removed)}`;
    if (records.changed.length) await sql`INSERT INTO records(organization_id,entity_id,id,payload) SELECT ${organizationId}::uuid,${entity.id},item->>'id',item FROM jsonb_array_elements(${sql.json(records.changed as never)}) item ON CONFLICT(organization_id,entity_id,id) DO UPDATE SET payload=EXCLUDED.payload`;
  }
  const relations = projectionDelta(workspace.relations, previous?.relations);
  if (relations.removed.length) await sql`DELETE FROM relations WHERE organization_id=${organizationId}::uuid AND id IN ${sql(relations.removed)}`;
  if (relations.changed.length) await sql`INSERT INTO relations(organization_id,id,configuration) SELECT ${organizationId}::uuid,item->>'id',item FROM jsonb_array_elements(${sql.json(relations.changed as never)}) item ON CONFLICT(organization_id,id) DO UPDATE SET configuration=EXCLUDED.configuration`;
  const comments = projectionDelta(workspace.comments || [], previous?.comments);
  if (comments.removed.length) await sql`DELETE FROM comments WHERE organization_id=${organizationId}::uuid AND id IN ${sql(comments.removed)}`;
  if (comments.changed.length) await sql`INSERT INTO comments(organization_id,id,entity_id,record_id,payload) SELECT ${organizationId}::uuid,item->>'id',item->>'entityId',item->>'recordId',item FROM jsonb_array_elements(${sql.json(comments.changed as never)}) item ON CONFLICT(organization_id,id) DO UPDATE SET entity_id=EXCLUDED.entity_id,record_id=EXCLUDED.record_id,payload=EXCLUDED.payload`;
  for (const table of ["workflows", "approvals"] as const) {
    const changes = projectionDelta<{ id: string }>(workspace[table] || [], previous?.[table]);
    if (changes.removed.length) await sql`DELETE FROM ${sql(table)} WHERE organization_id=${organizationId}::uuid AND id IN ${sql(changes.removed)}`;
    if (changes.changed.length) await sql`INSERT INTO ${sql(table)}(organization_id,id,payload) SELECT ${organizationId}::uuid,item->>'id',item FROM jsonb_array_elements(${sql.json(changes.changed as never)}) item ON CONFLICT(organization_id,id) DO UPDATE SET payload=EXCLUDED.payload`;
  }
}
