import { useCallback } from "react";
import { dateText } from "@/lib/format";
import { useRequest } from "../../kernel";
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

/**
 * The care rhythm (US-ACH-04) in the section "Erfolge": the last 12 weeks as a bar, the current run and the longest run
 * so far. Gentler than a streak: nothing is shown as lost, a missed week names the open tasks and what to do (P-09), and
 * a new run starts with the next week on time. Without a due task the rhythm is unknown and says what fills it (P-08).
 * Calm mode, a read error or an unexpected answer show nothing (US-ACH-08).
 */
export function CareRhythmSection(props: { api: string; token: Token }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadRhythm(api, t), [api]);
  const r = useRequest({ queryKey: ["achievements", "rhythm"], token, load });
  const v = r.value;
  if (!v || v.calmMode || !Array.isArray(v.weeks)) return null;
  return (
    <section aria-label="Pflegerhythmus" className="flex min-w-0 max-w-xl flex-col gap-2">
      <h3 className="m-0 text-lg font-semibold">Pflegerhythmus</h3>
      {!v.hasTasks ? (
        <p className="m-0 text-sm text-muted-foreground">
          Noch war kein Pflegetermin fällig. Sobald Behandlungen oder Messungen anstehen, siehst du
          hier, wie regelmäßig du pflegst.
        </p>
      ) : (
        <>
          <p className="m-0">
            Aktueller Rhythmus: {weeks(v.currentRun)} pünktlich. Längster Rhythmus bisher:{" "}
            {weeks(v.longestRun)}.
          </p>
          {v.openTasks > 0 && (
            <p className="m-0 text-sm">
              {v.openTasks === 1 ? "1 Termin ist" : `${v.openTasks} Termine sind`} offen. Erledige{" "}
              {v.openTasks === 1 ? "ihn" : "sie"} unter „Heute“.
            </p>
          )}
          {v.openTasks === 0 && v.currentRun === 0 && (
            <p className="m-0 text-sm text-muted-foreground">
              Eine pünktliche Woche startet den Rhythmus neu.
            </p>
          )}
        </>
      )}
      <ol aria-label="Die letzten 12 Wochen" className="m-0 flex list-none gap-1 p-0">
        {v.weeks.map((w) => (
          <li
            key={w.start}
            className="flex h-8 w-8 items-center justify-center rounded border border-border text-sm"
          >
            <span aria-hidden="true">{WEEK[w.state].mark}</span>
            <span className="sr-only">{`Woche vom ${dateText(w.start)}: ${WEEK[w.state].word}`}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
