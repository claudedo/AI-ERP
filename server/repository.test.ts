import type { TransactionSql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { persistWorkspace, projectionDelta } from "./repository";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import { withMembers } from "./platform";

const fixture = () => { const a = analyzeBusiness("customers and orders"); return generateWorkspace(a, generateArchitectureOptions(a)[2]); };
describe("projection persistence and connection reuse", () => {
  it("diffs added, removed and changed projections by stable ID", () => {
    expect(projectionDelta([{ id: "a", value: 2 }, { id: "c", value: 3 }], [{ id: "a", value: 1 }, { id: "b", value: 2 }])).toEqual({ changed: [{ id: "a", value: 2 }, { id: "c", value: 3 }], removed: ["b"] });
  });
  it("does not rewrite unchanged projections", async () => {
    const workspace = fixture();
    const query = Object.assign(vi.fn(async () => []), { json: (value: unknown) => value });
    await persistWorkspace(query as unknown as TransactionSql, "org", "user", workspace, structuredClone(workspace));
    expect(query).toHaveBeenCalledTimes(1);
    expect((query.mock.calls[0] as unknown as [TemplateStringsArray])[0].join("")).toMatch(/UPDATE workspaces/);
  });
  it("uses the caller's transaction for memberships instead of acquiring a second connection", async () => {
    const query = vi.fn(async () => [{ user_id: "usr-admin", display_name: "Admin", role_id: "admin" }]);
    const result = await withMembers(fixture(), { userId: "usr-admin", organizationId: "org", roleId: "admin", displayName: "Admin" }, query as unknown as TransactionSql);
    expect(query).toHaveBeenCalledOnce();
    expect(result.users[0].name).toBe("Admin");
  });
});
