import { z } from "zod";
import type { Workspace } from "../types";
import { operationSchema, publishConfiguration, restoreConfigurationDraft, saveConfigurationDraft, stageProposal } from "./configuration";
import { addComment, deleteRecord, requirePermission, saveRecord, setApproval } from "./workspaceDomain";
import { applyEntry, entrySchema } from "./smartEntry";

const record = z.record(z.string().refine(key => !["__proto__", "constructor", "prototype"].includes(key)), z.union([z.string().max(100000), z.number().finite(), z.boolean(), z.null()])).refine(value => typeof value.id === "string" && value.id.length > 0);
export const actionSchema = z.discriminatedUnion("type", [
  z.object({type:z.literal("smartEntry"),proposal:entrySchema}).strict(),
  z.object({ type: z.literal("configure"), operations: z.array(operationSchema).min(1).max(100) }).strict(),
  z.object({ type: z.literal("stageProposal"), proposal: z.unknown() }).strict(),
  z.object({ type: z.literal("publish") }).strict(),
  z.object({ type: z.literal("discardDraft") }).strict(),
  z.object({ type: z.literal("restoreVersion"), version: z.number().int().positive() }).strict(),
  z.object({ type: z.literal("saveRecord"), entityId: z.string(), record }).strict(),
  z.object({ type: z.literal("deleteRecord"), entityId: z.string(), recordId: z.string() }).strict(),
  z.object({ type: z.literal("comment"), entityId: z.string(), recordId: z.string(), body: z.string().min(1).max(10000) }).strict(),
  z.object({ type: z.literal("approval"), approvalId: z.string(), status: z.enum(["approved", "rejected"]) }).strict()
]);
export type WorkspaceAction = z.infer<typeof actionSchema>;
export function dispatchWorkspaceAction(workspace: Workspace, input: unknown, deferWorkflows = false): Workspace {
  const action = actionSchema.parse(input);
  switch (action.type) {
    case "smartEntry": return applyEntry(workspace,action.proposal,deferWorkflows);
    case "configure": return saveConfigurationDraft(workspace, action.operations);
    case "stageProposal": return stageProposal(workspace, action.proposal);
    case "publish": return publishConfiguration(workspace);
    case "restoreVersion": return restoreConfigurationDraft(workspace, action.version);
    case "discardDraft": requirePermission(workspace, "editStructure"); return { ...workspace, configurationDraft: undefined, revision: (workspace.revision || 0) + 1 };
    case "saveRecord": return saveRecord(workspace, action.entityId, action.record as import("../types").DataRecord, "manual", deferWorkflows);
    case "deleteRecord": return deleteRecord(workspace, action.entityId, action.recordId);
    case "comment": return addComment(workspace, action.entityId, action.recordId, action.body);
    case "approval": return setApproval(workspace, action.approvalId, action.status);
  }
}
