import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { fieldClasses, type FieldInvalidProps } from "./input";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldInvalidProps;

/**
 * Styled native `<select>` (ADR 0007: the OS picker is the best mobile experience). Pass `<option>` children; US-QS-07, DS-15,
 * DS-18. A value that does not fit ends with an ellipsis, never cut mid-letter (`truncate`, US-QS-32, issue 1960); the
 * native arrow sits in the field's right padding, so the ellipsis stops before it.
 */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldClasses, "min-h-[44px] truncate py-2", className)}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export { Select };
