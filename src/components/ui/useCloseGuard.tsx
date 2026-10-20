import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";
import { useNavigationBoundary } from "./NavigationGuard";

export function useCloseGuard(
  dirty: boolean,
  close: () => void,
  save?: () => void | boolean | Promise<void | boolean>,
) {
  const [asking, setAsking] = useState(false);
  const [trigger] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const bypass = useRef(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const boundary = useNavigationBoundary();
  const [id] = useState(() => Symbol("editor"));
  const current = useRef({ dirty, save });
  current.current = { dirty, save };
  useEffect(() => boundary?.register(id, resume => {
    if (!current.current.dirty || bypass.current) return false;
    pendingNavigation.current = resume;
    setAsking(true);
    return true;
  }, () => current.current.dirty && !bypass.current), [boundary?.register, id]);
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  const finish = () => {
    bypass.current = true;
    close();
    const resume = pendingNavigation.current;
    pendingNavigation.current = null;
    if (resume) { resume(); return; }
    window.setTimeout(() => {
      const target =
        trigger?.isConnected && trigger.tagName !== "BODY"
          ? trigger
          : document.querySelector<HTMLElement>(
              "[data-record-create],main h1,main button",
            );
      if (target) {
        if (!target.matches("button,a[href],input,textarea,select,[tabindex]"))
          target.setAttribute("tabindex", "-1");
        target.focus();
      }
    }, 80);
  };
  const requestClose = () => {
    if (dirty && !bypass.current) setAsking(true);
    else finish();
  };
  const confirmation = (
    <AlertDialog.Root
      open={asking}
      onOpenChange={(open) => {
        // Escape/overlay/"Continua" dismissals cancel the blocked navigation;
        // Discard and Save close programmatically and keep it pending.
        if (!open) pendingNavigation.current = null;
        setAsking(open);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="alert-overlay" />
        <AlertDialog.Content className="confirm-box">
          <AlertDialog.Title>Modifiche non salvate</AlertDialog.Title>
          <AlertDialog.Description>
            Scegli se continuare, salvare o scartare le modifiche.
          </AlertDialog.Description>
          <div>
            <AlertDialog.Cancel asChild>
              <button className="secondary">Continua a modificare</button>
            </AlertDialog.Cancel>
            <button
              className="danger-button"
              onClick={() => {
                setAsking(false);
                finish();
              }}
            >
              Scarta modifiche
            </button>
            {save && (
              <button
                className="primary"
                onClick={async () => {
                  setAsking(false);
                  try {
                    const result = await save();
                    if (result === false) pendingNavigation.current = null;
                  } catch { pendingNavigation.current = null; }
                }}
              >
                Salva
              </button>
            )}
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
  return { requestClose, finish, confirmation };
}
