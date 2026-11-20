import type { TreatmentListRow } from "@pflanzendex/core";
import { useCallback, useRef, useState } from "react";
import type { EmptyStateAction } from "@/shared/patterns/elements/empty-state/empty-state";
import { EmptySection } from "@/shared/patterns/elements/empty-state/empty-section/empty-section";
import { texts } from "@/shared/lib/text-rules/texts";
import { LAYER_PARAM, Pager } from "@/shared/patterns/responsive/pager/pager";
import { isOnline } from "@/shared/platform/browser/network";
import { useAnnounce } from "@/shared/platform/announcer/context";
import { placeHeld, useUndo } from "@/shared/feedback/undo-row/use-undo";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../shared/data";
import { LIST_CLASSES, RefusalAlert } from "../../shared/notices";
import { PAGE_SIZE, Row } from "./treatment-row/treatment-row";
import { OpenTreatmentsSkeleton } from "./open-treatments.skeleton";
import {
  completeTreatment,
  loadOpenTreatments,
  reopenTreatment,
} from "../../shared/api/treatments-api";
import { OPEN_KEY, TREATMENTS } from "../../shared/api/query-keys";
import table from "./open-treatments.de.json";

// `t` names the token in the callbacks of this file, so the texts are `ui`.
const ui = texts(table);

type Token = () => Promise<string | undefined>;
/** One sentence that says what to do next (P-09): the overdue and the due-today dates first. */
export function nextStepText(rows: readonly TreatmentListRow[]): string | null {
  const overdue = rows.filter((r) => r.status.kind === "overdue").length;
  const today = rows.filter((r) => r.status.kind === "today").length;
  if (overdue === 0 && today === 0) return null;
  const parts = [];
  if (overdue > 0)
    parts.push(overdue === 1 ? "1 Termin ist überfällig" : `${overdue} Termine sind überfällig`);
  if (today > 0) parts.push(today === 1 ? "1 ist heute fällig" : `${today} sind heute fällig`);
  return `${parts.join(", ")}. Behandle diese Pflanzen zuerst.`;
}

/**
 * Ticking off and its undo (US-BEH-03, US-QS-32). A ticked-off row stays in its place for the undo window with "Erledigt ·
 * Rückgängig" (SG-FEED-03), and its result is announced; "Rückgängig" opens the treatment again through the same kind of
 * validating write. A refusal stays visible below the list (P-10). Offline the row leaves at once, because its write waits
 * in the buffer and the row must not be buffered twice (US-QS-10); then there is no undo.
 */
function useCompletion(api: string, token: Token, onChanged: () => void) {
  const announce = useAnnounce();
  const undo = useUndo<TreatmentListRow>();
  const [hidden, setHidden] = useState<readonly string[]>([]);
  const tapped = useRef<{ row: TreatmentListRow; index: number } | null>(null);
  const restoring = useRef<string | null>(null);
  const complete = useWriteAction(token, onChanged, (message, kind) => {
    const done = tapped.current;
    tapped.current = null;
    if (kind === "error" || !done) return;
    undo.hold(
      [{ key: done.row.id, group: done.row.id, item: done.row, index: done.index, undoable: true }],
      ui("doneResult"),
      ui("doneSaid", { name: done.row.specimenName, reason: done.row.reason }),
    );
  });
  const restore = useWriteAction(token, onChanged, (message, kind) => {
    if (kind === "error") return;
    if (restoring.current !== null) undo.release(restoring.current);
    restoring.current = null;
    announce?.announce(message);
  });
  const tick = (row: TreatmentListRow, index: number) => {
    if (isOnline()) tapped.current = { row, index };
    else {
      setHidden((ids) => [...ids, row.id]);
      tapped.current = null;
    }
    void complete.run((t) => completeTreatment(api, t, row.id), ui("doneResult"));
  };
  const reopen = (id: string) => {
    restoring.current = id;
    void restore.run((t) => reopenTreatment(api, t, id), ui("restored"));
  };
  return {
    tick,
    reopen,
    undo,
    hidden,
    running: complete.running || restore.running,
    failure: complete.error ?? restore.error,
  };
}

type Completion = ReturnType<typeof useCompletion>;

function OpenList(props: {
  all: readonly TreatmentListRow[];
  completion: Completion;
  next: EmptyStateAction | undefined;
  host: boolean;
}) {
  const { completion } = props;
  const visible = props.all.filter((r) => !completion.hidden.includes(r.id));
  const rows = placeHeld(visible, completion.undo.held, (r) => r.id);
  const held = new Map(completion.undo.held.map((h) => [h.key, h] as const));
  const next = nextStepText(rows);
  // One line and the next step, as every empty section of a page or sheet (US-QS-32, SG-STATE-01); without `next` the
  // step already stands on the screen and the line stays alone (issue 2233).
  if (rows.length === 0)
    return <EmptySection text={ui("empty.line")} {...(props.next ? { action: props.next } : {})} />;
  const rowOf = (row: TreatmentListRow, host: boolean) => {
    const state = held.get(row.id);
    return (
      <Row
        row={row}
        running={completion.running}
        onDone={() => completion.tick(row, rows.indexOf(row))}
        host={host}
        held={
          state
            ? {
                result: state.result,
                subject: ui("undoSubject", { reason: row.reason, name: row.specimenName }),
                busy: completion.running,
                onUndo: () => completion.reopen(row.id),
              }
            : undefined
        }
      />
    );
  };
  return (
    <>
      {next && !props.host && <p className="font-semibold">{next}</p>}
      {props.host ? (
        <Pager
          items={rows}
          pageSize={PAGE_SIZE}
          param={LAYER_PARAM}
          label="Offene Behandlungen"
          getKey={(row) => row.id}
          renderItem={(row) => rowOf(row, true)}
        />
      ) : (
        <ul className={LIST_CLASSES} aria-label="Offene Behandlungen">
          {rows.map((row) => (
            <li key={row.id}>{rowOf(row, false)}</li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * The open treatments by urgency (US-BEH-02): earliest first (the server sorts), status as text, never by colour
 * alone. Without any, the view says so and what to do next (P-09): `next` is that action, unless the screen shows it.
 * Planning and every tick-off attempt invalidate the treatments, so this list and the history load again without a
 * page reload.
 */
export function OpenTreatments(props: {
  api: string;
  token: Token;
  /**
   * What to do when there is nothing open: plan one, or create a specimen first. Left out when the screen shows that
   * step already, so the empty line does not repeat it (SG-STATE-01, issue 2233).
   */
  next?: EmptyStateAction | undefined;
  /** Shown as a section of "Heute" (US-QS-14): its heading is one level lower. */
  host?: boolean;
}) {
  const { api, token } = props;
  const host = props.host === true;
  const Title = host ? "h3" : "h2";
  const changed = useInvalidate(TREATMENTS);
  const completion = useCompletion(api, token, changed);
  const load = useCallback((t: string) => loadOpenTreatments(api, t), [api]);
  return (
    <section aria-labelledby="open-treatments-title" className="flex flex-col gap-3">
      <Title id="open-treatments-title" className={host ? "sr-only" : "text-xl font-semibold"}>
        Offene Behandlungen
      </Title>
      {completion.failure && <RefusalAlert error={completion.failure} />}
      <LoadFrame
        queryKey={OPEN_KEY}
        token={token}
        load={load}
        loadingText="Offene Behandlungen werden geladen …"
        loadingFallback={<OpenTreatmentsSkeleton />}
      >
        {(all) => <OpenList all={all} completion={completion} next={props.next} host={host} />}
      </LoadFrame>
    </section>
  );
}
