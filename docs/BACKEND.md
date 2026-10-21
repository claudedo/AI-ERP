# Connected NODUS: setup and verification

No infrastructure is created automatically. Use your approved Supabase and Netlify accounts.

1. Execute the migrations once each, in order, in Supabase SQL Editor: `server/migrations/001_platform.sql`, `002_ai_usage.sql`, `003_self_signup.sql`. They use Supabase's `auth.uid()`, `anon` and `authenticated` roles. The `nodus_migrations` ledger records applied versions. Client roles receive tenant-scoped SELECT only; mutation goes through validated Functions. 002 and 003 are idempotent; do not rerun 001 on an initialized database.
2. Create a **private** Storage bucket `nodus-private` with a 10 MB limit. Do not grant public access. Restrict MIME types to business files; exclude active HTML, JavaScript and SVG content.
3. Configure Supabase Auth (Dashboard → Authentication):
   - **Email provider ON**, "Allow new users to sign up" ON, and **Confirm email MUST be ON**. Bootstrap trusts `email_confirmed_at` from Supabase: with confirmation OFF Supabase marks every address confirmed at sign-up, so anyone could create a company with an email they do not own.
   - **Pre-account-takeover (pre-hijacking) mitigation:** keep Confirm email ON so an attacker cannot pre-register a victim's address with a known password and wait for it to be used. Supabase does not let an unconfirmed sign-up block the real owner: the owner's confirmation or invite link is what proves control of the mailbox. For invited users, recommend setting a new password (password reset) right after accepting the invitation, so no credential chosen before confirmation survives.
   - **Rate limits** (Authentication → Rate Limits): set conservative values for *sign-ups and sign-ins* (per IP), *emails sent* (per hour; with custom SMTP choose a value your provider tolerates, e.g. 30–100/h), *token verifications / OTP* (per IP) and *token refreshes*. These are the main brake on sign-up and email abuse; NODUS's own limits only protect company creation.
   - **URL Configuration**: Site URL = the production origin (e.g. `https://<site>.netlify.app`). **Redirect URLs** allowlist: `https://<site>.netlify.app/?mode=connected`, `https://<site>.netlify.app/?mode=connected&flow=signup` (or `https://<site>.netlify.app/**`) and, for local tests, `http://localhost:5173/**`.
   - **Email delivery**: the built-in Supabase SMTP is for testing only. It sends **only to addresses of the project's team members** and is heavily rate limited. For real customers configure a custom SMTP (Authentication → SMTP Settings) before opening sign-up.
