import { useEffect, useRef, useState } from "react";
import { AlertDialog } from "radix-ui";

export function useCloseGuard(
  dirty: boolean,
  close: () => void,
  save?: () => void | Promise<void>,
) {
  const [asking, setAsking] = useState(false);
  const [trigger] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const bypass = useRef(false);
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
    <AlertDialog.Root open={asking} onOpenChange={setAsking}>
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
                onClick={() => {
                  setAsking(false);
                  void save();
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
