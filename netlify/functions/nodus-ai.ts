import { chatRequestSchema } from "../../src/ai/chatContract";
import { contextWorkspace, selectChatContext } from "../../src/ai/chatContext";
import { localChat } from "../../src/ai/localChat";
import { openaiChat } from "../../server/openaiChat";
import { ChatRateLimit } from "../../server/chatRateLimit";
import { authenticate, database, respond, withMembers } from "../../server/platform";
import type { Workspace } from "../../src/types";
import { createHash } from "node:crypto";
import { reserveChatQuota } from "../../server/chatQuota";

const limiter = new ChatRateLimit();
// Enforced by Netlify before invoking any Function instance (not an in-memory counter).
export const config = { rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] } };
const unavailable = { error: "NODUS AI non è temporaneamente disponibile. Puoi riprovare o usare la modalità locale." };
export default async function handler(request: Request, netlify: { ip?: string } = {}): Promise<Response> {
  if (request.method === "GET") return respond({ service: "NODUS AI", configured: !!process.env.OPENAI_API_KEY });
  if (request.method !== "POST") return respond(unavailable, 405);
  // Browser same-origin only; no permissive CORS. This is not a substitute for authentication.
  const origin = request.headers.get("origin"), expected = new URL(request.url).origin;
  if (origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") return respond(unavailable, 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return respond(unavailable, 415);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 160000) return respond(unavailable, 413);
  try {
    const raw = await request.text(); if (raw.length > 160000) return respond(unavailable, 413);
    const parsed = chatRequestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return respond(unavailable, 400);
    const body = parsed.data;
    const fingerprint = createHash("sha256").update(JSON.stringify([body.message, body.context?.workspaceId, body.context?.revision, body.mode])).digest("hex");
    const client = netlify.ip || request.headers.get("x-nf-client-connection-ip") || "unknown";
    if (!limiter.accept(client, body.requestId, Date.now(), fingerprint)) return respond(unavailable, 429);
    let quotaClient = `ip:${client}`;
    let workspace: Workspace | undefined;
    if (body.mode === "connected") {
      // Never trust client role/schema/records in the shared organization workspace.
      const principal = await authenticate(request), sql = database();
      quotaClient = `organization:${principal.organizationId}:user:${principal.userId}`;
      const [row] = await sql`SELECT payload FROM workspaces WHERE organization_id=${principal.organizationId}::uuid`;
      if (!row) return respond(unavailable, 404);
      workspace = await withMembers(row.payload as Workspace, principal);
    }
    const context = workspace ? selectChatContext(workspace, body.message, body.contextId) : body.context;
    if (!context || context.entities.reduce((n, e) => n + e.records.length, 0) > 40 || JSON.stringify(context).length > 60000 || body.history.reduce((n, turn) => n + turn.q.length + turn.a.length, 0) > 12000) return respond(unavailable, 400);
    const target = workspace || contextWorkspace(context);
    if (!process.env.OPENAI_API_KEY || !(await reserveChatQuota(quotaClient))) return respond(await localChat(body.message, target, body.contextId));
    try { return respond(await openaiChat(body, context, workspace)); }
    catch {
      // A provider outage, invalid JSON, timeout, missing key or quota error never writes data.
      return respond(await localChat(body.message, target, body.contextId));
    }
  } catch { return respond(unavailable, 503); }
}
