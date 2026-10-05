import { useCallback } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { loadLocations } from "../light";
import { LoadFrame, useInvalidate, type Response } from "../kernel";
import { PhasesList } from "./phases-list";
import { loadCarePhases } from "./care-phases-api";
import { CarePhasesSkeleton } from "./CarePhasesPage.skeleton";
import { RefusalAlert, StatusNote } from "./notices";
import { usePhaseSwitch } from "./use-phase-switch";

const KEY = ["care", "phases"] as const;
type Token = () => Promise<string | undefined>;
type Loaded = { rows: readonly PhasesRow[]; locations: readonly LightLocation[] };

/** Phases and locations; if one fails, the loading fails as a whole. */
async function loadBoth(api: string, token: string): Promise<Response<Loaded>> {
  const [p, s] = await Promise.all([loadCarePhases(api, token), loadLocations(api, token)]);
  if (!p.ok) return p;
  if (!s.ok) return s;
  return { ok: true, value: { rows: p.value, locations: s.value } };
}

/**
 * Care phases (US-PHA-01) with "Jetzt umgestellt" (US-PHA-03): loads phases and locations; if one fails, the loading
 * fails as a whole. After a confirmation the list is loaded again, so the rows show the new location at once.
 */
export function CarePhasesPage(props: { api: string; token: Token }) {
  const { api, token } = props;
  const again = useInvalidate(KEY);
  const move = usePhaseSwitch(api, token, again);
  const load = useCallback((t: string) => loadBoth(api, t), [api]);
  const loading = "Pflegephasen werden geladen …";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h1 id="care-phases-title" className="text-2xl font-semibold">
        Pflegephasen
      </h1>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText={loading}
        loadingFallback={<CarePhasesSkeleton label={loading} />}
      >
        {(data) => (
          <>
            {move.message && <StatusNote>{move.message}</StatusNote>}
            {move.error && <RefusalAlert error={move.error} />}
            <PhasesList
              rows={data.rows}
              locations={data.locations}
              busy={move.running}
              onConfirm={(ids, text) => void move.confirm(ids, text)}
            />
          </>
        )}
      </LoadFrame>
    </div>
  );
}
