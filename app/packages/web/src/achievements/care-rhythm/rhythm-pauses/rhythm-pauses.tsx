import { useState } from "react";
import { localToday } from "@pflanzendex/core";
import { Button } from "@/shared/ui/button/button";
import { DateField } from "@/shared/ui/fields/input/native-fields/date-field/date-field";
import { isHandedDate } from "@/shared/ui/fields/input/native-fields/date-field/date-field-schema";
import { dateText } from "@/shared/lib/format";
import { errorText } from "@/shared/lib/error-text";
import { currentTimeZone, useInvalidate, useWriteAction } from "../../../shared/data";
import type { RhythmPauseItem } from "../../achievements-api";
import { addRhythmPause, removeRhythmPause } from "./pause-api";

type Token = () => Promise<string | undefined>;

function PauseList(props: { pauses: RhythmPauseItem[]; remove: (id: string) => void }) {
  if (props.pauses.length === 0) return null;
  return (
    <ul aria-label="Eingetragener Urlaub" className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {props.pauses.map((p) => (
        <li key={p.id} className="flex items-center gap-2">
          <span>{`${dateText(p.from)} bis ${dateText(p.until)}`}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => props.remove(p.id)}>
            {`Urlaub vom ${dateText(p.from)} entfernen`}
          </Button>
        </li>
      ))}
    </ul>
  );
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
  const refresh = useInvalidate(["achievements"]);
  const write = useWriteAction(token, refresh);
  const submit = () => {
    // A typed text that is no day: its field shows the message on leaving it (US-QS-32), nothing is sent.
    if (!isHandedDate(from) || !isHandedDate(until)) return;
    void write.run((t) => addRhythmPause(api, t, { from, until }), "Urlaub eingetragen.");
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
        <label className="flex flex-col gap-1">
          Bis (einschließlich)
          <DateField value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <Button type="button" onClick={submit} disabled={write.running} className="self-start">
          Urlaub eintragen
        </Button>
      </div>
      <PauseList
        pauses={pauses}
        remove={(id) => void write.run((t) => removeRhythmPause(api, t, id), "Urlaub entfernt.")}
      />
      {write.error && (
        <p role="alert" className="mt-2 text-destructive">
          {errorText(write.error.code)}
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
