import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import { selectChatContext } from "../src/ai/chatContext";
const { refund } = vi.hoisted(() => ({ refund: vi.fn(async () => {}) }));
vi.mock("./chatQuota", () => ({ reserveChatQuota: async () => ({ refund }) }));
import handler from "../netlify/functions/nodus-ai";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); refund.mockClear(); });
describe("provider reservation refunds", () => {
  it.each(["timeout", "http", "json"])("refunds quota on %s failure and returns a local response", async failure => {
    vi.stubEnv("OPENAI_API_KEY", "test-only");
    vi.stubGlobal("fetch", failure === "timeout" ? vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError")) : vi.fn().mockResolvedValue(new Response(failure === "json" ? "invalid-json" : "error", { status: failure === "http" ? 500 : 200 })));
    const a = analyzeBusiness("customers and orders"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]), message = "Come funziona?";
    const response = await handler(new Request("https://nodus.test/.netlify/functions/nodus-ai", { method: "POST", headers: { Origin: "https://nodus.test", "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), message, mode: "demo", history: [], context: selectChatContext(w, message) }) }), { ip: crypto.randomUUID() });
    expect((await response.json()).source).toBe("local"); expect(refund).toHaveBeenCalledOnce();
  });
});
