import type { MouseEventHandler, ReactNode } from "react";
import { Button } from "@/shared/ui/button";
import { BUSY_LOOK } from "@/shared/lib/utils";
import type { useFirstPlant } from "../../use-first-plant";

/** What the button reads of the first-plant flow: the save and the three things it waits for. */
type Flow = Pick<
  ReturnType<typeof useFirstPlant>,
  "save" | "saving" | "zones" | "zonesError" | "marker"
>;

/**
 * The save of the first-plant steps (US-QS-03, US-ONB-01). It cannot run while the zones or the marker rule of the species
 * are read, or while the save runs (the press then does nothing). The button is `aria-disabled`, not `disabled`: it keeps
 * the keyboard focus (PF-045, `BUSY_LOOK`). While the wait is a load or the save itself it also shows a spinner and
 * `aria-busy`, so a press that is ignored is seen to wait and never a silent no-op (P-10). Waiting for zones that failed is
 * not busy: the zone block shows that reason with its retry.
 */
export function SaveButton(props: {
  f: Flow;
  onMouseDown?: MouseEventHandler<HTMLButtonElement> | undefined;
  children: ReactNode;
}) {
  const { f } = props;
  const blocked = f.saving || f.zones === null || f.marker.rule === null;
  const busy = blocked && !f.zonesError;
  return (
    <Button
      type="button"
      aria-disabled={blocked || undefined}
      aria-busy={busy || undefined}
      className={BUSY_LOOK}
      onMouseDown={props.onMouseDown}
      onClick={() => {
        if (!blocked) void f.save();
      }}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
        />
      ) : null}
      {props.children}
    </Button>
  );
}
