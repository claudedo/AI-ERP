BEGIN;
CREATE TABLE IF NOT EXISTS nodus_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
CREATE TABLE IF NOT EXISTS memberships (organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL, role_id text NOT NULL CHECK (role_id IN ('admin','manager','operator','viewer')), display_name text NOT NULL, PRIMARY KEY(organization_id,user_id));
CREATE TABLE IF NOT EXISTS workspaces (organization_id uuid PRIMARY KEY REFERENCES organizations(id), revision bigint NOT NULL DEFAULT 0, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS configuration_versions (organization_id uuid NOT NULL REFERENCES organizations(id), version integer NOT NULL, configuration jsonb NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,version));
CREATE TABLE IF NOT EXISTS entities (organization_id uuid NOT NULL REFERENCES organizations(id), id text NOT NULL, schema jsonb NOT NULL, PRIMARY KEY(organization_id,id));
CREATE TABLE IF NOT EXISTS records (organization_id uuid NOT NULL, entity_id text NOT NULL, id text NOT NULL, payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'), PRIMARY KEY(organization_id,entity_id,id), FOREIGN KEY(organization_id,entity_id) REFERENCES entities(organization_id,id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS records_payload_idx ON records USING gin(payload);
CREATE TABLE IF NOT EXISTS relations (organization_id uuid NOT NULL REFERENCES organizations(id), id text NOT NULL, configuration jsonb NOT NULL, PRIMARY KEY(organization_id,id));
CREATE TABLE IF NOT EXISTS comments (organization_id uuid NOT NULL REFERENCES organizations(id), id text NOT NULL, entity_id text NOT NULL, record_id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(organization_id,id));
CREATE TABLE IF NOT EXISTS attachments (organization_id uuid NOT NULL REFERENCES organizations(id), id uuid NOT NULL DEFAULT gen_random_uuid(), entity_id text NOT NULL, record_id text NOT NULL, object_path text NOT NULL UNIQUE, filename text NOT NULL, mime text NOT NULL, size bigint NOT NULL CHECK(size BETWEEN 0 AND 10485760), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')), created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,id));
CREATE TABLE IF NOT EXISTS workflows (organization_id uuid NOT NULL REFERENCES organizations(id), id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(organization_id,id));
CREATE TABLE IF NOT EXISTS approvals (organization_id uuid NOT NULL REFERENCES organizations(id), id text NOT NULL, payload jsonb NOT NULL, PRIMARY KEY(organization_id,id));
CREATE TABLE IF NOT EXISTS audit_log (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, organization_id uuid NOT NULL REFERENCES organizations(id), actor_id uuid NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS action_receipts (organization_id uuid NOT NULL REFERENCES organizations(id), request_id uuid NOT NULL, request_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(organization_id,request_id));
CREATE TABLE IF NOT EXISTS workflow_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), actor_id uuid NOT NULL, entity_id text NOT NULL, record_id text NOT NULL, record jsonb NOT NULL, previous_record jsonb, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','complete','failed','superseded')), attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(), error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS workflow_events_pending_idx ON workflow_events(available_at) WHERE status='pending';

-- API queries always bind organization_id derived from a verified membership.
-- These policies additionally protect direct PostgREST access for authenticated users.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_memberships ON memberships FOR SELECT TO authenticated USING (user_id=auth.uid());
CREATE POLICY own_organizations ON organizations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=organizations.id AND m.user_id=auth.uid()));
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['workspaces','configuration_versions','entities','records','relations','comments','attachments','workflows','approvals','audit_log','action_receipts','workflow_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    -- No client writes: all mutation paths must go through validated API actions.
    EXECUTE format('CREATE POLICY member_read ON %I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id=%I.organization_id AND m.user_id=auth.uid()))',table_name,table_name);
  END LOOP;
END $$;
-- Receipt payloads and job internals are server-only, including for same-tenant users.
DROP POLICY member_read ON action_receipts;
DROP POLICY member_read ON workflow_events;
REVOKE ALL ON organizations,memberships,workspaces,configuration_versions,entities,records,relations,comments,attachments,workflows,approvals,audit_log,action_receipts,workflow_events FROM anon,authenticated;
GRANT SELECT ON organizations,memberships,workspaces,configuration_versions,entities,records,relations,comments,attachments,workflows,approvals,audit_log TO authenticated;
INSERT INTO nodus_migrations(version) VALUES(1);
COMMIT;
