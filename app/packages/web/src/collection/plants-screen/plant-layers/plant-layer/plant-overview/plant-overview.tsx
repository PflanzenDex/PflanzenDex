import type { ReactNode } from "react";
import { zoneLabel, type SpecimenCard } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/display/badge/badge";
import { Button } from "@/shared/ui/button/button";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import { Photo, Quiet } from "../../../../specimens/cards/parts/parts";
import {
  Measurement,
  Provenance,
  STATUS_TEXT,
  Treatment,
} from "../../../../specimens/cards/specimen-card/specimen-card";
import { UNKNOWN } from "../../../../specimens/model/text";
import { tileState } from "../../../rows/plant-tile/plant-tile";
import table from "../../plant-layers.de.json";
import { NotesButton } from "../plant-notes/plant-notes";

const t = texts(table);

/** The one primary action of the layer on this tab: measuring, the first thing next to a plant (P-11, US-QS-23). */
export function MeasureButton(props: { card: SpecimenCard; onMeasure: () => void }) {
  return (
    <Button
      type="button"
      size="touch"
      className="w-full"
      aria-label={t("overview.measureLabel", { name: props.card.name })}
      onClick={props.onMeasure}
    >
      {t("overview.measure")}
    </Button>
  );
}

/**
 * Light zone, location and the open treatment as text chips (P-08: unknown reads as such). A long chip wraps inside its
 * pill, so the row keeps the "Mehr" button inside the window at 200 % text (NFR-13, issue 1228).
 */
export function Chips({ card }: { card: SpecimenCard }) {
  return (
    <ul aria-label={t("chips.label")} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
      <li>
        <Badge variant="outline" className="whitespace-normal">
          {card.lightZone ? zoneLabel(card.lightZone) : t("chips.zoneUnknown")}
        </Badge>
      </li>
      <li>
        <Badge variant="outline" className="whitespace-normal">
          {card.location ?? t("chips.locationUnknown")}
        </Badge>
      </li>
      {card.treatment ? (
        <li>
          <Badge variant="warning" className="whitespace-normal">
            {t("chips.treatment")}
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}

/**
 * "Überblick" (US-QS-23): fits the layer without scroll on a phone. The latest photo as a thumbnail beside the last
 * measurement, the growth trend of the own history (a slot of `care`, P-08), the state and the open treatment; "Gießen"
 * (a slot of `monitoring`), "Behandeln" and "Notizen" are outline buttons, the filled "Messen" sits in the layer's
 * primary slot.
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
    // The column is exactly as wide as the layer (NFR-13): an `auto` track would grow to the widest row at 200 % text.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
      {/* The last measurement sits beside the photo; when its longest word no longer fits there, it moves below the photo. */}
      <div className="flex flex-wrap gap-3">
        <Photo card={card} access={props.access} compact />
        <div className="grid min-w-min flex-1 content-start gap-1 text-sm">
          <Measurement card={card} />
        </div>
      </div>
      {props.growth ?? <Quiet>{t("overview.trend", { value: UNKNOWN })}</Quiet>}
      <div className="grid gap-1.5 text-sm">
        <Treatment card={card} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
        <p>
          {t("overview.state")} <strong data-attention={state.attention}>{state.text}</strong>
        </p>
        <Quiet>
          {t("overview.facts", {
            species: card.speciesName ?? UNKNOWN,
            status: STATUS_TEXT[card.status],
          })}
        </Quiet>
      </div>
      <Provenance value={card.provenance} />
      {/* Three buttons side by side: the row costs no height at 360 px, where the overview has about 10 px left (US-QS-23).
          When the labels do not fit (200 % text, NFR-13) a button moves to the next row. A message of "Gießen" always takes
          a row of its own. The private notes open as their own layer (US-BES-18). */}
      <div className="flex flex-wrap gap-2 [&>button]:grow [&>button]:basis-1/4 [&>p]:basis-full">
        {props.water}
        <Button
          type="button"
          variant="outline"
          aria-label={t("overview.treatLabel", { name: card.name })}
          onClick={props.onTreat}
        >
          {t("overview.treat")}
        </Button>
        <NotesButton card={card} />
      </div>
    </div>
  );
}
