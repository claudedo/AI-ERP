export type FieldType = "text" | "number" | "currency" | "date" | "status" | "relation" | "select" | "checkbox";
export type RecordValue = string | number | boolean | null;
export type DataRecord = Record<string, RecordValue> & { id: string };

export interface Field { id: string; name: string; type: FieldType; required?: boolean; options?: string[]; relationEntityId?: string }
export interface Entity { id: string; name: string; singularName?: string; icon?: string; fields: Field[]; records: DataRecord[] }
export interface Relation { id: string; fromEntityId: string; fromFieldId: string; toEntityId: string; label: string; kind: "one-to-many" | "many-to-one" | "many-to-many" }
export interface ViewFilter { fieldId: string; operator: "equals" | "contains" | "truthy"; value: RecordValue }
export interface View { id: string; entityId: string; name: string; columns: string[]; filters: ViewFilter[]; createdBy: string }
export interface WorkflowRun { id: string; at: string; status: "success" | "pending" | "failed"; summary: string }
export interface Workflow { id: string; name: string; trigger: string; actions: string[]; active: boolean; runs: WorkflowRun[] }
export type RoleId = "admin" | "manager" | "operator" | "viewer";
export interface Role { id: RoleId; name: string; permissions: { editRecords: boolean; deleteRecords: boolean; editStructure: boolean; manageUsers: boolean } }
export interface User { id: string; name: string; initials: string; email: string; roleId: RoleId; title: string }
export interface AIChange { id: string; at: string; userId: string; command: string; summary: string; status: "applied" | "cancelled"; affectedEntityIds: string[] }
export interface Alert { id: string; title: string; detail: string; severity: "high" | "medium" | "low"; entityId?: string; recordId?: string }
export interface Workspace { id: string; companyName: string; industry: string; architecture: string; entities: Entity[]; relations: Relation[]; views: View[]; workflows: Workflow[]; users: User[]; roles: Role[]; currentUserId: string; changeHistory: AIChange[]; alerts: Alert[]; version: number }
export interface ArchitectureOption { id: "simple" | "process" | "advanced"; label: string; title: string; description: string; modules: string[]; advantages: string[]; complexity: number }
export interface Analysis { industry: string; companyName: string; process: string[]; branches: string[]; insight: string }
export type AiActionType = "filter-delayed" | "attention-summary" | "add-priority" | "add-quality" | "add-approval" | "add-suppliers" | "add-order-customer-relation" | "unknown";
export interface AiAction { type: AiActionType; mode: "operator" | "builder"; command: string }
export interface ChangeProposal { id: string; action: AiActionType; title: string; summary: string; details: string[]; impact: string; affectedEntityIds: string[]; command: string }
