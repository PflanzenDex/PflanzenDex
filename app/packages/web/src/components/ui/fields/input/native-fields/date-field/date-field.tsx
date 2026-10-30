import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldClasses, type InputProps } from "../../input";

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const GERMAN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

/** Is `y-m-d` a real calendar day? Pure calendar arithmetic, no time zone involved (NFR-08). */
function isRealDay(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "09.03.2026" or "2026-03-09" as the local calendar date `YYYY-MM-DD`; `""` when it is no real day (NFR-08). */
export function parseDateText(text: string): string {
  const t = text.trim();
  const iso = ISO.exec(t);
  const de = GERMAN.exec(t);
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : de
      ? [Number(de[3]), Number(de[2]), Number(de[1])]
      : [0, 0, 0];
  if (!y || !isRealDay(y, m, d)) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` as "09.03.2026"; anything else is shown as it is. */
export function showDateText(iso: string): string {
  const m = ISO.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/**
 * The one date field (US-QS-24): shows `TT.MM.JJJJ` in every browser and locale, the value stays the local calendar
 * date `YYYY-MM-DD` (NFR-08, DS-51), or `""` while the text is no real day. `min`/`max` (`YYYY-MM-DD`) mark an
 * out-of-range day as invalid. Takes the props of `Input`; `onChange` receives an event whose `target.value` is the ISO date.
 */
const DateField = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(
  (
    { className, invalid, value, defaultValue, onChange, onBlur, min, max, placeholder, ...props },
    ref,
  ) => {
    const initial = String(value ?? defaultValue ?? "");
    const [draft, setDraft] = React.useState(showDateText(initial));
    const shown = value === undefined ? draft : draftFor(draft, String(value));
    const iso = parseDateText(shown);
    const outOfRange = iso !== "" && ((max && iso > String(max)) || (min && iso < String(min)));
    const typedButInvalid = shown.trim() !== "" && iso === "";
    return (
      <input
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? "TT.MM.JJJJ"}
        min={min}
        max={max}
        maxLength={10}
        {...props}
        value={shown}
        aria-invalid={
          invalid || props["aria-invalid"] || outOfRange || typedButInvalid || undefined
        }
        className={cn(fieldClasses, "min-h-[44px] py-2", className)}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const next = parseDateText(text);
          // Callers read `event.target.value` (react-hook-form too), so hand them the calendar date, not the text.
          onChange?.({
            ...e,
            target: { name: props.name ?? "", value: next },
            currentTarget: e.currentTarget,
          } as unknown as React.ChangeEvent<HTMLInputElement>);
        }}
        onBlur={(e) => {
          if (iso) setDraft(showDateText(iso));
          onBlur?.(e);
        }}
      />
    );
  },
);
DateField.displayName = "DateField";

/** While the parent's ISO value is the date the draft already means, keep the draft (the user is typing). */
function draftFor(draft: string, value: string): string {
  return parseDateText(draft) === value ? draft : showDateText(value);
}

export { DateField };
