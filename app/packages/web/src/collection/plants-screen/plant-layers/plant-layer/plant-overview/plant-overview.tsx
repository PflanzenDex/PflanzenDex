import type { ReactNode } from "react";
import type { SpecimenCard } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import type { PhotoAccess } from "@/lib/use-stored-photo";
import { Photo, Quiet } from "../../../../specimens/cards/parts/parts";
import {
  Measurement,
  Provenance,
  STATUS_TEXT,
  Treatment,
} from "../../../../specimens/cards/specimen-card/specimen-card";
import { UNKNOWN } from "../../../../specimens/model/text";
import { tileState } from "../../../rows/plant-tile/plant-tile";

/** The one primary action of the layer on this tab: measuring, the first thing next to a plant (P-11, US-QS-23). */
export function MeasureButton(props: { card: SpecimenCard; onMeasure: () => void }) {
  return (
    <Button
      type="button"
      size="touch"
      className="w-full"
      aria-label={`Messen: ${props.card.name}`}
      onClick={props.onMeasure}
    >
      Messen
    </Button>
  );
}

/**
 * "Überblick" (US-QS-23): fits the layer without scroll on a phone. The latest photo as a thumbnail beside the last
 * measurement, the growth trend of the own history (a slot of `care`, P-08), the state and the open treatment; "Gießen"
 * (a slot of `monitoring`) and "Behandeln" are outline buttons, the filled "Messen" sits in the layer's primary slot.
 */
export function PlantOverview(props: {
  card: SpecimenCard;
  access: PhotoAccess;
  /** The growth trend; without it the overview says "unbekannt". */
  growth?: ReactNode;
  /** The button "Gießen". */
  water?: ReactNode;
  /** Opens the planning of a treatment (tab "Pflege"). */
  onTreat: () => void;
}) {
  const { card } = props;
  const state = tileState(card);
  return (
    <div className="grid gap-3">
      <div className="flex gap-3">
        <Photo card={card} access={props.access} compact />
        <div className="grid min-w-0 content-start gap-1 text-sm">
          <Measurement card={card} />
        </div>
      </div>
      {props.growth ?? <Quiet>Trend: {UNKNOWN}</Quiet>}
      <p>
        Zustand: <strong data-attention={state.attention}>{state.text}</strong>
      </p>
      <Treatment card={card} />
      <Quiet>
        Art: {card.speciesName ?? UNKNOWN} · Status: {STATUS_TEXT[card.status]}
      </Quiet>
      <Provenance value={card.provenance} />
      <div className="grid grid-cols-2 gap-2">
        {props.water}
        <Button
          type="button"
          variant="outline"
          aria-label={`Behandeln: ${card.name}`}
          onClick={props.onTreat}
        >
          Behandeln
        </Button>
      </div>
    </div>
  );
}
