import type { Account } from "./account-api";

type Action = () => void;

export function Welcome(props: { onRegister: Action; onSignIn: Action; hint?: string }) {
  return (
    <section className="card" aria-labelledby="title">
      <h1 id="title">PflanzenDex</h1>
      <p className="lead">Deine Pflanzen, deine Sammlung. Lege ein Konto an, um zu starten.</p>
      {props.hint && (
        <p role="status" className="hint">
          {props.hint}
        </p>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={props.onRegister}>
          Konto anlegen
        </button>
        <button type="button" className="secondary" onClick={props.onSignIn}>
          Anmelden
        </button>
      </div>
    </section>
  );
}

export function AccountView(props: {
  account: Account;
  onSignOut: Action;
  onEverywhereSignOut: Action;
  error?: string;
}) {
  const { account } = props;
  return (
    <section className="card" aria-labelledby="title">
      <h1 id="title">Hallo{account.displayName ? `, ${account.displayName}` : ""}</h1>
      <dl className="data">
        <dt>E-Mail</dt>
        <dd>{account.email}</dd>
      </dl>
      {!account.emailConfirmed && (
        <p role="alert" className="warning">
          E-Mail-Adresse bestätigen: Wir haben dir einen Link geschickt. Teilen mit Freunden ist
          erst danach möglich.
        </p>
      )}
      {props.error && (
        <p role="alert" className="warning">
          {props.error}
        </p>
      )}
      <div className="actions">
        <button type="button" className="primary" onClick={props.onSignOut}>
          Abmelden
        </button>
        <button type="button" className="secondary" onClick={props.onEverywhereSignOut}>
          Auf allen Geräten abmelden
        </button>
      </div>
    </section>
  );
}

export function Loading() {
  return (
    <section className="card" aria-busy="true">
      <p role="status">Einen Moment, die Anmeldung wird geprüft …</p>
    </section>
  );
}

export function AppError(props: { text: string; onReload: Action }) {
  return (
    <section className="card">
      <p role="alert" className="warning">
        {props.text}
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={props.onReload}>
          Erneut versuchen
        </button>
      </div>
    </section>
  );
}
