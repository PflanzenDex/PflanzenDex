import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button/button";

export type SegmentedOption<V extends string> = { value: V; label: string };

export type SegmentedControlProps<V extends string> = {
  /** Accessible name of the whole group (German); the options carry their own names. */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
};

/**
 * A pill group of two or three exclusive choices (US-QS-14, DS-15): toggle buttons in a named group, so Tab reaches
 * every segment, Enter and Space choose, and screen readers say which one is pressed. Every segment is a 44 px target;
 * the selected one is a raised pill with a check mark and a visible focus ring, so colour is never the only sign.
 */
export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>) {
  const { options, value, onChange } = props;
  return (
    <div
      role="group"
      aria-label={props.label}
      className={cn(
        "inline-flex w-fit max-w-full gap-1 rounded-full bg-muted p-1",
        props.className,
      )}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Button
            key={o.value}
            type="button"
            variant="ghost"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-[44px] rounded-full px-4 font-semibold",
              selected
                ? "bg-card text-foreground shadow-elevation-1 hover:bg-card forced-colors:border-[color:Highlight]"
                : "text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            {selected ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
            {o.label}
          </Button>
        );
      })}
    </div>
  );
}
