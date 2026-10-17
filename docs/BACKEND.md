# Connected NODUS: setup and verification

No infrastructure is created automatically. Use your approved Supabase and Netlify accounts.

1. Execute `server/migrations/001_platform.sql` once in Supabase SQL Editor. It uses Supabase's `auth.uid()`, `anon` and `authenticated` roles. The migration ledger records version 1. Client roles receive tenant-scoped SELECT only; mutation goes through validated Functions.
2. Create a **private** Storage bucket `nodus-private` with a 10 MB limit. Do not grant public access. Restrict MIME types to business files; exclude active HTML, JavaScript and SVG content.
3. Configure Supabase Auth email delivery and application redirect allowlists, including `/?mode=connected`. Create the first admin identity through Supabase Auth. Add its UUID to a trusted database membership:

```sql
INSERT INTO organizations(name) VALUES ('Your organization') RETURNING id;
INSERT INTO memberships(organization_id,user_id,role_id,display_name)
VALUES ('ORGANIZATION_UUID','AUTH_USER_UUID','admin','Your name');
```

4. Set build-time public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anonymous/publishable key is intended for browsers and is protected by RLS.
5. Set server-only Functions variables: `DATABASE_URL` (Supabase transaction pooler, TLS), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `APP_ORIGIN` (trusted full application origin). Never prefix these with `VITE_`. Use `.env.example`; secret files are ignored.
6. Deploy, sign into Connected workspace and initialize an empty workspace as admin. Invite members there. Provider acceptance of an invitation is reported separately from email delivery.
7. Verify Netlify registers `workflow-worker` as a scheduled Function. It processes at most ten events per invocation, with three attempts maximum. If a record changes before execution, the old event is marked superseded to avoid stale side effects.

## API contract

Endpoint: `/.netlify/functions/api`. All requests require `Authorization: Bearer <Supabase access token>`. The server validates the token and membership. Optional query `organization=<uuid>` only selects an organization the verified user belongs to; the request body cannot supply acting-user, role or tenant overrides.

- GET: workspace, current role, attachment metadata, recent event status and AI availability.
- POST `{ action: "initialize", name }`: admin-only initialization.
- POST `{ action: "mutate", expectedRevision, requestId, command }`: atomic validated mutation with a fresh UUID request ID. Commands: configure, stageProposal, publish, discardDraft, restoreVersion, saveRecord, deleteRecord, comment, approval. Exact runtime schemas are in `src/services/workspaceActions.ts` and `configuration.ts`.
- POST `{ action: "invite", email, name, role }`: admin-only invitation (manager/operator/viewer).
- POST `{ action: "operator", request }`: authorized deterministic query.
- POST `{ action: "attachmentInit", entityId, recordId, filename, mime, size }`: private upload URL and attachment ID. PUT bytes to that URL, then POST `{ action: "attachmentComplete", id }`. The server checks object existence/size before exposing metadata.
- POST `{ action: "attachmentUrl", id }`: 60-second authorized signed download.
- POST `{ action: "attachmentDelete", id }`: private-object and metadata deletion.
- POST `{ action: "propose", request, expectedRevision }`: optional AI adapter.

409 means stale/concurrent state: refresh, review and retry. A repeated request ID with the same command cannot duplicate effects; changing its command is rejected. Transactions include the aggregate, tenant projections, event enqueue, receipt and audit. The aggregate/projection approach favors correctness for small organizations; use paginated entity repositories and targeted writes before scaling beyond 5,000 records.

## Optional AI adapter

`AI_PROVIDER_URL` is a trusted HTTPS adapter endpoint; `AI_PROVIDER_API_KEY` is its server-only Bearer token. The adapter receives `{ request, configuration, baseRevision, responseSchema }` and returns the JSON proposal schema: id, request, interpretation, baseRevision, operations, ambiguities, impact.

This is a provider-neutral contract, not a direct vendor chat-completion endpoint. Supply an adapter for your chosen model. Responses are size/time limited, redirects disallowed and operations/references runtime validated. No model call is made when configuration is missing. Proposals require staging and publication; no model-generated code executes.

## Live acceptance checklist (requires configured services)

1. Two users in organization A must see the same published module and record after Refresh.
2. A user in B requesting `?organization=A_UUID` must receive 403. A's record/attachment IDs must not resolve in B. Direct PostgREST reads must obey RLS; client writes must be denied.
3. Two writes with the same revision: one success, one 409. Repeating a request UUID must not create a second record/event.
4. Upload, verify no public access, download via authorized signed URL, delete and verify both object and metadata are gone.
5. A matching record write must enqueue an event, then show complete with one effect. Revoked permission must fail safely; failures retry at most three times. Outputs must not recursively enqueue events.

These integration checks are not claimed as passed without a live test project. Existing unit tests verify domain behavior and membership boundaries, not the hosted providers.

## Limits

No realtime synchronization, connected bulk-import API, outbound webhooks or arbitrary executable actions. Remote files should be removed explicitly before deleting their record; a retention/garbage-collection policy is still required for orphaned files. Configure PostgreSQL/Storage backups separately; local JSON migration backups exclude IndexedDB blobs. This is an implemented backend boundary, not a claim of production-scale or compliance certification.
