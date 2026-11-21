import type { ReactNode } from "react";
import { PageHeader } from "../../../../shared/patterns/navigation/page-header/page-header";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../../../shared/patterns/elements/segmented-control/segmented-control";

/**
 * The title area of the destination "Sammlung" (US-QS-14, US-QS-32): the one main heading, in the top bar below `md`, and a
 * small count line when the shown view has loaded, then the switch between the views. With `reserveCaption` the line keeps
 * its height while there is no count yet, so the switch keeps its place when the count arrives (SG-STATE-02, F-0018). The
 * name stays the same in every mode; the selected segment names the mode (SG-HEAD-01). Takes data and callbacks only (DS-44).
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
  /** A control beside the heading, e.g. the opener of the layer "Ansicht" (US-QS-19); it goes into the bar below `md`. */
  action?: ReactNode;
}) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      <PageHeader
        title={props.title ?? "Sammlung"}
        {...(props.action ? { action: props.action } : {})}
      />
      {props.caption ? (
        <p className="text-sm text-muted-foreground">{props.caption}</p>
      ) : props.reserveCaption ? (
        <CaptionReserve />
      ) : null}
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
