import * as React from "react";
import { cn } from "@/lib/utils";
import type { FieldInvalidProps } from "./input";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> &
  FieldInvalidProps & {
    /** Classes for the surrounding row (the 44 px target); `className` goes to the box itself. */
    rowClassName?: string;
  };

/**
 * Styled native checkbox (US-QS-07, DS-15). The whole label row is the 44 px hit area, the children are the label text,
 * so the box always has an accessible name. Fixes the 24 px gap of the legacy `.settings label.check input`.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
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
            "disabled:pointer-events-none",
          className,
        )}
        {...props}
      />
      <span>{children}</span>
    </label>
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
