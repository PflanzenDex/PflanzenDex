import "./settings.css";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { LoadFrame, SIGN_IN, deviceTimeZone, setProfileTimeZone, type ApiError } from "../kernel";
import { loadProfile, saveProfile, type AccountProfile } from "./account-api";
import { DISPLAY_NAME_ID, ProfileFields, SwitchFields, TIME_ZONE_ID } from "./settings-fields";

type Token = () => Promise<string | undefined>;

const ERROR_ID = "settings-error";
/** Order of the fields in the form: the first refused one gets the focus. */
const FIELD_IDS: Record<string, string> = { displayName: DISPLAY_NAME_ID, timeZone: TIME_ZONE_ID };

/**
 * After a refusal the focus goes to the first refused field, otherwise to the error text, so a keyboard or screen
 * reader user lands where the problem is. Returns the ref for the error text.
 */
function useFocusOnError(error: ApiError | null) {
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error) return;
    const fields = error.details?.map((d) => d.field) ?? [];
    const first = Object.keys(FIELD_IDS).find((f) => fields.includes(f));
    (first ? document.getElementById(FIELD_IDS[first] as string) : alertRef.current)?.focus();
  }, [error]);
  return alertRef;
}

/** Saves one profile at a time (a double tap sends one); a refusal stays visible and keeps the input (P-10). */
function SettingsForm(props: { api: string; token: Token; profile: AccountProfile }) {
  const [saved, setSaved] = useState(props.profile);
  const fromDevice = saved.timeZone === null;
  const [form, setForm] = useState<AccountProfile>({
    ...props.profile,
    timeZone: props.profile.timeZone ?? deviceTimeZone(),
  });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const set = (change: Partial<AccountProfile>) => {
    setForm((f) => ({ ...f, ...change }));
    setMessage(null);
  };
  const alertRef = useFocusOnError(error);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (running) return;
    setRunning(true);
    const t = await props.token();
    const r = t ? await saveProfile(props.api, t, form) : { ok: false as const, error: SIGN_IN };
    setRunning(false);
    setError(r.ok ? null : r.error);
    setMessage(r.ok ? "Einstellungen gespeichert." : null);
    if (!r.ok) return;
    setSaved(r.value);
    setForm(r.value);
    setProfileTimeZone(r.value.timeZone);
  }

  return (
    <form className="form" onSubmit={(e) => void send(e)} aria-label="Einstellungen" noValidate>
      <ProfileFields
        form={form}
        set={set}
        invalid={error?.details?.map((d) => d.field) ?? []}
        errorId={ERROR_ID}
        fromDevice={fromDevice}
      />
      <SwitchFields form={form} set={set} />
      {error && (
        <div role="alert" id={ERROR_ID} ref={alertRef} tabIndex={-1} className="warning">
          <p>{error.text}</p>
        </div>
      )}
      {message && (
        <p role="status" className="hint">
          {message}
        </p>
      )}
      <div className="actions">
        <button type="submit" className="primary" disabled={running || !dirty}>
          Speichern
        </button>
      </div>
    </form>
  );
}

/**
 * Profile and settings (US-ACC-02): display name, time zone (prefilled from the device until chosen), a switch per
 * notification occasion and the two global switches. The page says what happens next (P-09): the hint under the time
 * zone, the confirmation after saving, the refusal with its reason.
 */
export function SettingsPage(props: { api: string; token: Token }) {
  const load = useCallback((t: string) => loadProfile(props.api, t), [props.api]);
  return (
    <div className="light settings">
      <h1>Einstellungen</h1>
      <LoadFrame token={props.token} load={load} loadingText="Einstellungen werden geladen …">
        {(profile) => <SettingsForm api={props.api} token={props.token} profile={profile} />}
      </LoadFrame>
    </div>
  );
}
