import { REMINDER_LIMITS, type ReminderOccasion, type ReminderSettings } from "@pflanzendex/core";
import { RefusalClose } from "@/shared/patterns/states/banner/banner";
import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { FormBar } from "@/shared/ui/form-bar";
import { FormRoot } from "@/shared/ui/form";
import { isHandedDate } from "@/shared/ui/input.date-schema";
import { accountKey, useInvalidate, useWriteAction } from "../../../shared/data";
import { LoadFrame } from "@/shared/patterns/states/request-state/load-frame/load-frame";
import { loadReminderSettings, saveReminderSettings } from "../../api/reminders-api";
import { PauseRows, withPause, type Paused } from "../pause-rows/pause-rows";
import { TimeFields } from "./time-fields/time-fields";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../monitoring.de.json";
import { SettingsFormSkeleton } from "./settings-form.skeleton";

const ui = texts(table);

type Token = () => Promise<string | undefined>;

const KEY = ["monitoring", "settings"] as const;
const { min, max } = REMINDER_LIMITS.measurementDays;

/** The id of the form of "Wann erinnern?": the confirming action in the bar of its layer submits it (SG-SHEET-04, US-QS-15). */
const TIMES_FORM = "reminder-times-form";
/** The id of the form of "Erinnerungen aussetzen". */
const PAUSES_FORM = "reminder-pauses-form";

/** A complaint about the input that the server would refuse too, in words that name the fix (P-09); `null` when fine. */
function complaint(quietFrom: string, quietTo: string, days: string): string | null {
  if ((quietFrom === "") !== (quietTo === ""))
    return "Die Ruhezeit braucht Beginn und Ende. Fülle beide Zeiten aus oder lösche beide.";
  if (!/^\d+$/.test(days) || Number(days) < min || Number(days) > max)
    return `Die Tage bis zur überfälligen Messung sind eine ganze Zahl von ${min} bis ${max}.`;
  return null;
}

const Alert = ({
  text,
  error,
}: {
  text: string;
  error?: { dismiss?: (() => void) | undefined } | null;
}) => (
  <p role="alert" className="rounded-lg border border-destructive p-3">
    {text}
    <RefusalClose error={error ?? null} />
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
    void write.run(
      (t, opts) => saveReminderSettings(props.api, t, next, opts),
      "Erinnerungen gesichert.",
      // Set-state on the times form: its own action, so the pauses form never shares its key (US-QS-03).
      accountKey("reminders:times"),
    );
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
      {write.error && <Alert text={write.error.text} error={write.error} />}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
      <FormBar formId={TIMES_FORM} pending={write.running} needsNetwork>
        {ui("times.save")}
      </FormBar>
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
    // A typed text that is no day: its field shows the message on leaving it (US-QS-32), nothing is saved.
    if (!Object.values(paused).every(isHandedDate)) return;
    const next: ReminderSettings = { ...saved, paused };
    void write.run(
      (t, opts) => saveReminderSettings(props.api, t, next, opts),
      "Pausen gesichert.",
      // Set-state on the pauses form: its own action, so the times form never shares its key (US-QS-03).
      accountKey("reminders:pauses"),
    );
  };
  const pause = (o: ReminderOccasion, until: string) => setPaused((p) => withPause(p, o, until));

  return (
    <FormRoot
      id={PAUSES_FORM}
      aria-label="Erinnerungen aussetzen"
      onSubmit={submit}
      className="flex min-w-0 flex-col gap-4"
    >
      <PauseRows paused={paused} onChange={pause} />
      {write.error && <Alert text={write.error.text} error={write.error} />}
      {write.message && (
        <p role="status" className="rounded-lg border border-border p-3">
          {write.message}
        </p>
      )}
      <FormBar formId={PAUSES_FORM} pending={write.running} needsNetwork>
        {ui("pauses.save")}
      </FormBar>
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
    <LoadFrame
      queryKey={KEY}
      fresh
      token={props.token}
      load={load}
      loadingText={props.loading}
      loadingFallback={<SettingsFormSkeleton label={props.loading} />}
    >
      {(saved) => props.children(saved)}
    </LoadFrame>
  );
}

/** "Wann erinnern?" (US-MON-08): the time of the daily check, the quiet hours and the days of an overdue measurement. */
export function ReminderTimesForm(props: { api: string; token: Token }) {
  return (
    <WithSettings {...props} loading={ui("times.loading")}>
      {(saved) => <TimesForm api={props.api} token={props.token} saved={saved} />}
    </WithSettings>
  );
}

/** "Erinnerungen aussetzen" (US-MON-08): a pause per occasion, in pages inside its layer. */
export function ReminderPausesForm(props: { api: string; token: Token }) {
  return (
    <WithSettings {...props} loading={ui("pauses.loading")}>
      {(saved) => <PausesForm api={props.api} token={props.token} saved={saved} />}
    </WithSettings>
  );
}
