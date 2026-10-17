import { createHash } from "node:crypto";
import { database } from "./platform";

export function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class QuotaExceeded extends Error {}
export interface ChatReservation { refund(): Promise<void> }

function localUnmetered(): boolean {
  return process.env.NODUS_AI_ALLOW_UNMETERED === "true" && process.env.NODE_ENV !== "production" && !["production", "deploy-preview", "branch-deploy"].includes(process.env.CONTEXT || "") && (!process.env.NETLIFY || process.env.NETLIFY_DEV === "true");
}

/** Reserve provider calls atomically across Function instances; never store raw IPs. */
export async function reserveChatQuota(client: string): Promise<ChatReservation | null> {
  if (!process.env.DATABASE_URL) return localUnmetered() ? { async refund() {} } : null;
  const limits = [
    { scope: "global", limit: positiveLimit(process.env.NODUS_AI_DAILY_LIMIT, 500) },
    { scope: `client:${createHash("sha256").update(client).digest("hex")}`, limit: positiveLimit(process.env.NODUS_AI_CLIENT_DAILY_LIMIT, 50) },
  ];
  let day = "";
  try {
    await database().begin(async sql => {
      for (const { scope, limit } of limits) {
        const rows = await sql`INSERT INTO ai_usage(day,scope,used) VALUES(CURRENT_DATE,${scope},1) ON CONFLICT(day,scope) DO UPDATE SET used=ai_usage.used+1 WHERE ai_usage.used<${limit} RETURNING day::text AS day,used`;
        if (!rows.length) throw new QuotaExceeded();
        day = rows[0].day;
      }
    });
    let refunded = false;
    return { async refund() {
      if (refunded) return;
      refunded = true;
      try {
        await database().begin(async sql => {
          for (const { scope } of limits) {
            await sql`DELETE FROM ai_usage WHERE day=${day}::date AND scope=${scope} AND used=1`;
            await sql`UPDATE ai_usage SET used=used-1 WHERE day=${day}::date AND scope=${scope} AND used>1`;
          }
        });
      } catch { refunded = false; console.error("NODUS AI quota refund unavailable"); }
    } };
  } catch (error) {
    // Missing migration, DB outage or exhausted quota: do not spend; keep local chat available.
    if (!(error instanceof QuotaExceeded)) console.error("NODUS AI shared quota unavailable");
    return null;
  }
}
