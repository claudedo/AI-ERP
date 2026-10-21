import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";

// Only the external boundaries are faked: Postgres (in-memory, transactional) and Supabase.
// The real handler, authenticate(), membership checks and bootstrap logic run unmodified.
const identity = vi.hoisted(() => ({ users: new Map<string, Record<string, unknown>>(), signedUrl: vi.fn(), invite: vi.fn() }));
vi.mock("postgres", async () => { const { fakeDatabase } = await import("./testing/fakeSql"); return { default: () => fakeDatabase.sql }; });
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => identity.users.has(token) ? { data: { user: identity.users.get(token) }, error: null } : { data: { user: null }, error: new Error("invalid JWT") },
      admin: { inviteUserByEmail: identity.invite },
    },
    storage: { from: () => ({ createSignedUrl: identity.signedUrl, info: vi.fn(), remove: vi.fn(), createSignedUploadUrl: vi.fn() }) },
  }),
}));
import { fakeDatabase as db } from "./testing/fakeSql";
import handler from "../netlify/functions/api";
import bootstrapHandler, { config } from "../netlify/functions/bootstrap";
import { userLockKey } from "./bootstrap";

const ALICE = "00000000-0000-4000-8000-00000000a11c", BOB = "00000000-0000-4000-8000-000000000b0b", CAROL = "00000000-0000-4000-8000-0000000ca201", DAVE = "00000000-0000-4000-8000-00000000da5e";
const ORG_A = "00000000-0000-4000-8000-0000000000aa", ORG_B = "00000000-0000-4000-8000-0000000000bb", ATTACHMENT_B = "00000000-0000-4000-8000-00000000f11e";
const confirmed = "2026-10-20T10:00:00Z";
const user = (id: string, email: string, emailConfirmedAt: string | null, metadata: Record<string, unknown> = {}) => ({ id, email, email_confirmed_at: emailConfirmedAt, user_metadata: metadata });
const workspaceNamed = (companyName: string) => { const a = analyzeBusiness("customers and orders"); return { ...generateWorkspace(a, generateArchitectureOptions(a)[2]), companyName }; };

type CallOptions = { organization?: string; ip?: string | null; fn?: "api" | "bootstrap" };
function call(token: string | null, body?: unknown, options: CallOptions = {}) {
  const fn = options.fn || "api", url = new URL(`https://nodus.test/.netlify/functions/${fn}`);
  if (options.organization) url.searchParams.set("organization", options.organization);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const request = new Request(url, body === undefined ? { headers } : { method: "POST", headers, body: JSON.stringify(body) });
  const context = options.ip === null ? {} : { ip: options.ip || crypto.randomUUID() };
  return (fn === "api" ? handler : bootstrapHandler)(request, context);
}
const bootstrap = (token: string | null, company = "Alfa Srl", extra: Record<string, unknown> = {}, options: CallOptions = {}) => call(token, { company, ...extra }, { ...options, fn: "bootstrap" });

beforeEach(() => {
  for (const [name, value] of Object.entries({ DATABASE_URL: "postgres://test-only", SUPABASE_URL: "https://identity.test", SUPABASE_SERVICE_ROLE_KEY: "test-only", SUPABASE_STORAGE_BUCKET: "test-only", APP_ORIGIN: "https://nodus.test" })) vi.stubEnv(name, value);
  identity.users = new Map([
    ["token-alice", user(ALICE, "alice@example.test", confirmed, { name: "Alice Rossi", company: "Alfa Srl" })],
    ["token-bob", user(BOB, "bob@example.test", confirmed, { name: "Bob" })],
    ["token-carol", user(CAROL, "carol@example.test", confirmed, { name: "Carol" })],
    ["token-dave", user(DAVE, "dave@example.test", null, { name: "Dave", company: "Delta" })],
  ]);
  db.reset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); identity.signedUrl.mockReset(); identity.invite.mockReset(); });

