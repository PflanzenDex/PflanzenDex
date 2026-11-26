import * as React from "react";
import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";
import { cn } from "@/shared/lib/utils";
import { enterKeyHandlers } from "./input.enter-key";

/**
 * Shared look of the text-like fields (Input, Textarea, Select): token border (`--input`, 3:1 on the surface,
 * WCAG 1.4.11), 16 px text so phones do not zoom (DS-18), focus ring (DS-37), invalid and disabled states (DS-38, DS-39).
 */
export const fieldClasses =
  "w-full rounded-control border border-input bg-card ps-3 pe-3 text-base text-foreground " +
  "placeholder:text-muted-foreground transition-colors motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "aria-invalid:border-destructive aria-invalid:inset-ring-1 aria-invalid:inset-ring-destructive " +
  "disabled:pointer-events-none disabled:opacity-50";

export type FieldInvalidProps = {
  /** Sets `aria-invalid`. Link the error text with `aria-describedby`; the thicker border is not the only cue (DS-38). */
  invalid?: boolean;
};

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> &
  FieldInvalidProps & {
    /**
     * A unit shown inside the field at its right edge ("cm"), not part of the label (SG-FORM-01). The screen reader
     * reads it as the field's description; the text keeps its room at the end of the field.
     */
    suffix?: string | undefined;
  };

/**
 * A browser without a date picker shows a date field as plain text: the placeholder and the pattern name the format
 * there (FR-BES-04); browsers with a picker ignore both. A caller's own values win.
 */
const DATE_HINT = { placeholder: "JJJJ-MM-TT", pattern: "\\d{4}-\\d{2}-\\d{2}" };

/**
 * Single-line field (US-QS-07, DS-15, DS-18, DS-19). `type`, `inputMode` and `autoComplete` pass through; dates stay
 * `YYYY-MM-DD` strings (DS-51). The return-key hint (`enterkeyhint`) is set when the field gets the focus or is pressed:
 * "next" when a later text field of its form follows, where Enter moves on, and "done" on the last one, where Enter submits
 * (SG-FORM-03, US-QS-32). A search field says "search". A field with a datalist never says "next" (Enter picks a suggestion
 * there): it says "done" as the last field of a form that submits and has no hint otherwise. A caller's `enterKeyHint` wins.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      invalid,
      suffix,
      type = "text",
      enterKeyHint,
      onFocus,
      onPointerDown,
      onKeyDown,
      style,
      "aria-describedby": describedBy,
      ...props
    },
    ref,
  ) => {
    const suffixId = React.useId();
    const hasSuffix = Boolean(suffix);
    // The room for the unit follows its length: "W" reserves little, "µmol/m²/s" enough. The 1.5 rem is the gap to the
    // edge plus the unit's own padding; both scale with the text size (SG-FORM-01, SG-TYPE-04). Without a unit the
    // variable is unset and the class falls back to the normal end padding.
    const unitRoom = suffix ? `calc(${suffix.length}ch + 1.5rem)` : undefined;
    const control = (
      <input
        // The ref goes straight through: a stable ref is attached once, not again on every render.
        ref={ref}
        type={type}
        {...(type === "date" ? DATE_HINT : {})}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        aria-describedby={
          [describedBy, hasSuffix ? suffixId : undefined].filter(Boolean).join(" ") || undefined
        }
        className={cn(
          fieldClasses,
          "min-h-[44px] py-2",
          "pe-[var(--unit-room,0.75rem)]",
          className,
        )}
        style={{ "--unit-room": unitRoom, ...style } as React.CSSProperties}
        enterKeyHint={enterKeyHint}
        {...enterKeyHandlers(enterKeyHint, { onFocus, onPointerDown, onKeyDown })}
        {...props}
      />
    );
    if (!hasSuffix) return control;
    // The unit sits at the right edge of the same box; it is not in the label, so the name stays the label's text.
    return (
      <span className="relative block w-full min-w-0">
        {control}
        <span
          id={suffixId}
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 end-0 flex items-center pe-3 text-sm text-muted-foreground"
        >
          {suffix}
        </span>
      </span>
    );
  },
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
    /** Marks the field "(optional)" after its label (SG-FORM-01). */
    optional?: boolean;
  } & Omit<InputProps, "name" | "value" | "onChange" | "onBlur" | "ref">,
) {
  const { control, name, label, focusRef, optional, ...input } = props;
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel optional={optional}>{label}</FormLabel>
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
