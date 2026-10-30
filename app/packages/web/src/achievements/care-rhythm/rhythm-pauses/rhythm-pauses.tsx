import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import { DateField } from "@/components/ui/fields/input/native-fields/date-field/date-field";
import { dateText } from "@/lib/format";
import { errorText } from "@/lib/error-text";
import { useInvalidate, useWriteAction } from "../../../kernel";
import type { RhythmPauseItem } from "../../achievements-api";
import { addRhythmPause, removeRhythmPause } from "./pause-api";

type Token = () => Promise<string | undefined>;

function PauseList(props: { pauses: RhythmPauseItem[]; remove: (id: string) => void }) {
  if (props.pauses.length === 0) return null;
  return (
    <ul aria-label="Eingetragene Pausen" className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {props.pauses.map((p) => (
        <li key={p.id} className="flex items-center gap-2">
          <span>{`${dateText(p.from)} bis ${dateText(p.until)}`}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => props.remove(p.id)}>
            {`Pause vom ${dateText(p.from)} entfernen`}
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
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const refresh = useInvalidate(["achievements"]);
  const write = useWriteAction(token, refresh);
  const submit = () => {
    void write.run((t) => addRhythmPause(api, t, { from, until }), "Pause eingetragen.");
  };
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-muted-foreground">
          In einer Pause von höchstens 4 Wochen zählen fällige Termine nicht. Dein Rhythmus bleibt
          bestehen. Auch Tage, an denen alle deine Pflanzen ruhen, zählen nicht.
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
          Pause eintragen
        </Button>
      </div>
      <PauseList
        pauses={pauses}
        remove={(id) => void write.run((t) => removeRhythmPause(api, t, id), "Pause entfernt.")}
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
