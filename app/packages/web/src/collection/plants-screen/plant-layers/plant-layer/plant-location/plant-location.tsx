import type { LightLocation, SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { LocateControl } from "../../../../markers/locate/locate-control/locate-control";
import { Actions, Quiet } from "../../../../specimens/cards/parts/parts";
import { UNKNOWN, zoneText } from "../../../../specimens/model/text";

/**
 * "Standort" (US-QS-23): the location and the light zone with where the zone comes from (unknown reads "unbekannt",
 * P-08), and the actions that change them: the own light zone (US-LIC-02) and the location, chosen from the own
 * locations (US-PHA-03). Without any location the control sends to the management (P-09).
 */
export function PlantLocation(props: {
  card: SpecimenCard;
  locations?: readonly LightLocation[] | undefined;
  busy?: boolean;
  onLocate?: ((locationId: string, success: string) => void) | undefined;
  onLightZone?: (() => void) | undefined;
  onManage?: (() => void) | undefined;
}) {
  const { card } = props;
  return (
    <div className="grid gap-2">
      <Quiet>Standort: {card.location ?? UNKNOWN}</Quiet>
      <Quiet>Lichtzone: {zoneText(card)}</Quiet>
      {props.onLightZone ? (
        <Actions>
          <Button
            type="button"
            variant="outline"
            aria-label={`Lichtzone ändern: ${card.name}`}
            onClick={props.onLightZone}
          >
            Lichtzone ändern
          </Button>
        </Actions>
      ) : null}
      {props.locations && props.onLocate ? (
        <LocateControl
          specimenName={card.name}
          locations={props.locations}
          busy={props.busy ?? false}
          onLocate={props.onLocate}
          onCreateLocation={props.onManage ?? (() => undefined)}
        />
      ) : null}
    </div>
  );
}
