import { OCCASIONS, type AccountProfile, type Occasion } from "./account-api";

const OCCASION_TEXT: Record<Occasion, string> = {
  phase: "Pflegephasen",
  treatment: "Behandlungen",
  measurement: "Messungen",
  watering: "Gießen",
  swap: "Tausch",
  friends: "Freunde",
};

const zones = (): string[] => {
  const all = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  return all ? all("timeZone") : [];
};

export function ProfileFields(props: {
  form: AccountProfile;
  set: (change: Partial<AccountProfile>) => void;
  invalid: readonly string[];
  fromDevice: boolean;
}) {
  const { form, set } = props;
  return (
    <>
      <label>
        Anzeigename
        <input
          autoComplete="nickname"
          maxLength={80}
          aria-invalid={props.invalid.includes("displayName")}
          value={form.displayName ?? ""}
          onChange={(e) => set({ displayName: e.target.value === "" ? null : e.target.value })}
        />
      </label>
      <p className="note">
        Du kannst jeden Namen wählen, er muss nicht einmalig sein. Freunde finden dich über eine
        Einladung, nicht über den Namen.
      </p>
      <label>
        Zeitzone
        <input
          list="time-zones"
          autoComplete="off"
          aria-invalid={props.invalid.includes("timeZone")}
          value={form.timeZone ?? ""}
          onChange={(e) => set({ timeZone: e.target.value === "" ? null : e.target.value })}
        />
        <datalist id="time-zones">
          {zones().map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>
      <p className="note">
        {props.fromDevice
          ? "Vom Gerät übernommen. Speichere, um sie festzulegen."
          : "Pflegephasen, Termine und „heute“ richten sich nach dieser Zeitzone."}
      </p>
    </>
  );
}

function Switch(props: {
  label: string;
  checked: boolean;
  invalid?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={props.checked}
        aria-invalid={props.invalid}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      {props.label}
    </label>
  );
}

export function SwitchFields(props: {
  form: AccountProfile;
  set: (change: Partial<AccountProfile>) => void;
}) {
  const { form, set } = props;
  return (
    <>
      <fieldset className="choice">
        <legend>Benachrichtigungen</legend>
        {OCCASIONS.map((o) => (
          <Switch
            key={o}
            label={OCCASION_TEXT[o]}
            checked={form.notifications[o]}
            onChange={(on) => set({ notifications: { ...form.notifications, [o]: on } })}
          />
        ))}
        <p className="note">
          Deine Auswahl wird gespeichert. Erinnerungen werden erst verschickt, wenn sie eingerichtet
          sind.
        </p>
      </fieldset>
      <fieldset className="choice">
        <legend>Datenschutz und Empfehlungen</legend>
        <Switch
          label="Alles privat"
          checked={form.everythingPrivate}
          onChange={(on) => set({ everythingPrivate: on })}
        />
        <Switch
          label="Keine Empfehlungen"
          checked={form.noRecommendations}
          onChange={(on) => set({ noRecommendations: on })}
        />
        <p className="note">
          „Alles privat“ setzt alle Freigaben aus, ohne sie zu löschen. Ohne Empfehlungen zeigt die
          App keine Ausrüstungsvorschläge.
        </p>
      </fieldset>
    </>
  );
}
