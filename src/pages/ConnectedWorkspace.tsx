import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
import {
  ApiError,
  ApiWorkspaceRepository,
  executeWithRecovery,
  type RemoteState,
} from "../persistence/apiRepository";
import { ConnectedAuth, CompanySetup, ResendConfirmation } from "../components/ConnectedAuth";
import { EMAIL_NOT_CONFIRMED, authRedirectIssue, isAuthRedirect } from "../services/authFlow";
import { ServerConfigurationProvider } from "../ai/configurationProvider";
import { VisualBuilder } from "../builder/VisualBuilder";
import { EntityTable } from "../components/EntityTable";
import { currentRole } from "../services/workspaceDomain";
import type { WorkspaceAction } from "../services/workspaceActions";
import type { Workspace } from "../types";
import { AssistantPanel } from "../components/AssistantPanel";

const publicUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined,
  publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// Read redirect errors (expired invite/confirmation links) before the auth client consumes the URL.
const redirectIssue = authRedirectIssue(location.href),
  confirmedSignup = new URLSearchParams(location.search).get("flow") === "signup";
// Invitations sent before this change redirect to the bare origin: pin connected mode in the query
// so it survives the auth client clearing the token hash.
if (isAuthRedirect(location.hash) && new URLSearchParams(location.search).get("mode") !== "connected")
  history.replaceState(history.state, "", `${location.pathname}?mode=connected${location.hash}`);
