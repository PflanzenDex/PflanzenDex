import { useCallback, useState } from "react";
import type { LightLocation, SpecimenHint } from "@pflanzendex/core";
import { LoadFrame, useWriteAction } from "../kernel";
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
export function HintsPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: (target: HintTarget) => void;
}) {
  const { api, onOpen, token } = props;
  const [refresh, setRefresh] = useState(0);
  const again = useCallback(() => setRefresh((n) => n + 1), []);
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
    <div className="light collection">
      <LoadFrame
        token={token}
        load={load}
        loadingText="Hinweise werden geladen …"
        refresh={refresh}
      >
        {(data: Data) => (
          <>
            {place.message && (
              <p role="status" className="hint">
                {place.message}
              </p>
            )}
            {place.error && (
              <div role="alert" className="warning">
                <p>{place.error.text}</p>
              </div>
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
    </div>
  );
}

function HintList(props: {
  data: Data;
  busy: boolean;
  onOpen: (t: HintTarget) => void;
  onLocate: (specimenId: string, locationId: string, success: string) => void;
}) {
  return (
    <section aria-labelledby="hints-title" className="specimen-hints">
      <h1 id="hints-title">Hinweise</h1>
      {props.data.hints.length === 0 ? (
        <p>Keine Hinweise: Jedes Exemplar hat eine Art, einen Standort und eine Lichtzone.</p>
      ) : (
        <>
          <p className="quiet">
            Diese Exemplare sind unvollständig und fallen sonst aus Auswertungen wie der Verteilung
            auf die Lichtzonen.
          </p>
          <ul className="cards-grid">
            {props.data.hints.map((h) => {
              const action = ACTION[h.kind];
              return (
                <li key={`${h.specimenId}-${h.kind}`} className="specimen-card">
                  <p>{h.text}</p>
                  <p className="next-action">{h.nextAction}</p>
                  {h.kind === "location_missing" && (
                    <LocateControl
                      specimenName={h.specimenName}
                      locations={props.data.locations}
                      busy={props.busy}
                      onLocate={(locationId, success) =>
                        props.onLocate(h.specimenId, locationId, success)
                      }
                      onCreateLocation={() => props.onOpen("light")}
                    />
                  )}
                  {action && (
                    <div className="actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => props.onOpen(action.target)}
                      >
                        {action.label}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
