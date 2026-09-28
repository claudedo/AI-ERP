import type { ReactNode } from "react";
import { Tooltip } from "radix-ui";

/** Desktop-style tooltip. Requires a Tooltip.Provider higher in the tree (see WorkspaceApp). */
export function Hint({ label, shortcut, side = "bottom", children }: { label: string; shortcut?: string; side?: "top" | "right" | "bottom" | "left"; children: ReactNode }) {
  return <Tooltip.Root>
    <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className="tooltip-content" side={side} sideOffset={6} collisionPadding={8}>
        {label}{shortcut && <kbd className="tooltip-kbd">{shortcut}</kbd>}
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>;
}
