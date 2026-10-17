import { z } from "zod";
import { entrySchema } from "../services/smartEntry";
import { fieldSchema, proposalSchema } from "../services/configuration";

export const safeId = z.string().min(1).max(160).refine(v => !["__proto__", "constructor", "prototype"].includes(v));
const scalar = z.union([z.string().max(10000), z.number().finite(), z.boolean(), z.null()]);
export const chatContextSchema = z.object({
  workspaceId: safeId, revision: z.number().int().nonnegative(),
  user: z.object({ id: safeId, role: z.enum(["admin", "manager", "operator", "viewer"]), permissions: z.object({ editRecords: z.boolean(), deleteRecords: z.boolean(), editStructure: z.boolean(), manageUsers: z.boolean() }).strict() }).strict(),
  entities: z.array(z.object({ id: safeId, name: z.string().max(100), fields: z.array(fieldSchema).max(100), records: z.array(z.record(safeId, scalar)).max(40), total: z.number().int().nonnegative() }).strict()).max(50),
}).strict();
export type ChatContext = z.infer<typeof chatContextSchema>;
export const querySchema = z.object({
  entityId: safeId,
  filters: z.array(z.object({ fieldId: safeId, operator: z.enum(["equals", "not-equals", "contains", "greater-than", "less-than", "this-month", "before-today"]), value: scalar }).strict()).max(8),
  metric: z.enum(["count", "sum", "group-count"]), fieldId: z.string().nullable(), groupBy: z.string().nullable(),
}).strict();
export type ChatQuery = z.infer<typeof querySchema>;
const base = { message: z.string().min(1).max(8000), source: z.enum(["openai", "local"]) };
export const chatResponseSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("answer") }).strict(),
  z.object({ ...base, type: z.literal("query_results"), query: querySchema }).strict(),
  z.object({ ...base, type: z.literal("entry_proposal"), proposal: entrySchema }).strict(),
  z.object({ ...base, type: z.literal("update_proposal"), proposal: entrySchema }).strict(),
  z.object({ ...base, type: z.literal("structure_proposal"), proposal: proposalSchema }).strict(),
  z.object({ ...base, type: z.literal("clarification"), questions: z.array(z.string().max(1000)).min(1).max(20), extracted: z.array(z.object({ label: z.string().max(100), value: scalar }).strict()).max(20) }).strict(),
  z.object({ ...base, type: z.literal("unsupported") }).strict(),
]);
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export const chatErrorSchema = z.object({ error: z.string().max(1000), reason: z.enum(["rate_limit", "forbidden"]) }).strict();
export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(6000), requestId: z.string().uuid(),
  mode: z.enum(["demo", "connected"]), contextId: safeId.optional(),
  history: z.array(z.object({ q: z.string().max(6000), a: z.string().max(8000) }).strict()).max(6),
  context: chatContextSchema.optional(),
}).strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;

// Fixed envelope supports strict Structured Outputs despite dynamic workspace field names.
export const modelReplySchema = z.object({
  type: z.enum(["answer", "query_results", "entry_proposal", "update_proposal", "structure_proposal", "clarification", "unsupported"]),
  message: z.string(), query: querySchema.nullable(),
  changes: z.array(z.object({ entityId: safeId, kind: z.enum(["create", "update"]), recordId: z.string().nullable(), values: z.array(z.object({ fieldId: safeId, value: scalar }).strict()).max(50) }).strict()).max(20),
  structure_json: z.string().nullable(), questions: z.array(z.string()).max(20),
}).strict();
