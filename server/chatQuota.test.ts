import { afterEach, describe, expect, it, vi } from "vitest";
const { query, begin } = vi.hoisted(() => ({ query: vi.fn(), begin: vi.fn() }));
vi.mock("./platform", () => ({ database: () => ({ begin }) }));
import { positiveLimit, reserveChatQuota } from "./chatQuota";
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.restoreAllMocks(); });

describe("shared provider-call budget", () => {
  it("accepts only positive finite integer limits", () => {
    for (const input of [undefined, "", "0", "-1", "NaN", "1.5", "Infinity"]) expect(positiveLimit(input, 50)).toBe(50);
    expect(positiveLimit("10", 50)).toBe(10);
  });
  it("can fail closed when no shared quota backend is configured", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("NODUS_AI_REQUIRE_QUOTA", "true");
    expect(await reserveChatQuota("client")).toBe(false);
    expect(begin).not.toHaveBeenCalled();
  });
  it("preserves demo compatibility when strict quota is not enabled", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("NODUS_AI_REQUIRE_QUOTA", "false");
    expect(await reserveChatQuota("client")).toBe(true);
  });
  it("reserves both budgets in one transaction without storing raw IPs", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    query.mockResolvedValue([{ used: 1 }]);
    begin.mockImplementation(async callback => callback(query));
    expect(await reserveChatQuota("ip:192.0.2.1")).toBe(true);
    expect(begin).toHaveBeenCalledOnce(); expect(query).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(query.mock.calls)).not.toContain("192.0.2.1");
  });
  it("denies exhausted budgets and database failures", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    query.mockResolvedValue([]); begin.mockImplementation(async callback => callback(query));
    expect(await reserveChatQuota("client")).toBe(false);
    vi.spyOn(console, "error").mockImplementation(() => {});
    begin.mockRejectedValue(new Error("SQL unavailable"));
    expect(await reserveChatQuota("client")).toBe(false);
  });
});
