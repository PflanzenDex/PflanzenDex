import { useCallback } from "react";
import type { SpecimenHint } from "@pflanzendex/core";
import { LoadFrame } from "../kernel";
import { loadSpecimenHints } from "./hints-api";

/** Where a hint is fixed: the app wires the target to a tab (the modules do not know each other). */
export type HintTarget = "collection" | "light";

const ACTION: Record<SpecimenHint["kind"], { target: HintTarget; label: string }> = {
  location_missing: { target: "collection", label: "Zum Bestand" },
  species_missing: { target: "collection", label: "Zum Bestand" },
  location_without_zone: { target: "light", label: "Zu Standorte und Licht" },
};

/**
 * Hints about incomplete specimens (US-BES-08): every one says what is missing and offers the action that fixes it
 * (P-09). An incomplete specimen drops out of evaluations; here it is named instead of vanishing (P-10).
 */
export function HintsPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  onOpen: (target: HintTarget) => void;
}) {
  const { api, onOpen } = props;
  const load = useCallback((t: string) => loadSpecimenHints(api, t), [api]);
  return (
    <div className="light collection">
      <LoadFrame token={props.token} load={load} loadingText="Hinweise werden geladen …">
        {(hints) => <HintList hints={hints} onOpen={onOpen} />}
      </LoadFrame>
    </div>
  );
}

function HintList(props: { hints: readonly SpecimenHint[]; onOpen: (t: HintTarget) => void }) {
  return (
    <section aria-labelledby="hints-title" className="hints">
      <h1 id="hints-title">Hinweise</h1>
      {props.hints.length === 0 ? (
        <p>Keine Hinweise: Jedes Exemplar hat eine Art, einen Standort und eine Lichtzone.</p>
      ) : (
        <>
          <p className="quiet">
            Diese Exemplare sind unvollständig und fallen sonst aus Auswertungen wie der Verteilung
            auf die Lichtzonen.
          </p>
          <ul className="cards-grid">
            {props.hints.map((h) => {
              const action = ACTION[h.kind];
              return (
                <li key={`${h.specimenId}-${h.kind}`} className="specimen-card">
                  <p>{h.text}</p>
                  <p className="next-action">{h.nextAction}</p>
                  <div className="actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => props.onOpen(action.target)}
                    >
                      {action.label}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
