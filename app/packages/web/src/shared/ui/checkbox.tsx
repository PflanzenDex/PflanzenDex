import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { NetworkReason, useNetworkGate } from "./button.network-gate";
import type { FieldInvalidProps } from "./input";

type CheckboxBase = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> &
  FieldInvalidProps & {
    /** Classes for the surrounding row (the 44 px target); `className` goes to the box itself. */
    rowClassName?: string;
  };

/**
 * A box that writes at once (US-QS-30, SG-BTN-05) must be controlled: offline it shows the stored state (`checked`) and
 * does not change, because React restores a controlled box after a change that the caller does not take. An uncontrolled
 * box cannot be held that way, so the type asks for `checked`.
 */
export type CheckboxProps =
  | (CheckboxBase & { needsNetwork?: false })
  | (CheckboxBase & { needsNetwork: true; checked: boolean });

/** The styled row: the whole label row is the 44 px hit area, the children are the label text. */
const CheckboxControl = React.forwardRef<HTMLInputElement, CheckboxBase>(
  ({ className, rowClassName, invalid, children, ...props }, ref) => (
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
  ),
);
CheckboxControl.displayName = "CheckboxControl";

/** A box that writes at once: the gate is set here, so a plain `Checkbox` subscribes to nothing. */
const NetworkCheckbox = React.forwardRef<HTMLInputElement, CheckboxBase & { checked: boolean }>(
  ({ onChange, "aria-describedby": describedBy, ...props }, ref) => {
    const gate = useNetworkGate(describedBy, undefined);
    return (
      <>
        <CheckboxControl
          ref={ref}
          {...props}
          aria-disabled={gate.offline || props["aria-disabled"] || undefined}
          aria-describedby={gate.describedBy}
          // The change of an offline box is not taken; React then restores the stored state.
          onChange={(event) => {
            if (!gate.offline) onChange?.(event);
          }}
        />
        {gate.inline ? <NetworkReason id={gate.reasonId} /> : null}
      </>
    );
  },
);
NetworkCheckbox.displayName = "NetworkCheckbox";

/**
 * Styled native checkbox (US-QS-07, DS-15). The whole label row is the 44 px hit area, the children are the label text,
 * so the box always has an accessible name.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ needsNetwork, ...props }, ref) =>
    needsNetwork ? (
      <NetworkCheckbox ref={ref} {...props} checked={props.checked as boolean} />
    ) : (
      <CheckboxControl ref={ref} {...props} />
    ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
