import type { PhasesRow } from "@pflanzendex/core";
import { useLocation, useSearchParams } from "react-router";
import { Button } from "@/shared/ui/button";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  PLANT_LOCATION_TAB,
  PLANT_TAB_PARAM,
  plantLayerId,
} from "@/shared/patterns/navigation/navigation/navigation";
import table from "../../phases-list.de.json";

const ui = texts(table);

/**
 * The Standort tab in the plant's own layer, replaced like the tab choice of the layer (`usePlantTab`), so Back still
 * closes the layer in one step (US-QS-32, issue 2150).
 */
function useShowLocationTab(): () => void {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  return () => {
    const next = new URLSearchParams(params);
    next.set(PLANT_TAB_PARAM, PLANT_LOCATION_TAB[PLANT_TAB_PARAM]);
    setParams(next, { replace: true, state: location.state });
  };
}

/**
 * "Standort setzen" of a plant without a location (US-QS-32, issue 2150), in the hint line under the row beside the chip
 * "Kein Standort". It opens the plant's own location choice (the Standort tab, FR-PHA-03). With `opens` false the row
 * already shows the plant, so the click only switches that layer to its Standort tab.
 */
export function LocateAction(props: { row: PhasesRow; opens: boolean }) {
  const { openLayer } = useLayer(plantLayerId(props.row.specimenId));
  const showLocation = useShowLocationTab();
  return (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0 px-3"
      aria-label={ui("locateLabel", { name: props.row.name })}
      onClick={(event) =>
        props.opens ? openLayer(event.currentTarget, PLANT_LOCATION_TAB) : showLocation()
      }
    >
      {ui("locate")}
    </Button>
  );
}
