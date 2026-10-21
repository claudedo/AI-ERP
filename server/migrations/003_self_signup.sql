-- 003: self-service sign-up bootstrap.
-- Adds only what the server-side `bootstrap` action needs. RLS policies, role permissions and
-- grants are unchanged: clients keep SELECT-only access; organizations are still written only
-- by the server (Functions connect with DATABASE_URL, outside anon/authenticated).
-- Idempotent: safe to run more than once. Run after 001 and 002.
BEGIN;
-- Nullable: organizations created manually by an operator keep created_by NULL.
-- On an existing table this is a metadata-only change (no rewrite, no default).
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_by uuid;
-- At most one self-service organization per creating user (NULLs are distinct, so manual
-- organizations are unaffected). Backstop for the per-user advisory lock taken by bootstrap.
-- Plain (non-CONCURRENT) build: organizations is a small tenant table and this runs once.
CREATE UNIQUE INDEX IF NOT EXISTS organizations_created_by_key ON organizations(created_by);
-- Defensive re-assertion of 001: still no client writes on organizations or memberships.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON organizations, memberships FROM anon, authenticated;
INSERT INTO nodus_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
COMMIT;

-- Rollback (manual, only if no self-service organization depends on it):
--   BEGIN; DROP INDEX IF EXISTS organizations_created_by_key;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS created_by;
--   DELETE FROM nodus_migrations WHERE version=3; COMMIT;
