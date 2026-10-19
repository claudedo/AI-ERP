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
    fashion: "Fashion",
    furniture: "Furniture",
    realestate: "Real estate",
    consulting: "Consulting",
    generic: "General",
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
      notify("Workspace could not be saved. No changes were committed.", true);
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
          ? "Record updated"
          : "Record created",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Record could not be saved.",
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
        "Record deleted; incoming links cleared",
      );
      if (saved)
        attachmentIds.forEach(
          (attachmentId) =>
            void removeAttachmentBlob(attachmentId).catch(() =>
              notify(
                "A deleted record’s file could not be removed from this browser.",
                true,
              ),
            ),
        );
      return saved;
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Record could not be deleted.",
        true,
      );
      return false;
    }
  };
  const saveView = (view: View) => {
    try {
      return commit(persistView(workspace, view), "View saved");
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "View could not be saved.",
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
        "Comment saved",
      );
    } catch (error) {
      notify(
        error instanceof Error ? error.message : "Comment could not be saved.",
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
        "Attachment saved",
      );
      if (!saved) await removeAttachmentBlob(attachment.id);
      return saved;
    } catch (error) {
      await removeAttachmentBlob(attachment.id).catch(() => undefined);
      notify(
        error instanceof Error
          ? error.message
          : "Attachment could not be saved.",
        true,
      );
      return false;
    }
  };
  const removeRecordAttachment = (attachmentId: string) => {
    try {
      const saved = commit(
        removeAttachment(workspace, attachmentId),
        "Attachment removed",
      );
      if (saved)
        void removeAttachmentBlob(attachmentId).catch(() =>
          notify("File could not be removed from this browser.", true),
        );
      return saved;
    } catch (error) {
      notify(
        error instanceof Error
          ? error.message
          : "Attachment could not be removed.",
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
    notify("Demo user switched");
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
          aria-label="Workspace navigation"
        >
          <div className="sidebar-brand">
            <div className="brand-copy">
              <NodusLogo variant="lockup" />
              <small>CONNECTED OPERATIONS</small>
            </div>
            <button
              ref={closeNavRef}
              className="mobile-close"
              aria-label="Close navigation"
              onClick={() => setMobileNav(false)}
            >
              <X />
            </button>
          </div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="workspace-switch" aria-label="Workspace menu">
                <div className="company-avatar">
                  {workspace.companyName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <strong>{workspace.companyName}</strong>
                  <small>{industryLabel(workspace.industry)} workspace</small>
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
                  Automations
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("approvals")}
                >
                  <ShieldCheck />
                  Approvals
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("users")}
                >
                  <UserCog />
                  Users & roles
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className="ds-menu-item"
                  onSelect={() => go("history")}
                >
                  <History />
                  AI change history
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="ds-menu-sep" />
                <DropdownMenu.Item
                  className="ds-menu-item danger"
                  onSelect={() => setConfirmReset(true)}
                >
                  <RotateCcw />
                  Reset demo…
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <nav>
            {navItem("dashboard", <LayoutDashboard />, "Dashboard")}
            <div className="nav-label">Modules</div>
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
            <div className="nav-label">Manage</div>
            {navItem(
              "automations",
              <Zap />,
              "Automations",
              <em>{workspace.workflows.filter((w) => w.active).length}</em>,
            )}
            {navItem(
              "approvals",
              <ShieldCheck />,
              "Approvals",
              <em>
                {
                  (workspace.approvals || []).filter(
                    (a) => a.status === "pending",
                  ).length
                }
              </em>,
            )}
            {navItem("users", <UserCog />, "Users & roles")}
            {navItem("history", <History />, "AI change history")}
          </nav>
          <div className="sidebar-bottom">
            <button onClick={onConnected}>
              <Users />
              <span>Connected workspace</span>
            </button>
            {permissions.editStructure && (
              <button onClick={onBuilder}>
                <Blocks />
                <span>Visual Builder</span>
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
              <span>Reset demo</span>
            </button>
            <div className="user">
              <div className="avatar">{currentUser.initials}</div>
              <div>
                <strong>{currentUser.name}</strong>
                <small>{role.name}</small>
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button aria-label="Account menu">
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
                      Preview as demo user
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
                      Users & roles
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className="ds-menu-item danger"
                      onSelect={() => setConfirmReset(true)}
                    >
                      <LogOut />
                      Leave demo…
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
              aria-label="Open navigation"
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
                placeholder="Search anything..."
                aria-label="Search all workspace records"
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
                  aria-label="Search results"
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
                    <p role="status">No matching records</p>
                  )}
                </div>
              )}
            </div>
            <div className="permission-badge">
              <span>{role.name}</span>
              {!permissions.editRecords && <small>Read only</small>}
            </div>
            <div className="top-actions">
              <Hint label="Command palette" shortcut="⌘K">
                <button
                  className="icon-button"
                  aria-label="Open command palette"
                  onClick={() => setPaletteOpen(true)}
                >
                  <Command />
                </button>
              </Hint>
              {permissions.editRecords && (
                <Hint label="Import CSV or Excel">
                  <button
                    className="icon-button"
                    aria-label="Import CSV or Excel"
                    onClick={() => setImportOpen(true)}
                  >
                    <FileUp />
                  </button>
                </Hint>
              )}
              <Popover.Root>
                <Hint label="Notifications">
                  <Popover.Trigger asChild>
                    <button
                      aria-label={`Notifications, ${notificationCount} items`}
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
                      <strong>Needs attention</strong>
                      <span>{notificationCount}</span>
                    </div>
                    {notificationCount === 0 ? (
                      <p className="notif-empty">You’re all caught up.</p>
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
              <Hint label="Ask your workspace">
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
              {storageError} Changes remain unsaved in this browser.
            </div>
          )}
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
                    "Dashboard updated",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Dashboard could not be updated.",
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
                  commit(toggleWorkflow(workspace, id), "Automation updated");
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Automation could not be updated.",
                    true,
                  );
                }
              }}
              onSave={(flow) => {
                try {
                  return commit(
                    saveWorkflow(workspace, flow),
                    "Workflow created",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Workflow could not be created.",
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
                    `Approval ${status}`,
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Approval could not be updated.",
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
                    "AI change undone",
                  );
                } catch (error) {
                  notify(
                    error instanceof Error
                      ? error.message
                      : "Undo is unavailable.",
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
            onImport={(next) => commit(next, "Import saved")}
          />
        )}
        <AlertDialog.Root open={confirmReset} onOpenChange={setConfirmReset}>
          <AlertDialog.Portal>
            <AlertDialog.Overlay className="alert-overlay" />
            <AlertDialog.Content className="confirm-box">
              <RotateCcw />
              <AlertDialog.Title>Reset the demo workspace?</AlertDialog.Title>
              <AlertDialog.Description>
                All records, views and AI changes saved in this browser will be
                removed and you’ll return to onboarding.
              </AlertDialog.Description>
              <div>
                <AlertDialog.Cancel asChild>
                  <button className="secondary">Cancel</button>
                </AlertDialog.Cancel>
                <AlertDialog.Action asChild>
                  <button className="danger-solid" onClick={onReset}>
                    Reset demo
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
            <span>{toastError ? "!" : "✓"}</span>
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
          <h1>AI change history</h1>
          <p>
            A transparent record of proposed and applied structural changes.
          </p>
        </div>
      </div>
      <div className="history-list">
        {workspace.changeHistory.map((change) => (
          <article key={change.id}>
            <span className={change.status}>
              {change.status === "applied" ? "✓" : "×"}
            </span>
            <div>
              <h3>{change.summary}</h3>
              <p>“{change.command}”</p>
              <small>
                {new Date(change.at).toLocaleString("en-GB")} ·{" "}
                {workspace.users.find((user) => user.id === change.userId)
                  ?.name || "User"}
              </small>
            </div>
            <em>{change.status}</em>
            {canUndo &&
              change.status === "applied" &&
              change.appliedRevision === (workspace.revision || 0) &&
              reversible.has(change.action || "") && (
                <button className="secondary" onClick={() => onUndo(change.id)}>
                  Undo
                </button>
              )}
          </article>
        ))}
        {workspace.changeHistory.length === 0 && (
          <div className="empty-state">
            <History />
            <h3>No AI changes yet</h3>
            <p>Confirmed Builder changes will be recorded here.</p>
          </div>
        )}
      </div>
      <div className="section-title">
        <div>
          <History />
          <div>
            <h3>Workspace activity</h3>
            <p>Manual, import, AI and browser automation actions</p>
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
                {new Date(entry.at).toLocaleString("en-GB")} · {entry.source} ·{" "}
                {workspace.users.find((user) => user.id === entry.userId)
                  ?.name || "User"}
              </small>
            </div>
          </article>
        ))}
        {!(workspace.activity || []).length && (
          <div className="empty-state">
            <p>No activity recorded yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
