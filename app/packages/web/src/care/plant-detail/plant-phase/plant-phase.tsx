import { useCallback } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { LoadFrame, useInvalidate } from "../../../kernel";
import { loadLocations } from "../../../light";
import { loadCarePhases } from "../../shared/api/care-phases-api";
import { Entry } from "../../phases/phases-list/entry/entry";
import { switchedText } from "../../phases/phase-groups";
import { usePhaseSwitch } from "../../phases/use-phase-switch";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";

type Token = () => Promise<string | undefined>;
const NO_PHASE =
  "Pflegephase: unbekannt. Für diese Art ist kein Ruhephasen-Zeitraum hinterlegt; trage ihn im Pflegeprofil ein.";

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
  const load = useCallback(
    async (t: string) => {
      const [p, l] = await Promise.all([loadCarePhases(api, t), loadLocations(api, t)]);
      if (!p.ok) return p;
      if (!l.ok) return l;
      const row = p.value.find((r) => r.specimenId === specimenId) ?? null;
      return { ok: true as const, value: { row, locations: l.value } };
    },
    [api, specimenId],
  );
  return (
    <>
      {move.message ? <StatusNote>{move.message}</StatusNote> : null}
      {move.error ? <RefusalAlert error={move.error} /> : null}
      <LoadFrame
        queryKey={["care", "phases"]}
        token={token}
        load={load}
        loadingText="Pflegephase wird geladen …"
        loadingFallback={<Loading text="Pflegephase wird geladen …" />}
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
            <p className="text-sm text-muted-foreground">{NO_PHASE}</p>
          )
        }
      </LoadFrame>
    </>
  );
}
