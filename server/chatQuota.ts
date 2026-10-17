import { createHash } from "node:crypto";
import { database } from "./platform";

export function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

class QuotaExceeded extends Error {}

/** Reserve provider calls atomically across Function instances; never store raw IPs. */
export async function reserveChatQuota(client: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return process.env.NODUS_AI_REQUIRE_QUOTA !== "true";
  const limits = [
    { scope: "global", limit: positiveLimit(process.env.NODUS_AI_DAILY_LIMIT, 500) },
    { scope: `client:${createHash("sha256").update(client).digest("hex")}`, limit: positiveLimit(process.env.NODUS_AI_CLIENT_DAILY_LIMIT, 50) },
  ];
  try {
    await database().begin(async sql => {
      for (const { scope, limit } of limits) {
        const rows = await sql`INSERT INTO ai_usage(day,scope,used) VALUES(CURRENT_DATE,${scope},1) ON CONFLICT(day,scope) DO UPDATE SET used=ai_usage.used+1 WHERE ai_usage.used<${limit} RETURNING used`;
        if (!rows.length) throw new QuotaExceeded();
      }
    });
    return true;
  } catch (error) {
    // Missing migration, DB outage or exhausted quota: do not spend; keep local chat available.
    if (!(error instanceof QuotaExceeded)) console.error("NODUS AI shared quota unavailable");
    return false;
  }
}
