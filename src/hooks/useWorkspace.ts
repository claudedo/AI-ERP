import { useState } from "react";
import type { Workspace } from "../types";
import { localWorkspaceRepository } from "../services/workspaceStorage";

export function useWorkspace() {
  const [initial] = useState(() => {
    try { return { workspace: localWorkspaceRepository.load(), error: "" }; }
    catch (error) { return { workspace: null, error: error instanceof Error ? error.message : "Workspace could not be opened." }; }
  });
  const [workspace, setCurrent] = useState<Workspace | null>(initial.workspace);
  const [storageError, setStorageError] = useState(initial.error);
  const setWorkspace = (next: Workspace): boolean => {
    try { localWorkspaceRepository.save(next); setCurrent(next); setStorageError(""); return true; }
    catch (error) { setStorageError(error instanceof Error ? error.message : "Workspace could not be saved."); return false; }
  };
  const reset = () => {
    try { localWorkspaceRepository.clear(); setCurrent(null); setStorageError(""); }
    catch (error) { setStorageError(error instanceof Error ? error.message : "Workspace could not be reset."); }
  };
  return { workspace, setWorkspace, reset, storageError };
}
