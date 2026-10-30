import type { LightLocation, SpecimenHint } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { Actions, CARD, NextAction } from "../../../specimens/cards/parts/parts";
import { LocateControl } from "../../../markers/locate/locate-control/locate-control";

/** Where a hint is fixed: the app wires the target to a tab (the modules do not know each other). */
export type HintTarget = "collection" | "light";

/** Hints with a link to the place that fixes them; "location missing" is fixed right here (US-PHA-03). */
const ACTION: Partial<Record<SpecimenHint["kind"], { target: HintTarget; label: string }>> = {
  species_missing: { target: "collection", label: "Zur Sammlung" },
  location_without_zone: { target: "light", label: "Standorte verwalten" },
};

/** A hint of the section "Fehlt noch": the warning tokens say it needs a step, the text says which (US-QS-14). */
const HOST_CARD =
  "grid min-w-0 content-start gap-1 break-words rounded-card bg-warning p-3 text-warning-foreground shadow-elevation-1";

export function HintCard(props: {
  host: boolean;
  hint: SpecimenHint;
  locations: readonly LightLocation[];
  busy: boolean;
  onOpen: (t: HintTarget) => void;
  onLocate: (specimenId: string, locationId: string, success: string) => void;
}) {
  const { hint: h } = props;
  const action = ACTION[h.kind];
  return (
    <div className={props.host ? HOST_CARD : CARD}>
      <p>{h.text}</p>
      <NextAction>{h.nextAction}</NextAction>
      {h.kind === "location_missing" && (
        <LocateControl
          specimenName={h.specimenName}
          locations={props.locations}
          busy={props.busy}
          onLocate={(locationId, success) => props.onLocate(h.specimenId, locationId, success)}
          onCreateLocation={() => props.onOpen("light")}
        />
      )}
      {action && (
        <Actions>
          <Button type="button" variant="outline" onClick={() => props.onOpen(action.target)}>
            {action.label}
          </Button>
        </Actions>
      )}
    </div>
  );
}
