import postgres from "postgres";
import type { TransactionSql } from "postgres";
import { createClient } from "@supabase/supabase-js";
import { roles } from "../src/data/templates";
import type { RoleId, Workspace } from "../src/types";
import { upgradeCompanies } from "../src/services/companies";
import { localizeRealEstateNames } from "../src/services/realEstateLabels";

/** `reason` marks curated, user-facing failures (Italian message, machine-readable code for the client). */
export class HttpError extends Error { constructor(public status: number, message: string, public reason?: string) { super(message); } }
export function required(name: string): string { const value = process.env[name]; if (!value) throw new HttpError(503, `Server configuration missing: ${name}`, "not_configured"); return value; }
let connection: ReturnType<typeof postgres> | undefined;
export const database = () => connection ||= postgres(required("DATABASE_URL"), { max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
export const identity = () => createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
export interface Principal { userId: string; organizationId: string; roleId: RoleId; displayName: string }
export function authorizeMembership(userId: string, rows: { user_id: string; organization_id: string; role_id: string; display_name: string }[]): Principal {
  const membership = rows.find(row => row.user_id === userId);
  if (!membership || !roles.some(role => role.id === membership.role_id)) throw new HttpError(403, "Organization access denied.");
  return { userId, organizationId: membership.organization_id, roleId: membership.role_id as RoleId, displayName: membership.display_name };
}
/** Identity facts taken only from the provider-verified access token, never from the request body. */
export interface VerifiedUser { id: string; email?: string; emailConfirmedAt: string | null; metadata: Record<string, unknown> }
export async function verifiedUser(request: Request): Promise<VerifiedUser> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Sign in to continue.");
  const { data, error } = await identity().auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new HttpError(401, "Session expired. Sign in again.");
  return { id: data.user.id, email: data.user.email, emailConfirmedAt: data.user.email_confirmed_at ?? null, metadata: data.user.user_metadata ?? {} };
}
export async function authenticate(request: Request): Promise<Principal> {
  const user = await verifiedUser(request);
  const requestedOrg = new URL(request.url).searchParams.get("organization");
  if (requestedOrg && !/^[0-9a-f-]{36}$/i.test(requestedOrg)) throw new HttpError(400, "Invalid organization selector.");
  const sql = database();
  const rows = requestedOrg ? await sql`SELECT * FROM memberships WHERE user_id=${user.id} AND organization_id=${requestedOrg}::uuid` : await sql`SELECT * FROM memberships WHERE user_id=${user.id} ORDER BY organization_id LIMIT 1`;
  // Distinct signal only when the user has no organization at all, so the client can offer self-service bootstrap.
  if (!requestedOrg && !rows.length) throw new HttpError(403, "Il tuo account non è ancora collegato a un'azienda.", "no_membership");
  return authorizeMembership(user.id, rows as unknown as Parameters<typeof authorizeMembership>[1]);
}
export async function withMembers(workspace: Workspace, principal: Principal, sql: TransactionSql | ReturnType<typeof postgres> = database()): Promise<Workspace> {
  const rows = await sql`SELECT user_id, display_name, role_id FROM memberships WHERE organization_id=${principal.organizationId}::uuid`;
  return localizeRealEstateNames(upgradeCompanies({ ...workspace, currentUserId: principal.userId, roles: workspace.roles?.length ? workspace.roles : structuredClone(roles), users: rows.map(row => ({ id: row.user_id, name: row.display_name, initials: row.display_name.slice(0,2).toUpperCase(), email: "", roleId: row.role_id, title: "Organization member" })) }));
}
export const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
