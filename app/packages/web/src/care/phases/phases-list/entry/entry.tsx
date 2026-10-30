import { phaseStatus, type LightLocation, type PhasesRow } from "@pflanzendex/core";
import { Button } from "@/components/ui/button/button";
import { CARD_CLASSES, WARNING_CLASSES } from "../../../shared/notices/notices";
import { PHASE_TEXT, locationText, nextChangeText } from "../../../shared/text";
import { needsSwitch, switchedText } from "../../phase-groups";

/** Called with the specimens to switch and the text to show afterwards; without it the list only shows. */
export type Confirm = (specimenIds: readonly string[], success: string) => void;

/** The hint and the button "Jetzt umgestellt" of an entry whose plant has to move (US-PHA-03). */
function SwitchAction(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm;
}) {
  const { row: z } = props;
  return (
    <>
      <p className="font-semibold">
        Stelle die Pflanze an den Soll-Standort und tippe dann „Jetzt umgestellt“.
      </p>
      <Button
        type="button"
        size="touch"
        className="mt-2"
        disabled={props.busy}
        aria-label={`Jetzt umgestellt: ${z.name}`}
        onClick={() => props.onConfirm([z.specimenId], switchedText([z], props.locations))}
      >
        Jetzt umgestellt
      </Button>
    </>
  );
}

/** The first hint as a chip; further hints are counted and stay reachable as text and title (P-10). */
function HintChip({ hints }: { hints: readonly string[] }) {
  if (hints.length === 0) return null;
  return (
    <p
      title={hints.join(" ")}
      className="mt-1 w-fit rounded-full border border-warning-border bg-warning px-2 py-0.5 text-xs font-semibold text-warning-foreground"
    >
      {hints[0]}
      {hints.length > 1 && (
        <>
          {" "}
          <span>+{hints.length - 1} weitere</span>
          <span className="sr-only">: {hints.slice(1).join(" ")}</span>
        </>
      )}
    </p>
  );
}

/**
 * The compact card of the paged grouping (US-QS-19): the name, one line of facts, one line of the place, one hint and the
 * one action, so a page of cards fits the window. Every fact of the full card stays, only the boxes and repeats go.
 */
function CompactEntry(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
}) {
  const { row: z, locations } = props;
  const status = phaseStatus(z);
  const canSwitch = props.onConfirm !== undefined && needsSwitch(z);
  const here = locationText(locations, z.locationId);
  const target = locationText(locations, z.targetLocationId);
  const hints = [
    z.nextChange === null ? "Prüfe den Ruhephasen-Zeitraum im Pflegeprofil der Art." : null,
    status === "location_missing" && !canSwitch
      ? "Weise der Pflanze unter „Hinweise“ einen Standort zu."
      : null,
    status === "in_place" && z.targetLocationId === null
      ? `Wähle im Pflegeprofil der Art einen Soll-Standort für die ${PHASE_TEXT[z.phase]}.`
      : null,
  ].filter((h): h is string => h !== null);
  return (
    <div className={`${CARD_CLASSES} flex flex-col gap-0 px-3 py-2 text-sm leading-snug`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 text-base font-semibold">{z.name}</h3>
        {canSwitch && (
          <Button
            type="button"
            size="touch"
            variant="secondary"
            className="shrink-0"
            disabled={props.busy}
            aria-label={`Jetzt umgestellt: ${z.name}`}
            onClick={() => props.onConfirm?.([z.specimenId], switchedText([z], locations))}
          >
            Jetzt umgestellt
          </Button>
        )}
      </div>
      <p>
        <span>Soll-Phase heute: {PHASE_TEXT[z.phase]}</span> ·{" "}
        <span>{nextChangeText(z.nextChange)}</span>
      </p>
      {status === "location_missing" ? (
        <p className="font-semibold text-warning-foreground">
          Standort fehlt · Soll-Standort: {target}
        </p>
      ) : (
        <p className={status === "deviation" ? "font-semibold" : "text-muted-foreground"}>
          Standort: {here} · Soll-Standort: {target}
          {status === "deviation" ? " · Weicht ab" : ""}
        </p>
      )}
      <HintChip hints={hints} />
    </div>
  );
}

export function Entry(props: {
  row: PhasesRow;
  locations: readonly LightLocation[];
  busy: boolean;
  onConfirm: Confirm | undefined;
  /** A `div` instead of a list item, for a host that already wraps the entry in one (US-QS-19). */
  bare?: boolean;
}) {
  if (props.bare) return <CompactEntry {...props} />;
  const { row: z, locations } = props;
  const Root = props.bare ? "div" : "li";
  const status = phaseStatus(z);
  const canSwitch = props.onConfirm !== undefined && needsSwitch(z);
  return (
    <Root className={`${CARD_CLASSES} flex flex-col gap-1`}>
      <h3 className="font-semibold">{z.name}</h3>
      <p>Soll-Phase heute: {PHASE_TEXT[z.phase]}</p>
      <p>{nextChangeText(z.nextChange)}</p>
      {z.nextChange === null && (
        <p className="font-semibold">Prüfe den Ruhephasen-Zeitraum im Pflegeprofil der Art.</p>
      )}
      {status === "location_missing" ? (
        <p className={WARNING_CLASSES}>Standort fehlt</p>
      ) : (
        <p className="text-muted-foreground">Standort: {locationText(locations, z.locationId)}</p>
      )}
      <p className="text-muted-foreground">
        Soll-Standort: {locationText(locations, z.targetLocationId)}
      </p>
      {status === "deviation" && (
        <p className={WARNING_CLASSES}>
          Weicht ab: steht am Standort „{locationText(locations, z.locationId)}“, Soll ist „
          {locationText(locations, z.targetLocationId)}“.
        </p>
      )}
      {status === "location_missing" && !canSwitch && (
        <p className="font-semibold">Weise der Pflanze unter „Hinweise“ einen Standort zu.</p>
      )}
      {status === "in_place" && z.targetLocationId === null && (
        <p className="font-semibold">
          Wähle im Pflegeprofil der Art einen Soll-Standort für die {PHASE_TEXT[z.phase]}.
        </p>
      )}
      {canSwitch && (
        <SwitchAction
          row={z}
          locations={locations}
          busy={props.busy}
          onConfirm={props.onConfirm as Confirm}
        />
      )}
    </Root>
  );
}
