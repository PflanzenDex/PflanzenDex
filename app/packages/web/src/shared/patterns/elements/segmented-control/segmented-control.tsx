import { OctagonAlert } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "../../../ui/button/button";

export type SegmentedOption<V extends string> = {
  value: V;
  label: string;
  /** The keyboard shortcut of this choice (US-QS-11): shown on desktop, announced with the choice. */
  keyHint?: { visible: string; aria: string } | undefined;
};

export type SegmentedControlProps<V extends string> = {
  /** Accessible name of the whole group (German); the options carry their own names. */
  label: string;
  options: readonly SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /**
   * A segment that holds errors (US-QS-32, F-0106): the mark and the text the caller gives for it (German), which the
   * accessible name carries after the label, e.g. "1 Angabe fehlt". The component reads no German text itself.
   */
  alerts?: Readonly<Partial<Record<V, string | undefined>>>;
  /**
   * Locks every segment while an action runs (the busy state of a write). The chosen level stays pressed (aria-pressed)
   * while the group is locked; the others cannot be chosen.
   */
  disabled?: boolean;
  className?: string;
};

// Two or three choices: one row of equal columns, the segments share the full width (SG-CTRL-01); the track is a pill.
const ROW_LAYOUT = "grid-flow-col auto-cols-fr rounded-full";
// Four choices (the Sammlung switch, issue 1858): two columns, and one row of four from a container width given in rem.
// Measured in a browser at 100 % text: the widest label in its selected (semibold) state, "Wünsche", needs 73.3 px with
// its padding and border, so one row of four needs 313 px (19.6 rem) with the gaps and the track. The phone container
// is 328 px at 360 px wide (the page gutter is 16 px each side), so 20 rem keeps one row at normal text. At 200 % text
// the rem threshold doubles to 640 px and the container is 296 px, so the four become a 2 x 2 grid. On two rows the track
// is a 22 px card radius, not a lozenge (SG-SHAPE-02); the segments themselves stay pills.
const FOUR_LAYOUT = "grid-cols-2 rounded-2xl @min-[20rem]:grid-cols-4 @min-[20rem]:rounded-full";

/**
 * A segmented control of two to four exclusive choices (US-QS-14, DS-15, US-QS-32, SG-CTRL-01): toggle buttons in a named
 * group, so Tab reaches every segment, Enter and Space choose, and screen readers say which one is pressed. Every segment
 * is a 44 px target that shares the full width. The selected one is a raised card fill with a semibold label and a 1 px
 * boundary in the field colour; the others carry the same boundary, transparent, so nothing jumps. The selection is never
 * shown by colour alone.
 * Two or three choices stay in one row: at a larger text size the row scrolls sideways inside its own box instead of
 * running past the right edge or taking the height of the screen (issue 1019). `data-scroll-x="row"` tells the one-screen
 * gate that this row may scroll sideways at 200 % text (issue 1183); at normal text size it must fit.
 * Four choices are one row at normal text on a phone and a 2 x 2 grid at a larger text size, so every view stays visible
 * (issue 1858). The grid is judged by the width of its container (a container query in rem), not by the viewport.
 */
export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>) {
  const { options, value, onChange, alerts, disabled } = props;
  const four = options.length === 4;
  const group = (
    <div
      role="group"
      aria-label={props.label}
      data-scroll-x={four ? undefined : "row"}
      className={cn(
        "grid w-full gap-1 overflow-x-auto overscroll-x-contain bg-muted p-1 [scrollbar-width:none]",
        four ? FOUR_LAYOUT : ROW_LAYOUT,
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
            disabled={disabled}
            aria-pressed={selected}
            aria-keyshortcuts={o.keyHint?.aria}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-w-[44px] shrink-0 gap-1 rounded-full border px-1",
              selected
                ? "border-input bg-card font-semibold text-foreground shadow-elevation-1 hover:bg-card hover:text-foreground forced-colors:border-[color:Highlight]"
                : "border-transparent font-normal text-muted-foreground hover:bg-transparent hover:text-foreground",
            )}
          >
            {o.label}
            {alerts?.[o.value] ? (
              <>
                <OctagonAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
                <span className="sr-only">, {alerts[o.value]}</span>
              </>
            ) : null}
            {o.keyHint ? (
              <kbd aria-hidden="true" className="hidden font-mono text-xs font-normal md:inline">
                {o.keyHint.visible}
              </kbd>
            ) : null}
          </Button>
        );
      })}
    </div>
  );
  // The container of the four-choice grid: its width, not the viewport's, decides the columns (the container query).
  return four ? <div className="@container w-full">{group}</div> : group;
}
