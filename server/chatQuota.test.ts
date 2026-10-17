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
    expect(await reserveChatQuota("client")).toBeNull();
    expect(begin).not.toHaveBeenCalled();
  });
  it("fails closed by default even if the old strict flag is false", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("NODUS_AI_REQUIRE_QUOTA", "false");
    expect(await reserveChatQuota("client")).toBeNull();
  });
  it("reserves both budgets in one transaction without storing raw IPs", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    query.mockResolvedValue([{ used: 1, day: "2026-10-17" }]);
    begin.mockImplementation(async callback => callback(query));
    expect(await reserveChatQuota("ip:192.0.2.1")).toHaveProperty("refund");
    expect(begin).toHaveBeenCalledOnce(); expect(query).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(query.mock.calls)).not.toContain("192.0.2.1");
  });
  it("denies exhausted budgets and database failures", async () => {
    vi.stubEnv("DATABASE_URL", "configured");
    query.mockResolvedValue([]); begin.mockImplementation(async callback => callback(query));
    expect(await reserveChatQuota("client")).toBeNull();
    vi.spyOn(console, "error").mockImplementation(() => {});
    begin.mockRejectedValue(new Error("SQL unavailable"));
    expect(await reserveChatQuota("client")).toBeNull();
  });
  it("refunds both counters once, using the reserved date even across midnight", async () => {
    vi.stubEnv("DATABASE_URL", "configured"); query.mockResolvedValue([{ day: "2026-10-17", used: 1 }]); begin.mockImplementation(async callback => callback(query));
    const reservation = await reserveChatQuota("client"); query.mockClear();
    await reservation!.refund(); await reservation!.refund();
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls.every(call => call[1] === "2026-10-17")).toBe(true);
  });
  it("permits an explicit local development opt-in but never a production bypass", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("NODUS_AI_ALLOW_UNMETERED", "true"); vi.stubEnv("NETLIFY", ""); vi.stubEnv("CONTEXT", "");
    expect(await reserveChatQuota("client")).not.toBeNull();
    vi.stubEnv("CONTEXT", "production"); expect(await reserveChatQuota("client")).toBeNull();
  });
});
