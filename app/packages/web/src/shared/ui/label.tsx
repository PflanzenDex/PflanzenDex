import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./label.de.json";

const t = texts(table);

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement> & {
  /** Adds " (optional)" after the text: a field that may stay empty says so, a required one says nothing (SG-FORM-01). */
  optional?: boolean | undefined;
};

/** Form label (US-QS-07, DS-36). Put it before its control; the control may carry the `peer` class to dim the label when disabled. */
const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, optional, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      {optional ? ` ${t("optional")}` : null}
    </label>
  ),
);
Label.displayName = "Label";

export { Label };