describe("self-service organization bootstrap", () => {
  it("creates organization, admin membership and initialized workspace in one transaction", async () => {
    const response = await bootstrap("token-alice"), data = await response.json();
    expect(response.status).toBe(201);
    expect(data).toMatchObject({ created: true, role: "admin" });
    expect(db.state.organizations).toEqual([{ id: data.organizationId, name: "Alfa Srl", created_by: ALICE }]);
    expect(db.state.memberships).toEqual([{ organization_id: data.organizationId, user_id: ALICE, role_id: "admin", display_name: "Alice Rossi" }]);
    expect(db.state.workspaces).toHaveLength(1);
    const payload = db.state.workspaces[0].payload as ReturnType<typeof workspaceNamed>;
    expect(payload.companyName).toBe("Alfa Srl");
    expect(payload.entities.every(entity => entity.records.length === 0)).toBe(true);
    expect(db.log.begins).toBe(1);
    expect(db.log.writesOutsideTransaction).toEqual([]);
    const loaded = await call("token-alice");
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({ organizationId: data.organizationId, role: "admin", workspace: { companyName: "Alfa Srl" } });
  });

  it("rolls back organization, membership and workspace when a step fails mid-way", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    db.failWhen(/INSERT INTO entities/);
    const failed = await bootstrap("token-alice");
    expect(failed.status).toBe(500);
    expect(db.state.organizations).toEqual([]); expect(db.state.memberships).toEqual([]); expect(db.state.workspaces).toEqual([]); expect(db.state.writes).toEqual([]);
    // Logs carry error names only: no tokens, emails or company names.
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(/token-alice|alice@example|Alfa Srl/);
    db.failWhen(undefined);
    expect((await bootstrap("token-alice")).status).toBe(201);
    expect(db.state.organizations).toHaveLength(1);
  });

  it("is idempotent: a second call returns the existing organization", async () => {
    const first = await (await bootstrap("token-alice")).json();
    const second = await bootstrap("token-alice", "Altro nome");
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ created: false, organizationId: first.organizationId, role: "admin" });
    expect(db.state.organizations).toHaveLength(1); expect(db.state.memberships).toHaveLength(1); expect(db.state.workspaces).toHaveLength(1);
  });

  it("is concurrency-safe: two simultaneous calls create exactly one organization", async () => {
    const responses = await Promise.all([bootstrap("token-alice"), bootstrap("token-alice")]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map(response => response.json()));
    expect(new Set(bodies.map(body => body.organizationId)).size).toBe(1);
    expect(db.state.organizations).toHaveLength(1); expect(db.state.memberships).toHaveLength(1); expect(db.state.workspaces).toHaveLength(1);
  });

  it("requires a confirmed email before creating anything", async () => {
    const response = await bootstrap("token-dave");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Conferma la tua email per continuare.", reason: "email_not_confirmed" });
    expect(db.log.begins).toBe(0); expect(db.state.organizations).toEqual([]);
  });

  it("rejects missing or invalid tokens", async () => {
    expect((await bootstrap(null)).status).toBe(401);
    expect((await bootstrap("forged-token")).status).toBe(401);
    expect(db.state.organizations).toEqual([]);
  });

  it("takes the acting user only from the verified token, never from the body or query", async () => {
    for (const extra of [{ userId: BOB }, { organizationId: ORG_B }, { role: "viewer" }, { user_id: BOB }, { action: "bootstrap" }]) {
      const response = await bootstrap("token-alice", "Alfa Srl", extra);
      expect(response.status).toBe(400);
    }
    expect(db.state.organizations).toEqual([]);
    const response = await bootstrap("token-alice", "Alfa Srl", {}, { organization: ORG_B }), data = await response.json();
    expect(response.status).toBe(201);
    expect(data.organizationId).not.toBe(ORG_B);
    expect(db.state.memberships).toEqual([expect.objectContaining({ user_id: ALICE, role_id: "admin", organization_id: data.organizationId })]);
  });

  it("validates and length-limits the company and display names", async () => {
    for (const company of ["", " ", "x".repeat(101), "Alfa\u0000Srl"]) expect((await bootstrap("token-alice", company)).status).toBe(400);
    expect((await bootstrap("token-alice", "Alfa Srl", { name: "n".repeat(101) })).status).toBe(400);
    expect(db.state.organizations).toEqual([]);
  });

  it("rejects lone UTF-16 surrogates that jsonb cannot store, but accepts real emoji", async () => {
    for (const company of ["Alfa \uD800", "\uDC00Alfa", "Alfa \uDC00\uD800 Srl"]) expect((await bootstrap("token-alice", company)).status).toBe(400);
    expect((await bootstrap("token-alice", "Alfa Srl", { name: "Alice \uD83D" })).status).toBe(400);
    expect(db.state.organizations).toEqual([]);
    expect((await bootstrap("token-alice", "Alfa \u{1F33F} Srl")).status).toBe(201);
  });

  it("is no longer an action of the general API function", async () => {
    expect((await call("token-alice", { action: "bootstrap", company: "Alfa Srl" })).status).toBe(403);
    db.reset({ organizations: [{ id: ORG_A, name: "Alfa", created_by: null }], memberships: [{ organization_id: ORG_A, user_id: ALICE, role_id: "admin", display_name: "Alice" }] });
    expect((await call("token-alice", { action: "bootstrap", company: "Altra" })).status).toBe(400);
    expect(db.state.organizations).toHaveLength(1);
  });

  it("never bootstraps a new organization for an invited member who already has a membership", async () => {
    db.reset({ organizations: [{ id: ORG_A, name: "Alfa", created_by: ALICE }], memberships: [{ organization_id: ORG_A, user_id: ALICE, role_id: "admin", display_name: "Alice" }, { organization_id: ORG_A, user_id: CAROL, role_id: "viewer", display_name: "Carol" }], workspaces: [{ organization_id: ORG_A, payload: workspaceNamed("Alfa"), revision: 0 }] });
    const response = await bootstrap("token-carol", "Nuova Azienda");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ created: false, organizationId: ORG_A, role: "viewer" });
    expect(db.state.organizations).toHaveLength(1);
    expect(db.state.memberships.filter(row => row.user_id === CAROL)).toEqual([{ organization_id: ORG_A, user_id: CAROL, role_id: "viewer", display_name: "Carol" }]);
    const loaded = await (await call("token-carol")).json();
    expect(loaded).toMatchObject({ organizationId: ORG_A, role: "viewer", workspace: { companyName: "Alfa" } });
  });

  it("answers 409 when this account already created an organization it no longer belongs to", async () => {
    db.reset({ organizations: [{ id: ORG_A, name: "Alfa", created_by: ALICE }] });
    const response = await bootstrap("token-alice");
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: "company_exists", error: expect.stringContaining("Hai già un'azienda") });
    expect(db.state.organizations).toHaveLength(1); expect(db.state.memberships).toEqual([]);
  });

  it("rate limits bootstrap attempts per client and declares a Netlify rate limit", async () => {
    const ip = crypto.randomUUID();
    for (let attempt = 0; attempt < 5; attempt++) expect((await bootstrap("token-dave", "Delta", {}, { ip })).status).toBe(403);
    const limited = await bootstrap("token-alice", "Alfa Srl", {}, { ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(await limited.json()).toMatchObject({ reason: "rate_limit" });
    expect(db.state.organizations).toEqual([]);
    expect(config.rateLimit).toEqual({ windowLimit: 10, windowSize: 60, aggregateBy: ["ip"] });
  });

  it("does not lump IP-less callers into one shared in-memory bucket (the Netlify rule covers them)", async () => {
    for (let attempt = 0; attempt < 8; attempt++) expect((await bootstrap("token-dave", "Delta", {}, { ip: null })).status).toBe(403);
  });

  it("signals a missing membership distinctly so the client can offer company creation", async () => {
    const response = await call("token-bob");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ reason: "no_membership" });
  });

  it("reports missing server configuration in Italian without naming secrets' values", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const response = await bootstrap("token-alice"), data = await response.json();
    expect(response.status).toBe(503);
    expect(data).toMatchObject({ reason: "not_configured", error: expect.stringContaining("non è ancora configurato") });
  });
});

