import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bootstrapOrganization, bootstrapRequestSchema } from "../../server/bootstrap";
import { ChatRateLimit } from "../../server/chatRateLimit";
import { database, HttpError, respond, verifiedUser } from "../../server/platform";

// Self-service company creation lives in its own Function so this strict limit applies to it alone.
// Enforced by Netlify before any instance runs (the primary limit).
export const config = { rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip"] } };
// Second line, per warm instance. Only applied when the client IP is known: IP-less callers are
// not lumped into one shared bucket (that would let one caller lock out everyone).
const limiter = new ChatRateLimit(5);
const notConfigured = "Il servizio NODUS non è ancora configurato su questo server. Contatta l'amministratore.";

export default async function handler(request: Request, netlify: { ip?: string } = {}): Promise<Response> {
  try {
    if (request.method !== "POST") throw new HttpError(405, "Metodo non consentito.", "method_not_allowed");
    if (!request.headers.get("content-type")?.includes("application/json")) throw new HttpError(415, "Usa application/json.", "unsupported_media_type");
    const text = await request.text();
    if (text.length > 4096) throw new HttpError(413, "Richiesta troppo grande.", "too_large");
    const body = bootstrapRequestSchema.parse(JSON.parse(text));
    const client = netlify.ip || request.headers.get("x-nf-client-connection-ip");
    if (client && !limiter.accept(client, randomUUID())) throw new HttpError(429, "Troppi tentativi. Riprova tra un minuto.", "rate_limit");
    // The user id comes only from the verified token; the body carries just the validated names.
    const result = await bootstrapOrganization(database(), await verifiedUser(request), body);
    return respond(result, result.created ? 201 : 200);
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.reason === "not_configured") console.error("NODUS bootstrap configuration missing");
      const message = error.reason === "not_configured" ? notConfigured : error.reason ? error.message : error.status === 401 ? "Sessione non valida. Accedi di nuovo." : "Operazione non consentita.";
      const response = respond({ error: message, ...(error.reason ? { reason: error.reason } : {}) }, error.status);
      if (error.status === 429) response.headers.set("Retry-After", "60");
      return response;
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) return respond({ error: "Dati non validi: controlla nome azienda e nome (2–100 caratteri).", reason: "invalid" }, 400);
    // Names only: never tokens, emails, company names or SQL.
    console.error("NODUS bootstrap failed", error instanceof Error ? error.name : "UnknownError");
    return respond({ error: "Creazione dell'azienda non riuscita. Nessun dato è stato salvato: riprova tra poco." }, 500);
  }
}
