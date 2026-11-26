import { OctagonAlert } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { LabelProbe, useStacked } from "./label-probe/label-probe";

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
// Two or three choices whose longest label does not fit its column (200 % text on a 360 px phone, issue 2232): the
// segments stack in one column at the full width, and the track takes the 22 px card radius (SG-SHAPE-02).
const STACK_LAYOUT = "grid-cols-1 rounded-2xl";
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
 * Two or three choices sit in one row while the longest label fits its column; when it does not (200 % text on a phone,
 * issue 2232) the segments stack in one column at the full width, so no label is clipped, runs past its segment or
 * scrolls sideways. The row is judged by measuring, not by a fixed breakpoint, because the labels differ per screen.
 * Four choices are one row at normal text on a phone and a 2 x 2 grid at a larger text size, so every view stays visible
 * (issue 1858). The grid is judged by the width of its container (a container query in rem), not by the viewport.
 */
export function SegmentedControl<V extends string>(props: SegmentedControlProps<V>) {
  const { options, value, onChange, alerts, disabled } = props;
  const four = options.length === 4;
  const labels = options.map((o) => o.label).join("\u0000");
  const { group: groupRef, probe, stacked } = useStacked(!four, labels);
  const group = (
    <div
      ref={groupRef}
      role="group"
      aria-label={props.label}
      data-stacked={stacked ? "" : undefined}
      className={cn(
        "relative grid w-full gap-1 bg-muted p-1",
        four ? FOUR_LAYOUT : stacked ? STACK_LAYOUT : ROW_LAYOUT,
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
              // The segment is 44 px high at least (the button's minimum); its vertical padding is 4 px, not the button's 8 px,
              // so that two rows of four at 200 % text fit on a 360 x 640 window (issue 1858, round 3).
              "min-w-[44px] gap-1 rounded-full border px-1 py-1",
              // In a row a label stays on one line (the row stacks before it would clip); stacked, a label longer than
              // the whole width wraps between words instead of running past its segment.
              !four && !stacked ? "whitespace-nowrap" : "break-words",
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
      {four ? null : <LabelProbe probeRef={probe} options={options} alerts={alerts} />}
    </div>
  );
  // The container of the four-choice grid: its width, not the viewport's, decides the columns (the container query).
  return four ? <div className="@container w-full">{group}</div> : group;
}