const auth = publicUrl && publicKey ? createClient(publicUrl, publicKey) : null;
interface Account { confirmed: boolean; email: string; company: string; name: string }
const accountOf = (user: User | undefined): Account | null => user ? {
  confirmed: !!user.email_confirmed_at,
  email: user.email || "",
  company: typeof user.user_metadata?.company === "string" ? user.user_metadata.company.slice(0, 100) : "",
  name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name.slice(0, 100) : "",
} : null;
export function ConnectedWorkspace({ onClose }: { onClose: () => void }) {
  const [entry,setEntry]=useState(false);
  const [account, setAccount] = useState<Account | null>(null),
    [needsCompany, setNeedsCompany] = useState(false);
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
    if (!value) throw new Error("Accedi per collegarti all'organizzazione.");
    return value;
  };
  const repository = useMemo(() => new ApiWorkspaceRepository(token), []),
    provider = useMemo(() => new ServerConfigurationProvider(token), []);
  const refresh = async () => {
    try {
      const next = await repository.load();
      current.current = next.workspace;
      setState(next);
      setNeedsCompany(false);
      setError("");
    } catch (cause) {
      // A signed-in account without any organization: offer self-service company creation.
      if (cause instanceof ApiError && cause.reason === "no_membership") { setNeedsCompany(true); setError(""); return; }
      setError(cause instanceof Error ? cause.message : "Connessione non riuscita.");
    }
  };
  useEffect(() => {
    if (!auth) return;
    // Drop error params from the address bar once captured; keep connected mode.
    if (redirectIssue) history.replaceState(history.state, "", `${location.pathname}?mode=connected`);
    void auth.auth.getSession().then(({ data }) => { setSignedIn(!!data.session); setAccount(accountOf(data.session?.user)); });
    const { data } = auth.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
      setAccount(accountOf(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (signedIn) void refresh();
    else {
      setState(null);
      setNeedsCompany(false);
      current.current = null;
    }
  }, [signedIn]);
  const createCompany = async (company: string, name: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await repository.request<{ created: boolean; message?: string }>({ company, name }, "bootstrap");
      setNotice(result.created ? "Azienda creata. Sei l'amministratore: puoi invitare i colleghi." : result.message || "");
      await refresh();
    } catch (cause) {
      if (cause instanceof ApiError && cause.reason === "email_not_confirmed") setAccount(previous => previous && { ...previous, confirmed: false });
      setError(cause instanceof Error ? cause.message : "Creazione dell'azienda non riuscita.");
    } finally {
      setBusy(false);
    }
  };
  const execute = async (command: WorkspaceAction) => {
    if (!current.current || inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const workspace = await executeWithRecovery(repository, current.current, command, next => { current.current = next.workspace; setState(next); });
      current.current = workspace;
      setState((previous) =>
        previous ? { ...previous, workspace } : previous,
      );
      await refresh();
      setNotice("Salvato sul server dell'organizzazione.");
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Salvataggio non riuscito.");
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
      setError(cause instanceof Error ? cause.message : "Operazione non riuscita.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  if (!auth)
    return (
      <main className="connected-shell">
        <h1>Workspace condiviso</h1>
        <p>
          Il workspace condiviso non è ancora attivo in questo ambiente: il servizio di
          registrazione e accesso non è configurato. Puoi continuare nella demo: i dati
          saranno salvati soltanto in questo browser.
        </p>
        <button className="secondary" onClick={onClose}>
          Torna alla demo locale
        </button>
      </main>
    );
  if (!signedIn) return <ConnectedAuth auth={auth} issue={redirectIssue} onClose={onClose} />;
  if (needsCompany)
    return (
      <main className="connected-shell auth-panel">
        <h1>Benvenuto in NODUS</h1>
        {account?.confirmed ? (
          <>
            {confirmedSignup && <p role="status" className="auth-note">Email confermata.</p>}
            <CompanySetup defaults={{ company: account.company, name: account.name }} busy={busy} onCreate={(company, name) => void createCompany(company, name)} />
          </>
        ) : (
          <section className="auth-form">
            <p role="alert" className="auth-error">{EMAIL_NOT_CONFIRMED}</p>
            <ResendConfirmation auth={auth} email={account?.email || ""} />
          </section>
        )}
        {error && <p role="alert" className="auth-error">{error}</p>}
        {notice && <p role="status" className="auth-note">{notice}</p>}
        <div className="auth-actions">
          <button type="button" className="secondary" onClick={onClose}>Demo locale</button>
          <button type="button" className="secondary" onClick={() => void auth.auth.signOut()}>Esci</button>
        </div>
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
        <h1>{workspace?.companyName || "Workspace condiviso"}</h1>
        <span>{state?.role} · Dati condivisi dell'organizzazione</span>
        <button className="secondary" disabled={busy} onClick={refresh}>
          Aggiorna
        </button>
        {role?.permissions.editStructure && (
          <button className="primary" onClick={() => setBuilder(true)}>
            Editor visivo
          </button>
        )}
        <button className="secondary" onClick={onClose}>
          Demo locale
        </button>
        <button className="secondary" onClick={() => void auth.auth.signOut()}>
          Esci
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {busy && <p role="status">Salvataggio in corso…</p>}
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
            Nome del workspace dell'organizzazione
            <input name="name" required />
          </label>
          <button className="primary" disabled={busy}>
            Inizializza workspace vuoto
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
                  "L'importazione di massa è disponibile nella demo locale. Il workspace condiviso accetta per ora solo azioni validate sui singoli record.",
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
                  if (!response.ok) throw new Error("Caricamento privato non riuscito.");
                  return request({
                    action: "attachmentComplete",
                    id: upload.id,
                  });
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Caricamento non riuscito.",
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
          <h2>Approvazioni</h2>
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
                      Approva
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
                      Rifiuta
                    </button>
                  </>
                )}
              </div>
            ))}
          <h2>Eventi in background</h2>
          {state?.events.length ? (
            state.events.map((event) => (
              <p key={event.id}>
                {event.status} · {event.attempts} tentativo/i
                {event.error ? ` · ${event.error}` : ""}
              </p>
            ))
          ) : (
            <p>Nessun evento in coda.</p>
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
              <h2>Invita un membro</h2>
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Email
                <input name="email" type="email" required />
              </label>
              <label>
                Ruolo
                <select name="role">
                  <option value="viewer">Lettore</option>
                  <option value="operator">Operatore</option>
                  <option value="manager">Responsabile</option>
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Invia invito
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
