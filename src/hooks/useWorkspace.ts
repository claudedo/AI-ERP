import { useEffect, useState } from "react";
import type { Workspace } from "../types";
import { localWorkspaceRepository } from "../services/workspaceStorage";

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(() => localWorkspaceRepository.load());
  useEffect(() => { if (workspace) localWorkspaceRepository.save(workspace); }, [workspace]);
  const reset = () => { localWorkspaceRepository.clear(); setWorkspace(null); };
  return { workspace, setWorkspace, reset };
}
