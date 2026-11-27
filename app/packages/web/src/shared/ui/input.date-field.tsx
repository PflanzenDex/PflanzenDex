import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { fieldClasses, type InputProps } from "./input";
import { enterKeyHandlers } from "./input.enter-key";
import { draftFor, handedFor, parseDateText, showDateText } from "./input.date-text";
import table from "./input.date-field.de.json";

export { parseDateText, showDateText };

const t = texts(table);
const COARSE = "(pointer: coarse)";
type DateProps = Omit<InputProps, "type">;

/** Does the device point with a finger (a coarse pointer)? Without `matchMedia`, as in jsdom, the pointer is fine. */
function coarseNow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COARSE).matches
    : false;
}

/** The pointer of the device, followed while it changes (a keyboard docked to a tablet, a window that resizes). */
function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = React.useState(coarseNow);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(COARSE);
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return coarse;
}

/**
 * A touch device: the system date picker (SG-CTRL-03). The value is the local calendar date `YYYY-MM-DD` as it is, and
 * the picker shows no placeholder, length limit or number pad of its own (US-QS-32).
 */
const PickerDate = React.forwardRef<HTMLInputElement, DateProps>(
  ({ className, invalid, enterKeyHint, onFocus, onPointerDown, onKeyDown, ...props }, ref) => (
    <input
      ref={ref}
      type="date"
      enterKeyHint={enterKeyHint}
      {...enterKeyHandlers(enterKeyHint, { onFocus, onPointerDown, onKeyDown })}
      {...props}
      placeholder={undefined}
      maxLength={undefined}
      inputMode={undefined}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(fieldClasses, "min-h-[44px] py-2", className)}
    />
  ),
);
PickerDate.displayName = "PickerDate";

/** The typed text and what it means: the shown draft, its calendar date, whether it is a problem, and whether it was left. */
function useTypedText(props: Pick<DateProps, "value" | "defaultValue" | "min" | "max">) {
  const { value, defaultValue, min, max } = props;
  const [draft, setDraft] = React.useState(() => showDateText(String(value ?? defaultValue ?? "")));
  const [left, setLeft] = React.useState(false);
  const shown = value === undefined ? draft : draftFor(draft, String(value));
  const iso = parseDateText(shown);
  return { setDraft, setLeft, shown, iso, left, problem: problemOf(shown, iso, min, max) };
}

/**
 * What is wrong with the typed text, as the message the keeper reads (SG-FORM-05: it says how to fix it): a text that is
 * no real day, a day after `max` (the last day to choose) or before `min` (the first day). `null` when it is fine.
 */
function problemOf(shown: string, iso: string, min: DateProps["min"], max: DateProps["max"]) {
  if (iso === "") return shown.trim() === "" ? null : t("invalid");
  if (max && iso > String(max)) return t("beforeMax", { date: showDateText(String(max)) });
  if (min && iso < String(min)) return t("afterMin", { date: showDateText(String(min)) });
  return null;
}
type TypedText = ReturnType<typeof useTypedText>;

/** Focus selects the whole text (Q-134); Enter shows the message, because the form may submit now (US-QS-32). */
function typedKeys(
  typed: TypedText,
  h: Pick<DateProps, "enterKeyHint" | "onFocus" | "onPointerDown" | "onKeyDown">,
) {
  return enterKeyHandlers(h.enterKeyHint, {
    onFocus: (event) => {
      event.currentTarget.select();
      typed.setLeft(false);
      h.onFocus?.(event);
    },
    onPointerDown: h.onPointerDown,
    onKeyDown: (event) => {
      if (event.key === "Enter") typed.setLeft(true);
      h.onKeyDown?.(event);
    },
  });
}

/** The change a caller gets: `target.value` is the calendar date, or the typed text while it is no day (US-QS-32). */
function handedEvent(e: React.ChangeEvent<HTMLInputElement>, name: string | undefined) {
  return {
    ...e,
    target: { name: name ?? "", value: handedFor(e.target.value) },
    currentTarget: e.currentTarget,
  } as unknown as React.ChangeEvent<HTMLInputElement>;
}

/** The typed attributes of a fine pointer (the browser's keyboard shows letters-free digits, US-QS-24). */
const TYPED = { type: "text", inputMode: "numeric", autoComplete: "off", maxLength: 10 } as const;

/**
 * A fine pointer: the typed `TT.MM.JJJJ` field (US-QS-24). Focus selects the whole text (Q-134). A text that is no real
 * day, or out of `min`/`max`, is marked when the field is left, with one message under it (SG-FORM-05, US-QS-32);
 * nothing shows while the keeper types, and the typed text is never cleared.
 */
const TypedDate = React.forwardRef<HTMLInputElement, DateProps>((props, ref) => {
  const { invalid, defaultValue, onChange, onBlur, ...rest } = props;
  const messageId = `${React.useId()}-message`;
  const typed = useTypedText({ value: rest.value, defaultValue, min: rest.min, max: rest.max });
  const callerInvalid = Boolean(invalid || rest["aria-invalid"]);
  // A caller's own refusal (its form message) stands alone: the field adds no second message beside it.
  const message = !callerInvalid && typed.left ? typed.problem : null;
  const describedBy =
    [rest["aria-describedby"], message ? messageId : undefined].filter(Boolean).join(" ") ||
    undefined;
  return (
    <>
      <input
        ref={ref}
        {...TYPED}
        {...rest}
        placeholder={rest.placeholder ?? "TT.MM.JJJJ"}
        {...typedKeys(typed, rest)}
        value={typed.shown}
        aria-invalid={callerInvalid || message ? true : undefined}
        aria-describedby={describedBy}
        className={cn(fieldClasses, "min-h-[44px] py-2", rest.className)}
        onChange={(e) => {
          typed.setDraft(e.target.value);
          onChange?.(handedEvent(e, rest.name));
        }}
        onBlur={(e) => {
          typed.setLeft(true);
          if (typed.iso) typed.setDraft(showDateText(typed.iso));
          onBlur?.(e);
        }}
      />
      {message && (
        <p id={messageId} role="alert" className="text-sm font-medium text-destructive">
          {message}
        </p>
      )}
    </>
  );
});
TypedDate.displayName = "TypedDate";

/**
 * The one date field (US-QS-24, SG-CTRL-03). A fine pointer gets the typed `TT.MM.JJJJ` field, a touch device the system
 * date picker; the value is the local calendar date `YYYY-MM-DD` in both (NFR-08, DS-51). `min`/`max` (`YYYY-MM-DD`)
 * mark an out-of-range day. Takes the props of `Input`; `onChange` receives an event whose `target.value` is the ISO date,
 * or the typed text while it is no real day (the form refuses it). The return key works as in `Input` (SG-FORM-03,
 * US-QS-32): the typed field is a text field, so a field before it says "next" and Enter moves on onto it, and the last
 * text field says "done" and Enter submits. A caller's `enterKeyHint` wins.
 */
const DateField = React.forwardRef<HTMLInputElement, DateProps>((props, ref) => {
  const coarse = useCoarsePointer();
  return coarse ? <PickerDate {...props} ref={ref} /> : <TypedDate {...props} ref={ref} />;
});
DateField.displayName = "DateField";

export { DateField };
