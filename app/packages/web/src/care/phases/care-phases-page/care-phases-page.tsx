import { useCallback, useEffect } from "react";
import type { LightLocation, PhasesRow } from "@pflanzendex/core";
import { sharedLocations } from "../../../light";
import {
  LoadFrame,
  useInvalidate,
  useQueryClient,
  type QueryClient,
  type Response,
} from "../../../shared/data";
import { PhasesList } from "../phases-list/phases-list";
import { PhasesPaged } from "../phases-paged/phases-paged";
import { loadCarePhases } from "../../shared/api/care-phases-api";
import { CarePhasesSkeleton } from "./care-phases-page.skeleton";
import { RefusalAlert, StatusNote } from "../../shared/notices/notices";
import { useBulkMove } from "./use-bulk-move";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "./care-phases-page.de.json";

const ui = texts(table);
const KEY = ["care", "phases"] as const;
type Token = () => Promise<string | undefined>;
type Loaded = { rows: readonly PhasesRow[]; locations: readonly LightLocation[] };

/** Phases and locations; if one fails, the loading fails as a whole. */
async function loadBoth(
  client: QueryClient,
  api: string,
  token: string,
): Promise<Response<Loaded>> {
  const [p, s] = await Promise.all([
    loadCarePhases(api, token),
    sharedLocations(client, api, token),
  ]);
  if (!p.ok) return p;
  if (!s.ok) return s;
  return { ok: true, value: { rows: p.value, locations: s.value } };
}

/** What the host shows below its title: the count line of the loaded list (US-QS-14). */
export type PhasesHost = { onCaption: (text: string | null) => void };

/** Tells the host how many plants have a phase, and clears the line when the list goes away. */
function ReportCount({ host, count }: { host: PhasesHost | undefined; count: number }) {
  useEffect(() => {
    host?.onCaption(count === 1 ? ui("countOne") : ui("countMany", { count }));
    return () => host?.onCaption(null);
  }, [host, count]);
  return null;
}

/** The loaded phase list with its notes, alerts and the grouping the host asks for (US-PHA-01, US-QS-14). */
function PhasesBody(props: {
  api: string;
  token: Token;
  host: PhasesHost | undefined;
  data: Loaded;
  bulk: ReturnType<typeof useBulkMove>;
}) {
  const { api, token, data, bulk } = props;
  // A held bulk move shows its rows as they stood before it, so the list keeps its shape for the undo window.
  const rows = data.rows.map((r) => bulk.snapshot.get(r.specimenId) ?? r);
  return (
    <>
      <ReportCount host={props.host} count={data.rows.length} />
      {bulk.note && <StatusNote>{bulk.note}</StatusNote>}
      {bulk.move.error && <RefusalAlert error={bulk.move.error} />}
      {bulk.restore.error && <RefusalAlert error={bulk.restore.error} />}
      {props.host && rows.length > 0 ? (
        <PhasesPaged
          rows={rows}
          locations={data.locations}
          busy={bulk.busy}
          onConfirm={bulk.confirm}
          groupUndo={bulk.groupUndo}
          access={{ api, token }}
        />
      ) : (
        <PhasesList
          rows={rows}
          locations={data.locations}
          busy={bulk.busy}
          onConfirm={bulk.confirm}
          groupUndo={bulk.groupUndo}
        />
      )}
    </>
  );
}

/**
 * Care phases (US-PHA-01) with "Umstellen" (US-PHA-03): loads phases and locations; if one fails, the loading
 * fails as a whole. After a confirmation the list is loaded again, so the rows show the new location at once. It is
 * shown as the grouping "nach Pflegephase" of the plants in the Sammlung (US-QS-14): below the title of that
 * destination, so its own heading is a section name for screen readers. A bulk move stays in place for the undo window
 * (`useBulkMove`, SG-FEED-03, US-QS-32).
 */
export function CarePhasesPage(props: { api: string; token: Token; host?: PhasesHost }) {
  const { api, token } = props;
  const again = useInvalidate(KEY);
  const bulk = useBulkMove(api, token, again);
  const client = useQueryClient();
  const load = useCallback((t: string) => loadBoth(client, api, t), [api, client]);
  const loading = ui("loading");
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <h2 id="care-phases-title" className="sr-only">
        {ui("title")}
      </h2>
      <LoadFrame
        queryKey={KEY}
        token={token}
        load={load}
        loadingText={loading}
        loadingFallback={<CarePhasesSkeleton label={loading} />}
      >
        {(data) => <PhasesBody api={api} token={token} host={props.host} data={data} bulk={bulk} />}
      </LoadFrame>
    </div>
  );
}
