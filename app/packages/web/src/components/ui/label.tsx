import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Adds a visual asterisk; the control itself carries `required` for assistive technology. */
  required?: boolean;
};

/** Form label (US-QS-07, DS-36). Put it before its control; the control may carry the `peer` class to dim the label when disabled. */
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      ) : null}
    </label>
  ),
);
Label.displayName = "Label";

export { Label };