4. Set build-time public `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The anonymous/publishable key is intended for browsers and is protected by RLS.
5. Set server-only Functions variables: `DATABASE_URL` (Supabase transaction pooler, TLS), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `APP_ORIGIN` (trusted full application origin, used for invitation redirects). Never prefix these with `VITE_`. Use `.env.example`; secret files are ignored.
6. Deploy. No manual SQL is needed for customers: they follow the self-service flow below.
7. Verify Netlify registers `workflow-worker` as a scheduled Function. It processes at most ten events per invocation, with three attempts maximum. If a record changes before execution, the old event is marked superseded to avoid stale side effects.

## Self-service flow: sign-up → confirm → bootstrap → invite

1. **Sign-up.** In *Workspace condiviso* (`/?mode=connected`) → *Registrati*: nome, email, password (min. 8), nome azienda. The browser calls Supabase `auth.signUp` with `emailRedirectTo = <origin>/?mode=connected&flow=signup` and `{ name, company }` as user metadata. To prevent account enumeration the answer is always neutral ("Se l'indirizzo è valido e non ancora registrato, riceverai un'email di conferma."), whether or not the address exists; magic-link requests likewise always answer "Se esiste un account con questa email, riceverai un link di accesso.". "Reinvia email di conferma" uses `auth.resend`.
2. **Confirm.** The confirmation link signs the user in and returns to connected mode. Before confirmation the UI shows "Conferma la tua email per continuare" and the server refuses bootstrap with 403 `email_not_confirmed`.
3. **Bootstrap.** A signed-in user without any membership receives 403 `no_membership` from GET; the UI then offers *Crea la tua azienda* (prefilled from metadata, editable). POST `/.netlify/functions/bootstrap` with `{ company, name? }` (its own Function, separate from the workspace API) creates, **in one transaction**, the organization (`created_by` = verified user), the `admin` membership and the initialized empty workspace (same as `initialize`), plus an audit entry. The user id comes only from the verified token; the body cannot carry user, organization or role (strict schema, 400); names must be 2–100 (company) / 1–100 (name) printable characters without lone UTF-16 surrogates. A per-user transaction advisory lock (also taken by `invite` around its membership insert, so bootstrap and invitation for the same user serialize) plus the unique index on `organizations.created_by` prevent duplicates under concurrency. If the user already has any membership (e.g. an invited collaborator), nothing is created and the existing organization is returned (200, `created: false`). If the account created an organization it no longer belongs to: 409 `company_exists` ("Hai già un'azienda…").
4. **Invite.** The admin invites colleagues (manager/operator/viewer) from the workspace. The invitation redirects to `APP_ORIGIN/?mode=connected`; the colleague lands directly in the inviter's organization with the invited role and never sees company creation. Expired or reused links (`error_code=otp_expired` in the redirect) show an Italian message asking for a new invite or link; provider text from the URL is never displayed.

Anti-abuse: `netlify/functions/bootstrap.ts` declares a Netlify `config.rateLimit` of 10 requests/minute per IP (enforced before the Function runs). As a second line, a per-warm-instance in-memory limit of 5/minute applies when the client IP is known (429 `rate_limit` with `Retry-After`); IP-less callers are not lumped into a shared bucket and rely on the Netlify rule. `netlify/functions/api.ts` keeps a generous 300/minute per IP and domain for the workspace API. Supabase Auth rate limits (step 3) cover sign-up, emails and OTP. Logs contain only error names, never tokens, emails or company names. A missing server variable answers 503 `not_configured` with an Italian message.

**Operator fallback (optional, not part of the customer procedure).** To attach an existing Auth user to an organization manually (e.g. support recovery), run in SQL Editor:

```sql
INSERT INTO organizations(name) VALUES ('Your organization') RETURNING id;
INSERT INTO memberships(organization_id,user_id,role_id,display_name)
VALUES ('ORGANIZATION_UUID','AUTH_USER_UUID','admin','Your name');
```

The admin then initializes the empty workspace from the UI.

**Operator runbook: `409 company_exists`.** A user who created an organization and was later removed from it (membership deleted) can never self-create another one: the unique `created_by` still points at them, so bootstrap answers 409 permanently. After reviewing the case (is the old organization abandoned? should the user be re-invited instead?), release the link:

```sql
UPDATE organizations SET created_by = NULL WHERE id = '<org uuid>';
```

The user can then create a new company, or be re-invited into the old one.

## Migration 003

`003_self_signup.sql` adds the nullable `organizations.created_by uuid` column and the unique index `organizations_created_by_key` (one self-service organization per creating user; manual organizations keep NULL and are unaffected), hides `created_by` from clients by replacing the table-wide SELECT grant with `GRANT SELECT (id, name) ON organizations TO authenticated` (exactly the columns members could read before; the `own_organizations` RLS policy is unchanged), re-asserts that `anon`/`authenticated` cannot write `organizations`/`memberships`, sets `lock_timeout = '5s'`, and records version 3. RLS policies and role permissions are unchanged; the server uses `DATABASE_URL` and is unaffected by the column grant. A manual rollback is documented at the end of the file.

## Local testing with real Supabase (dev runner, no netlify-cli)

`npm run dev` serves the app **and** the Functions: a dev-only Vite plugin (`vite.config.ts`, `apply: "serve"`) routes `/.netlify/functions/:name` to the default export of `netlify/functions/:name.ts` via `ssrLoadModule`, with a standard `Request`/`Response`. Server-only variables are read from `.env` into the dev server process only; the browser receives only `VITE_`-prefixed variables. It is never part of `vite build` or `vite preview`.

1. Use a separate Supabase **test** project. Run migrations 001 → 002 → 003 and create the private bucket.
2. Copy `.env.example` to `.env` and fill `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `APP_ORIGIN=http://localhost:5173`.
3. In Supabase Auth add `http://localhost:5173/**` to Redirect URLs. With the default SMTP, sign up with an email of a project team member.
4. `npm run dev`, open `http://localhost:5173/?mode=connected`, register, confirm from the email, create the company, invite a colleague (also a team-member address with the default SMTP).

## API contract

Endpoint: `/.netlify/functions/api`. All requests require `Authorization: Bearer <Supabase access token>`. The server validates the token and membership. Optional query `organization=<uuid>` only selects an organization the verified user belongs to; the request body cannot supply acting-user, role or tenant overrides.

- GET: workspace, current role, attachment metadata, recent event status and AI availability. A verified user without any organization gets 403 with `reason: "no_membership"`.
- POST `/.netlify/functions/bootstrap` `{ company, name? }` (separate Function, same Bearer token): self-service creation of organization + admin membership + workspace for a confirmed user without membership (see the flow above). 201 created, 200 already a member, 403 `email_not_confirmed`, 409 `company_exists`, 429 `rate_limit`.
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
