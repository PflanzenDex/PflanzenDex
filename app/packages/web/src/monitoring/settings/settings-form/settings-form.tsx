import { REMINDER_LIMITS, type ReminderOccasion, type ReminderSettings } from "@pflanzendex/core";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { FormRoot } from "@/components/ui/fields/form/form";
import { LoadFrame, useInvalidate, useWriteAction } from "../../../kernel";
import { loadReminderSettings, saveReminderSettings } from "../../api/reminders-api";
import { PauseRows, withPause, type Paused } from "../pause-rows/pause-rows";
import { TimeFields } from "./time-fields/time-fields";

type Token = () => Promise<string | undefined>;

const KEY = ["monitoring", "settings"] as const;
const { min, max } = REMINDER_LIMITS.measurementDays;

/** The id of the form of "Wann erinnern?": its footer button submits it from outside the scroll region (US-QS-15). */
export const TIMES_FORM = "reminder-times-form";
/** The id of the form of "Pausen je Anlass". */
export const PAUSES_FORM = "reminder-pauses-form";

/** A complaint about the input that the server would refuse too, in words that name the fix (P-09); `null` when fine. */
function complaint(quietFrom: string, quietTo: string, days: string): string | null {
  if ((quietFrom === "") !== (quietTo === ""))
    return "Die Erinnerungspause braucht Beginn und Ende. Fülle beide Zeiten aus oder lösche beide.";
  if (!/^\d+$/.test(days) || Number(days) < min || Number(days) > max)
    return `Die Tage bis zur überfälligen Messung sind eine ganze Zahl von ${min} bis ${max}.`;
  return null;
}

const Alert = ({ text }: { text: string }) => (
  <p role="alert" className="rounded-lg border border-destructive p-3">
    {text}
  </p>
);

/** Saves the whole settings: the fields of this form change, the others keep the stored value (US-MON-08). */
function TimesForm(props: { api: string; token: Token; saved: ReminderSettings }) {
  const { saved } = props;
  const [sendTime, setSendTime] = useState(saved.sendTime);
  const [quiet, setQuiet] = useState<readonly [string, string]>([
    saved.quietFrom ?? "",
    saved.quietTo ?? "",
  ]);
  const [days, setDays] = useState(String(saved.measurementDays));
  const [problem, setProblem] = useState<string | null>(null);
  const write = useWriteAction(props.token, useInvalidate(KEY));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found = complaint(quiet[0], quiet[1], days);
    setProblem(found);
    if (found !== null) return;
    const next: ReminderSettings = {
      ...saved,
      sendTime,
      quietFrom: quiet[0] === "" ? null : quiet[0],
      quietTo: quiet[1] === "" ? null : quiet[1],
      measurementDays: Number(days),
    };
    void write.run((t) => saveReminderSettings(props.api, t, next), "Erinnerungen gespeichert.");
  };

  return (
    <FormRoot
      id={TIMES_FORM}
      aria-label="Erinnerungen einstellen"
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-4"
    >
      <TimeFields
        sendTime={sendTime}
        quiet={quiet}
        days={days}
        on={{ sendTime: setSendTime, quiet: (f, t) => setQuiet([f, t]), days: setDays }}
      />
      {problem !== null && <Alert text={problem} />}
      {write.error && <Alert text={write.error.text} />}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
    </FormRoot>
  );
}

/** Saves the whole settings with the pauses changed; the time and the quiet hours keep the stored value. */
function PausesForm(props: { api: string; token: Token; saved: ReminderSettings }) {
  const { saved } = props;
  const [paused, setPaused] = useState<Paused>(saved.paused);
  const write = useWriteAction(props.token, useInvalidate(KEY));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: ReminderSettings = { ...saved, paused };
    void write.run((t) => saveReminderSettings(props.api, t, next), "Pausen gespeichert.");
  };
  const pause = (o: ReminderOccasion, until: string) => setPaused((p) => withPause(p, o, until));

  return (
    <FormRoot
      id={PAUSES_FORM}
      aria-label="Pausen je Anlass einstellen"
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-4"
    >
      <PauseRows paused={paused} onChange={pause} />
      {write.error && <Alert text={write.error.text} />}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
    </FormRoot>
  );
}

/** Loads the settings for one form of a layer; the form is shown once they are there (P-10: a failure is named). */
function WithSettings(props: {
  api: string;
  token: Token;
  loading: string;
  children: (saved: ReminderSettings) => ReactNode;
}) {
  const load = useCallback((t: string) => loadReminderSettings(props.api, t), [props.api]);
  return (
    <LoadFrame queryKey={KEY} fresh token={props.token} load={load} loadingText={props.loading}>
      {(saved) => props.children(saved)}
    </LoadFrame>
  );
}

/** "Wann erinnern?" (US-MON-08): the time of the daily check, the quiet hours and the days of an overdue measurement. */
export function ReminderTimesForm(props: { api: string; token: Token }) {
  return (
    <WithSettings {...props} loading="Erinnerungseinstellungen werden geladen …">
      {(saved) => <TimesForm api={props.api} token={props.token} saved={saved} />}
    </WithSettings>
  );
}

/** "Pausen je Anlass" (US-MON-08): a pause per occasion, in pages inside its layer. */
export function ReminderPausesForm(props: { api: string; token: Token }) {
  return (
    <WithSettings {...props} loading="Pausen werden geladen …">
      {(saved) => <PausesForm api={props.api} token={props.token} saved={saved} />}
    </WithSettings>
  );
}
