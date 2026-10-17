import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import { selectChatContext } from "../src/ai/chatContext";
import handler from "../netlify/functions/nodus-ai";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
export function demoRequest(message = "Come funziona?") {
  const a = analyzeBusiness("customers and orders"), workspace = generateWorkspace(a, generateArchitectureOptions(a)[2]);
  return new Request("https://nodus.test/.netlify/functions/nodus-ai", { method: "POST", headers: { Origin: "https://nodus.test", "Content-Type": "application/json" }, body: JSON.stringify({ message, mode: "demo", requestId: crypto.randomUUID(), history: [], context: selectChatContext(workspace, message) }) });
}
describe("anonymous provider-call boundary", () => {
  it("accepts a repeated message with a fresh request ID", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("OPENAI_API_KEY", "");
    const ip = crypto.randomUUID();
    const request = demoRequest(), body = await request.clone().json();
    expect((await handler(request, { ip })).status).toBe(200);
    const repeat = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }) });
    expect((await handler(repeat, { ip })).status).toBe(200);
  });
  it("returns a machine-readable reason for forbidden origins", async () => {
    const request = demoRequest(); request.headers.set("Origin", "https://other.test");
    const response = await handler(request);
    expect(response.status).toBe(403); expect(await response.json()).toHaveProperty("reason", "forbidden");
  });
  it("never calls OpenAI without a shared quota, even with a spoofed Origin and configured key", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("NODUS_AI_REQUIRE_QUOTA", "false"); vi.stubEnv("NODUS_AI_ALLOW_UNMETERED", ""); vi.stubEnv("OPENAI_API_KEY", "server-test-only");
    const fetcher = vi.fn().mockRejectedValue(new Error("A provider call must not happen")); vi.stubGlobal("fetch", fetcher);
    const response = await handler(demoRequest(), { ip: crypto.randomUUID() });
    expect(response.status).toBe(200); expect((await response.json()).source).toBe("local"); expect(fetcher).not.toHaveBeenCalled();
  });
});
