import { useCallback } from "react";
import type { LightLocation, SpecimenHint } from "@pflanzendex/core";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { LoadFrame, useInvalidate, useWriteAction } from "../kernel";
import { HintsPageSkeleton } from "./HintsPage.skeleton";
import { Actions, CARD, GRID, NextAction, PageFrame, Quiet, Status, TITLE, Warning } from "./parts";
import { refusalText } from "./refusal";
import { loadLocations } from "../light";
import { loadSpecimenHints } from "./hints-api";
import { setSpecimenLocation } from "./specimens-api";
import { LocateControl } from "./locate-control";

/** Where a hint is fixed: the app wires the target to a tab (the modules do not know each other). */
export type HintTarget = "collection" | "light";

/** Hints with a link to the place that fixes them; "location missing" is fixed right here (US-PHA-03). */
const ACTION: Partial<Record<SpecimenHint["kind"], { target: HintTarget; label: string }>> = {
  species_missing: { target: "collection", label: "Zum Bestand" },
  location_without_zone: { target: "light", label: "Zu Standorte und Licht" },
};

interface Data {
  readonly hints: readonly SpecimenHint[];
  readonly locations: readonly LightLocation[];
}

/**
 * Hints about incomplete specimens (US-BES-08): every one says what is missing and offers the action that fixes it
 * (P-09). An incomplete specimen drops out of evaluations; here it is named instead of vanishing (P-10). A specimen
 * without a location gets one right here, chosen from the own locations (US-PHA-03).
 */
const KEY = ["collection", "hints"] as const;

export function HintsPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: (target: HintTarget) => void;
}) {
  const { api, onOpen, token } = props;
  const again = useInvalidate(KEY);
  const place = useWriteAction(token, again);
  const load = useCallback(
    async (t: string) => {
      const [hints, locations] = await Promise.all([
        loadSpecimenHints(api, t),
        loadLocations(api, t),
      ]);
      if (!hints.ok) return hints;
      if (!locations.ok) return locations;
      return { ok: true as const, value: { hints: hints.value, locations: locations.value } };
    },
    [api],
  );
  return (
    <PageFrame>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText="Hinweise werden geladen …"
        loadingFallback={<HintsPageSkeleton label="Hinweise werden geladen …" />}
      >
        {(data: Data) => (
          <>
            {place.message && <Status>{place.message}</Status>}
            {place.error && (
              <Warning>
                <p>{refusalText(place.error)}</p>
              </Warning>
            )}
            <HintList
              data={data}
              busy={place.running}
              onOpen={onOpen}
              onLocate={(specimenId, locationId, success) =>
                void place.run(
                  (t) => setSpecimenLocation(api, t, { id: specimenId, locationId }),
                  success,
                )
              }
            />
          </>
        )}
      </LoadFrame>
    </PageFrame>
  );
}

function HintCard(props: {
  hint: SpecimenHint;
  locations: readonly LightLocation[];
  busy: boolean;
  onOpen: (t: HintTarget) => void;
  onLocate: (specimenId: string, locationId: string, success: string) => void;
}) {
  const { hint: h } = props;
  const action = ACTION[h.kind];
  return (
    <li className={CARD}>
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
    </li>
  );
}

function HintList(props: {
  data: Data;
  busy: boolean;
  onOpen: (t: HintTarget) => void;
  onLocate: (specimenId: string, locationId: string, success: string) => void;
}) {
  return (
    <section aria-labelledby="hints-title">
      <h1 id="hints-title" className={TITLE}>
        Hinweise
      </h1>
      {props.data.hints.length === 0 ? (
        <EmptyState
          title="Keine Hinweise"
          description="Jedes Exemplar hat eine Art, einen Standort und eine Lichtzone."
          action={{ label: "Zum Bestand", onClick: () => props.onOpen("collection") }}
        />
      ) : (
        <>
          <Quiet className="mb-3">
            Diese Exemplare sind unvollständig und fallen sonst aus Auswertungen wie der Verteilung
            auf die Lichtzonen.
          </Quiet>
          <ul className={GRID}>
            {props.data.hints.map((h) => (
              <HintCard
                key={`${h.specimenId}-${h.kind}`}
                hint={h}
                locations={props.data.locations}
                busy={props.busy}
                onOpen={props.onOpen}
                onLocate={props.onLocate}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
