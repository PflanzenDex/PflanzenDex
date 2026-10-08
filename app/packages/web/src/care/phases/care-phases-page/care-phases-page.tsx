import { useCallback, useEffect } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { loadLocations } from "../../../light";
import { LoadFrame, useInvalidate, type Response } from "../../../kernel";
import { PhasesList } from "../phases-list/phases-list";
import { loadCarePhases } from "../../shared/api/care-phases-api";
import { CarePhasesSkeleton } from "./care-phases-page.skeleton";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";
import { usePhaseSwitch } from "../use-phase-switch";

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

/** What the host shows below its title: the count line of the loaded list (US-QS-14). */
export type PhasesHost = { onCaption: (text: string | null) => void };

/** Tells the host how many plants have a phase, and clears the line when the list goes away. */
function ReportCount({ host, count }: { host: PhasesHost | undefined; count: number }) {
  useEffect(() => {
    host?.onCaption(
      count === 1 ? "1 Pflanze mit Pflegephase" : `${count} Pflanzen mit Pflegephase`,
    );
    return () => host?.onCaption(null);
  }, [host, count]);
  return null;
}

/**
 * Care phases (US-PHA-01) with "Jetzt umgestellt" (US-PHA-03): loads phases and locations; if one fails, the loading
 * fails as a whole. After a confirmation the list is loaded again, so the rows show the new location at once. It is
 * shown as the grouping "nach Pflegephase" of the plants in the Sammlung (US-QS-14): below the title of that
 * destination, so its own heading is a section name for screen readers.
 */
export function CarePhasesPage(props: { api: string; token: Token; host?: PhasesHost }) {
  const { api, token } = props;
  const again = useInvalidate(KEY);
  const move = usePhaseSwitch(api, token, again);
  const load = useCallback((t: string) => loadBoth(api, t), [api]);
  const loading = "Pflegephasen werden geladen …";
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 id="care-phases-title" className="sr-only">
        Pflegephasen
      </h2>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText={loading}
        loadingFallback={<CarePhasesSkeleton label={loading} />}
      >
        {(data) => (
          <>
            <ReportCount host={props.host} count={data.rows.length} />
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
