import { useEffect, useRef, useState } from "react";
import type { Workspace } from "../types";
import { localWorkspaceRepository, WORKSPACE_KEY } from "../services/workspaceStorage";

export function useWorkspace() {
  const [initial] = useState(() => {
    try { const workspace = localWorkspaceRepository.load(); return { workspace, raw: localWorkspaceRepository.raw(), error: "" }; }
    catch (error) { return { workspace: null, raw: undefined, error: error instanceof Error ? error.message : "Workspace could not be opened." }; }
  });
  const [workspace, setCurrent] = useState<Workspace | null>(initial.workspace);
  const [storageError, setStorageError] = useState(initial.error);
  const snapshot = useRef(initial.raw);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if ((event.key === WORKSPACE_KEY || event.key === null) && event.storageArea === localStorage && localWorkspaceRepository.raw() !== snapshot.current) setStorageError("Another tab changed this workspace. Reload before saving; your current draft has not been overwritten.");
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const setWorkspace = (next: Workspace): boolean => {
    try { localWorkspaceRepository.save(next, snapshot.current); snapshot.current = localWorkspaceRepository.raw(); setCurrent(next); setStorageError(""); return true; }
    catch (error) { setStorageError(error instanceof Error ? error.message : "Workspace could not be saved."); return false; }
  };
  const reset = () => {
    try { localWorkspaceRepository.clear(); snapshot.current = null; setCurrent(null); setStorageError(""); }
    catch (error) { setStorageError(error instanceof Error ? error.message : "Workspace could not be reset."); }
  };
  return { workspace, setWorkspace, reset, storageError };
}
