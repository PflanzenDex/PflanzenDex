import type { CreatedInvitation, InvitationRecord, InvitationStatus } from "@pflanzendex/core";
import { useState, type FormEvent } from "react";
import { instantText } from "./access-api";

const STATUS_TEXT: Record<InvitationStatus, string> = {
  open: "offen",
  redeemed: "eingelöst",
  expired: "abgelaufen",
};

/** Limits of the validity in days, as the server enforces them (INVITATION_VALIDITY_DAYS). */
const DAYS = { min: 1, max: 30, start: 7 } as const;

/** The mode in words (not only a switch state) and the one action that changes it. */
export function ModeSection(props: {
  invitationOnly: boolean;
  running: boolean;
  onChange: (invitationOnly: boolean) => void;
}) {
  const { invitationOnly } = props;
  return (
    <section aria-labelledby="mode-title">
      <h2 id="mode-title">Registrierung</h2>
      <p>
        Im Moment: <strong>{invitationOnly ? "nur mit Einladungscode" : "offen für alle"}</strong>
      </p>
      <p className="quiet">
        Bestehende Konten melden sich in beiden Fällen wie gewohnt an. Nur neue Personen brauchen
        bei Einladungspflicht einen Code.
      </p>
      <button
        type="button"
        className="secondary"
        disabled={props.running}
        onClick={() => props.onChange(!invitationOnly)}
      >
        {invitationOnly ? "Für alle öffnen" : "Nur mit Einladungscode erlauben"}
      </button>
    </section>
  );
}

/** The days field and the button; a value outside the limits is refused before anything is sent. */
export function InvitationForm(props: { running: boolean; onCreate: (days: number) => void }) {
  const [days, setDays] = useState(String(DAYS.start));
  const [problem, setProblem] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const n = Number(days);
    if (days.trim() === "" || !Number.isInteger(n) || n < DAYS.min || n > DAYS.max)
      return setProblem(`Gib eine ganze Zahl zwischen ${DAYS.min} und ${DAYS.max} ein.`);
    setProblem(null);
    props.onCreate(n);
  };
  return (
    <form onSubmit={submit} noValidate>
      <label>
        Gültig für (Tage)
        <input
          type="number"
          inputMode="numeric"
          min={DAYS.min}
          max={DAYS.max}
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      {problem && (
        <p role="alert" className="warning">
          {problem}
        </p>
      )}
      <button type="submit" className="primary" disabled={props.running}>
        Code erstellen
      </button>
    </form>
  );
}

/** The code is shown exactly once; afterwards only its hash exists on the server. */
export function NewCode(props: { created: CreatedInvitation }) {
  const { created } = props;
  return (
    <section className="new-code" aria-label="Neuer Einladungscode">
      <p>
        <code className="code">{created.code}</code>
      </p>
      <p className="hint">
        Gültig bis {instantText(created.expiresAt)}. Der Code wird nur jetzt angezeigt: Gib ihn
        weiter oder notiere ihn, später kannst du ihn nicht mehr ansehen.
      </p>
    </section>
  );
}

export function InvitationList(props: { invitations: readonly InvitationRecord[] }) {
  if (props.invitations.length === 0)
    return <p className="quiet">Noch keine Einladung erstellt. Erstelle oben einen Code.</p>;
  return (
    <ul className="list" aria-label="Einladungen">
      {props.invitations.map((i) => (
        <li key={i.id} className="entry">
          <strong>{STATUS_TEXT[i.status]}</strong> · erstellt {instantText(i.createdAt)} · gültig
          bis {instantText(i.expiresAt)}
          {i.redeemedAt ? ` · eingelöst ${instantText(i.redeemedAt)}` : ""}
        </li>
      ))}
    </ul>
  );
}
