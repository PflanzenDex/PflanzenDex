import { SegmentedControl, type SegmentedOption } from "../../segmented-control/segmented-control";
import { Button } from "../../ui/button/button";

/**
 * The controls below the switch of the plants in the Sammlung (US-QS-14): how the plants are grouped (all, by care
 * phase, by location) and the way to the management of the locations and light zones. Takes data and callbacks only (DS-44).
 */
export function PlantControls<G extends string>(props: {
  group: G;
  options: readonly SegmentedOption<G>[];
  onGroup: (g: G) => void;
  onManage: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedControl
        label="Gruppierung der Pflanzen"
        options={props.options}
        value={props.group}
        onChange={props.onGroup}
      />
      <Button type="button" variant="secondary" size="sm" onClick={props.onManage}>
        Standorte verwalten
      </Button>
    </div>
  );
}
