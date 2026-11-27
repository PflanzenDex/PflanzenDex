import { forwardRef, useId, useRef, useState } from "react";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { localToday, MAX_PAUSE_DAYS } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button";
import { DateField } from "@/shared/ui/input.date-field";
import { isHandedDate } from "@/shared/ui/input.date-schema";
import { dateText } from "@/shared/lib/format";
import { errorText } from "@/shared/lib/error-text";
import { texts } from "@/shared/lib/text-rules/texts";
import {
  createKey,
  currentTimeZone,
  entityKey,
  useInvalidate,
  useWriteAction,
} from "../../../shared/data";
import type { RhythmPauseItem } from "../../achievements-api";
import { addRhythmPause, removeRhythmPause } from "./pause-api";
import { isPauseTooLong, lastPauseDay } from "./pause-limit";
import table from "./rhythm-pauses.de.json";

type Token = () => Promise<string | undefined>;

const TOO_LONG = "achievements.pause_too_long";
const ui = texts(table);

function PauseList(props: { pauses: RhythmPauseItem[]; remove: (id: string) => void }) {
  if (props.pauses.length === 0) return null;
  return (
    <ul aria-label="Eingetragener Urlaub" className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {props.pauses.map((p) => (
        <li key={p.id} className="flex items-center gap-2">
          <span>{`${dateText(p.from)} bis ${dateText(p.until)}`}</span>
          <Button
            type="button"
            variant="destructive-plain"
            size="sm"
            onClick={() => props.remove(p.id)}
          >
            {`Urlaub vom ${dateText(p.from)} entfernen`}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The one message that stops "Bis" (F-0371, P-10): a range longer than the limit once "Bis" is left or a send tried it,
 * or the server's refusal of such a pause. It names the last day the limit allows.
 */
function stopMessageOf(from: string, until: string, stopped: boolean, refused: boolean) {
  if (!refused && !(stopped && isPauseTooLong(from, until))) return null;
  const latest = from !== "" && isHandedDate(from) ? lastPauseDay(from) : null;
  return latest
    ? ui("until.latest", { weeks: MAX_PAUSE_DAYS / 7, date: dateText(latest) })
    : errorText(TOO_LONG);
}

/**
 * "Bis (einschließlich)": the last day of the pause. `max` is the last day the limit allows (the field's own message when
 * it is left); `message` replaces that message when the stop is shown, so exactly one message is read (F-0371).
 */
const UntilField = forwardRef<
  HTMLInputElement,
  {
    from: string;
    until: string;
    message: string | null;
    onChange: (value: string) => void;
    onLeave: () => void;
  }
>(({ from, until, message, onChange, onLeave }, ref) => {
  const messageId = useId();
  return (
    <>
      <label className="flex flex-col gap-1">
        Bis (einschließlich)
        <DateField
          ref={ref}
          value={until}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onLeave}
          max={from !== "" && isHandedDate(from) ? lastPauseDay(from) : undefined}
          invalid={message !== null}
          aria-describedby={message ? messageId : undefined}
        />
      </label>
      {message && (
        <p id={messageId} role="alert" className="text-sm font-medium text-destructive">
          {message}
        </p>
      )}
    </>
  );
});
UntilField.displayName = "UntilField";

/** The writes of the pauses (US-ACH-04, US-QS-03): a new pause, and the removal of one. */
function usePauseWrites(api: string, token: Token) {
  const write = useWriteAction(token, useInvalidate(["achievements"]));
  const add = (from: string, until: string) =>
    void write.run(
      (t, o) => addRhythmPause(api, t, { from, until }, o),
      "Urlaub eingetragen.",
      // A create (a pause is added): the operation only, the dates are the body (US-QS-03).
      createKey("pause", "add"),
    );
  const remove = (id: string) =>
    void write.run(
      (t, o) => removeRhythmPause(api, t, id, o),
      "Urlaub entfernt.",
      entityKey("pause", id, "remove"),
    );
  return { write, add, remove };
}

/**
 * Explicit pauses of the care rhythm (US-ACH-04): holiday or illness, up to 4 weeks each. Tasks due inside a pause
 * are neutral, nothing is lost. A refusal (too long, end before start) stays visible with its reason (P-10).
 */
export function RhythmPauses(props: { api: string; token: Token; pauses: RhythmPauseItem[] }) {
  const { api, token, pauses } = props;
  // A pause is set from today on, and the keeper changes both days (US-ACH-04, US-QS-32: prefilled with today).
  const today = localToday(new Date(), currentTimeZone());
  const [from, setFrom] = useState(today);
  const [until, setUntil] = useState(today);
  const [untilLeft, setUntilLeft] = useState(false);
  const untilRef = useRef<HTMLInputElement>(null);
  const { write, add, remove } = usePauseWrites(api, token);
  const stop = stopMessageOf(from, until, untilLeft, write.error?.code === TOO_LONG);
  const submit = () => {
    if (!isHandedDate(from) || !isHandedDate(until)) return;
    // A pause longer than the limit is stopped at "Bis" with the last allowed day, and nothing is sent (F-0371, P-10).
    if (isPauseTooLong(from, until)) {
      setUntilLeft(true);
      untilRef.current?.focus();
      return;
    }
    add(from, until);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-muted-foreground">
          Urlaub oder Krankheit, höchstens 4 Wochen: fällige Termine zählen dann nicht gegen deinen
          Pflegerhythmus. Auch Tage, an denen alle deine Pflanzen ruhen, zählen nicht.
        </p>
        <label className="flex flex-col gap-1">
          Von
          <DateField value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <UntilField
          ref={untilRef}
          from={from}
          until={until}
          message={stop}
          onChange={setUntil}
          onLeave={() => setUntilLeft(true)}
        />
        <Button type="button" onClick={submit} disabled={write.running} className="self-start">
          Urlaub eintragen
        </Button>
      </div>
      <PauseList pauses={pauses} remove={remove} />
      {write.error && write.error.code !== TOO_LONG && (
        <p role="alert" className="mt-2 text-destructive">
          {errorText(write.error.code)}
          <RefusalClose error={write.error} />
        </p>
      )}
      {write.message && (
        <p role="status" className="mt-2">
          {write.message}
        </p>
      )}
    </div>
  );
}
