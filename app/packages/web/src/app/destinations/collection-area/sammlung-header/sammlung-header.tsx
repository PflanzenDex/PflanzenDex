import type { ReactNode } from "react";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../../../shared/patterns/elements/segmented-control/segmented-control";

/**
 * The title area of the destination "Sammlung" (US-QS-14): the one main heading, a small count line when the shown view
 * has loaded, and the switch between the views. With `reserveCaption` the line keeps its height while there is no count
 * yet, so the switch keeps its place when the count arrives (SG-STATE-02, F-0018). Takes data and callbacks only (DS-44).
 */
export function SammlungHeader<V extends string>(props: {
  view: V;
  options: readonly SegmentedOption<V>[];
  onChoose: (v: V) => void;
  caption: string | null;
  /** Keep the count line's height while `caption` is null: the shown view reports its count once it has loaded. */
  reserveCaption?: boolean;
  /** The destination title and the name of the switch; the default is the Sammlung. */
  title?: string;
  switchLabel?: string;
  /** A second control that belongs to the chosen view, e.g. the arrangement of the species. */
  children?: ReactNode;
  /** A control beside the heading, e.g. the opener of the layer "Ansicht" (US-QS-19). */
  action?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      {/* The action goes below the heading when there is no room beside it at a larger text size (issue 1019). */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{props.title ?? "Sammlung"}</h1>
          {props.caption ? (
            <p className="text-sm text-muted-foreground">{props.caption}</p>
          ) : props.reserveCaption ? (
            <CaptionReserve />
          ) : null}
        </div>
        {props.action}
      </div>
      <SegmentedControl
        label={props.switchLabel ?? "Ansicht der Sammlung"}
        options={props.options}
        value={props.view}
        onChange={props.onChoose}
      />
      {props.children}
    </div>
  );
}

/**
 * The place of the count line while there is no count (SG-STATE-02, F-0018): an empty box of the line's height (`text-sm`,
 * 1.25 rem, so it grows with the text size like the line). It draws nothing: a view whose load failed says so in its body,
 * so no bar pulses on for good (P-10). The route's fallback of "Sammlung" reserves the same box.
 */
function CaptionReserve() {
  return <div aria-hidden="true" data-caption-reserve="" className="h-5" />;
}
