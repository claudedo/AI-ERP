# Connected NODUS: setup and verification

No infrastructure is created automatically. Use your approved Supabase and Netlify accounts.

1. Execute the migrations once each, in order, in Supabase SQL Editor: `server/migrations/001_platform.sql`, `002_ai_usage.sql`, `003_self_signup.sql`. They use Supabase's `auth.uid()`, `anon` and `authenticated` roles. The `nodus_migrations` ledger records applied versions. Client roles receive tenant-scoped SELECT only; mutation goes through validated Functions. 002 and 003 are idempotent; do not rerun 001 on an initialized database.
2. Create a **private** Storage bucket `nodus-private` with a 10 MB limit. Do not grant public access. Restrict MIME types to business files; exclude active HTML, JavaScript and SVG content.
3. Configure Supabase Auth (Dashboard → Authentication):
   - **Email provider ON**, **Confirm email ON** (the server refuses to create a company for an unconfirmed email), "Allow new users to sign up" ON.
   - **URL Configuration**: Site URL = the production origin (e.g. `https://<site>.netlify.app`). **Redirect URLs** allowlist: `https://<site>.netlify.app/?mode=connected`, `https://<site>.netlify.app/?mode=connected&flow=signup` (or `https://<site>.netlify.app/**`) and, for local tests, `http://localhost:5173/**`.
   - **Email delivery**: the built-in Supabase SMTP is for testing only. It sends **only to addresses of the project's team members** and is heavily rate limited. For real customers configure a custom SMTP (Authentication → SMTP Settings) before opening sign-up.
4. Set build-time public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anonymous/publishable key is intended for browsers and is protected by RLS.
5. Set server-only Functions variables: `DATABASE_URL` (Supabase transaction pooler, TLS), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `APP_ORIGIN` (trusted full application origin, used for invitation redirects). Never prefix these with `VITE_`. Use `.env.example`; secret files are ignored.
6. Deploy. No manual SQL is needed for customers: they follow the self-service flow below.
7. Verify Netlify registers `workflow-worker` as a scheduled Function. It processes at most ten events per invocation, with three attempts maximum. If a record changes before execution, the old event is marked superseded to avoid stale side effects.

## Self-service flow: sign-up → confirm → bootstrap → invite

1. **Sign-up.** In *Workspace condiviso* (`/?mode=connected`) → *Registrati*: nome, email, password (min. 8), nome azienda. The browser calls Supabase `auth.signUp` with `emailRedirectTo = <origin>/?mode=connected&flow=signup` and `{ name, company }` as user metadata. An already registered email shows "Email già registrata" (only what Supabase itself discloses). "Reinvia email di conferma" uses `auth.resend`.
2. **Confirm.** The confirmation link signs the user in and returns to connected mode. Before confirmation the UI shows "Conferma la tua email per continuare" and the server refuses bootstrap with 403 `email_not_confirmed`.
3. **Bootstrap.** A signed-in user without any membership receives 403 `no_membership` from GET; the UI then offers *Crea la tua azienda* (prefilled from metadata, editable). POST `{ action: "bootstrap", company, name? }` creates, **in one transaction**, the organization (`created_by` = verified user), the `admin` membership and the initialized empty workspace (same as `initialize`), plus an audit entry. The user id comes only from the verified token; the body cannot carry user, organization or role (strict schema, 400). A per-user transaction advisory lock plus the unique index on `organizations.created_by` prevent duplicates under concurrency. If the user already has any membership (e.g. an invited collaborator), nothing is created and the existing organization is returned (200, `created: false`). If the account created an organization it no longer belongs to: 409 `company_exists` ("Hai già un'azienda…").
4. **Invite.** The admin invites colleagues (manager/operator/viewer) from the workspace. The invitation redirects to `APP_ORIGIN/?mode=connected`; the colleague lands directly in the inviter's organization with the invited role and never sees company creation. Expired or reused links (`error_code=otp_expired` in the redirect) show an Italian message asking for a new invite or link; provider text from the URL is never displayed.

Anti-abuse: bootstrap is limited to 5 attempts/minute per client IP per warm Function instance (in-memory, 429 `rate_limit` with `Retry-After`), and `netlify/functions/api.ts` declares a Netlify `config.rateLimit` of 300 requests/minute per IP and domain for the whole API. Supabase Auth applies its own sign-up/email rate limits. Logs contain only error names, never tokens, emails or company names. A missing server variable answers 503 `not_configured` with an Italian message.

**Operator fallback (optional, not part of the customer procedure).** To attach an existing Auth user to an organization manually (e.g. support recovery), run in SQL Editor:

```sql
INSERT INTO organizations(name) VALUES ('Your organization') RETURNING id;
INSERT INTO memberships(organization_id,user_id,role_id,display_name)
VALUES ('ORGANIZATION_UUID','AUTH_USER_UUID','admin','Your name');
```

The admin then initializes the empty workspace from the UI.

## Migration 003

`003_self_signup.sql` adds the nullable `organizations.created_by uuid` column and the unique index `organizations_created_by_key` (one self-service organization per creating user; manual organizations keep NULL and are unaffected), re-asserts that `anon`/`authenticated` cannot write `organizations`/`memberships`, and records version 3. RLS policies, grants for reads and role permissions are unchanged. A manual rollback is documented at the end of the file.

