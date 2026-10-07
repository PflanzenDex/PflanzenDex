import type { TreatmentListRow } from "@pflanzendex/core";
import { useCallback, useRef, useState } from "react";
import { EmptyState, type EmptyStateAction } from "@/components/shared/empty-state";
import { Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isOnline } from "@/platform/network";
import { useAnnounce } from "@/platform/announcer/context";
import { LoadFrame, SIGN_IN, useInvalidate, type ApiError } from "../kernel";
import { ATTENTION_CLASSES, LIST_CLASSES, RefusalAlert, StatusNote } from "./notices";
import { OpenTreatmentsSkeleton } from "./open-treatments.skeleton";
import { completeTreatment, loadOpenTreatments } from "./api/treatments-api";
import { OPEN_KEY, TREATMENTS } from "./api/query-keys";
import { dateText } from "./text";

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
  return `${parts.join(", ")}. Behandle diese Exemplare zuerst.`;
}

/**
 * Ticking off (US-BEH-03): one request at a time (a double tap sends one). A success says what was ticked off and
 * reloads; a refusal stays visible and the list reloads too, so a row that is gone elsewhere disappears (P-10).
 */
function useCompletion(api: string, token: Token, onChanged: () => void) {
  const busy = useRef(false);
  const announcer = useAnnounce();
  const [runningId, setRunningId] = useState<string | null>(null);
  // Ticked off here: hidden at once, so a second tap before the list reloads has nothing to hit.
  const [doneIds, setDoneIds] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const complete = useCallback(
    async (row: TreatmentListRow) => {
      if (busy.current) return;
      busy.current = true;
      if (announcer && !isOnline()) {
        // No network: the tick-off waits in the buffer, the row is hidden so it cannot be buffered twice (US-QS-10).
        setDoneIds((ids) => [...ids, row.id]);
        busy.current = false;
        void announcer.buffer({
          token,
          send: (t) => completeTreatment(api, t, row.id),
          success: `„${row.specimenName}“: „${row.reason}“ als erledigt eingetragen.`,
          after: onChanged,
        });
        return;
      }
      setRunningId(row.id);
      const t = await token();
      const r = t
        ? await completeTreatment(api, t, row.id)
        : { ok: false as const, error: SIGN_IN };
      busy.current = false;
      setRunningId(null);
      if (r.ok) setDoneIds((ids) => [...ids, row.id]);
      setError(r.ok ? null : r.error);
      setMessage(
        r.ok
          ? `„${row.specimenName}“: „${row.reason}“ als erledigt eingetragen am ${dateText(r.value.doneAt ?? row.dueAt)}.`
          : null,
      );
      onChanged();
    },
    [api, token, onChanged, announcer],
  );
  return { runningId, doneIds, message, error, complete };
}

/** The status chip of an overdue or due-today row: the status text says it first, the tint only underlines it (never by colour alone). */
const CHIP = new Set(["overdue", "today"]);

function Row(props: {
  row: TreatmentListRow;
  running: boolean;
  onDone: () => void;
  /** Shown as a section of another page: the specimen name is one heading level lower (US-QS-14). */
  host: boolean;
}) {
  const { row } = props;
  const Name = props.host ? "h4" : "h3";
  return (
    <li className="flex min-w-0 items-center gap-3 rounded-card bg-card p-3 text-card-foreground shadow-elevation-1 [overflow-wrap:anywhere]">
      <span
        aria-hidden="true"
        className="flex size-13 shrink-0 items-center justify-center rounded-tile bg-accent text-accent-foreground"
      >
        <Sprout className="size-6" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Name className="text-[15px] font-semibold">{row.specimenName}</Name>
        <p className="text-[12.5px] text-muted-foreground">Grund: {row.reason}</p>
        <p className="text-[12.5px] text-muted-foreground">Mittel: {row.agent ?? "—"}</p>
        <p className="text-[12.5px] text-muted-foreground">Fällig am: {dateText(row.dueAt)}</p>
        <p
          className={`w-fit rounded-full px-2 py-0.5 text-[12.5px] font-semibold ${CHIP.has(row.status.kind) ? ATTENTION_CLASSES : ""}`}
        >
          {row.status.text}
        </p>
      </div>
      <Button
        type="button"
        size="lg"
        className="shrink-0 rounded-full"
        disabled={props.running}
        aria-label={`${row.reason} bei ${row.specimenName} als erledigt abhaken`}
        onClick={props.onDone}
      >
        Erledigt
      </Button>
    </li>
  );
}

function OpenList(props: {
  all: readonly TreatmentListRow[];
  completion: ReturnType<typeof useCompletion>;
  next: EmptyStateAction;
  host: boolean;
}) {
  const { completion } = props;
  const rows = props.all.filter((r) => !completion.doneIds.includes(r.id));
  const next = nextStepText(rows);
  if (rows.length === 0)
    return (
      <EmptyState
        title="Keine offenen Behandlungen."
        level={props.host ? 3 : 2}
        description={
          props.host
            ? "Plane einen Termin, dann erscheint er hier."
            : "Plane unten einen Termin, dann erscheint er hier."
        }
        action={props.next}
      />
    );
  return (
    <>
      {next && <p className="font-semibold">{next}</p>}
      <ul className={LIST_CLASSES} aria-label="Offene Behandlungen">
        {rows.map((row) => (
          <Row
            key={row.id}
            row={row}
            running={completion.runningId === row.id}
            onDone={() => void completion.complete(row)}
            host={props.host}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * The open treatments by urgency (US-BEH-02): earliest first (the server sorts), status as text, never by colour
 * alone. Without any, the view says so and what to do next (P-09): `next` is that action. Planning and every tick-off
 * attempt invalidate the treatments, so this list and the history load again without a page reload.
 */
export function OpenTreatments(props: {
  api: string;
  token: Token;
  /** What to do when there is nothing open: plan one, or create a specimen first. */
  next: EmptyStateAction;
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
      <Title id="open-treatments-title" className="text-xl font-semibold">
        Offene Behandlungen
      </Title>
      {completion.message && <StatusNote>{completion.message}</StatusNote>}
      {completion.error && <RefusalAlert error={completion.error} />}
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
