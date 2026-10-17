import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  ApiWorkspaceRepository,
  type RemoteState,
} from "../persistence/apiRepository";
import { ServerConfigurationProvider } from "../ai/configurationProvider";
import { VisualBuilder } from "../builder/VisualBuilder";
import { EntityTable } from "../components/EntityTable";
import { currentRole } from "../services/workspaceDomain";
import type { WorkspaceAction } from "../services/workspaceActions";
import type { Workspace } from "../types";
import { AssistantPanel } from "../components/AssistantPanel";

const publicUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined,
  publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const auth = publicUrl && publicKey ? createClient(publicUrl, publicKey) : null;
export function ConnectedWorkspace({ onClose }: { onClose: () => void }) {
  const [entry,setEntry]=useState(false);
  const [signedIn, setSignedIn] = useState(false),
    [state, setState] = useState<RemoteState | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [builder, setBuilder] = useState(false),
    [active, setActive] = useState(""),
    [recordId, setRecordId] = useState("");
  const current = useRef<Workspace | null>(null),
    inFlight = useRef(false);
  const token = async () => {
    const session = await auth?.auth.getSession();
    const value = session?.data.session?.access_token;
    if (!value) throw new Error("Sign in to connect to the organization.");
    return value;
  };
  const repository = useMemo(() => new ApiWorkspaceRepository(token), []),
    provider = useMemo(() => new ServerConfigurationProvider(token), []);
  const refresh = async () => {
    try {
      const next = await repository.load();
      current.current = next.workspace;
      setState(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Connection failed.");
    }
  };
  useEffect(() => {
    if (!auth) return;
    void auth.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = auth.auth.onAuthStateChange((_event, session) =>
      setSignedIn(!!session),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (signedIn) void refresh();
    else {
      setState(null);
      current.current = null;
    }
  }, [signedIn]);
  const execute = async (command: WorkspaceAction) => {
    if (!current.current || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const workspace = await repository.execute(current.current, command);
      current.current = workspace;
      setState((previous) =>
        previous ? { ...previous, workspace } : previous,
      );
      await refresh();
      setNotice("Saved on the organization server.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Save failed.");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const request = async (body: unknown) => {
    setBusy(true);
    setError("");
    try {
      await repository.request(body);
      await refresh();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Operation failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!auth)
    return (
      <main className="connected-shell">
        <h1>Connected workspace</h1>
        <p>
          Il workspace condiviso non è ancora attivo in questo ambiente. Per usarlo,
          l’amministratore deve collegare il servizio aziendale e abilitare il tuo account.
          Puoi continuare nella demo: i dati saranno salvati soltanto in questo browser.
        </p>
        <button className="secondary" onClick={onClose}>
          Return to local demo
        </button>
      </main>
    );
  if (!signedIn)
    return (
      <main className="connected-shell">
        <h1>Sign in to NODUS</h1>
        <p>
          Access your organization through the configured identity provider.
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const email = String(
              new FormData(event.currentTarget).get("email"),
            );
            setBusy(true);
            const { error } = await auth.auth.signInWithOtp({
              email,
              options: {
                shouldCreateUser: false,
                emailRedirectTo: `${location.origin}/?mode=connected`,
              },
            });
            setBusy(false);
            if (error) setError(error.message);
            else
              setNotice(
                "The identity provider accepted the sign-in request. Check your email.",
              );
          }}
        >
          <label>
            Email
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <button className="primary" disabled={busy}>
            Send sign-in link
          </button>
        </form>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        <button className="secondary" onClick={onClose}>
          Local demo
        </button>
      </main>
    );
  const workspace = state?.workspace,
    role = workspace ? currentRole(workspace) : null,
    entity =
      workspace?.entities.find((item) => item.id === active) ||
      workspace?.entities.find((item) => !item.archived);
  if (builder && workspace)
    return (
      <>
        <VisualBuilder
          workspace={workspace}
          provider={state?.aiConfigured ? provider : undefined}
          onAction={execute}
          onClose={() => setBuilder(false)}
        />
        {error && (
          <div className="builder-feedback" role="alert">
            {error}
          </div>
        )}
      </>
    );
  return (
    <main className="connected-shell">
      <header>
        <h1>{workspace?.companyName || "Connected workspace"}</h1>
        <span>{state?.role} · Shared organization data</span>
        <button className="secondary" disabled={busy} onClick={refresh}>
          Refresh
        </button>
        {role?.permissions.editStructure && (
          <button className="primary" onClick={() => setBuilder(true)}>
            Visual Builder
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Local demo
        </button>
        <button className="secondary" onClick={() => void auth.auth.signOut()}>
          Sign out
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Saving…</p>}
      {!workspace && state?.role === "admin" && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void request({
              action: "initialize",
              name: String(new FormData(event.currentTarget).get("name")),
            });
          }}
        >
          <label>
            Organization workspace name
            <input name="name" required />
          </label>
          <button className="primary" disabled={busy}>
            Initialize empty workspace
          </button>
        </form>
      )}
      {workspace && (
        <>
          <button className="secondary" onClick={()=>setEntry(true)}>NODUS AI</button>
          {entry&&<AssistantPanel workspace={workspace} contextId={entity?.id} setWorkspace={()=>false} canBuild={!!role?.permissions.editStructure} token={token} onApplyStructure={proposal=>execute({type:"applyProposal",proposal})} setActiveEntity={setActive} setDelayedOnly={()=>{}} onOpenResult={(entityId,id)=>{setActive(entityId);setRecordId(id);setEntry(false)}} onToast={setNotice} onClose={()=>setEntry(false)} onApplyEntry={proposal=>execute({type:"smartEntry",proposal})}/>}
          <nav>
            {workspace.entities
              .filter((item) => !item.archived)
              .map((item) => (
                <button
                  className="secondary"
                  key={item.id}
                  onClick={() => {
                    setActive(item.id);
                    setRecordId("");
                  }}
                >
                  {item.name}
                </button>
              ))}
          </nav>
          {entity && (
            <EntityTable
              key={entity.id}
              entity={entity}
              workspace={workspace}
              initialRecordId={recordId}
              canEdit={!!role?.permissions.editRecords && !busy}
              canDelete={!!role?.permissions.deleteRecords && !busy}
              delayedOnly={false}
              onClearDelayed={() => {}}
              onSaveRecord={(record) =>
                execute({ type: "saveRecord", entityId: entity.id, record })
              }
              onSmartEntry={()=>setEntry(true)}
              onSaveRelated={(entityId,record)=>execute({type:"saveRecord",entityId,record})}
              onDeleteRecord={(recordId) =>
                execute({ type: "deleteRecord", entityId: entity.id, recordId })
              }
              onSaveView={view => execute({ type: "configureAndPublish", operations: [{ type: "createView", view }] })}
              onImport={() =>
                setError(
                  "Bulk import is available in the local demo. Connected mode currently accepts validated record actions individually.",
                )
              }
              onComment={(recordId, body) =>
                execute({
                  type: "comment",
                  entityId: entity.id,
                  recordId,
                  body,
                })
              }
              onAttach={async (recordId, file) => {
                try {
                  const upload = await repository.request<{
                    id: string;
                    uploadUrl: string;
                  }>({
                    action: "attachmentInit",
                    entityId: entity.id,
                    recordId,
                    filename: file.name,
                    mime: file.type,
                    size: file.size,
                  });
                  const response = await fetch(upload.uploadUrl, {
                    method: "PUT",
                    headers: {
                      "Content-Type": file.type || "application/octet-stream",
                    },
                    body: file,
                  });
                  if (!response.ok) throw new Error("Private upload failed.");
                  return request({
                    action: "attachmentComplete",
                    id: upload.id,
                  });
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Upload failed.",
                  );
                  return false;
                }
              }}
              onRemoveAttachment={(id) =>
                request({ action: "attachmentDelete", id })
              }
              onOpenAttachment={async (id) => {
                const result = await repository.request<{ url: string }>({
                  action: "attachmentUrl",
                  id,
                });
                const link = document.createElement("a");
                link.href = result.url;
                link.rel = "noopener noreferrer";
                link.target = "_blank";
                link.click();
              }}
              onOpenRelated={(entityId, id) => {
                setActive(entityId);
                setRecordId(id);
              }}
            />
          )}
          <h2>Approvals</h2>
          {(workspace.approvals || [])
            .filter((item) => item.status === "pending")
            .map((item) => (
              <div key={item.id}>
                {item.recordId}
                {["admin", "manager"].includes(role?.id || "") && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        execute({
                          type: "approval",
                          approvalId: item.id,
                          status: "approved",
                        })
                      }
                    >
                      Approve
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        execute({
                          type: "approval",
                          approvalId: item.id,
                          status: "rejected",
                        })
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            ))}
          <h2>Background events</h2>
          {state?.events.length ? (
            state.events.map((event) => (
              <p key={event.id}>
                {event.status} · {event.attempts} attempt(s)
                {event.error ? ` · ${event.error}` : ""}
              </p>
            ))
          ) : (
            <p>No queued events.</p>
          )}
          {state?.role === "admin" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void request({
                  action: "invite",
                  email: data.get("email"),
                  name: data.get("name"),
                  role: data.get("role"),
                });
              }}
            >
              <h2>Invite a member</h2>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Role
                <select name="role">
                  <option value="viewer">Viewer</option>
                  <option value="operator">Operator</option>
                  <option value="manager">Manager</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Send invitation
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
