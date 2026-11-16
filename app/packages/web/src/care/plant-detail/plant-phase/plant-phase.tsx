import { useCallback } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { useLocation, useSearchParams } from "react-router";
import { Button } from "@/shared/ui/button/button";
import { LoadFrame, useInvalidate, useQueryClient } from "../../../shared/data";
import { sharedLocations } from "../../../light";
import { loadCarePhases } from "../../shared/api/care-phases-api";
import { Entry } from "../../phases/phases-list/entry/entry";
import { switchedText } from "../../phases/phase-groups";
import { usePhaseSwitch } from "../../phases/use-phase-switch";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./plant-phase.de.json";

const ui = texts(table);
type Token = () => Promise<string | undefined>;

/**
 * The part of "Pflege" in the plant layer's address (plant-care-tab, `teil`) and its value for the own care profile: the
 * dormancy period is entered there (US-QS-32). The address is the link between the two parts, so no module is imported.
 */
const PART_PARAM = "teil";
const PROFILE_PART = "profil";

const Loading = ({ text }: { text: string }) => (
  <p role="status" className="text-sm text-muted-foreground">
    {text}
  </p>
);

type Phase = { row: PhasesRow | null; locations: readonly LightLocation[] };

/** The care phase of this plant with "Jetzt umgestellt" (US-PHA-01, US-PHA-03); an unknown phase says so (P-08). */
export function PhaseOfPlant(props: { api: string; token: Token; specimenId: string }) {
  const { api, token, specimenId } = props;
  const again = useInvalidate(["care", "phases"]);
  const move = usePhaseSwitch(api, token, again);
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  // Replaces the entry like the segments do, so Back still closes the layer in one step (US-QS-23).
  const openProfile = () => {
    const next = new URLSearchParams(params);
    next.set(PART_PARAM, PROFILE_PART);
    setParams(next, { replace: true, state: location.state });
  };
  const load = useCallback(
    async (t: string) => {
      const [p, l] = await Promise.all([loadCarePhases(api, t), sharedLocations(client, api, t)]);
      if (!p.ok) return p;
      if (!l.ok) return l;
      const row = p.value.find((r) => r.specimenId === specimenId) ?? null;
      return { ok: true as const, value: { row, locations: l.value } };
    },
    [api, specimenId, client],
  );
  return (
    <>
      {move.message ? <StatusNote>{move.message}</StatusNote> : null}
      {move.error ? <RefusalAlert error={move.error} /> : null}
      {/* Its own key below the prefix of the grouping's key: the grouping reads the list of rows under ["care", "phases"],
          this part one row; a shared key handed the grouping the wrong shape (US-PHA-01). The prefix still refreshes both. */}
      <LoadFrame
        queryKey={["care", "phases", "plant", specimenId]}
        token={token}
        load={load}
        loadingText={ui("loading")}
        loadingStatus={<Loading text={ui("loading")} />}
      >
        {(data: Phase) =>
          data.row ? (
            <Entry
              bare
              row={data.row}
              locations={data.locations}
              busy={move.running}
              onConfirm={(ids) =>
                void move.confirm(ids, switchedText([data.row as PhasesRow], data.locations))
              }
            />
          ) : (
            <div className="flex flex-col items-start gap-1">
              <p className="m-0 text-sm text-muted-foreground">{ui("unknown")}</p>
              <Button type="button" variant="ghost" onClick={openProfile}>
                {ui("enterDormancy")}
              </Button>
            </div>
          )
        }
      </LoadFrame>
    </>
  );
}
