import { REMINDER_LIMITS, type ReminderOccasion, type ReminderSettings } from "@pflanzendex/core";
import { useCallback, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { LoadFrame, useInvalidate, useWriteAction } from "../../kernel";
import { loadReminderSettings, saveReminderSettings } from "../api/reminders-api";
import { PauseRows, withPause, type Paused } from "./pause-rows";

type Token = () => Promise<string | undefined>;

const KEY = ["monitoring", "settings"] as const;
const { min, max } = REMINDER_LIMITS.measurementDays;

/** A complaint about the input that the server would refuse too, in words that name the fix (P-09); `null` when fine. */
function complaint(quietFrom: string, quietTo: string, days: string): string | null {
  if ((quietFrom === "") !== (quietTo === ""))
    return "Ruhezeiten brauchen Beginn und Ende. Fülle beide Zeiten aus oder lösche beide.";
  if (!/^\d+$/.test(days) || Number(days) < min || Number(days) > max)
    return `Die Tage bis zur überfälligen Messung sind eine ganze Zahl von ${min} bis ${max}.`;
  return null;
}

const Alert = ({ text }: { text: string }) => (
  <p role="alert" className="rounded-lg border border-destructive p-3">
    {text}
  </p>
);

type TimeFieldsProps = {
  sendTime: string;
  quiet: readonly [string, string];
  days: string;
  on: {
    sendTime: (v: string) => void;
    quiet: (from: string, to: string) => void;
    days: (v: string) => void;
  };
};

/** Time of the daily check, quiet hours and the days of an overdue measurement. */
function TimeFields({ sendTime, quiet, days, on }: TimeFieldsProps) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor="reminder-time">Uhrzeit der täglichen Prüfung</Label>
        <Input
          id="reminder-time"
          type="time"
          value={sendTime}
          required
          onChange={(e) => on.sendTime(e.target.value)}
          aria-describedby="reminder-time-hint"
        />
        <p id="reminder-time-hint" className="m-0 text-sm text-muted-foreground">
          In deiner Zeitzone. Es kommt höchstens eine Erinnerung am Tag, und nur, wenn etwas zu tun
          ist.
        </p>
      </div>
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1 text-sm font-medium">Ruhezeiten</legend>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiet-from">Von</Label>
            <Input
              id="quiet-from"
              type="time"
              value={quiet[0]}
              onChange={(e) => on.quiet(e.target.value, quiet[1])}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="quiet-to">Bis</Label>
            <Input
              id="quiet-to"
              type="time"
              value={quiet[1]}
              onChange={(e) => on.quiet(quiet[0], e.target.value)}
            />
          </div>
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          In dieser Zeit kommt nichts an. Fällt die Uhrzeit in die Ruhezeit, wartet die Erinnerung
          bis zu deren Ende und geht nicht verloren. Beide Zeiten leer: keine Ruhezeiten.
        </p>
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor="measurement-days">Messung überfällig nach (Tagen)</Label>
        <Input
          id="measurement-days"
          inputMode="numeric"
          autoComplete="off"
          value={days}
          onChange={(e) => on.days(e.target.value)}
        />
      </div>
    </>
  );
}

function Form(props: { api: string; token: Token; saved: ReminderSettings }) {
  const { saved } = props;
  const [sendTime, setSendTime] = useState(saved.sendTime);
  const [quiet, setQuiet] = useState<readonly [string, string]>([
    saved.quietFrom ?? "",
    saved.quietTo ?? "",
  ]);
  const [days, setDays] = useState(String(saved.measurementDays));
  const [paused, setPaused] = useState<Paused>(saved.paused);
  const [problem, setProblem] = useState<string | null>(null);
  const write = useWriteAction(props.token, useInvalidate(KEY));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = complaint(quiet[0], quiet[1], days);
    setProblem(found);
    if (found !== null) return;
    const next: ReminderSettings = {
      sendTime,
      quietFrom: quiet[0] === "" ? null : quiet[0],
      quietTo: quiet[1] === "" ? null : quiet[1],
      paused,
      measurementDays: Number(days),
    };
    void write.run((t) => saveReminderSettings(props.api, t, next), "Erinnerungen gespeichert.");
  };
  const pause = (o: ReminderOccasion, until: string) => setPaused((p) => withPause(p, o, until));

  return (
    <form
      aria-label="Erinnerungen einstellen"
      onSubmit={submit}
      className="flex max-w-xl flex-col gap-4"
    >
      <TimeFields
        sendTime={sendTime}
        quiet={quiet}
        days={days}
        on={{ sendTime: setSendTime, quiet: (f, t) => setQuiet([f, t]), days: setDays }}
      />
      <PauseRows paused={paused} onChange={pause} />
      {problem !== null && <Alert text={problem} />}
      {write.error && <Alert text={write.error.text} />}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
      <Button type="submit" size="touch" disabled={write.running}>
        {write.running ? "Speichert …" : "Erinnerungen speichern"}
      </Button>
    </form>
  );
}

/** Reminder settings (US-MON-08): time, quiet hours, days of an overdue measurement and a pause per occasion. */
export function ReminderSettingsForm(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadReminderSettings(props.api, t), [props.api]);
  return (
    <LoadFrame
      queryKey={KEY}
      fresh
      token={props.token}
      load={load}
      loadingText="Erinnerungseinstellungen werden geladen …"
    >
      {(saved) => <Form api={props.api} token={props.token} saved={saved} />}
    </LoadFrame>
  );
}
