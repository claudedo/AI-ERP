import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  BarChart3,
  Bell,
  Blocks,
  Check,
  ChevronsUpDown,
  Command,
  FileUp,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  RotateCcw,
  Search,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
  X,
  Zap,
} from "lucide-react";
import { AlertDialog, DropdownMenu, Popover, Tooltip } from "radix-ui";
import type { DataRecord, Entity, View, Workspace } from "../types";
import { Dashboard } from "../components/Dashboard";
import { EntityTable } from "../components/EntityTable";
import { AutomationsPage } from "../components/AutomationsPage";
import { UsersRolesPage } from "../components/UsersRolesPage";
import { AssistantPanel } from "../components/AssistantPanel";
import { Hint } from "../components/ui/Hint";
import { NodusLogo } from "../components/NodusLogo";
import { useGuardedNavigation } from "../components/ui/NavigationGuard";
import { recordLabel } from "../components/RecordDrawer";
import { ImportWizard } from "../components/ImportWizard";
import { CommandPalette } from "../components/CommandPalette";
import { ApprovalsPage } from "../components/ApprovalsPage";
import { useWorkspaceRoute } from "../hooks/useWorkspaceRoute";
import { applyEntry } from "../services/smartEntry";
import {
  addAttachment,
  addComment,
  deleteRecord as removeRecord,
  markNotificationRead,
  removeAttachment,
  saveDashboardWidgets,
  saveRecord as upsertRecord,
  saveView as persistView,
  saveWorkflow,
  setApproval as decideApproval,
  toggleWorkflow,
  undoAiChange,
} from "../services/workspaceDomain";
import {
  removeAttachmentBlob,
  saveAttachmentBlob,
} from "../services/attachments";
import { newId } from "../services/workspaceDomain";

const iconFor = (name: string) =>
  /customer|client|lead|owner/i.test(name) ? (
    <Users />
  ) : /analytic/i.test(name) ? (
    <BarChart3 />
  ) : /deliver|logistic/i.test(name) ? (
    <Truck />
  ) : (
    <Blocks />
  );
const industryLabel = (industry: string) =>
  ({
    fashion: "Moda",
    furniture: "Arredamento",
    realestate: "Immobiliare",
    consulting: "Consulenza",
    generic: "Generale",
  })[
    industry as
      "fashion" | "furniture" | "realestate" | "consulting" | "generic"
  ] || industry;
const searchableText = (
  entity: Entity,
  record: DataRecord,
  workspace: Workspace,
) =>
  [
    recordLabel(entity, record),
    ...entity.fields.map((f) => {
      const value = record[f.id];
      if (f.type === "relation" && f.relationEntityId) {
        const target = workspace.entities.find(
            (e) => e.id === f.relationEntityId,
          ),
          linked = target?.records.find((r) => r.id === value);
        return linked && target
          ? recordLabel(target, linked)
          : String(value ?? "");
      }
      return String(value ?? "");
    }),
  ]
    .join(" ")
    .toLowerCase();

