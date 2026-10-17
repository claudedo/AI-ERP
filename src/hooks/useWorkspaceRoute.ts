import { useEffect, useState } from "react";
import type { Workspace } from "../types";
export const routeTo = (path: string) => {
  if (location.hash !== `#${path}`) location.hash = path;
};
export function useWorkspaceRoute(
  workspace: Workspace,
): [string, (value: string) => void] {
  const read = () => {
    let id = "";
    try {
      id = decodeURIComponent(location.hash.replace(/^#workspace\/?/, ""));
    } catch {
      return "dashboard";
    }
    return [
      "dashboard",
      "automations",
      "approvals",
      "users",
      "history",
    ].includes(id) || workspace.entities.some((e) => e.id === id && !e.archived)
      ? id
      : "dashboard";
  };
  const [active, setActive] = useState(read);
  useEffect(() => {
    const update = () => {
      const id = read();
      setActive(id);
      if (
        id === "dashboard" &&
        location.hash.startsWith("#workspace/") &&
        location.hash !== "#workspace/dashboard"
      )
        history.replaceState(
          null,
          "",
          `${location.pathname}${location.search}#workspace/dashboard`,
        );
    };
    window.addEventListener("hashchange", update);
    update();
    return () => window.removeEventListener("hashchange", update);
  }, [workspace.entities]);
  return [
    active,
    (value) => {
      setActive(value);
      routeTo(`workspace/${encodeURIComponent(value)}`);
    },
  ];
}
