import type { Workspace } from "../types";
import type { WorkspaceAction } from "../services/workspaceActions";

export interface RemoteState { workspace: Workspace | null; organizationId: string; role: string; aiConfigured: boolean; attachments: { id: string; entity_id: string; record_id: string; filename: string; mime: string; size: number }[]; events: { id: string; status: string; attempts: number; error?: string }[] }
export interface AsyncWorkspaceRepository { load(): Promise<RemoteState>; execute(workspace: Workspace, command: WorkspaceAction): Promise<Workspace> }
/** `reason` is the server's machine-readable code (no_membership, email_not_confirmed, rate_limit, company_exists, not_configured). */
export class ApiError extends Error { constructor(public status: number, message: string, public reason?: string) { super(message); } }
export async function executeWithRecovery(repository: AsyncWorkspaceRepository, workspace: Workspace, command: WorkspaceAction, refreshed: (state: RemoteState) => void) {
  try { return await repository.execute(workspace, command); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error;
    refreshed(await repository.load());
    throw new ApiError(409, "Il workspace è stato aggiornato da un altro membro o da un’automazione. La bozza non è stata applicata né cancellata. Verifica i dati e riprova; rigenera le proposte AI se necessario.");
  }
}
export class ApiWorkspaceRepository implements AsyncWorkspaceRepository {
  constructor(private token: () => Promise<string>) {}
  /** `fn` selects the Netlify Function: the workspace API, or self-service company creation. */
  async request<T>(body?: unknown, fn: "api" | "bootstrap" = "api"): Promise<T> {
    const response = await fetch(`/.netlify/functions/${fn}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await this.token()}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new ApiError(503, "Backend non disponibile. In locale avvia `npm run dev` (include le Functions); online verifica che le Functions siano pubblicate.", "not_configured");
    const data = await response.json();
    if (!response.ok) throw new ApiError(response.status, data.error || `Errore del servizio (${response.status})`, typeof data.reason === "string" ? data.reason : undefined);
    return data as T;
  }
  async load() {
    const state = await this.request<RemoteState>();
    if (state.workspace) state.workspace.attachments = state.attachments.map(file => ({ id: file.id, entityId: file.entity_id, recordId: file.record_id, name: file.filename, mime: file.mime, size: Number(file.size), at: "" }));
    return state;
  }
  async execute(workspace: Workspace, command: WorkspaceAction) {
    const result = await this.request<{ workspace: Workspace }>({ action: "mutate", expectedRevision: workspace.revision || 0, requestId: crypto.randomUUID(), command });
    return result.workspace;
  }
}
