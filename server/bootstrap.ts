import type postgres from "postgres";
import { z } from "zod";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../src/services/aiEngine";
import type { Workspace } from "../src/types";
import { HttpError, withMembers, type Principal, type VerifiedUser } from "./platform";
import { persistWorkspace } from "./repository";

// Printable text only: control characters would corrupt headers, logs and exports.
const printable = (max: number, min = 1) => z.string().trim().min(min).max(max).regex(/^[^\p{Cc}]+$/u);
export const bootstrapRequestSchema = z.object({ action: z.literal("bootstrap"), company: printable(100, 2), name: printable(100).optional() }).strict();
export type BootstrapRequest = z.infer<typeof bootstrapRequestSchema>;
export type BootstrapResult = { created: true; organizationId: string; role: "admin"; workspace: Workspace } | { created: false; organizationId: string; role: string; message: string };

/** Same empty workspace that the admin-only `initialize` action produces. */
export function initialWorkspace(companyName: string): Workspace {
  const analysis = analyzeBusiness("customers and orders");
  const workspace = generateWorkspace(analysis, generateArchitectureOptions(analysis)[2]);
  workspace.companyName = companyName; workspace.entities.forEach(entity => { entity.records = []; }); workspace.workflows = []; workspace.alerts = []; workspace.version = 4; workspace.configurationVersion = 1;
  return workspace;
}

function displayNameOf(user: VerifiedUser, requested?: string): string {
  // user_metadata is user-controlled at sign-up: accepted only as a validated default.
  const fromMetadata = printable(100).safeParse(user.metadata.name);
  return requested || (fromMetadata.success ? fromMetadata.data : "") || user.email?.split("@")[0]?.slice(0, 100) || "Amministratore";
}

/**
 * Creates organization, admin membership and initialized workspace in ONE transaction.
 * A transaction-scoped advisory lock keyed by the verified user id serializes concurrent calls;
 * the unique index on organizations.created_by (migration 003) is the database-level backstop.
 */
export async function bootstrapOrganization(sql: ReturnType<typeof postgres>, user: VerifiedUser, input: Pick<BootstrapRequest, "company" | "name">): Promise<BootstrapResult> {
  if (!user.emailConfirmedAt) throw new HttpError(403, "Conferma la tua email per continuare.", "email_not_confirmed");
  const displayName = displayNameOf(user, input.name);
  return sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`nodus:bootstrap:${user.id}`}, 0))`;
    const [existing] = await tx`SELECT organization_id, role_id FROM memberships WHERE user_id=${user.id}::uuid ORDER BY organization_id LIMIT 1`;
    // Idempotent, and never a second organization for invited members.
    if (existing) return { created: false as const, organizationId: String(existing.organization_id), role: String(existing.role_id), message: "Hai già un'azienda: ti abbiamo collegato a quella esistente." };
    const [organization] = await tx`INSERT INTO organizations(name,created_by) VALUES(${input.company},${user.id}::uuid) ON CONFLICT (created_by) DO NOTHING RETURNING id`;
    if (!organization) throw new HttpError(409, "Hai già un'azienda creata con questo account, ma non ne fai più parte. Contatta l'assistenza NODUS per recuperarla.", "company_exists");
    const organizationId = String(organization.id);
    const principal: Principal = { userId: user.id, organizationId, roleId: "admin", displayName };
    await tx`INSERT INTO memberships(organization_id,user_id,role_id,display_name) VALUES(${organizationId}::uuid,${user.id}::uuid,${"admin"},${displayName})`;
    const workspace = await withMembers(initialWorkspace(input.company), principal, tx);
    const inserted = await tx`INSERT INTO workspaces(organization_id,payload) VALUES(${organizationId}::uuid,${tx.json(workspace as never)}) ON CONFLICT DO NOTHING RETURNING organization_id`;
    if (!inserted.length) throw new HttpError(409, "Workspace already exists. Refresh the page.");
    await persistWorkspace(tx, organizationId, user.id, workspace);
    await tx`INSERT INTO audit_log(organization_id,actor_id,action,detail) VALUES(${organizationId}::uuid,${user.id}::uuid,'bootstrap',${tx.json({ source: "self-signup" } as never)})`;
    return { created: true as const, organizationId, role: "admin" as const, workspace };
  }) as Promise<BootstrapResult>;
}
