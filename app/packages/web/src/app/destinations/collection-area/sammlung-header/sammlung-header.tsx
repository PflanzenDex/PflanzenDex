import type { ReactNode } from "react";
import { PageHeader } from "../../../../shared/patterns/navigation/page-header/page-header";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../../../shared/patterns/elements/segmented-control/segmented-control";

/**
 * The title area of the destination "Sammlung" (US-QS-14, US-QS-32): the one main heading, in the top bar below `md`, and a
 * small count line when the shown view has loaded, then the switch between the views. The name stays the same in every
 * mode; the selected segment names the mode (SG-HEAD-01). Takes data and callbacks only (DS-44).
 */
export function SammlungHeader<V extends string>(props: {
  view: V;
  options: readonly SegmentedOption<V>[];
  onChoose: (v: V) => void;
  caption: string | null;
  /** The destination title and the name of the switch; the default is the Sammlung. */
  title?: string;
  switchLabel?: string;
  /** A second control that belongs to the chosen view, e.g. the arrangement of the species. */
  children?: ReactNode;
  /** A control beside the heading, e.g. the opener of the layer "Ansicht" (US-QS-19); it goes into the bar below `md`. */
  action?: ReactNode;
  /** Keeps the title in the content below `md` too: a destination that is not on the top bar yet (US-QS-32). */
  inContent?: boolean;
}) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      <PageHeader
        title={props.title ?? "Sammlung"}
        {...(props.action ? { action: props.action } : {})}
        {...(props.inContent ? { inContent: true } : {})}
      />
      {props.caption ? <p className="text-sm text-muted-foreground">{props.caption}</p> : null}
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
