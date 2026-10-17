import { database, identity, required } from "./platform";

/** Retryable bounded cleanup: never drop the DB reference if Storage deletion fails. */
export async function cleanupOrphanAttachments() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_STORAGE_BUCKET) return 0;
  const sql = database();
  const orphans = await sql`SELECT a.organization_id,a.id,a.object_path FROM attachments a WHERE NOT EXISTS(SELECT 1 FROM records r WHERE r.organization_id=a.organization_id AND r.entity_id=a.entity_id AND r.id=a.record_id) ORDER BY a.created_at LIMIT 25`;
  if (!orphans.length) return 0;
  const bucket = identity().storage.from(required("SUPABASE_STORAGE_BUCKET"));
  let removed = 0;
  for (const attachment of orphans) {
    try {
      const { error } = await bucket.remove([attachment.object_path]);
      if (error) continue;
      await sql`DELETE FROM attachments WHERE organization_id=${attachment.organization_id}::uuid AND id=${attachment.id}::uuid`;
      removed++;
    } catch { console.error("NODUS attachment cleanup failed; retry scheduled"); }
  }
  return removed;
}
