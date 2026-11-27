import { useCallback, type ReactNode } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { texts } from "@/shared/lib/text-rules/texts";
import { placeHeld } from "@/shared/feedback/undo-row/use-undo";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { DueCountOf, WATERING_KEY, type DueCount } from "../../api/due-count/due-count";
import { loadWateringDue, type WateringDueRow } from "../../api/reminders-api";
import { WateringListSkeleton } from "./watering-list.skeleton";
import { Rows } from "./due-rows/due-rows";
import { useDueWrite } from "./use-due-write";
import table from "./watering-list.de.json";

const ui = texts(table);

type Token = () => Promise<string | undefined>;

/**
 * The plants that are due to be watered today (US-MON-05): last watering plus the interval of the current phase. The
 * intervals are the keeper's own entries in the care profile; without one a plant is not listed (nothing is invented,
 * P-08), and the empty state is one line. "Gegossen" writes today's entry; several can be marked and entered in one step.
 */
export function WateringList(props: {
  api: string;
  token: Token;
  /** With `count` the list renders nothing of its own and hands the due count to it (US-QS-18). */
  count?: (due: DueCount) => ReactNode;
}) {
  if (props.count)
    return (
      <DueCountOf api={props.api} token={props.token}>
        {props.count}
      </DueCountOf>
    );
  return <DueList api={props.api} token={props.token} />;
}

/**
 * The list with its write. The result of "Gegossen" is a line of reserved height above the list (F-0075, SG-FEED-01): it
 * stays when the last plant is marked and the list shows its empty state, and the announcer says the same text once (the
 * line carries no role). A write that made the entries stays in place with its undo instead (SG-FEED-03, US-QS-32). A
 * refusal is the alert below the list (P-10, SG-FEED-02).
 */
function DueList(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadWateringDue(props.api, t), [props.api]);
  const due = useDueWrite(props.api, props.token);
  const heldBy = new Map(due.held.map((h) => [h.key, h] as const));
  return (
    // No gap around the reserved line: it costs one text line and nothing more, so the sheet still fits (QG-U8).
    <div className="flex flex-col">
      <p className="min-h-[1lh] text-sm">{due.result}</p>
      <LoadFrame
        queryKey={WATERING_KEY}
        token={props.token}
        load={load}
        loadingText={ui("loading")}
        loadingFallback={<WateringListSkeleton label={ui("loading")} />}
      >
        {(rows: readonly WateringDueRow[]) => {
          const shown = placeHeld(rows, due.held, (r) => r.specimenId);
          return shown.length === 0 ? (
            // The line only: a link to the collection was no real next step (owner decision 2026-11-16, issue 2240).
            <EmptySection text={ui("none.line")} />
          ) : (
            <Rows
              rows={shown}
              held={heldBy}
              busy={due.running}
              water={due.water}
              undoPlant={due.undoPlant}
              bulk={due.bulk}
            />
          );
        }}
      </LoadFrame>
      {due.failure && (
        <p role="alert" className="mt-3 rounded-lg border border-destructive p-3">
          {due.failure.text}
          <RefusalClose error={due.failure} />
        </p>
      )}
    </div>
  );
}
