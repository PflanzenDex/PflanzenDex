import { Suspense, useRef, type ReactNode } from "react";
import {
  speciesDisplayName,
  zoneDerive,
  type LightZone,
  type Species,
  zoneLabel,
} from "@pflanzendex/core";
import { Select } from "@/shared/ui/select";
import { Label } from "@/shared/ui/label";
import { DelayedSkeleton } from "@/shared/ui/skeleton.delayed";
import { Skeleton } from "@/shared/ui/skeleton";
import { MarkerSection, type MarkerSectionProps } from "@/collection";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { RequestState } from "@/shared/patterns/states/request-state/request-state";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./save-step.de.json";

const ui = texts(table);

/** A block of the field's size while the section's chunk arrives; it shows after the delay (DS-57, issue 1726). */
function FieldSkeleton() {
  return (
    <DelayedSkeleton>
      <Skeleton className="h-20 w-full" />
    </DelayedSkeleton>
  );
}

/** The zone the species needs, derived live from its light demand (FR-BES-10); `null` = unknown (P-08). */
export const derivedZone = (species: Species, zones: readonly LightZone[]): LightZone | null => {
  const d = zoneDerive(
    {
      lightDemandLux: species.lightDemandLux,
      standardLevel: species.standardLevel,
      softLeaf: species.softLeaf,
    },
    zones,
  );
  return d.kind === "zone" ? d.zone : null;
};

/**
 * The light need field: the select with the derived value first. While the zones are missing, the reason and a retry
 * replace the whole block, so no empty list looks like a choice (US-ONB-01, issue 2098, P-10).
 */
function ZoneField(props: {
  zones: readonly LightZone[] | null;
  derived: LightZone | null;
  zoneId: string;
  onZone: (id: string) => void;
  zonesError: string | null | undefined;
  onRetryZones: (() => void) | undefined;
}) {
  // The zones load again by themselves when the device is back online (useOwnZones, issue 2098): `ownOffline` keeps
  // RequestState from loading them a second time (US-QS-32).
  if (props.zonesError)
    return (
      <RequestState
        status="error"
        errorText={props.zonesError}
        onRetry={props.onRetryZones ?? (() => undefined)}
        ownOffline
      />
    );
  return (
    <>
      <Label htmlFor="first-plant-zone">{ui("zoneLabel")}</Label>
      <Select
        id="first-plant-zone"
        value={props.zoneId}
        disabled={props.zones === null}
        onChange={(e) => props.onZone(e.target.value)}
      >
        <option value="">
          {props.derived ? ui("derived", { name: zoneLabel(props.derived.name) }) : ui("unknown")}
        </option>
        {(props.zones ?? []).map((z) => (
          <option key={z.id} value={z.id}>
            {zoneLabel(z.name)}
          </option>
        ))}
      </Select>
      <p className="m-0 text-sm text-muted-foreground">{ui("hint")}</p>
    </>
  );
}

/** The refusal of the save as text; a key conflict of the create also offers "Hinweis schließen" (US-QS-03, P-10). */
function SaveRefusal(props: { text: string; dismiss: (() => void) | undefined }) {
  return (
    <p role="alert">
      {props.text}
      <RefusalClose error={{ dismiss: props.dismiss }} />
    </p>
  );
}

/**
 * Step 2 of the first plant (US-ONB-01): the light need is prefilled from the species as a value to change, never as
 * a question. Empty value = derived, so nothing derived is stored (P-01).
 */
export function SaveStep(props: {
  species: Species;
  zones: readonly LightZone[] | null;
  /** The German reason the zones could not be read or made: the zone block shows it with a retry (issue 2098). */
  zonesError?: string | null;
  /** Loads the zones again after `zonesError` (US-ONB-01, issue 2098). */
  onRetryZones?: () => void;
  /** Empty = the zone derived from the species. */
  zoneId: string;
  onZone: (id: string) => void;
  error: string | null;
  /** Frees the key of a key conflict and clears `error`: "Hinweis schließen" shows only with it (US-QS-03). */
  dismiss?: (() => void) | undefined;
  /**
   * The marker of a further plant (US-BES-03, US-QS-15): its section reads the rule of the species and reports it to
   * the flow, which enables the save with it (issue 1638).
   */
  marker?: Omit<MarkerSectionProps, "speciesId" | "speciesName">;
  /** More fields of the step, e.g. the suggested place of a further plant. */
  children?: ReactNode;
  /** "Schritt n von m": said once, by the focused heading (US-ACC-03, issue 1612). */
  stepLabel?: string;
}) {
  const { species, zones } = props;
  const derived = zones ? derivedZone(species, zones) : null;
  const heading = useRef<HTMLHeadingElement>(null);
  // The retry button leaves the screen when it is pressed: the focus goes to the step's heading, not to the body (issue 2098).
  const retry = () => {
    heading.current?.focus();
    props.onRetryZones?.();
  };
  return (
    <section className="flex flex-col gap-3">
      <h2 ref={heading} tabIndex={-1} className="text-base font-semibold">
        {props.stepLabel && <span className="sr-only">{`${props.stepLabel}:`}</span>}
        {props.stepLabel && " "}
        {ui("title")}
      </h2>
      <p className="m-0">
        <i>{species.latinName}</i>
        {species.germanName ? ` (${species.germanName})` : ""}
      </p>
      {props.marker && (
        // The section arrives with its own chunk (issue 1638): a block of the field's size meanwhile.
        <Suspense fallback={<FieldSkeleton />}>
          <MarkerSection
            key={species.id}
            form={props.marker.form}
            api={props.marker.api}
            token={props.marker.token}
            refusal={props.marker.refusal}
            report={props.marker.report}
            speciesId={species.id}
            speciesName={speciesDisplayName(species)}
          />
        </Suspense>
      )}
      <ZoneField
        zones={zones}
        derived={derived}
        zoneId={props.zoneId}
        onZone={props.onZone}
        zonesError={props.zonesError}
        onRetryZones={retry}
      />
      {props.children}
      {props.error && <SaveRefusal text={props.error} dismiss={props.dismiss} />}
    </section>
  );
}
