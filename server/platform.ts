import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { roles } from "../src/data/templates";
import type { RoleId, Workspace } from "../src/types";
import { upgradeCompanies } from "../src/services/companies";

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function required(name: string): string { const value = process.env[name]; if (!value) throw new HttpError(503, `Server configuration missing: ${name}`); return value; }
let connection: ReturnType<typeof postgres> | undefined;
export const database = () => connection ||= postgres(required("DATABASE_URL"), { max: 2, prepare: false, idle_timeout: 20, connect_timeout: 10, ssl: "require" });
export const identity = () => createClient(required("SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
export interface Principal { userId: string; organizationId: string; roleId: RoleId; displayName: string }
export function authorizeMembership(userId: string, rows: { user_id: string; organization_id: string; role_id: string; display_name: string }[]): Principal {
  const membership = rows.find(row => row.user_id === userId);
  if (!membership || !roles.some(role => role.id === membership.role_id)) throw new HttpError(403, "Organization access denied.");
  return { userId, organizationId: membership.organization_id, roleId: membership.role_id as RoleId, displayName: membership.display_name };
}
export async function authenticate(request: Request): Promise<Principal> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new HttpError(401, "Sign in to continue.");
  const { data, error } = await identity().auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new HttpError(401, "Session expired. Sign in again.");
  const requestedOrg = new URL(request.url).searchParams.get("organization");
  if (requestedOrg && !/^[0-9a-f-]{36}$/i.test(requestedOrg)) throw new HttpError(400, "Invalid organization selector.");
  const sql = database();
  const rows = requestedOrg ? await sql`SELECT * FROM memberships WHERE user_id=${data.user.id} AND organization_id=${requestedOrg}::uuid` : await sql`SELECT * FROM memberships WHERE user_id=${data.user.id} ORDER BY organization_id LIMIT 1`;
  return authorizeMembership(data.user.id, rows as unknown as Parameters<typeof authorizeMembership>[1]);
}
export async function withMembers(workspace: Workspace, principal: Principal): Promise<Workspace> {
  const rows = await database()`SELECT user_id, display_name, role_id FROM memberships WHERE organization_id=${principal.organizationId}::uuid`;
  return upgradeCompanies({ ...workspace, currentUserId: principal.userId, roles: workspace.roles?.length ? workspace.roles : structuredClone(roles), users: rows.map(row => ({ id: row.user_id, name: row.display_name, initials: row.display_name.slice(0,2).toUpperCase(), email: "", roleId: row.role_id, title: "Organization member" })) });
}
export const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
