import { useCallback } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
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
            <p className="text-sm text-muted-foreground">{ui("unknown")}</p>
          )
        }
      </LoadFrame>
    </>
  );
}