export function WorkspaceApp({
  workspace,
  setWorkspace,
  storageError,
  onReset,
  onBuilder,
  onConnected,
}: {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => boolean;
  storageError: string;
  onReset: () => void;
  onBuilder: () => void;
  onConnected: () => void;
}) {
  const [active, setActive] = useWorkspaceRoute(workspace);
  const [assistant, setAssistant] = useState(false),
    [mobileNav, setMobileNav] = useState(false),
    [delayedOnly, setDelayedOnly] = useState(false),
    [toast, setToast] = useState(""),
    [toastError, setToastError] = useState(false),
    [confirmReset, setConfirmReset] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [paletteOpen, setPaletteOpen] = useState(false),
    [targetRecord, setTargetRecord] = useState(""),
    // Re-opening the same record (e.g. twice from chat) must reopen its drawer.
    [recordOpenRequest, setRecordOpenRequest] = useState(0);
  // Record jumps (related links, search, chat, notifications) ask any dirty editor first.
  const guardedNavigate = useGuardedNavigation();
  const searchRef = useRef<HTMLInputElement>(null),
    menuButtonRef = useRef<HTMLButtonElement>(null),
    closeNavRef = useRef<HTMLButtonElement>(null);
  const [globalQuery, setGlobalQuery] = useState(""),
    [tableSearch, setTableSearch] = useState("");
  const currentUser =
      workspace.users.find((u) => u.id === workspace.currentUserId) ||
      workspace.users[0],
    role =
      workspace.roles.find((r) => r.id === currentUser.roleId) ||
      workspace.roles[0],
    permissions = role.permissions,
    entity = workspace.entities.find((e) => e.id === active);
  const visibleNotifications = (workspace.notifications || []).filter(
      (n) => !n.userId || n.userId === currentUser.id,
    ),
    notificationCount =
      visibleNotifications.filter((n) => !n.read).length +
      workspace.alerts.length;
  const searchResults = globalQuery.trim()
    ? workspace.entities
        .filter((e) => !e.archived)
        .flatMap((e) =>
          e.records
            .filter((r) =>
              searchableText(e, r, workspace).includes(
                globalQuery.trim().toLowerCase(),
              ),
            )
            .map((r) => ({ entity: e, record: r })),
        )
        .slice(0, 8)
    : [];
  const notify = (message: string, error = false) => {
    setToast(message);
    setToastError(error);
    window.setTimeout(() => setToast(""), 3400);
  };
  const commit = (next: Workspace, message: string) => {
    if (!setWorkspace(next)) {
      notify("Impossibile salvare il workspace. Nessuna modifica applicata.", true);
      return false;
    }
    notify(message);
    return true;
  };
  const saveRecord = (record: DataRecord) => {
    if (!entity) return false;
    try {
      return commit(
        upsertRecord(workspace, entity.id, record),
        entity.records.some((r) => r.id === record.id)
          ? "Record aggiornato"
          : "Record creato",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossibile salvare il record.",
        true,
      );
      return false;
    }
  };
  const deleteRecord = (id: string) => {
    if (!entity) return false;
    try {
      const attachmentIds = (workspace.attachments || [])
        .filter((a) => a.entityId === entity.id && a.recordId === id)
        .map((a) => a.id);
      const saved = commit(
        removeRecord(workspace, entity.id, id),
        "Record eliminato; collegamenti in entrata rimossi",
      );
      if (saved)
        attachmentIds.forEach(
          (attachmentId) =>
            void removeAttachmentBlob(attachmentId).catch(() =>
              notify(
                "Impossibile rimuovere da questo browser il file di un record eliminato.",
                true,
              ),
            ),
        );
      return saved;
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossibile eliminare il record.",
        true,
      );
      return false;
    }
  };
  const saveView = (view: View) => {
    try {
      return commit(persistView(workspace, view), "Vista salvata");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossibile salvare la vista.",
        true,
      );
      return false;
    }
  };
  const commentOnRecord = (recordId: string, body: string) => {
    if (!entity) return false;
    try {
      return commit(
        addComment(workspace, entity.id, recordId, body),
        "Commento salvato",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Impossibile salvare il commento.",
        true,
      );
      return false;
    }
  };
  const attachToRecord = async (recordId: string, file: File) => {
    if (!entity) return false;
    const attachment = {
      id: newId("attachment"),
      entityId: entity.id,
      recordId,
      name: file.name,
      mime: file.type,
      size: file.size,
      at: new Date().toISOString(),
    };
    try {
      await saveAttachmentBlob(attachment.id, file);
      const saved = commit(
        addAttachment(workspace, attachment),
        "Allegato salvato",
      );
      if (!saved) await removeAttachmentBlob(attachment.id);
      return saved;
    } catch (error) {
      await removeAttachmentBlob(attachment.id).catch(() => undefined);
      notify(
        error instanceof Error
          ? error.message
          : "Impossibile salvare l’allegato.",
        true,
      );
      return false;
    }
  };
  const removeRecordAttachment = (attachmentId: string) => {
    try {
      const saved = commit(
        removeAttachment(workspace, attachmentId),
        "Allegato rimosso",
      );
      if (saved)
        void removeAttachmentBlob(attachmentId).catch(() =>
          notify("Impossibile rimuovere il file da questo browser.", true),
        );
      return saved;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Impossibile rimuovere l’allegato.",
        true,
      );
      return false;
    }
  };
  const openAssistant = (_hint: "operator" | "builder" = "operator") => {
    setAssistant(true);
  };
  const go = (id: string) => {
    setActive(id);
    setDelayedOnly(false);
    setMobileNav(false);
    setTableSearch("");
    setTargetRecord("");
  };
  const goRecord = (id: string, recordId: string, after?: () => void) =>
    guardedNavigate(() => {
      go(id);
      setTargetRecord(recordId);
      setRecordOpenRequest((n) => n + 1);
      after?.();
    });
  const openSearchResult = (id: string, recordId: string) =>
    // Keep the query if a dirty editor cancels the jump.
    goRecord(id, recordId, () => {
      setGlobalQuery("");
      searchRef.current?.blur();
    });
  const switchUser = (id: string) => {
    setWorkspace({ ...workspace, currentUserId: id });
    notify("Utente demo cambiato");
  };

  // Desktop shortcuts: ⌘/ searches records; ⌘K opens commands; Esc closes mobile navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (mod && e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!mobileNav) return;
    closeNavRef.current?.focus();
    return () => menuButtonRef.current?.focus();
  }, [mobileNav]);

  const navItem = (
    id: string,
    icon: ReactNode,
    label: string,
    meta?: ReactNode,
  ) => (
    <button
      key={id}
      className={active === id ? "active" : ""}
      aria-current={active === id ? "page" : undefined}
      onClick={() => go(id)}
    >
      {icon}
      <span>{label}</span>
      {meta}
    </button>
  );

  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={150}>
      <div className="app-shell">
        {/* Keyboard users skip the sidebar and top bar. Focus is moved by script so the
            hash router never sees "#main-content" as a route. */}
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("main-content")?.focus();
          }}
        >
          Salta al contenuto
        </a>
        {mobileNav && (
          <div
            className="sidebar-scrim"
            onClick={() => setMobileNav(false)}
            aria-hidden
          />
        )}
        <aside
          id="workspace-navigation"
          className={`sidebar ${mobileNav ? "open" : ""}`}
          role={mobileNav ? "dialog" : undefined}
          aria-modal={mobileNav ? true : undefined}
          aria-label="Navigazione del workspace"
        >
          <div className="sidebar-brand">
            <div className="brand-copy">
              <NodusLogo variant="lockup" />
              <small>OPERAZIONI CONNESSE</small>
            </div>
            <button
              ref={closeNavRef}
              className="mobile-close"
              aria-label="Chiudi navigazione"
              onClick={() => setMobileNav(false)}
            >
              <X />
            </button>
          </div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="workspace-switch" aria-label="Menu del workspace">
                <div className="company-avatar">
                  {workspace.companyName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{workspace.companyName}</strong>
                  <small>workspace {industryLabel(workspace.industry)}</small>
                </div>
                <ChevronsUpDown size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="ds-menu"
                sideOffset={4}
                align="start"
                collisionPadding={8}
              >
                <DropdownMenu.Label className="ds-menu-label">
                  {workspace.companyName} · {workspace.architecture}
                </DropdownMenu.Label>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("dashboard")}
                >
                  <LayoutDashboard />
                  Dashboard
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("automations")}
                >
                  <Zap />
                  Automazioni
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("approvals")}
                >
                  <ShieldCheck />
                  Approvazioni
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("users")}
                >
                  <UserCog />
                  Utenti e ruoli
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("history")}
                >
                  <History />
                  Cronologia modifiche
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="ds-menu-sep" />
                <DropdownMenu.Item
                  className="ds-menu-item danger"
                  onSelect={() => setConfirmReset(true)}
                >
                  <RotateCcw />
                  Reimposta demo…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <nav>
            {navItem("dashboard", <LayoutDashboard />, "Dashboard")}
            <div className="nav-label">Moduli</div>
            {workspace.entities
              .filter((e) => !e.archived)
              .map((e, index, visible) => (
                <div key={e.id}>
                  {e.navigationGroup &&
                    e.navigationGroup !==
                      visible[index - 1]?.navigationGroup && (
                      <div className="nav-label">{e.navigationGroup}</div>
                    )}
                  {navItem(
                    e.id,
                    iconFor(e.name),
                    e.name,
                    <small>{e.records.length}</small>,
                  )}
                </div>
              ))}
            <div className="nav-label">Gestisci</div>
            {navItem(
              "automations",
              <Zap />,
              "Automazioni",
              <em>{workspace.workflows.filter((w) => w.active).length}</em>,
            )}
            {navItem(
              "approvals",
              <ShieldCheck />,
              "Approvazioni",
              <em>
                {
                  (workspace.approvals || []).filter(
                    (a) => a.status === "pending",
                  ).length
                }
              </em>,
            )}
            {navItem("users", <UserCog />, "Utenti e ruoli")}
            {navItem("history", <History />, "Cronologia modifiche")}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={onConnected}>
              <Users />
              <span>Workspace condiviso</span>
            </button>
            {permissions.editStructure && (
              <button onClick={onBuilder}>
                <Blocks />
                <span>Editor visivo</span>
              </button>
            )}
            <button onClick={() => openAssistant("operator")}>
              <Search />
              <span>NODUS AI</span>
            </button>
            <button
              className="reset-demo"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw />
              <span>Reimposta demo</span>
            </button>
            <div className="user">
              <div className="avatar">{currentUser.initials}</div>
              <div>
                <strong>{currentUser.name}</strong>
                <small>{role.name}</small>
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button aria-label="Menu account">
                    <MoreHorizontal size={16} />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="ds-menu"
                    side="top"
                    align="end"
                    sideOffset={6}
                    collisionPadding={8}
                  >
                    <DropdownMenu.Label className="ds-menu-label">
                      Visualizza come utente demo
                    </DropdownMenu.Label>
                    <DropdownMenu.RadioGroup
                      value={currentUser.id}
                      onValueChange={switchUser}
                    >
                      {workspace.users.map((u) => (
                        <DropdownMenu.RadioItem
                          key={u.id}
                          value={u.id}
                          className="ds-menu-item"
                        >
                          <DropdownMenu.ItemIndicator className="ds-menu-check">
                            <Check size={13} />
                          </DropdownMenu.ItemIndicator>
                          {u.name}
                          <span className="ds-menu-meta">
                            {
                              workspace.roles.find((r) => r.id === u.roleId)
                                ?.name
                            }
                          </span>
                        </DropdownMenu.RadioItem>
                      ))}
                    </DropdownMenu.RadioGroup>
                    <DropdownMenu.Separator className="ds-menu-sep" />
                    <DropdownMenu.Item
                      className="ds-menu-item"
                      onSelect={() => go("users")}
                    >
                      <UserCog />
                      Utenti e ruoli
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="ds-menu-item danger"
                      onSelect={() => setConfirmReset(true)}
                    >
                      <LogOut />
                      Esci dalla demo…
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
        </aside>
        <main className="workspace-main" inert={mobileNav}>
          <header className="topbar">
            <button
              ref={menuButtonRef}
              className="menu-btn"
              aria-label="Apri navigazione"
              aria-controls="workspace-navigation"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(true)}
            >
              <Menu />
            </button>
            <div className="global-search">
              <Search />
              <input
                ref={searchRef}
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults[0])
                    openSearchResult(
                      searchResults[0].entity.id,
                      searchResults[0].record.id,
                    );
                  if (e.key === "Escape") setGlobalQuery("");
                }}
                placeholder="Cerca in tutto il workspace…"
                aria-label="Cerca in tutti i record del workspace"
                aria-controls={
                  globalQuery.trim() ? "workspace-search-results" : undefined
                }
                autoComplete="off"
              />
              <kbd>⌘/</kbd>
              {globalQuery.trim() && (
                <div
                  id="workspace-search-results"
                  className="global-search-results"
                  role="region"
                  aria-label="Risultati della ricerca"
                >
                  {searchResults.length ? (
                    searchResults.map(({ entity, record }) => (
                      <button
                        key={`${entity.id}:${record.id}`}
                        onClick={() => openSearchResult(entity.id, record.id)}
                      >
                        <strong>{recordLabel(entity, record)}</strong>
                        <span>{entity.name}</span>
                      </button>
                    ))
                  ) : (
                    <p role="status">Nessun record trovato</p>
                  )}
                </div>
              )}
            </div>
            <div className="permission-badge">
              <span>{role.name}</span>
              {!permissions.editRecords && <small>Sola lettura</small>}
            </div>
            <div className="top-actions">
              <Hint label="Comandi" shortcut="⌘K">
                <button
                  className="icon-button command-button"
                  aria-label="Apri comandi"
                  onClick={() => setPaletteOpen(true)}
                >
                  {/* On phones the workspace search field is hidden and this palette is the
                      way to find records, so it stays, drawn as search instead of ⌘. */}
                  <Command className="desktop-only" aria-hidden="true" />
                  <Search className="phone-only" aria-hidden="true" />
                </button>
              </Hint>
              {permissions.editRecords && (
                <Hint label="Importa CSV o Excel">
                  <button
                    className="icon-button"
                    aria-label="Importa CSV o Excel"
                    onClick={() => setImportOpen(true)}
                  >
                    <FileUp />
                  </button>
                </Hint>
              )}
              <Popover.Root>
                <Hint label="Notifiche">
                  <Popover.Trigger asChild>
                    <button
                      aria-label={`Notifiche, ${notificationCount} elementi`}
                      className="icon-button"
                    >
                      <Bell />
                      {notificationCount > 0 && (
                        <span className="badge-dot">{notificationCount}</span>
                      )}
                    </button>
                  </Popover.Trigger>
                </Hint>
                <Popover.Portal>
                  <Popover.Content
                    className="popover notif-pop"
                    align="end"
                    sideOffset={8}
                    collisionPadding={8}
                  >
                    <div className="notif-head">
                      <strong>Da gestire</strong>
                      <span>{notificationCount}</span>
                    </div>
                    {notificationCount === 0 ? (
                      <p className="notif-empty">Nessuna novità.</p>
                    ) : (
                      <>
                        {visibleNotifications.slice(0, 6).map((n) => (
                          <Popover.Close asChild key={n.id}>
                            <button
                              className="notif-row"
                              onClick={() => {
                                try {
                                  setWorkspace(
                                    markNotificationRead(workspace, n.id),
                                  );
                                } catch {}
                                if (n.entityId && n.recordId)
                                  goRecord(n.entityId, n.recordId);
                              }}
                            >
                              <span className="sev">
                                <Bell size={14} />
                              </span>
                              <span>
                                <strong>{n.title}</strong>
                                <small>{n.detail}</small>
                              </span>
                            </button>
                          </Popover.Close>
                        ))}
                        {workspace.alerts.slice(0, 6).map((a) => (
                          <Popover.Close asChild key={a.id}>
                            <button
                              className="notif-row"
                              onClick={() => a.entityId && go(a.entityId)}
                            >
                              <span className={`sev ${a.severity}`}>
                                <AlertCircle size={14} />
                              </span>
                              <span>
                                <strong>{a.title}</strong>
                                <small>{a.detail}</small>
                              </span>
                            </button>
                          </Popover.Close>
                        ))}
                      </>
                    )}
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
              <Hint label="Chiedi al tuo workspace">
                <button
                  className="assistant-top"
                  onClick={() => openAssistant("operator")}
                >
                  <NodusLogo variant="mark" />
                  NODUS AI
                </button>
              </Hint>
              <div className="avatar" title={currentUser.name}>
                {currentUser.initials}
              </div>
            </div>
          </header>
          {storageError && (
            <div className="storage-banner" role="alert">
              {storageError} Le modifiche restano non salvate in questo browser.
            </div>
          )}
          <div id="main-content" className="main-anchor" tabIndex={-1} />

          {active === "dashboard" && (
            <Dashboard
              workspace={workspace}
              onAsk={() => openAssistant("operator")}
              onOpen={go}
              canCustomize={permissions.editRecords}
              onWidgetsChange={(widgets) => {
                try {
                  return commit(
                    saveDashboardWidgets(workspace, widgets),
                    "Dashboard aggiornata",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Impossibile aggiornare la dashboard.",
                    true,
                  );
                  return false;
                }
              }}
            />
          )}
          {entity && (
            <EntityTable
              key={entity.id}
              entity={entity}
              workspace={workspace}
              initialSearch={tableSearch}
              initialRecordId={targetRecord}
              recordOpenRequest={recordOpenRequest}
              canEdit={permissions.editRecords}
              canDelete={permissions.deleteRecords}
              delayedOnly={delayedOnly}
              onClearDelayed={() => setDelayedOnly(false)}
              onSaveRecord={saveRecord}
              onDeleteRecord={deleteRecord}
              onSaveView={saveView}
              onImport={() => setImportOpen(true)}
              onComment={commentOnRecord}
              onAttach={attachToRecord}
              onRemoveAttachment={removeRecordAttachment}
              onOpenRelated={goRecord}
              onSmartEntry={() => openAssistant()}
              onSaveRelated={(id, record) => {
                try {
                  return commit(
                    upsertRecord(workspace, id, record),
                    "Anagrafica collegata salvata",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Salvataggio non riuscito",
                    true,
                  );
                  return false;
                }
              }}
            />
          )}
          {active === "automations" && (
            <AutomationsPage
              workspace={workspace}
              workflows={workspace.workflows}
              canEdit={permissions.editStructure}
              onCreate={() => openAssistant("builder")}
              onToggle={(id) => {
                try {
                  commit(toggleWorkflow(workspace, id), "Automazione aggiornata");
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Impossibile aggiornare l’automazione.",
                    true,
                  );
                }
              }}
              onSave={(flow) => {
                try {
                  return commit(
                    saveWorkflow(workspace, flow),
                    "Workflow creato",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Impossibile creare il workflow.",
                    true,
                  );
                  return false;
                }
              }}
            />
          )}
          {active === "approvals" && (
            <ApprovalsPage
              workspace={workspace}
              canDecide={role.id === "admin" || role.id === "manager"}
              onOpenRecord={goRecord}
              onDecide={(id, status) => {
                try {
                  return commit(
                    decideApproval(workspace, id, status),
                    `Approvazione ${status === "approved" ? "approvata" : "rifiutata"}`,
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Impossibile aggiornare l’approvazione.",
                    true,
                  );
                  return false;
                }
              }}
            />
          )}
          {active === "users" && (
            <UsersRolesPage
              workspace={workspace}
              canManage={permissions.manageUsers}
              onSwitch={switchUser}
            />
          )}
          {active === "history" && (
            <HistoryPage
              workspace={workspace}
              canUndo={permissions.editStructure}
              onUndo={(id) => {
                try {
                  return commit(
                    undoAiChange(workspace, id),
                    "Modifica AI annullata",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Impossibile annullare.",
                    true,
                  );
                  return false;
                }
              }}
            />
          )}
        </main>
        {assistant && (
          <AssistantPanel
            workspace={workspace}
            setWorkspace={setWorkspace}
            canBuild={permissions.editStructure}
            setActiveEntity={(id) => {
              setActive(id);
              setAssistant(false);
            }}
            setDelayedOnly={setDelayedOnly}
            onOpenResult={(id, recordId) =>
              // Close only once navigation is approved, so a pending chat
              // proposal can ask to be discarded instead of vanishing.
              goRecord(id, recordId, () => setAssistant(false))
            }
            onClose={() => setAssistant(false)}
            onToast={notify}
            contextId={entity?.id}
            onApplyEntry={(proposal) => {
              try {
                return commit(
                  applyEntry(workspace, proposal),
                  "Proposta salvata: record e workflow aggiornati",
                );
              } catch (error) {
                notify(
                  error instanceof Error
                    ? error.message
                    : "Proposta non salvata",
                  true,
                );
                return false;
              }
            }}
          />
        )}
        {paletteOpen && (
          <CommandPalette
            workspace={workspace}
            canEdit={permissions.editRecords}
            canBuild={permissions.editStructure}
            onClose={() => setPaletteOpen(false)}
            onNavigate={go}
            onRecord={goRecord}
            onAssistant={openAssistant}
            onImport={() => setImportOpen(true)}
          />
        )}
        {importOpen && (
          <ImportWizard
            workspace={workspace}
            defaultEntityId={entity?.id}
            onClose={() => setImportOpen(false)}
            onImport={(next) => commit(next, "Importazione salvata")}
          />
        )}
        <AlertDialog.Root open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="alert-overlay" />
            <AlertDialog.Content className="confirm-box">
              <RotateCcw />
              <AlertDialog.Title>Reimpostare il workspace demo?</AlertDialog.Title>
              <AlertDialog.Description>
                Tutti i record, le viste e le modifiche AI salvati in questo browser
                verranno rimossi e tornerai all’onboarding.
              </AlertDialog.Description>
              <div>
                <AlertDialog.Cancel asChild>
                  <button className="secondary">Annulla</button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button className="danger-solid" onClick={onReset}>
                    Reimposta demo
                  </button>
                </AlertDialog.Action>
              </div>
            </AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
        {toast && (
          <div
            className={`toast ${toastError ? "toast-error" : ""}`}
            role={toastError ? "alert" : "status"}
          >
            {toastError ? <AlertCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
            {toast}
          </div>
        )}
      </div>
    </Tooltip.Provider>
  );
}

