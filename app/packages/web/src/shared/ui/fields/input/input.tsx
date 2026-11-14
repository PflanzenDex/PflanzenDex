import * as React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "../form/form";
import { cn } from "@/shared/lib/utils";
import { enterKeyHandlers } from "./enter-key";

/**
 * Shared look of the text-like fields (Input, Textarea, Select): token border (`--input`, 3:1 on the surface,
 * WCAG 1.4.11), 16 px text so phones do not zoom (DS-18), focus ring (DS-37), invalid and disabled states (DS-38, DS-39).
 */
export const fieldClasses =
  "w-full rounded-control border border-input bg-card px-3 text-base text-foreground " +
  "placeholder:text-muted-foreground transition-colors motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "aria-invalid:border-destructive aria-invalid:inset-ring-1 aria-invalid:inset-ring-destructive " +
  "disabled:pointer-events-none disabled:opacity-50";

export type FieldInvalidProps = {
  /** Sets `aria-invalid`. Link the error text with `aria-describedby`; the thicker border is not the only cue (DS-38). */
  invalid?: boolean;
};

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & FieldInvalidProps;

/**
 * A browser without a date picker shows a date field as plain text: the placeholder and the pattern name the format
 * there (FR-BES-04); browsers with a picker ignore both. A caller's own values win.
 */
const DATE_HINT = { placeholder: "JJJJ-MM-TT", pattern: "\\d{4}-\\d{2}-\\d{2}" };

/**
 * Single-line field (US-QS-07, DS-15, DS-18, DS-19). `type`, `inputMode` and `autoComplete` pass through; dates stay
 * `YYYY-MM-DD` strings (DS-51). The return-key hint (`enterkeyhint`) is set when the field gets the focus or is pressed:
 * "next" when a later text field of its form follows, where Enter moves on, and "done" on the last one, where Enter submits
 * (SG-FORM-03, US-QS-32). A search field says "search". A caller's `enterKeyHint` wins.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      invalid,
      type = "text",
      enterKeyHint,
      onFocus,
      onPointerDown,
      onKeyDown,
      ...props
    },
    ref,
  ) => (
    <input
      // The ref goes straight through: a stable ref is attached once, not again on every render.
      ref={ref}
      type={type}
      {...(type === "date" ? DATE_HINT : {})}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldClasses, "min-h-[44px] py-2", className)}
      enterKeyHint={enterKeyHint}
      {...enterKeyHandlers(enterKeyHint, { onFocus, onPointerDown, onKeyDown })}
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
