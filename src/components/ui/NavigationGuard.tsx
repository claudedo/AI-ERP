import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

type Intercept = (resume: () => void) => boolean;
interface Editor { intercept: Intercept; isDirty: () => boolean }
interface NavigationBoundary {
  register: (id: symbol, intercept: Intercept, isDirty?: () => boolean) => () => void;
  navigate: (action: () => void) => void;
}
const Context = createContext<NavigationBoundary | null>(null);

/** Nested editors are asked from the inside out. A blocked action does not run
 * until each dirty owner explicitly saves or discards its own draft. */
export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const editors = useRef(new Map<symbol, Editor>());
  const navigate = useCallback((action: () => void) => {
    const proceed = (approved: symbol[] = []) => {
      for (const [id, { intercept }] of [...editors.current].reverse()) {
        if (!approved.includes(id) && intercept(() => proceed([...approved, id]))) return;
      }
      action();
    };
    proceed();
  }, []);
  const register = useCallback((id: symbol, intercept: Intercept, isDirty: () => boolean = () => true) => {
    editors.current.set(id, { intercept, isDirty });
    return () => { editors.current.delete(id); };
  }, []);
  useEffect(() => {
    let previous = location.href, replay = false;
    const changed = (event: HashChangeEvent) => {
      if (replay) { previous = location.href; return; }
      const target = location.href, from = previous;
      // A queued event after a blocked change lands on the restored URL: not a navigation.
      if (target === from) return;
      // Nothing to protect: let the change through untouched. Rewriting the URL here
      // races with a concurrent reload, which then reloads the previous address.
      if (![...editors.current.values()].some(editor => editor.isDirty())) { previous = target; return; }
      // Capture before the application router can unmount an editor.
      event.stopImmediatePropagation();
      history.replaceState(null, "", from);
      navigate(() => {
        history.replaceState(null, "", target);
        previous = target; replay = true;
        window.dispatchEvent(new HashChangeEvent("hashchange", { oldURL: from, newURL: target }));
        replay = false;
      });
    };
    window.addEventListener("hashchange", changed, true);
    return () => window.removeEventListener("hashchange", changed, true);
  }, [navigate]);
  return <Context.Provider value={{ register, navigate }}>{children}</Context.Provider>;
}

export const useNavigationBoundary = () => useContext(Context);
export function useGuardedNavigation() {
  const boundary = useNavigationBoundary();
  return boundary?.navigate || ((action: () => void) => action());
}
