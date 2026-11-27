import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { fieldClasses, type FieldInvalidProps } from "./input";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldInvalidProps;

/** Multi-line field (US-QS-07, DS-15, DS-18, DS-19); same look and states as `Input`. Grows from 3 to about 8 lines, then scrolls inside (`field-sizing-content`, owner decision d-156); Safari ignores it and keeps the fixed height. */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(
        fieldClasses,
        "field-sizing-content min-h-[calc(3lh+1rem+2px)] max-h-[calc(8lh+1rem+2px)] resize-none overscroll-contain py-2",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
