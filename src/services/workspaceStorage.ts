import type { Workspace } from "../types";
import { demoWorkflows, relationsFor, roles, users } from "../data/templates";
import { deriveAlerts } from "./aiEngine";
import { newId } from "./workspaceDomain";
import { upgradeCompanies } from "./companies";
import { assertStoredWorkspace } from "./workspaceSchema";
import { localizeRealEstateNames } from "./realEstateLabels";

export interface WorkspaceRepository { load(): Workspace | null; save(workspace: Workspace, expectedRaw?: string | null): void; clear(): void; raw(): string | null; backupKeys(): string[] }
export const WORKSPACE_KEY = "ai-business-os-workspace";
const SCHEMA_VERSION = 5;

function assertShape(value: unknown): asserts value is Workspace {
  if (!value || typeof value !== "object") throw new Error("Il workspace salvato non è valido.");
  const w = value as Partial<Workspace>;
  if (!Array.isArray(w.entities) || !w.entities.every(e => e && typeof e.id === "string" && Array.isArray(e.fields) && Array.isArray(e.records))) throw new Error("Il workspace salvato contiene moduli o record non validi.");
  if (typeof w.companyName !== "string") throw new Error("Nel workspace salvato manca il nome dell’azienda.");
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
  if ((workspace.version || 1) > SCHEMA_VERSION) throw new Error("Questo workspace è stato salvato da una versione più recente di NODUS.");
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
    try { parsed = JSON.parse(original); } catch { throw new Error("Il JSON del workspace salvato è danneggiato. Scarica una copia prima di reimpostarlo."); }
    const sourceVersion = (parsed as Partial<Workspace> | null)?.version || 1;
    if (sourceVersion < SCHEMA_VERSION) {
      const backupKey = `${WORKSPACE_KEY}-backup-v${sourceVersion}-${Date.now()}`;
      try { localStorage.setItem(backupKey, original); } catch { throw new Error("Spazio insufficiente nel browser per conservare il backup della migrazione. Nessun dato modificato."); }
    }
    const migrated = migrate(parsed), localized = localizeRealEstateNames(migrated);
    if (localized !== migrated && sourceVersion >= SCHEMA_VERSION) {
      const backupKey = `${WORKSPACE_KEY}-backup-v${sourceVersion}-labels-${Date.now()}`;
      try { localStorage.setItem(backupKey, original); } catch { throw new Error("Spazio insufficiente per il backup delle etichette. Nessun dato modificato."); }
    }
    if (sourceVersion < SCHEMA_VERSION || localized !== migrated) {
      try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(localized)); }
      catch { throw new Error("Il backup della migrazione è stato conservato, ma non è stato possibile salvare il workspace aggiornato."); }
    }
    return localized;
  },
  save(w, expectedRaw) {
    // Reject stale snapshots before writing; the caller keeps its unsaved draft.
    if (expectedRaw !== undefined && localStorage.getItem(WORKSPACE_KEY) !== expectedRaw) throw new Error("Un’altra scheda ha modificato questo workspace. Ricarica prima di salvare: le tue modifiche non sono state applicate.");
    try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(w)); }
    catch { throw new Error("Impossibile salvare il workspace. Lo spazio del browser potrebbe essere esaurito: elimina i dati voluminosi o esporta un backup."); }
  },
  clear() { localStorage.removeItem(WORKSPACE_KEY); },
  raw() { return localStorage.getItem(WORKSPACE_KEY); },
  backupKeys() { return Object.keys(localStorage).filter(k => k.startsWith(`${WORKSPACE_KEY}-backup-`)).sort().reverse(); }
};
