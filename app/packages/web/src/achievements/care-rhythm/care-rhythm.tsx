import { useCallback } from "react";
import { LayerPart } from "@/components/shared/responsive/layer-sheet/layer-part/layer-part";
import { dateText } from "@/lib/format";
import { useRequest } from "../../kernel";
import { RhythmPauses } from "./rhythm-pauses/rhythm-pauses";
import { loadRhythm, type RhythmWeekState } from "../achievements-api";

type Token = () => Promise<string | undefined>;

/** Symbol and word per state: never colour alone (NFR-13). A week with open tasks is no loss, only "offen" (FR-ACH-06). */
const WEEK: Record<RhythmWeekState, { mark: string; word: string }> = {
  on_time: { mark: "✓", word: "pünktlich" },
  open: { mark: "•", word: "offen" },
  pending: { mark: "…", word: "läuft noch" },
  none: { mark: "–", word: "nichts fällig" },
};

const weeks = (n: number): string => (n === 1 ? "1 Woche" : `${n} Wochen`);

/** The text of the rhythm: the run, the open tasks and what to do next, or what fills it (P-08, P-09). */
function RhythmText(props: {
  hasTasks: boolean;
  currentRun: number;
  longestRun: number;
  openTasks: number;
}) {
  const { hasTasks, currentRun, longestRun, openTasks } = props;
  if (!hasTasks)
    return (
      <p className="m-0 text-sm text-muted-foreground">
        Noch war kein Pflegetermin fällig. Sobald Behandlungen oder Messungen anstehen, siehst du
        hier, wie regelmäßig du pflegst.
      </p>
    );
  return (
    <>
      <p className="m-0">
        Aktueller Rhythmus: {weeks(currentRun)} pünktlich. Längster Rhythmus bisher:{" "}
        {weeks(longestRun)}.
      </p>
      {openTasks > 0 && (
        <p className="m-0 text-sm">
          {openTasks === 1 ? "1 Termin ist" : `${openTasks} Termine sind`} offen. Erledige{" "}
          {openTasks === 1 ? "ihn" : "sie"} unter „Heute“.
        </p>
      )}
      {openTasks === 0 && currentRun === 0 && (
        <p className="m-0 text-sm text-muted-foreground">
          Eine pünktliche Woche startet den Rhythmus neu.
        </p>
      )}
    </>
  );
}

/** The last 12 weeks, six per row on a phone (US-ACH-04); each week says its state in words too. */
function RhythmWeeks(props: { weeks: readonly { start: string; state: RhythmWeekState }[] }) {
  return (
    <ol
      aria-label="Die letzten 12 Wochen"
      className="m-0 grid list-none grid-cols-6 gap-1 p-0 sm:grid-cols-12"
    >
      {props.weeks.map((w) => (
        <li
          key={w.start}
          className="flex h-10 items-center justify-center rounded border border-border text-sm"
        >
          <span aria-hidden="true">{WEEK[w.state].mark}</span>
          <span className="sr-only">{`Woche vom ${dateText(w.start)}: ${WEEK[w.state].word}`}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The care rhythm (US-ACH-04) as a row "Pflegerhythmus" with its layer: the last 12 weeks as a grid, the current run and
 * the longest run so far. Gentler than a streak: nothing is shown as lost, a missed week names the open tasks and what
 * to do (P-09), and a new run starts with the next week on time. Without a due task the rhythm is unknown and says what
 * fills it (P-08). The explicit pauses are a row of their own (US-QS-15). Calm mode, a read error or an unexpected answer
 * show nothing (US-ACH-08).
 */
export function CareRhythmSection(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadRhythm(api, t), [api]);
  const r = useRequest({ queryKey: ["achievements", "rhythm"], token, load });
  const v = r.value;
  if (!v || v.calmMode || !Array.isArray(v.weeks)) return null;
  return (
    <>
      <LayerPart
        id="rhythm"
        title="Pflegerhythmus"
        value={
          !v.hasTasks ? "Noch kein Pflegetermin fällig" : `Aktuell ${weeks(v.currentRun)} pünktlich`
        }
      >
        <div className="flex min-w-0 flex-col gap-3">
          <RhythmText
            hasTasks={v.hasTasks}
            currentRun={v.currentRun}
            longestRun={v.longestRun}
            openTasks={v.openTasks}
          />
          <RhythmWeeks weeks={v.weeks} />
        </div>
      </LayerPart>
      <LayerPart id="pause" title="Pause eintragen" value="Urlaub oder Krankheit, bis 4 Wochen">
        <RhythmPauses api={api} token={token} pauses={v.pauses ?? []} />
      </LayerPart>
    </>
  );
}
