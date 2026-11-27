import { phaseStatus, type LightLocation, type PhasesRow } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";
import { texts } from "@/shared/lib/text-rules/texts";
import { CARD_CLASSES, WARNING_CLASSES } from "../../../../shared/notices/notices";
import { PHASE_TEXT, locationText, nextChangeText } from "../../../../shared/text";
import { needsSwitch, switchedText } from "../../../phase-groups";
import table from "../../phases-list.de.json";
import type { Confirm } from "../entry-types";

const ui = texts(table);

/** The hint and the button "Umstellen" of an entry whose plant has to move (US-PHA-03). */
function SwitchAction(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm;
}) {
  const { row: z } = props;
  return (
    <>
      <p className="font-semibold">{ui("switchHint")}</p>
      <Button
        type="button"
        size="touch"
        className="mt-2"
        disabled={props.busy}
        aria-label={ui("switchLabel", { name: z.name })}
        onClick={() => props.onConfirm([z.specimenId], switchedText([z], props.locations))}
      >
        {ui("switch")}
      </Button>
    </>
  );
}

/**
 * The full card of the unpaged list (US-PHA-01): the name, the phase with its next change, the place and its target, the
 * warning of a deviation and the action where the plant has to move. Used where no plant layer is opened (the list
 * without a host, and the care-phase page of a plant without its own row).
 */
export function CardEntry(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
}) {
  const { row: z, locations } = props;
  const status = phaseStatus(z);
  const canSwitch = props.onConfirm !== undefined && needsSwitch(z);
  return (
    <li className={cn(CARD_CLASSES, "flex flex-col gap-1")}>
      <h3 className="font-semibold">{z.name}</h3>
      <p>{ui("phaseLine", { phase: PHASE_TEXT[z.phase] })}</p>
      <p>{nextChangeText(z.nextChange)}</p>
      {z.nextChange === null && <p className="font-semibold">{ui("hintReview")}</p>}
      {status === "location_missing" ? (
        <p className="font-semibold">{ui("locationMissing")}</p>
      ) : (
        <p className="text-muted-foreground">
          {ui("place", { place: locationText(locations, z.locationId) })}
        </p>
      )}
      <p className="text-muted-foreground">
        {ui("targetPlace", { place: locationText(locations, z.targetLocationId) })}
      </p>
      {status === "deviation" && (
        <p className={WARNING_CLASSES}>
          {ui("deviationFull", {
            here: locationText(locations, z.locationId),
            target: locationText(locations, z.targetLocationId),
          })}
        </p>
      )}
      {status === "location_missing" && !canSwitch && (
        <p className="font-semibold">{ui("hintLocation")}</p>
      )}
      {status === "in_place" && z.targetLocationId === null && (
        <p className="font-semibold">{ui("hintTarget", { phase: PHASE_TEXT[z.phase] })}</p>
      )}
      {canSwitch && (
        <SwitchAction
          row={z}
          locations={locations}
          busy={props.busy}
          onConfirm={props.onConfirm as Confirm}
        />
      )}
    </li>
  );
}
