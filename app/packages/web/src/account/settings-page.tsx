import "./settings.css";
import { useCallback, useState, type FormEvent } from "react";
import { LoadFrame, SIGN_IN, deviceTimeZone, setProfileTimeZone, type ApiError } from "../kernel";
import { loadProfile, saveProfile, type AccountProfile } from "./account-api";
import { ProfileFields, SwitchFields } from "./settings-fields";

type Token = () => Promise<string | undefined>;

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
        fromDevice={fromDevice}
      />
      <SwitchFields form={form} set={set} />
      {error && (
        <div role="alert" className="warning">
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