function HistoryPage({
  workspace,
  canUndo,
  onUndo,
}: {
  workspace: Workspace;
  canUndo: boolean;
  onUndo: (id: string) => boolean;
}) {
  const reversible = new Set([
    "add-priority",
    "add-quality",
    "add-suppliers",
    "add-approval",
    "add-status",
    "add-view",
  ]);
  return (
    <div className="entity-page history-page">
      <div className="page-heading">
        <div>
          <span className="overline">WORKSPACE / GOVERNANCE</span>
          <h1>Cronologia modifiche</h1>
          <p>
            Registro trasparente delle modifiche strutturali proposte e applicate.
          </p>
        </div>
      </div>
      <div className="history-list">
        {workspace.changeHistory.map((change) => (
          <article key={change.id}>
            <span className={change.status}>
              {change.status === "applied" ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
            </span>
            <div>
              <h3>{change.summary}</h3>
              <p>“{change.command}”</p>
              <small>
                {new Date(change.at).toLocaleString("it-IT")} ·{" "}
                {workspace.users.find((user) => user.id === change.userId)
                  ?.name || "Utente"}
              </small>
            </div>
            <em>{({ applied: "applicata", rejected: "rifiutata", proposed: "proposta" } as Record<string, string>)[change.status] ?? change.status}</em>
            {canUndo &&
              change.status === "applied" &&
              change.appliedRevision === (workspace.revision || 0) &&
              reversible.has(change.action || "") && (
                <button className="secondary" onClick={() => onUndo(change.id)}>
                  Annulla
                </button>
              )}
          </article>
        ))}
        {workspace.changeHistory.length === 0 && (
          <div className="empty-state">
            <History />
            <h3>Nessuna modifica AI</h3>
            <p>Le modifiche confermate dall’editor verranno registrate qui.</p>
          </div>
        )}
      </div>
      <div className="section-title">
        <div>
          <History />
          <div>
            <h3>Attività del workspace</h3>
            <p>Azioni manuali, di importazione, AI e di automazione nel browser</p>
          </div>
        </div>
      </div>
      <div className="history-list">
        {(workspace.activity || []).slice(0, 100).map((entry) => (
          <article key={entry.id}>
            <span>{entry.source[0].toUpperCase()}</span>
            <div>
              <h3>{entry.summary}</h3>
              <small>
                {new Date(entry.at).toLocaleString("it-IT")} · {entry.source} ·{" "}
                {workspace.users.find((user) => user.id === entry.userId)
                  ?.name || "Utente"}
              </small>
            </div>
          </article>
        ))}
        {!(workspace.activity || []).length && (
          <div className="empty-state">
            <p>Nessuna attività registrata.</p>
          </div>
        )}
      </div>
    </div>
  );
}
