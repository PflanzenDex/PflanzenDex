import * as React from "react";
import {
  useFormState,
  useWatch,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { cn } from "@/lib/utils";

type MoreFieldsProps = {
  /** Open while true: a field inside holds a value or a refusal (P-10). */
  forced?: boolean;
  /** The summary; "Mehr Angaben" for every optional group of a form (US-QS-24). */
  label?: string;
  className?: string | undefined;
  children: React.ReactNode;
};

/**
 * The optional fields of a form behind "Mehr Angaben" (US-QS-15, US-QS-24, DS-64): closed by default, opened by a click.
 * While a field inside holds a value or a refusal (`forced`), it stays open and its summary does not close it, so nothing
 * is hidden silently (P-10). A refused field takes the focus when the group opens by itself.
 */
export function MoreFields({
  forced = false,
  label = "Mehr Angaben",
  className,
  children,
}: MoreFieldsProps) {
  const [manual, setManual] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (forced) box.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [forced]);
  return (
    <details
      open={manual || forced}
      onToggle={(event) => setManual(event.currentTarget.open)}
      className={cn("rounded-lg border border-border", className)}
    >
      <summary
        onClick={(event) => {
          if (forced) event.preventDefault();
        }}
        className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
      </summary>
      <div ref={box} className="grid gap-4 px-3 pb-3">
        {children}
      </div>
    </details>
  );
}

/** A value that counts as filled: text with a visible character, a number, a chosen option, a file. */
function isFilled(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  return value !== undefined && value !== null && value !== false;
}

type FormMoreFieldsProps<T extends FieldValues> = Omit<MoreFieldsProps, "forced"> & {
  control: Control<T>;
  /** The optional fields inside; each one that holds a value or a refusal opens the group. */
  names: readonly FieldPath<T>[];
  /** Further reasons to open, for state outside the form (a chosen photo, a refused upload). */
  forced?: boolean;
};

/** `MoreFields` bound to a react-hook-form control: it opens by itself while one of `names` is filled or refused. */
export function FormMoreFields<T extends FieldValues>({
  control,
  names,
  forced = false,
  ...rest
}: FormMoreFieldsProps<T>) {
  const { errors } = useFormState({ control, name: names });
  const values: unknown = useWatch({ control, name: names });
  const refused = names.some((name) => Boolean((errors as Record<string, unknown>)[name]));
  const filled = (Array.isArray(values) ? values : [values]).some(isFilled);
  return <MoreFields {...rest} forced={forced || refused || filled} />;
}
