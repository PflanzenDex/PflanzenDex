import type { ReactNode } from "react";
import { zoneLabel, type SpecimenCard } from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
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
 * measurement, the growth trend of the own history (a slot of `care`, P-08), the state and the open treatment; "Behandeln" and
 * "Notizen" are plain buttons. The quick actions "Messen", "Gießen" and "Foto" stand under the title of the layer, not here
 * (`QuickActions`, owner decision 2026-11-22, issue 2424), and so does the result of "Gießen", in a line under the row (owner
 * decision d-130, issue 2536): the "Art · Status" line below is a plain line again.
 */
export function PlantOverview(props: {
  card: SpecimenCard;
  access: PhotoAccess;
  /** The growth trend; without it the overview says "unbekannt". */
  growth?: ReactNode;
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
      {/* Two plain buttons side by side; when the labels do not fit (200 % text, NFR-13) a button moves to the next row.
          The private notes open as their own layer (US-BES-18). */}
      <div className="flex flex-wrap gap-2 [&>button]:grow [&>button]:basis-1/4">
        <Button
          type="button"
          variant="plain"
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
