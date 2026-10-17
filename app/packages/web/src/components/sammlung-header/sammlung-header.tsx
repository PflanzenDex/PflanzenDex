import type { ReactNode } from "react";
import { SegmentedControl, type SegmentedOption } from "../segmented-control/segmented-control";

/**
 * The title area of the destination "Sammlung" (US-QS-14): the one main heading, a small count line when the shown
 * view has loaded, and the switch between the views. Takes data and callbacks only (DS-44).
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
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{props.title ?? "Sammlung"}</h1>
        {props.caption ? <p className="text-sm text-muted-foreground">{props.caption}</p> : null}
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
