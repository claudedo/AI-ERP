import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import { selectChatContext } from "../src/ai/chatContext";
import { activeProvider, compactContext, openaiChat, stripLimits } from "./openaiChat";
import handler from "../netlify/functions/nodus-ai";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const workspace = () => { const a = analyzeBusiness("customers and orders"); return generateWorkspace(a, generateArchitectureOptions(a)[2]); };
const envelope = { type: "answer", message: "Ciao, come posso aiutarti?", query: null, changes: [], structure_json: null, questions: [] };
const groqOk = (content: unknown = envelope) => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) } }] }), { headers: { "content-type": "application/json" } });
const post = (w = workspace(), message = "Come funziona?") => new Request("https://nodus.test/.netlify/functions/nodus-ai", { method: "POST", headers: { Origin: "https://nodus.test", "Content-Type": "application/json" }, body: JSON.stringify({ requestId: crypto.randomUUID(), message, mode: "demo", history: [], context: selectChatContext(w, message) }) });

describe("Groq free-tier provider", () => {
  it("prefers Groq when configured, and NODUS_AI_PROVIDER can force a provider", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai"); vi.stubEnv("GROQ_API_KEY", "");
    expect(activeProvider()).toBe("openai");
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    expect(activeProvider()).toBe("groq");
    vi.stubEnv("NODUS_AI_PROVIDER", "openai");
    expect(activeProvider()).toBe("openai");
    vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("GROQ_API_KEY", ""); vi.stubEnv("NODUS_AI_PROVIDER", "");
    expect(activeProvider()).toBeNull();
  });
  it("calls Groq Chat Completions with a strict JSON schema and validates the reply", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    const fetcher = vi.fn().mockResolvedValue(groqOk());
    const w = workspace(), reply = await openaiChat({ requestId: crypto.randomUUID(), message: "Come funziona?", mode: "demo", history: [] }, selectChatContext(w, "Come funziona?"), w, fetcher as typeof fetch);
    expect(reply).toMatchObject({ type: "answer", source: "openai" });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(JSON.stringify(sent.response_format.json_schema.schema)).not.toMatch(/maxLength|maxItems/);
    expect(sent.messages[0].role).toBe("system");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-groq" });
  });
  it("uses Groq without a shared quota database and falls back locally when Groq refuses (e.g. free-tier 429)", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq"); vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(groqOk()));
    expect((await (await handler(post())).json()).source).toBe("openai");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    expect((await (await handler(post())).json()).source).toBe("local");
  });
  it("reports the configured provider without exposing keys", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-groq");
    const status = await (await handler(new Request("https://nodus.test/.netlify/functions/nodus-ai"))).json();
    expect(status).toMatchObject({ configured: true, provider: "groq" });
    expect(JSON.stringify(status)).not.toContain("test-groq");
  });
  it("compacts sample records for small free-tier token budgets but keeps the schema", () => {
    const w = workspace(), context = selectChatContext(w, "ordini clienti consegne");
    const compact = compactContext(context, 2000);
    expect(compact.entities.map(e => e.id)).toEqual(context.entities.map(e => e.id));
    expect(compact.entities.reduce((n, e) => n + e.records.length, 0)).toBeLessThanOrEqual(context.entities.reduce((n, e) => n + e.records.length, 0));
    expect(stripLimits({ properties: { pattern: { type: "string", maxLength: 3 } } })).toEqual({ properties: { pattern: { type: "string" } } });
  });
});
