import type { Workspace } from "../types";
import { proposalSchema, stageProposal, type StructuredProposal } from "./configuration";

/** Apply only the visible, selected proposal. Validates dependencies without persisting. */
export function reviewStructure(workspace: Workspace, proposal: StructuredProposal, excluded: string[]): StructuredProposal {
  const operations = proposal.operations.flatMap((operation, index) => {
    if (excluded.includes(`operation:${index}`)) return [];
    return [operation.type === "createEntity" ? { ...operation, entity: { ...operation.entity, fields: operation.entity.fields.filter(field => !excluded.includes(`field:${index}:${field.id}`)) } } : operation];
  });
  const reviewed = proposalSchema.parse({ ...proposal, operations });
  stageProposal(workspace, reviewed);
  return reviewed;
}