describe("tenant isolation for self-service organizations", () => {
  beforeEach(() => db.reset({
    organizations: [{ id: ORG_A, name: "Alfa", created_by: ALICE }, { id: ORG_B, name: "Beta", created_by: BOB }],
    memberships: [{ organization_id: ORG_A, user_id: ALICE, role_id: "admin", display_name: "Alice" }, { organization_id: ORG_B, user_id: BOB, role_id: "admin", display_name: "Bob" }],
    workspaces: [{ organization_id: ORG_A, payload: workspaceNamed("Alfa"), revision: 0 }, { organization_id: ORG_B, payload: workspaceNamed("Beta Riservata"), revision: 0 }],
    attachments: [{ organization_id: ORG_B, id: ATTACHMENT_B, entity_id: "customers", record_id: "c-1", status: "ready", object_path: `${ORG_B}/${ATTACHMENT_B}`, filename: "contratto-beta.pdf", mime: "application/pdf", size: 10 }],
    records: [{ organization_id: ORG_B, entity_id: "customers", id: "c-1" }],
  }));

  it("a user of A selecting organization B cannot read B's workspace or attachments", async () => {
    const response = await call("token-alice", undefined, { organization: ORG_B }), text = await response.text();
    expect(response.status).toBe(403);
    expect(text).not.toMatch(/Beta Riservata|contratto-beta/);
  });

  it("a user of A selecting organization B cannot mutate B", async () => {
    const response = await call("token-alice", { action: "mutate", expectedRevision: 0, requestId: crypto.randomUUID(), command: { type: "deleteRecord", entityId: "customers", recordId: "c-1" } }, { organization: ORG_B });
    expect(response.status).toBe(403);
    expect(db.state.writes).toEqual([]);
    expect(db.log.begins).toBe(0);
  });

  it("a user of A cannot obtain a signed URL for B's attachment, with or without a selector", async () => {
    const selected = await call("token-alice", { action: "attachmentUrl", id: ATTACHMENT_B }, { organization: ORG_B });
    expect(selected.status).toBe(403);
    const ownTenant = await call("token-alice", { action: "attachmentUrl", id: ATTACHMENT_B });
    expect(ownTenant.status).toBe(404);
    expect(identity.signedUrl).not.toHaveBeenCalled();
  });

  it("the owner of B can still read B (fixture sanity check)", async () => {
    identity.signedUrl.mockResolvedValue({ data: { signedUrl: "https://storage.test/signed" }, error: null });
    const workspace = await call("token-bob", undefined, { organization: ORG_B });
    expect(await workspace.json()).toMatchObject({ organizationId: ORG_B, workspace: { companyName: "Beta Riservata" } });
    expect((await call("token-bob", { action: "attachmentUrl", id: ATTACHMENT_B })).status).toBe(200);
  });

  it("invitations stay admin-only and redirect into connected mode", async () => {
    identity.invite.mockResolvedValue({ data: { user: { id: CAROL } }, error: null });
    const response = await call("token-alice", { action: "invite", email: "carol@example.test", name: "Carol", role: "operator" });
    expect(response.status).toBe(200);
    expect(identity.invite).toHaveBeenCalledWith("carol@example.test", { redirectTo: "https://nodus.test/?mode=connected", data: { name: "Carol" } });
    expect(db.state.memberships).toContainEqual({ organization_id: ORG_A, user_id: CAROL, role_id: "operator", display_name: "Carol" });
    const asViewer = await call("token-carol", { action: "invite", email: "x@example.test", name: "X", role: "manager" });
    expect(asViewer.status).toBe(403);
  });

  it("invite inserts the membership under the same per-user lock as bootstrap, inside a transaction", async () => {
    identity.invite.mockResolvedValue({ data: { user: { id: CAROL } }, error: null });
    expect((await call("token-alice", { action: "invite", email: "carol@example.test", name: "Carol", role: "viewer" })).status).toBe(200);
    expect(db.log.locks).toEqual([userLockKey(CAROL)]);
    expect(db.log.writesOutsideTransaction.filter(text => /memberships|audit_log/.test(text))).toEqual([]);
    // A bootstrap serialized after the invite sees the membership and creates nothing.
    expect(await (await bootstrap("token-carol", "Carol Srl")).json()).toMatchObject({ created: false, organizationId: ORG_A, role: "viewer" });
    expect(db.log.locks).toEqual([userLockKey(CAROL), userLockKey(CAROL)]);
    expect(db.state.organizations).toHaveLength(2);
  });

  it("a bootstrap waiting on the user's lock sees an invite committed meanwhile", async () => {
    identity.invite.mockResolvedValue({ data: { user: { id: CAROL } }, error: null });
    let release: (() => void) | undefined;
    const begin = db.sql.begin as (callback: (tx: (parts: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>) => Promise<unknown>) => Promise<unknown>;
    const lockWaits = () => db.log.locks.length;
    const held = begin(async tx => {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${userLockKey(CAROL)}, 0))`;
      await new Promise<void>(resolve => { release = resolve; });
    });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    // Invite queues on Carol's lock first, then bootstrap queues behind it.
    const invited = call("token-alice", { action: "invite", email: "carol@example.test", name: "Carol", role: "operator" });
    await vi.waitFor(() => expect(lockWaits()).toBe(2));
    const boot = bootstrap("token-carol", "Carol Srl");
    await vi.waitFor(() => expect(lockWaits()).toBe(3));
    release!(); await held;
    expect((await invited).status).toBe(200);
    expect(await (await boot).json()).toMatchObject({ created: false, organizationId: ORG_A, role: "operator" });
    expect(db.state.memberships.filter(row => row.user_id === CAROL)).toEqual([expect.objectContaining({ organization_id: ORG_A, role_id: "operator" })]);
    expect(db.state.organizations).toHaveLength(2);
  });
});
