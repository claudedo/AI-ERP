import { CircleAlert, CircleCheck, Clock3 } from "lucide-react";
import { statusTone } from "../services/statusTone";

/** A status value drawn with its state tone. The icon (or the neutral dot) repeats the tone
 *  in shape, so the state never depends on colour alone; the visible text is the value itself. */
export function StatusPill({ value, label }: { value: unknown; label?: string }) {
  const tone = statusTone(value);
  const Icon = tone === "success" ? CircleCheck : tone === "warning" ? Clock3 : tone === "danger" ? CircleAlert : null;
  return (
    <span className={`status-pill tone-${tone}`}>
      {Icon ? <Icon aria-hidden="true" focusable="false" /> : <i className="status-dot" aria-hidden="true" />}
      {label ?? String(value)}
    </span>
  );
}
