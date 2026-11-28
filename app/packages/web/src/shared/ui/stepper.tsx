import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { Button } from "./button";
import table from "./stepper.de.json";

const t = texts(table);

export type StepperProps = {
  /** The visible name of the number. It names the group, so a screen reader says it before "Weniger", "Mehr" and the value. */
  label: React.ReactNode;
  value: number;
  /** The keeper pressed "Weniger" or "Mehr"; the value is always a whole number inside the limits. */
  onChange: (value: number) => void;
  /** Lowest whole number (starting value 0, SG-CTRL-04). */
  min?: number;
  /** Highest whole number (starting value 10, SG-CTRL-04). */
  max?: number;
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  className?: string | undefined;
};

/**
 * A whole number in a small range (0 to 10) as a stepper (US-QS-32, SG-CTRL-04): the name, then "Weniger", the value and
 * "Mehr". No keyboard opens on a phone and no wrong number can be typed. Both buttons are 44 px; at the limit the button is
 * `aria-disabled`, not `disabled`, so the focus stays on it (issue 2317), and a press there changes nothing. The value is a
 * live region, so a screen reader says the new number after each press (WCAG 4.1.3). The group takes `id` and
 * `aria-describedby`, so `FormControl` can wrap it; the error text of the field is the cue, because a group may not carry
 * the invalid attribute (ARIA 1.2).
 */
export function Stepper(props: StepperProps) {
  const { label, value, onChange, min = 0, max = 10 } = props;
  const labelId = React.useId();
  const step = (by: -1 | 1) => {
    const next = Math.min(max, Math.max(min, value + by));
    if (next !== value) onChange(next);
  };
  return (
    <div
      id={props.id}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={props["aria-describedby"]}
      className={cn("flex flex-wrap items-center justify-between gap-x-3 gap-y-1", props.className)}
    >
      <span id={labelId} className="min-w-0 font-semibold [overflow-wrap:anywhere]">
        {label}
      </span>
      <span className="ml-auto flex items-center gap-1">
        <Button
          type="button"
          variant="tinted"
          size="icon"
          aria-label={t("decrease")}
          aria-disabled={value <= min || undefined}
          onClick={() => step(-1)}
        >
          <Minus aria-hidden="true" className="size-5" />
        </Button>
        <output
          aria-live="polite"
          className="min-w-10 text-center text-lg font-semibold tabular-nums"
        >
          {value}
        </output>
        <Button
          type="button"
          variant="tinted"
          size="icon"
          aria-label={t("increase")}
          aria-disabled={value >= max || undefined}
          onClick={() => step(1)}
        >
          <Plus aria-hidden="true" className="size-5" />
        </Button>
      </span>
    </div>
  );
}
