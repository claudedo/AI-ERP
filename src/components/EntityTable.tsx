import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  BookmarkPlus,
  CalendarDays,
  Check,
  ChevronDown,
  Columns3,
  Download,
  FileUp,
  Filter,
  LayoutList,
  List,
  ListFilter,
  MoreHorizontal,
  PanelRightOpen,
  Plus,
  Search,
  SortAsc,
  Table2,
  X,
} from "lucide-react";
import { DropdownMenu, Popover, Tooltip } from "radix-ui";
import { Select } from "./ui/Select";
import type {
  DataRecord,
  Entity,
  View,
  ViewFilter,
  ViewLayout,
  Workspace,
} from "../types";
import { RecordDrawer, recordLabel } from "./RecordDrawer";
import { queryRecords } from "../services/viewQuery";
import { downloadText, exportCsv } from "../services/importExport";
import { AlternateViews } from "./AlternateViews";
import { RecordCell } from "./RecordCell";
import { usePagination } from "../hooks/usePagination";

export function EntityTable({
  entity,
  workspace,
  initialSearch = "",
  initialRecordId = "",
  recordOpenRequest = 0,
  canEdit,
  canDelete,
  delayedOnly,
  onClearDelayed,
  onSaveRecord,
  onDeleteRecord,
  onSaveView,
  onImport,
  onComment,
  onAttach,
  onRemoveAttachment,
  onOpenRelated,
  onOpenAttachment,
  onSaveRelated,
  onSmartEntry,
}: {
  entity: Entity;
  workspace: Workspace;
  initialSearch?: string;
  initialRecordId?: string;
  recordOpenRequest?: number;
  canEdit: boolean;
  canDelete: boolean;
  delayedOnly: boolean;
  onClearDelayed: () => void;
  onSaveRecord: (record: DataRecord) => boolean | Promise<boolean>;
  onDeleteRecord: (id: string) => boolean | Promise<boolean>;
  onSaveView: (view: View) => boolean | Promise<boolean>;
  onImport: () => void;
  onComment: (recordId: string, body: string) => boolean | Promise<boolean>;
  onAttach: (recordId: string, file: File) => Promise<boolean>;
  onRemoveAttachment: (id: string) => boolean | Promise<boolean>;
  onOpenAttachment?: (
    id: string,
    name: string,
    download: boolean,
  ) => Promise<void>;
  onOpenRelated: (entityId: string, recordId: string) => void;
  onSaveRelated?: (
    entityId: string,
    record: DataRecord,
  ) => boolean | Promise<boolean>;
  onSmartEntry?: () => void;
}) {
  const existing = workspace.views.filter((v) => v.entityId === entity.id);
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => setSearch(initialSearch), [initialSearch]);
  const [statusFilter, setStatusFilter] = useState("");
  const [hiddenColumns, setHiddenColumns] = useState<string[]>(() =>
    entity.ui
      ? entity.fields
          .filter((f) => !entity.ui!.columns.includes(f.id))
          .map((f) => f.id)
      : entity.id === "companies"
        ? ["legacyDetails"]
        : [],
  );
  const visibleFields = useMemo(() => {
    const order = new Map((entity.ui?.columns || entity.fields.map(f => f.id)).map((id, index) => [id, index]));
    return entity.fields.filter(f => !hiddenColumns.includes(f.id)).sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  }, [entity.fields, entity.ui, hiddenColumns]);
  const columns = visibleFields.map(f => f.id);
  const relationLabels = useMemo(() => {
    const targets = new Set(entity.fields.filter(f => f.type === "relation").map(f => f.relationEntityId));
    return new Map(workspace.entities.filter(e => targets.has(e.id)).map(e => [e.id, new Map(e.records.map(r => [r.id, recordLabel(e, r)]))]));
  }, [entity.fields, workspace.entities]);
  const [drawer, setDrawer] = useState<DataRecord | null | undefined>(() =>
    entity.records.find((r) => r.id === initialRecordId),
  );
  useEffect(() => {
    if (initialRecordId)
      setDrawer(entity.records.find((r) => r.id === initialRecordId));
  }, [initialRecordId, recordOpenRequest]);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [activeView, setActiveView] = useState("");
  const [layout, setLayout] = useState<ViewLayout>("table"),
    [extraFilters, setExtraFilters] = useState<ViewFilter[]>([]),
    [sort, setSort] = useState<View["sort"]>(),
    [selected, setSelected] = useState<Set<string>>(new Set());
  const statusField = entity.fields.find(
      (f) => f.type === "status" || f.type === "select",
    ),
    dateField = entity.fields.find((f) => f.type === "date");
  const statuses = [
    ...new Set(
      entity.records.map((r) => String(statusField ? r[statusField.id] || "" : "")).filter(Boolean),
    ),
  ];
  const combinedFilters = useMemo(
    () => [
      ...(statusFilter && statusField
        ? [
            {
              fieldId: statusField.id,
              operator: "equals" as const,
              value: statusFilter,
            },
          ]
        : []),
      ...extraFilters,
    ],
    [statusFilter, statusField, extraFilters],
  );
  const deferredSearch = useDeferredValue(search);
  const rows = useMemo(
    () => queryRecords(entity, deferredSearch, combinedFilters, sort, delayedOnly),
    [entity, deferredSearch, combinedFilters, sort, delayedOnly],
  );
  const pagination = usePagination(rows, JSON.stringify([entity.id, deferredSearch, combinedFilters, sort, delayedOnly]));
  useEffect(
    () =>
      setSelected(
        (current) =>
          new Set([...current].filter((id) => rows.some((r) => r.id === id))),
      ),
    [rows],
  );
  const applyView = (id: string) => {
    const v = existing.find((x) => x.id === id);
    if (!v) return;
    setHiddenColumns(
      entity.fields.filter((f) => !v.columns.includes(f.id)).map((f) => f.id),
    );
    // A saved filter is lossless: the quick status control must not rewrite
    // operators or consume multiple conditions on the same field.
    setStatusFilter("");
    setExtraFilters(structuredClone(v.filters));
    setLayout(v.layout || "table");
    setSort(v.sort);
  };
  const saveView = async () => {
    if (!viewName.trim()) return;
    if (
      await onSaveView({
        id: `view-${crypto.randomUUID()}`,
        entityId: entity.id,
        name: viewName.trim(),
        columns,
        filters: combinedFilters,
        sort,
        layout,
        createdBy: workspace.currentUserId,
      })
    ) {
      setSavingView(false);
      setViewName("");
    }
  };
  const toggleSelected = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const download = () => {
    const visible = selected.size
      ? rows.filter((r) => selected.has(r.id))
      : rows;
    downloadText(
      exportCsv(entity, visible, columns),
      `${entity.id}-${selected.size ? "selected" : "filtered"}.csv`,
    );
  };
  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="entity-page">
        <div className="page-heading">
          <div>
            <span className="overline">
              WORKSPACE / {entity.name.toUpperCase()}
            </span>
            <h1>{entity.name}</h1>
            <p>
              {entity.records.length} records · {entity.fields.length} fields
            </p>
          </div>
          {canEdit && (
            <div className="heading-actions">
              <button className="secondary" onClick={onImport}>
                <FileUp size={15} />
                Import
              </button>
              {onSmartEntry && (
                <button className="secondary" onClick={onSmartEntry}>
                  NODUS AI
                </button>
              )}
              {(!entity.ui || entity.ui.actions.includes("create")) && (
                <button
                  data-record-create
                  className="primary"
                  onClick={() => setDrawer(null)}
                >
                  <Plus />
                  Add record
                </button>
              )}
            </div>
          )}
        </div>
        <div className="view-strip">
          <button
            className={`view-tab ${activeView === "" ? "active" : ""}`}
            aria-pressed={activeView === ""}
            onClick={() => {
              setActiveView("");
              setHiddenColumns(
                entity.id === "companies" ? ["legacyDetails"] : [],
              );
              setStatusFilter("");
              setExtraFilters([]);
              setLayout("table");
              setSort(undefined);
            }}
          >
            All {entity.name}
          </button>
          {existing.map((v) => (
            <button
              className={`view-tab ${activeView === v.id ? "active" : ""}`}
              aria-pressed={activeView === v.id}
              key={v.id}
              onClick={() => {
                setActiveView(v.id);
                applyView(v.id);
              }}
            >
              {v.name}
            </button>
          ))}
          {canEdit && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className="save-view"
                  onClick={() => setSavingView(true)}
                >
                  <BookmarkPlus />
                  Save view
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip-content" sideOffset={6}>
                  Save filters and columns
                  <Tooltip.Arrow />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}
          {savingView && (
            <div className="view-name">
              <input
                autoFocus
                value={viewName}
                onChange={(e) => setViewName(e.target.value)}
                placeholder="View name"
                aria-label="View name"
                onKeyDown={(e) => e.key === "Enter" && saveView()}
              />
              <button onClick={saveView} aria-label="Save">
                <Check />
              </button>
              <button onClick={() => setSavingView(false)} aria-label="Cancel">
                <X />
              </button>
            </div>
          )}
        </div>
        <div className="table-card">
          <div className="table-tools">
            <div className="table-search">
              <Search />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${entity.name.toLowerCase()}...`}
                aria-label={`Search ${entity.name.toLowerCase()}`}
              />
            </div>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button
                  className={statusFilter ? "filter-chip" : ""}
                  aria-label={
                    statusFilter ? `Filter, status ${statusFilter}` : "Filter"
                  }
                >
                  <Filter />
                  Filter{statusFilter && <b>1</b>}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="popover" sideOffset={7} align="end">
                  <label>Status</label>
                  <Select
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={statuses}
                    emptyLabel="All statuses"
                    ariaLabel="Filter by status"
                  />
                  {statusFilter && (
                    <button
                      className="popover-clear"
                      onClick={() => setStatusFilter("")}
                    >
                      Clear filter
                    </button>
                  )}
                  <Popover.Arrow className="popover-arrow" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {delayedOnly && (
              <button className="filter-chip" onClick={onClearDelayed}>
                Delayed only <X />
              </button>
            )}
            <Popover.Root>
              <Popover.Trigger asChild>
                <button>
                  <Columns3 />
                  Columns <ChevronDown />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="popover column-pop"
                  sideOffset={7}
                  align="end"
                >
                  {entity.fields.map((f) => (
                    <label key={f.id}>
                      <input
                        type="checkbox"
                        checked={!hiddenColumns.includes(f.id)}
                        onChange={() =>
                          setHiddenColumns((c) =>
                            c.includes(f.id)
                              ? c.filter((x) => x !== f.id)
                              : [...c, f.id],
                          )
                        }
                      />
                      {f.name}
                    </label>
                  ))}
                  <Popover.Arrow className="popover-arrow" />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button className={extraFilters.length ? "filter-chip" : ""}>
                  <Filter />
                  More filters
                  {extraFilters.length > 0 && <b>{extraFilters.length}</b>}
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="popover filter-pop"
                  sideOffset={7}
                  align="end"
                >
                  <strong>Combine conditions</strong>
                  {extraFilters.map((filter, index) => (
                    <div className="filter-rule" key={index}>
                      <select
                        aria-label={`Filter field ${index + 1}`}
                        value={filter.fieldId}
                        onChange={(event) =>
                          setExtraFilters((current) =>
                            current.map((f, i) =>
                              i === index
                                ? { ...f, fieldId: event.target.value }
                                : f,
                            ),
                          )
                        }
                      >
                        {entity.fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`Filter operator ${index + 1}`}
                        value={filter.operator}
                        onChange={(event) =>
                          setExtraFilters((current) =>
                            current.map((f, i) =>
                              i === index
                                ? {
                                    ...f,
                                    operator: event.target
                                      .value as ViewFilter["operator"],
                                  }
                                : f,
                            ),
                          )
                        }
                      >
                        {[
                          "equals",
                          "not-equals",
                          "contains",
                          "greater-than",
                          "less-than",
                          "truthy",
                        ].map((operator) => (
                          <option key={operator}>{operator}</option>
                        ))}
                      </select>
                      <input
                        aria-label={`Filter value ${index + 1}`}
                        value={String(filter.value ?? "")}
                        onChange={(event) =>
                          setExtraFilters((current) =>
                            current.map((f, i) =>
                              i === index
                                ? { ...f, value: event.target.value }
                                : f,
                            ),
                          )
                        }
                      />
                      <button
                        aria-label={`Remove filter ${index + 1}`}
                        onClick={() =>
                          setExtraFilters((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="popover-clear"
                    onClick={() =>
                      setExtraFilters((current) => [
                        ...current,
                        {
                          fieldId: entity.fields[0]?.id || "id",
                          operator: "equals",
                          value: "",
                        },
                      ])
                    }
                  >
                    + Add condition
                  </button>
                  {extraFilters.length > 0 && (
                    <button
                      className="popover-clear"
                      onClick={() => setExtraFilters([])}
                    >
                      Clear conditions
                    </button>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            <Popover.Root>
              <Popover.Trigger asChild>
                <button>
                  <SortAsc />
                  Sort
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  className="popover sort-pop"
                  sideOffset={7}
                  align="end"
                >
                  <label>
                    Sort by
                    <select
                      value={sort?.fieldId || ""}
                      onChange={(event) =>
                        setSort(
                          event.target.value
                            ? {
                                fieldId: event.target.value,
                                direction: sort?.direction || "asc",
                              }
                            : undefined,
                        )
                      }
                    >
                      <option value="">Original order</option>
                      {entity.fields.map((field) => (
                        <option key={field.id} value={field.id}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {sort && (
                    <button
                      onClick={() =>
                        setSort({
                          ...sort,
                          direction: sort.direction === "asc" ? "desc" : "asc",
                        })
                      }
                    >
                      {sort.direction === "asc"
                        ? "Ascending ↑"
                        : "Descending ↓"}
                    </button>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
            {(!entity.ui || entity.ui.actions.includes("export")) && (
              <button
                onClick={download}
                aria-label={
                  selected.size
                    ? "Export selected records as CSV"
                    : "Export filtered results as CSV"
                }
              >
                <Download />
                Export{selected.size ? ` (${selected.size})` : ""}
              </button>
            )}
          </div>
          <div className="layout-strip" role="group" aria-label="Record layout">
            {(["table", "list", "kanban", "calendar"] as ViewLayout[]).map(
              (mode) => {
                const Icon =
                  mode === "table"
                    ? Table2
                    : mode === "list"
                      ? List
                      : mode === "kanban"
                        ? LayoutList
                        : CalendarDays;
                return (
                  <button
                    key={mode}
                    className={layout === mode ? "active" : ""}
                    aria-pressed={layout === mode}
                    disabled={
                      mode === "kanban"
                        ? !statusField
                        : mode === "calendar"
                          ? !dateField
                          : false
                    }
                    onClick={() => setLayout(mode)}
                  >
                    <Icon size={14} />
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                );
              },
            )}
            {selected.size > 0 && (
              <span>
                {selected.size} selected{" "}
                <button onClick={() => setSelected(new Set())}>Clear</button>
              </span>
            )}
          </div>
          <div className={`table-scroll ${layout !== "table" ? "hidden" : ""}`} aria-busy={search !== deferredSearch}>
            <table>
              <thead>
                <tr>
                  {visibleFields.map((f) => (
                      <th scope="col" key={f.id}>
                        {f.name}
                      </th>
                    ))}
                  <th scope="col" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody>
                {pagination.pageRows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    aria-label={`Open ${recordLabel(entity, r)}`}
                    onClick={() => setDrawer(r)}
                    onKeyDown={(e) => {
                      if (
                        e.target === e.currentTarget &&
                        (e.key === "Enter" || e.key === " ")
                      ) {
                        e.preventDefault();
                        setDrawer(r);
                      }
                    }}
                  >
                    {visibleFields.map((f) => (
                        <td key={f.id}>
                          <RecordCell value={r[f.id]} field={f} relations={relationLabels} />
                        </td>
                      ))}
                    <td
                      className="row-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            aria-label={`Actions for ${recordLabel(entity, r)}`}
                          >
                            <MoreHorizontal size={15} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="ds-menu"
                            align="end"
                            sideOffset={4}
                            collisionPadding={8}
                          >
                            <DropdownMenu.Item
                              className="ds-menu-item"
                              onSelect={() => setDrawer(r)}
                            >
                              <PanelRightOpen />
                              {canEdit ? "Open & edit" : "Open record"}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="ds-menu-item"
                              onSelect={() => toggleSelected(r.id)}
                            >
                              <Check />
                              {selected.has(r.id)
                                ? "Remove selection"
                                : "Select for export"}
                            </DropdownMenu.Item>
                            {statusField && r[statusField.id] != null && r[statusField.id] !== "" && (
                              <DropdownMenu.Item
                                className="ds-menu-item"
                                onSelect={() =>
                                  setStatusFilter(String(r[statusField.id]))
                                }
                              >
                                <ListFilter />
                                Show only “{String(r[statusField.id])}”
                              </DropdownMenu.Item>
                            )}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && (
              <div className="empty-state">
                <Search />
                <h3>No records found</h3>
                <p>Try clearing filters or use a different search.</p>
                <button
                  className="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("");
                    setExtraFilters([]);
                    if (delayedOnly) onClearDelayed();
                  }}
                >
                  Clear search and filters
                </button>
              </div>
            )}
          </div>
          {layout !== "table" && (
            <AlternateViews
              entity={entity}
              workspace={workspace}
              rows={rows}
              layout={layout}
              canEdit={canEdit}
              onOpen={setDrawer}
              onSaveRecord={onSaveRecord}
            />
          )}
          <div className="table-footer">
            <span>
              Showing {rows.length} of {entity.records.length} records
            </span>
            {layout === "table" && pagination.pages > 1 && <nav className="table-pagination" aria-label="Record pages"><button className="secondary" disabled={pagination.page === 0} onClick={() => pagination.setPage(pagination.page - 1)} aria-label="Previous page">←</button><span role="status" aria-live="polite">{pagination.start}–{pagination.end} · {pagination.page + 1}/{pagination.pages}</span><button className="secondary" disabled={pagination.page + 1 === pagination.pages} onClick={() => pagination.setPage(pagination.page + 1)} aria-label="Next page">→</button></nav>}
            <span>
              {
                workspace.relations.filter((r) => r.fromEntityId === entity.id)
                  .length
              }{" "}
              linked data relationships
            </span>
          </div>
        </div>
        {drawer !== undefined && (
          <RecordDrawer
            key={drawer?.id || "new-record"}
            entity={entity}
            workspace={workspace}
            record={drawer}
            canEdit={canEdit}
            canDelete={canDelete}
            onClose={() => setDrawer(undefined)}
            onSaveRelated={onSaveRelated}
            onSave={async (r) => {
              const saved = await onSaveRecord(r);
              if (saved) setDrawer(undefined);
              return saved;
            }}
            onDelete={async (id) => {
              const saved = await onDeleteRecord(id);
              if (saved) setDrawer(undefined);
              return saved;
            }}
            onComment={onComment}
            onAttach={onAttach}
            onRemoveAttachment={onRemoveAttachment}
            onOpenRelated={onOpenRelated}
            onOpenAttachment={onOpenAttachment}
          />
        )}
      </div>
    </Tooltip.Provider>
  );
}
