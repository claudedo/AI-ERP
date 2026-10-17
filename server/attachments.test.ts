import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), remove: vi.fn(), signedUrl: vi.fn(), info: vi.fn() }));
vi.mock("./platform", () => ({
  database: () => mocks.sql,
  authenticate: async () => ({ userId: "admin", organizationId: "org", roleId: "admin", displayName: "Admin" }),
  withMembers: async (workspace: unknown) => workspace,
  identity: () => ({ storage: { from: () => ({ remove: mocks.remove, createSignedUrl: mocks.signedUrl, info: mocks.info }) } }),
  required: () => "private-test-bucket",
  HttpError: class HttpError extends Error { constructor(public status: number, message: string) { super(message); } },
  respond: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
}));
import handler from "../netlify/functions/api";
import { cleanupOrphanAttachments } from "./attachmentCleanup";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); });

describe("attachment lifecycle", () => {
  it("never signs a download for a deleted record", async () => {
    mocks.sql.mockImplementation(async (parts: TemplateStringsArray) => {
      const query = parts.join("");
      if (query.includes("SELECT payload FROM workspaces")) return [{ payload: { entities: [] } }];
      if (query.includes("SELECT * FROM attachments")) return [{ id: "file", entity_id: "properties", record_id: "deleted", status: "ready", object_path: "org/file" }];
      return [];
    });
    const response = await handler(new Request("https://example.test/.netlify/functions/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "attachmentUrl", id: "00000000-0000-4000-8000-000000000001" }) }));
    expect(response.status).toBe(404);
    expect(mocks.signedUrl).not.toHaveBeenCalled();
  });
  it("keeps the DB reference when Storage deletion fails, for a later retry", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only"); vi.stubEnv("SUPABASE_STORAGE_BUCKET", "test-only");
    mocks.sql.mockResolvedValue([{ organization_id: "org", id: "file", object_path: "org/file" }]);
    mocks.remove.mockResolvedValue({ error: new Error("Storage unavailable") });
    expect(await cleanupOrphanAttachments()).toBe(0);
    expect(mocks.sql).toHaveBeenCalledOnce();
  });
  it("deletes metadata only after Storage confirms removal", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only"); vi.stubEnv("SUPABASE_STORAGE_BUCKET", "test-only");
    mocks.sql.mockResolvedValueOnce([{ organization_id: "org", id: "file", object_path: "org/file" }]).mockResolvedValue([]);
    mocks.remove.mockResolvedValue({ error: null });
    expect(await cleanupOrphanAttachments()).toBe(1);
    expect(mocks.remove).toHaveBeenCalledWith(["org/file"]);
    expect(mocks.sql).toHaveBeenCalledTimes(2);
  });
});
