import { describe, expect, it, vi } from "vitest";
import { ApiError, executeWithRecovery, type AsyncWorkspaceRepository, type RemoteState } from "./apiRepository";
import { analyzeBusiness, generateArchitectureOptions, generateWorkspace } from "../services/aiEngine";
describe("connected revision conflicts", () => {
  it("refreshes on 409 without retrying or mutating the user's draft", async () => {
    const a = analyzeBusiness("customers and orders"), w = generateWorkspace(a, generateArchitectureOptions(a)[2]);
    const command = { type: "saveRecord" as const, entityId: w.entities[0].id, record: { ...w.entities[0].records[0], name: "Unsaved draft" } }, before = JSON.stringify(command);
    const state = { workspace: { ...w, revision: 42 } } as RemoteState, refreshed = vi.fn();
    const repository: AsyncWorkspaceRepository = { execute: vi.fn().mockRejectedValue(new ApiError(409, "Conflict")), load: vi.fn().mockResolvedValue(state) };
    await expect(executeWithRecovery(repository, w, command, refreshed)).rejects.toThrow(/bozza.*non.*cancellata/);
    expect(refreshed).toHaveBeenCalledWith(state); expect(repository.execute).toHaveBeenCalledOnce(); expect(JSON.stringify(command)).toBe(before);
  });
});
