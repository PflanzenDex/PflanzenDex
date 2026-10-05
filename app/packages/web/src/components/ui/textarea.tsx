import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClasses, type FieldInvalidProps } from "./input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldInvalidProps;

/** Multi-line field (US-QS-07, DS-15, DS-18, DS-19); same look and states as `Input`. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldClasses, "min-h-[88px] py-2", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
