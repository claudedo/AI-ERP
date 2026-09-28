import { Check, ChevronsUpDown } from "lucide-react";
import { Select as RSelect } from "radix-ui";

/** Radix Select can't hold an empty-string value, so "" is mapped to a sentinel. */
const EMPTY = "__empty__";
export interface SelectOption { value: string; label: string }

export function Select({ value, onChange, options, placeholder = "Select…", emptyLabel, disabled, size = "md", ariaLabel, id }: {
  value: string; onChange: (v: string) => void; options: (string | SelectOption)[]; placeholder?: string;
  /** When set, an explicit item that clears the value (e.g. "All statuses"). */
  emptyLabel?: string; disabled?: boolean; size?: "sm" | "md"; ariaLabel?: string; id?: string;
}) {
  const items = options.map(o => typeof o === "string" ? { value: o, label: o } : o).filter(o => o.value !== "");
  const current = value === "" ? (emptyLabel ? EMPTY : undefined) : value;
  return <RSelect.Root value={current} onValueChange={v => onChange(v === EMPTY ? "" : v)} disabled={disabled}>
    <RSelect.Trigger className={`ds-select ds-select-${size}`} aria-label={ariaLabel} id={id}>
      <RSelect.Value placeholder={placeholder} />
      <RSelect.Icon className="ds-select-icon"><ChevronsUpDown size={13} /></RSelect.Icon>
    </RSelect.Trigger>
    <RSelect.Portal>
      <RSelect.Content className="ds-menu ds-select-content" position="popper" sideOffset={4} collisionPadding={8}>
        <RSelect.Viewport>
          {emptyLabel && <Item value={EMPTY} label={emptyLabel} />}
          {items.map(o => <Item key={o.value} value={o.value} label={o.label} />)}
        </RSelect.Viewport>
      </RSelect.Content>
    </RSelect.Portal>
  </RSelect.Root>;
}
function Item({ value, label }: { value: string; label: string }) {
  return <RSelect.Item value={value} className="ds-menu-item">
    <RSelect.ItemIndicator className="ds-menu-check"><Check size={13} /></RSelect.ItemIndicator>
    <RSelect.ItemText>{label}</RSelect.ItemText>
  </RSelect.Item>;
}
