import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button/button";

/** The id of the layer "Ansicht" (`?sheet=view`, US-QS-19). */
export const VIEW_LAYER = "view";

/**
 * The layer "Ansicht" of the Sammlung (US-QS-19, issue 1096): how the plants are grouped (`group=`, with the way to the
 * management of locations and light zones) or how the species are arranged (`sort=`). Takes data and callbacks only
 * (DS-44); the area wires the address.
 */
export function ViewLayer<G extends string>(props: {
  group: G;
  options: readonly { value: G; label: string }[];
  onGroup: (g: G) => void;
  /** The name of the group of choices, e.g. "Gruppierung der Pflanzen". */
  label: string;
  onManage?: () => void;
}) {
  return (
    <LayerSheet id={VIEW_LAYER} title="Ansicht">
      <div className="flex flex-col gap-4">
        <div role="group" aria-label={props.label} className="flex flex-col gap-2">
          {props.options.map((o) => {
            const selected = o.value === props.group;
            return (
              <Button
                key={o.value}
                type="button"
                variant={selected ? "secondary" : "outline"}
                aria-pressed={selected}
                className="justify-start"
                onClick={() => props.onGroup(o.value)}
              >
                {selected ? <span aria-hidden="true">✓</span> : null}
                {o.label}
              </Button>
            );
          })}
        </div>
        {props.onManage ? (
          <Button type="button" variant="outline" onClick={props.onManage}>
            Standorte und Lichtzonen verwalten
          </Button>
        ) : null}
      </div>
    </LayerSheet>
  );
}
