import { describe, expect, it } from "vitest";
import { authorizeMembership } from "./platform";

describe("server principal boundaries", () => {
  const memberships = [{ user_id: "user-a", organization_id: "organization-a", role_id: "viewer", display_name: "Alice" }];
  it("rejects a user without membership even if another tenant has data", () => {
    expect(() => authorizeMembership("user-b", memberships)).toThrow(/denied/);
    expect(() => authorizeMembership("user-a", [])).toThrow(/denied/);
  });
  it("derives organization and role from the membership, not client claims", () => {
    expect(authorizeMembership("user-a", memberships)).toEqual({ userId: "user-a", organizationId: "organization-a", roleId: "viewer", displayName: "Alice" });
    expect(() => authorizeMembership("user-a", [{ ...memberships[0], role_id: "superuser" }])).toThrow(/denied/);
  });
});
