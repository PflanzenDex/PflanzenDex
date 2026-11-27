import {
  phaseStatus,
  type LightLocation,
  type PhaseStatus,
  type PhasesRow,
} from "@pflanzendex/core";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { ObjectRow } from "@/shared/lists/object-row/object-row";
import { useObjectPhoto } from "@/shared/lists/object-row/use-object-photo";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import type { PhotoAccess } from "@/shared/platform/browser/use-stored-photo";
import { texts } from "@/shared/lib/text-rules/texts";
import { plantLayerId } from "@/shared/patterns/navigation/navigation/navigation";
import { PHASE_TEXT, locationText, nextChangeText } from "../../../shared/text";
import { needsSwitch, switchedText } from "../../phase-groups";
import table from "../phases-list.de.json";
import { CardEntry } from "./card-entry/card-entry";
import { LocateAction } from "./locate-action/locate-action";
import type { Confirm } from "./entry-types";

export type { Confirm } from "./entry-types";

const ui = texts(table);

/**
 * The first hint as a chip, neutral: a hint names the next step of a missing entry, it is no deviation (SG-COLOR-04). Further
 * hints are counted and stay reachable as text and title (P-10).
 */
function HintChip({ hints }: { hints: readonly string[] }) {
  if (hints.length === 0) return null;
  return (
    <p
      title={hints.join(" ")}
      className="mt-1 w-fit rounded-full border border-transparent bg-secondary px-2 py-0.5 text-xs font-semibold text-foreground"
    >
      {hints[0]}
      {hints.length > 1 && (
        <>
          {" "}
          <span>{ui("moreHints", { count: hints.length - 1 })}</span>
          <span className="sr-only">: {hints.slice(1).join(" ")}</span>
        </>
      )}
    </p>
  );
}

/**
 * The one trailing badge of a phase row when there is no action (SG-LIST-03): the place only when it deviates (amber,
 * "Weicht ab"). A plant in place shows no place (owner answer Q-82); a missing place is the action (US-QS-32).
 */
function placeBadge(status: PhaseStatus) {
  if (status === "deviation") return <Badge variant="warning">{ui("deviates")}</Badge>;
  return undefined;
}

/**
 * The meta line of a phase row (US-QS-32): the species first where the plant has its own name (owner answer Q-68), then
 * the target where the plant has to move (`Soll-Standort` only where it differs, owner rule of issue 1915), otherwise the next
 * change of US-PHA-04 ("heute", "in 5 Tagen (date)", or the date).
 */
function metaOf(z: PhasesRow, locations: readonly LightLocation[], moves: boolean): string {
  const second = moves
    ? ui("targetPlace", { place: locationText(locations, z.targetLocationId) })
    : nextChangeText(z.nextChange);
  return z.marker ? `${z.speciesName} · ${second}` : second;
}

/**
 * The hints under a phase row, the next step of an entry that is missing (P-09, P-10): a missing location with a target
 * keeps the switch hint (the place fact moves into the action), a missing location without one says "Kein Standort" (the
 * action "Standort setzen" sits beside the chip under the row, US-QS-32), and a plant without a target names what to choose.
 */
function rowHints(z: PhasesRow, status: PhaseStatus, canSwitch: boolean): string[] {
  const location =
    status === "location_missing" ? (canSwitch ? ui("switchHint") : ui("noLocation")) : null;
  return [
    z.nextChange === null ? ui("hintReview") : null,
    location,
    status === "in_place" && z.targetLocationId === null
      ? ui("hintTarget", { phase: PHASE_TEXT[z.phase] })
      : null,
  ].filter((h): h is string => h !== null);
}

/**
 * The row of the paged grouping "Nach Pflegephase" (US-QS-19, US-QS-32): the plant row of the list "Alle", so the row opens
 * the plant in its layer the same way, with its thumbnail, its own name as the title (owner answer Q-68), the meta line of
 * `metaOf`, and one trailing element or the action where the plant has to move. The hints stay under the row (P-09, P-10).
 */
function CompactEntry(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
  access: PhotoAccess | undefined;
  /** `false` where the row already shows its plant (the plant's own care part): the row then opens nothing. */
  opens: boolean;
}) {
  const { row: z, locations } = props;
  const { openLayer, open } = useLayer(plantLayerId(z.specimenId));
  const [ref, src] = useObjectPhoto(props.access, z.photo?.url);
  const status = phaseStatus(z);
  const moves = needsSwitch(z);
  const canSwitch = props.onConfirm !== undefined && moves;
  // A missing location without a switch: no trailing element, the action "Standort setzen" sits in the hint line (US-QS-32).
  const locate = status === "location_missing" && !canSwitch;
  const action = canSwitch ? (
    <Button
      type="button"
      variant="secondary"
      className="shrink-0 px-3"
      disabled={props.busy}
      aria-label={ui("switchLabel", { name: z.name })}
      onClick={() => props.onConfirm?.([z.specimenId], switchedText([z], locations))}
    >
      {ui("switch")}
    </Button>
  ) : undefined;
  const hints = <HintChip hints={rowHints(z, status, canSwitch)} />;
  return (
    <div className="flex flex-col gap-1">
      <ObjectRow
        rootRef={ref}
        src={src}
        title={z.marker || z.name}
        meta={metaOf(z, locations, moves)}
        trailing={canSwitch ? undefined : placeBadge(status)}
        action={action}
        haspopup={props.opens ? "dialog" : undefined}
        expanded={props.opens ? open : undefined}
        onClick={props.opens ? (event) => openLayer(event.currentTarget) : undefined}
      />
      {locate ? (
        // The chip and the action share one line; the line wraps at large text, so the row keeps its full width (issue 2150).
        <div className="flex flex-wrap items-center gap-2">
          {hints}
          <LocateAction row={z} opens={props.opens} />
        </div>
      ) : (
        hints
      )}
    </div>
  );
}

export function Entry(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
  /** A row of the paged grouping: the plant row, which the list wraps in its own list item (US-QS-19). */
  bare?: boolean | undefined;
  /** The access to the photos of the rows (the paged grouping); without it the thumbnail is the placeholder. */
  access?: PhotoAccess | undefined;
  /** A bare row opens its plant unless the host already shows that plant (`false`, the plant's own care part). */
  opens?: boolean | undefined;
}) {
  if (props.bare)
    return (
      <CompactEntry
        row={props.row}
        locations={props.locations}
        busy={props.busy}
        onConfirm={props.onConfirm}
        access={props.access}
        opens={props.opens !== false}
      />
    );
  return (
    <CardEntry
      row={props.row}
      locations={props.locations}
      busy={props.busy}
      onConfirm={props.onConfirm}
    />
  );
}
