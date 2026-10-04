import { useEffect, useState } from "react";
import type { AccountProfile } from "./account-api";
import { getProfile, updateProfile } from "./account-api";

type Token = () => Promise<string | undefined>;

const ERROR_TEXTS = {
  not_signed_in: "Du bist nicht angemeldet.",
  profile_not_loadable: "Einstellungen konnten nicht geladen werden.",
  profile_update_failed: "Einstellungen konnten nicht gespeichert werden.",
  input_invalid: "Ungültige Eingabe.",
} as const;

type LoadingState = "loading" | "loaded" | "saving" | "error";

function ProfileFields(props: {
  formData: Partial<AccountProfile>;
  onChange: (data: Partial<AccountProfile>) => void;
}) {
  return (
    <fieldset>
      <legend>Profil</legend>
      <div className="form-group">
        <label htmlFor="displayName">Anzeigename</label>
        <input
          id="displayName"
          type="text"
          value={props.formData.displayName ?? ""}
          onChange={(e) =>
            props.onChange({
              ...props.formData,
              displayName: e.target.value || null,
            })
          }
          placeholder="Dein Name (optional)"
        />
      </div>

      <div className="form-group">
        <label htmlFor="timeZone">Zeitzone</label>
        <input
          id="timeZone"
          type="text"
          value={props.formData.timeZone ?? ""}
          onChange={(e) =>
            props.onChange({
              ...props.formData,
              timeZone: e.target.value || null,
            })
          }
          placeholder="z.B. Europe/Berlin (optional)"
        />
      </div>
    </fieldset>
  );
}

function PrivacyFields(props: {
  formData: Partial<AccountProfile>;
  onChange: (data: Partial<AccountProfile>) => void;
}) {
  return (
    <fieldset>
      <legend>Datenschutz</legend>
      <div className="form-group">
        <label htmlFor="everythingPrivate">
          <input
            id="everythingPrivate"
            type="checkbox"
            checked={props.formData.everythingPrivate ?? false}
            onChange={(e) =>
              props.onChange({
                ...props.formData,
                everythingPrivate: e.target.checked,
              })
            }
          />
          Alles privat
        </label>
      </div>

      <div className="form-group">
        <label htmlFor="noRecommendations">
          <input
            id="noRecommendations"
            type="checkbox"
            checked={props.formData.noRecommendations ?? false}
            onChange={(e) =>
              props.onChange({
                ...props.formData,
                noRecommendations: e.target.checked,
              })
            }
          />
          Keine Empfehlungen
        </label>
      </div>
    </fieldset>
  );
}

function useSettings(api: string, token: Token) {
  const [state, setState] = useState<LoadingState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [formData, setFormData] = useState<Partial<AccountProfile>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const t = await token();
        if (!t) {
          setError(ERROR_TEXTS.not_signed_in ?? null);
          setState("error");
          return;
        }
        const p = await getProfile(api, t);
        setProfile(p);
        setFormData(p);
        setState("loaded");
      } catch (err) {
        const code = err instanceof Error ? err.message : "profile_not_loadable";
        const errorText =
          (ERROR_TEXTS as Record<string, string>)[code] ?? ERROR_TEXTS.profile_not_loadable;
        setError(errorText);
        setState("error");
      }
    };
    void load();
  }, [api, token]);

  const handleSave = async () => {
    if (!profile) return;
    setState("saving");
    try {
      const t = await token();
      if (!t) {
        setError(ERROR_TEXTS.not_signed_in ?? null);
        setState("error");
        return;
      }
      const updated = await updateProfile(api, t, formData);
      setProfile(updated);
      setFormData(updated);
      setState("loaded");
      setError(null);
    } catch (err) {
      const code = err instanceof Error ? err.message : "profile_update_failed";
      const errorText =
        (ERROR_TEXTS as Record<string, string>)[code] ?? ERROR_TEXTS.profile_update_failed;
      setError(errorText);
      setState("error");
    }
  };

  return { state, error, profile, formData, setFormData, handleSave };
}

export function SettingsPage(props: { api: string; token: Token }) {
  const { state, error, profile, formData, setFormData, handleSave } = useSettings(
    props.api,
    props.token,
  );
  const isDirty = JSON.stringify(profile) !== JSON.stringify(formData);

  return (
    <section className="card" aria-labelledby="title">
      <h1 id="title">Einstellungen</h1>
      {state === "loading" && <p role="status">Einstellungen werden geladen …</p>}
      {state === "error" && error && (
        <p role="alert" className="warning">
          {error}
        </p>
      )}
      {state !== "loading" && profile && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <ProfileFields formData={formData} onChange={setFormData} />
          <PrivacyFields formData={formData} onChange={setFormData} />

          <div className="actions">
            <button type="submit" className="primary" disabled={!isDirty || state === "saving"}>
              {state === "saving" ? "Wird gespeichert …" : "Speichern"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
