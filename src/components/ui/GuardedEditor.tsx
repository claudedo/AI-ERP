import { useRef, useState, type ReactNode } from "react";
import { useCloseGuard } from "./useCloseGuard";
export function GuardedEditor({
  onClose,
  children,
}: {
  onClose: () => void;
  children: (close: () => void, saved: () => void) => ReactNode;
}) {
  const [dirty, setDirty] = useState(false),
    saved = useRef(false);
  const guard = useCloseGuard(dirty, onClose);
  return (
    <div
      style={{ display: "contents" }}
      onChangeCapture={() => {
        saved.current = false;
        setDirty(true);
      }}
    >
      {children(
        () => (saved.current ? guard.finish() : guard.requestClose()),
        () => {
          saved.current = true;
          setDirty(false);
        },
      )}
      {guard.confirmation}
    </div>
  );
}
