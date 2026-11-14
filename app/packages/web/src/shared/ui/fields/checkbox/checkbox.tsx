import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { NetworkReason, useNetworkGate } from "../../button/button";
import type { FieldInvalidProps } from "../input/input";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> &
  FieldInvalidProps & {
    /** Classes for the surrounding row (the 44 px target); `className` goes to the box itself. */
    rowClassName?: string;
    /**
     * The box writes at once and cannot wait for the network (US-QS-30). Offline it keeps its state, is shown inactive
     * (`aria-disabled`) and the reason stands next to the row (SG-BTN-05). A buffered write does not use it.
     */
    needsNetwork?: boolean;
    /** With `needsNetwork`: the reason is a line next to the row (default), or for assistive technology only (`false`). */
    reasonInline?: boolean;
  };

/**
 * Styled native checkbox (US-QS-07, DS-15). The whole label row is the 44 px hit area, the children are the label text,
 * so the box always has an accessible name.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      rowClassName,
      invalid,
      children,
      needsNetwork = false,
      reasonInline = true,
      onChange,
      "aria-describedby": ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const gate = useNetworkGate(needsNetwork, ariaDescribedBy, undefined);
    const { offline, describedBy } = gate;
    // The caller's change does not run offline; a controlled box goes back to its stored state, because React restores
    // it after the change (no prevented click: that undoes the restore in some engines).
    const change: React.ChangeEventHandler<HTMLInputElement> = (event) => {
      if (!offline) onChange?.(event);
    };
    return (
      <>
        <label
          className={cn(
            "flex min-h-[44px] cursor-pointer items-center gap-3 text-base has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
            rowClassName,
          )}
        >
          <input
            ref={ref}
            type="checkbox"
            aria-invalid={invalid || props["aria-invalid"] || undefined}
            aria-disabled={offline || undefined}
            aria-describedby={describedBy}
            onChange={change}
            className={cn(
              "size-5 shrink-0 rounded-sm accent-primary " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                "aria-invalid:outline aria-invalid:outline-2 aria-invalid:outline-destructive " +
                "aria-disabled:opacity-50 disabled:pointer-events-none",
              className,
            )}
            {...props}
          />
          <span>{children}</span>
        </label>
        {offline ? <NetworkReason id={gate.reasonId} inline={reasonInline} /> : null}
      </>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
