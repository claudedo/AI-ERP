export type FieldType = "text" | "number" | "currency" | "date" | "status" | "relation" | "select" | "checkbox";
export type RecordValue = string | number | boolean | null;
export type DataRecord = Record<string, RecordValue> & { id: string };

export interface Field { id: string; name: string; type: FieldType; required?: boolean; options?: string[]; relationEntityId?: string; cardinality?: "many-to-one" | "one-to-one"; defaultValue?: RecordValue; formula?: string; visibleWhen?: { fieldId: string; equals: RecordValue }; requiredWhen?: { fieldId: string; equals: RecordValue } }
export interface Entity { id: string; name: string; singularName?: string; icon?: string; fields: Field[]; records: DataRecord[]; archived?: boolean; navigationGroup?: string; ui?: { columns: string[]; formOrder: string[]; formColumns: 1 | 2; actions: ("create" | "export")[] } }
export interface Relation { id: string; fromEntityId: string; fromFieldId: string; toEntityId: string; label: string; kind: "one-to-many" | "many-to-one" | "many-to-many" }
export interface ViewFilter { fieldId: string; operator: "equals" | "contains" | "truthy" | "not-equals" | "greater-than" | "less-than"; value: RecordValue }
export type ViewLayout = "table" | "list" | "kanban" | "calendar";
export interface View { id: string; entityId: string; name: string; columns: string[]; filters: ViewFilter[]; createdBy: string; layout?: ViewLayout; sort?: { fieldId: string; direction: "asc" | "desc" }; groupFieldId?: string; dateFieldId?: string }
export interface WorkflowRun { id: string; at: string; status: "success" | "pending" | "failed"; summary: string; eventKey?: string; demo?: boolean }
export interface WorkflowConfig { entityId: string; event: "create" | "update" | "status"; fieldId?: string; conditionFieldId?: string; conditionOperator?: "equals" | "greater-than"; conditionValue?: string; action: "create-task" | "update-field" | "notify" | "request-approval"; targetEntityId?: string; targetFieldId?: string; targetValue?: string }
export interface Workflow { id: string; name: string; trigger: string; actions: string[]; active: boolean; runs: WorkflowRun[]; config?: WorkflowConfig }
export type RoleId = "admin" | "manager" | "operator" | "viewer";
export interface Role { id: RoleId; name: string; permissions: { editRecords: boolean; deleteRecords: boolean; editStructure: boolean; manageUsers: boolean } }
export interface User { id: string; name: string; initials: string; email: string; roleId: RoleId; title: string }
export interface AIChange { id: string; at: string; userId: string; command: string; summary: string; status: "applied" | "cancelled" | "reverted"; affectedEntityIds: string[]; appliedRevision?: number; action?: AiActionType }
export interface Alert { id: string; title: string; detail: string; severity: "high" | "medium" | "low"; entityId?: string; recordId?: string }
export interface RecordComment { id: string; entityId: string; recordId: string; userId: string; body: string; at: string }
export interface AttachmentRef { id: string; entityId: string; recordId: string; name: string; mime: string; size: number; at: string }
export interface Notification { id: string; title: string; detail: string; at: string; read?: boolean; userId?: string; entityId?: string; recordId?: string }
export interface Approval { id: string; entityId: string; recordId: string; workflowId: string; status: "pending" | "approved" | "rejected"; requestedAt: string; decidedAt?: string; decidedBy?: string }
export interface ActivityEntry { id: string; at: string; userId: string; source: "manual" | "import" | "ai" | "workflow"; summary: string; entityId?: string; recordId?: string }
export interface DashboardWidget { id: string; kind: "record-count" | "sum" | "status" | "assigned" | "due" | "approvals"; entityId?: string; fieldId?: string }
export interface Workspace { id: string; companyName: string; industry: string; architecture: string; entities: Entity[]; relations: Relation[]; views: View[]; workflows: Workflow[]; users: User[]; roles: Role[]; currentUserId: string; changeHistory: AIChange[]; alerts: Alert[]; version: number; revision?: number; comments?: RecordComment[]; attachments?: AttachmentRef[]; notifications?: Notification[]; approvals?: Approval[]; activity?: ActivityEntry[]; dashboardWidgets?: DashboardWidget[] }
export interface ArchitectureOption { id: "simple" | "process" | "advanced"; label: string; title: string; description: string; modules: string[]; advantages: string[]; complexity: number }
export interface Workspace { configurationVersion?: number; configurationDraft?: import("./configuration").ConfigurationDraft; configurationHistory?: import("./configuration").ConfigurationVersion[] }
export interface Workspace { companyMigrationDraft?: string; appliedEntries?: string[]; entryConversations?: Record<string, string> }
export interface Analysis { industry: string; companyName: string; process: string[]; branches: string[]; insight: string; needsConfirmation?: boolean }
export type AiActionType = "filter-delayed" | "attention-summary" | "my-tasks" | "pending-approvals" | "orders-by-customer" | "add-priority" | "add-quality" | "add-approval" | "add-suppliers" | "add-order-customer-relation" | "add-status" | "add-view" | "unknown";
export interface AiAction { type: AiActionType; mode: "operator" | "builder"; command: string }
export interface ChangeProposal { id: string; action: AiActionType; title: string; summary: string; details: string[]; impact: string; affectedEntityIds: string[]; command: string; baseRevision?: number; ambiguities?: string[] }