## Local testing with real Supabase (dev runner, no netlify-cli)

`npm run dev` serves the app **and** the Functions: a dev-only Vite plugin (`vite.config.ts`, `apply: "serve"`) routes `/.netlify/functions/:name` to the default export of `netlify/functions/:name.ts` via `ssrLoadModule`, with a standard `Request`/`Response`. Server-only variables are read from `.env` into the dev server process only; the browser receives only `VITE_`-prefixed variables. It is never part of `vite build` or `vite preview`.

1. Use a separate Supabase **test** project. Run migrations 001 → 002 → 003 and create the private bucket.
2. Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `APP_ORIGIN=http://localhost:5173`.
3. In Supabase Auth add `http://localhost:5173/**` to Redirect URLs. With the default SMTP, sign up with an email of a project team member.
4. `npm run dev`, open `http://localhost:5173/?mode=connected`, register, confirm from the email, create the company, invite a colleague (also a team-member address with the default SMTP).

## API contract

Endpoint: `/.netlify/functions/api`. All requests require `Authorization: Bearer <Supabase access token>`. The server validates the token and membership. Optional query `organization=<uuid>` only selects an organization the verified user belongs to; the request body cannot supply acting-user, role or tenant overrides.

- GET: workspace, current role, attachment metadata, recent event status and AI availability. A verified user without any organization gets 403 with `reason: "no_membership"`.
- POST `{ action: "bootstrap", company, name? }`: self-service creation of organization + admin membership + workspace for a confirmed user without membership (see the flow above). 201 created, 200 already a member, 403 `email_not_confirmed`, 409 `company_exists`, 429 `rate_limit`.
- POST `{ action: "initialize", name }`: admin-only initialization.
- POST `{ action: "mutate", expectedRevision, requestId, command }`: atomic validated mutation with a fresh UUID request ID. Commands: configure, stageProposal, publish, applyProposal, configureAndPublish, discardDraft, restoreVersion, saveRecord, deleteRecord, smartEntry, comment, approval. `applyProposal` and `configureAndPublish` include staging and publication in the same transaction. Exact runtime schemas are in `src/services/workspaceActions.ts` and `configuration.ts`.
- POST `{ action: "invite", email, name, role }`: admin-only invitation (manager/operator/viewer).
- POST `{ action: "operator", request }`: authorized deterministic query.
- POST `{ action: "attachmentInit", entityId, recordId, filename, mime, size }`: private upload URL and attachment ID. PUT bytes to that URL, then POST `{ action: "attachmentComplete", id }`. The server checks object existence/size before exposing metadata.
- POST `{ action: "attachmentUrl", id }`: 60-second authorized signed download.
- POST `{ action: "attachmentDelete", id }`: private-object and metadata deletion.
- POST `{ action: "propose", request, expectedRevision }`: optional AI adapter.

409 means stale/concurrent state: refresh, review and retry. A repeated request ID with the same command cannot duplicate effects; changing its command is rejected. Transactions include the aggregate, tenant projections, event enqueue, receipt and audit. Membership queries inside transactions reuse the same connection. Projection writes are ID-based deltas; unchanged rows are not deleted/reinserted. The JSON aggregate is still persisted as a whole: server-side pagination and per-entity repositories remain necessary before scaling beyond 5,000 records.

## Optional AI adapter

`AI_PROVIDER_URL` is a trusted HTTPS adapter endpoint; `AI_PROVIDER_API_KEY` is its server-only Bearer token. The adapter receives `{ request, configuration, baseRevision, responseSchema }` and returns the JSON proposal schema: id, request, interpretation, baseRevision, operations, ambiguities, impact.

This is a provider-neutral contract, not a direct vendor chat-completion endpoint. Supply an adapter for your chosen model. Responses are size/time limited, redirects disallowed and operations/references runtime validated. No model call is made when configuration is missing. Proposals require staging and publication; no model-generated code executes.

## Live acceptance checklist (requires configured services)

1. Sign up a new user, confirm the email, create the company: exactly one organization, one admin membership and one workspace exist; a second click or a reload does not create another. An invited colleague lands in the inviter's organization with the invited role.
2. Two users in organization A must see the same published module and record after Refresh.
3. A user in B requesting `?organization=A_UUID` must receive 403. A's record/attachment IDs must not resolve in B. Direct PostgREST reads must obey RLS; client writes must be denied.
4. Two writes with the same revision: one success, one 409. Repeating a request UUID must not create a second record/event.
5. Upload, verify no public access, download via authorized signed URL, delete and verify both object and metadata are gone.
6. A matching record write must enqueue an event, then show complete with one effect. Revoked permission must fail safely; failures retry at most three times. Outputs must not recursively enqueue events.

These integration checks are not claimed as passed without a live test project. Existing unit tests verify domain behavior and membership boundaries, not the hosted providers.

## Limits

No realtime synchronization, connected bulk-import API, outbound webhooks or arbitrary executable actions. Downloads and upload completion reject attachments whose record no longer exists; GET excludes them. The scheduled worker retries orphan-file cleanup in batches of 25, preserving metadata until Storage confirms deletion. Verify that this worker is actually scheduled and monitor failures. Configure PostgreSQL/Storage backups separately; local JSON migration backups exclude IndexedDB blobs. This is an implemented backend boundary, not a claim of production-scale or compliance certification.
