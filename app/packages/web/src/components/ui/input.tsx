import * as React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { cn } from "@/lib/utils";

/**
 * Shared look of the text-like fields (Input, Textarea, Select): token border (`--input`, 3:1 on the surface,
 * WCAG 1.4.11), 16 px text so phones do not zoom (DS-18), focus ring (DS-37), invalid and disabled states (DS-38, DS-39).
 */
export const fieldClasses =
  "w-full rounded-md border border-input bg-background px-3 text-base text-foreground " +
  "placeholder:text-muted-foreground transition-colors motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "aria-invalid:border-destructive aria-invalid:inset-ring-1 aria-invalid:inset-ring-destructive " +
  "disabled:pointer-events-none disabled:opacity-50";

export type FieldInvalidProps = {
  /** Sets `aria-invalid`. Link the error text with `aria-describedby`; the thicker border is not the only cue (DS-38). */
  invalid?: boolean;
};

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldInvalidProps;

/** Single-line field (US-QS-07, DS-15, DS-18, DS-19). `type`, `inputMode` and `autoComplete` pass through; dates stay `YYYY-MM-DD` strings (DS-51). */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldClasses, "min-h-[44px] py-2", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };

/** One labelled text field of a form with its message (DS-47); the input attributes pass through. */
export function TextField<T extends FieldValues>(
  props: {
    control: Control<T>;
    name: FieldPath<T>;
    label: string;
    /** Receives the input, so a neighbour can move the focus to it. */
    focusRef?: React.MutableRefObject<HTMLInputElement | null> | undefined;
  } & Omit<InputProps, "name" | "value" | "onChange" | "onBlur" | "ref">,
) {
  const { control, name, label, focusRef, ...input } = props;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              {...input}
              ref={(el) => {
                field.ref(el);
                if (focusRef) focusRef.current = el;
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
