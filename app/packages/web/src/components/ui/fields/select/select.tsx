import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClasses, type FieldInvalidProps } from "../input/input";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & FieldInvalidProps;

/** Styled native `<select>` (ADR 0007: the OS picker is the best mobile experience). Pass `<option>` children; US-QS-07, DS-15, DS-18. */
const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, invalid, children, ...props }, ref) => (
    <select
      ref={ref}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldClasses, "min-h-[44px] py-2", className)}
      {...props}
    >
      {children}
    </select>
  ),
);
Select.displayName = "Select";

export { Select };
