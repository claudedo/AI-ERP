import type { Workspace } from "../types";
import { demoWorkflows, relationsFor, roles, users } from "../data/templates";
import { deriveAlerts } from "./aiEngine";
import { newId } from "./workspaceDomain";
import { upgradeCompanies } from "./companies";
import { assertStoredWorkspace } from "./workspaceSchema";

export interface WorkspaceRepository { load(): Workspace | null; save(workspace: Workspace, expectedRaw?: string | null): void; clear(): void; raw(): string | null; backupKeys(): string[] }
export const WORKSPACE_KEY = "ai-business-os-workspace";
const SCHEMA_VERSION = 5;

function assertShape(value: unknown): asserts value is Workspace {
  if (!value || typeof value !== "object") throw new Error("Saved workspace is not a valid object.");
  const w = value as Partial<Workspace>;
  if (!Array.isArray(w.entities) || !w.entities.every(e => e && typeof e.id === "string" && Array.isArray(e.fields) && Array.isArray(e.records))) throw new Error("Saved workspace has invalid modules or records.");
  if (typeof w.companyName !== "string") throw new Error("Saved workspace is missing its company name.");
}
function migrateV1ToV2(w: Workspace): Workspace {
  const entities = w.entities.filter(e => e.name !== "Dashboard" && e.name !== "Automations").map(e => ({ ...e, records: e.records.map(r => ({ ...r, id: String(r.id || newId("record")) })) }));
  return { ...w, entities, relations: w.relations || relationsFor(entities), views: w.views || [], workflows: (w.workflows || structuredClone(demoWorkflows)).map(x => ({ ...x, runs: x.runs || [] })), users: w.users || structuredClone(users), roles: w.roles || structuredClone(roles), currentUserId: w.currentUserId || "usr-admin", changeHistory: w.changeHistory || [], alerts: w.alerts || deriveAlerts(entities), version: 2 };
}
function migrateV2ToV3(w: Workspace): Workspace {
  const entities = structuredClone(w.entities);
  for (const entity of entities) {
    const seen = new Set<string>();
    for (const record of entity.records) {
      if (!record.id || seen.has(record.id)) record.id = newId("record");
      seen.add(record.id);
    }
  }
  return { ...w, entities, workflows: (w.workflows || []).map(flow => ({ ...flow, runs: flow.runs || [] })), revision: w.revision || 0, comments: w.comments || [], attachments: w.attachments || [], notifications: w.notifications || [], approvals: w.approvals || [], activity: w.activity || [], dashboardWidgets: w.dashboardWidgets || [{ id: "records", kind: "record-count" }, { id: "value", kind: "sum" }, { id: "status", kind: "status" }, { id: "assigned", kind: "assigned" }, { id: "due", kind: "due" }, { id: "approvals", kind: "approvals" }], version: 3 };
}
function migrate(value: unknown): Workspace {
  assertShape(value);
  let workspace = value;
  if ((workspace.version || 1) > SCHEMA_VERSION) throw new Error("This workspace was saved by a newer NODUS version.");
  if ((workspace.version || 1) < 2) workspace = migrateV1ToV2(workspace);
  if (workspace.version < 3) workspace = migrateV2ToV3(workspace);
  if (workspace.version < 4) workspace = { ...workspace, version: 4, configurationVersion: 1, configurationHistory: [] };
  if (workspace.version < 5) workspace = upgradeCompanies(workspace);
  assertStoredWorkspace(workspace);
  return workspace;
}
export const localWorkspaceRepository: WorkspaceRepository = {
  load() {
    const original = localStorage.getItem(WORKSPACE_KEY);
    if (!original) return null;
    let parsed: unknown;
    try { parsed = JSON.parse(original); } catch { throw new Error("Saved workspace JSON is damaged. Download a copy before resetting."); }
    const sourceVersion = (parsed as Partial<Workspace> | null)?.version || 1;
    if (sourceVersion < SCHEMA_VERSION) {
      const backupKey = `${WORKSPACE_KEY}-backup-v${sourceVersion}-${Date.now()}`;
      try { localStorage.setItem(backupKey, original); } catch { throw new Error("Not enough browser storage to preserve a migration backup. No data was changed."); }
    }
    const migrated = migrate(parsed);
    if (sourceVersion < SCHEMA_VERSION) {
      try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(migrated)); }
      catch { throw new Error("Migration backup was kept, but the updated workspace could not be saved."); }
    }
    return migrated;
  },
  save(w, expectedRaw) {
    // Reject stale snapshots before writing; the caller keeps its unsaved draft.
    if (expectedRaw !== undefined && localStorage.getItem(WORKSPACE_KEY) !== expectedRaw) throw new Error("Another tab changed this workspace. Reload before saving; your changes were not applied.");
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(w)); }
    catch { throw new Error("Workspace could not be saved. Browser storage may be full; remove large data or export a backup."); }
  },
  clear() { localStorage.removeItem(WORKSPACE_KEY); },
  raw() { return localStorage.getItem(WORKSPACE_KEY); },
  backupKeys() { return Object.keys(localStorage).filter(k => k.startsWith(`${WORKSPACE_KEY}-backup-`)).sort().reverse(); }
};
