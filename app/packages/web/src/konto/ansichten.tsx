import type { Konto } from "./konto-api";

type Aktion = () => void;

export function Willkommen(props: {
  onRegistrieren: Aktion;
  onAnmelden: Aktion;
  hinweis?: string;
}) {
  return (
    <section className="karte" aria-labelledby="titel">
      <h1 id="titel">PflanzenDex</h1>
      <p className="lead">Deine Pflanzen, deine Sammlung. Lege ein Konto an, um zu starten.</p>
      {props.hinweis && (
        <p role="status" className="hinweis">
          {props.hinweis}
        </p>
      )}
      <div className="aktionen">
        <button type="button" className="primaer" onClick={props.onRegistrieren}>
          Konto anlegen
        </button>
        <button type="button" className="sekundaer" onClick={props.onAnmelden}>
          Anmelden
        </button>
      </div>
    </section>
  );
}

export function KontoAnsicht(props: {
  konto: Konto;
  onAbmelden: Aktion;
  onUeberallAbmelden: Aktion;
  fehler?: string;
}) {
  const { konto } = props;
  return (
    <section className="karte" aria-labelledby="titel">
      <h1 id="titel">Hallo{konto.anzeigename ? `, ${konto.anzeigename}` : ""}</h1>
      <dl className="daten">
        <dt>E-Mail</dt>
        <dd>{konto.email}</dd>
      </dl>
      {!konto.emailBestaetigt && (
        <p role="alert" className="warnung">
          E-Mail-Adresse bestätigen: Wir haben dir einen Link geschickt. Teilen mit Freunden ist
          erst danach möglich.
        </p>
      )}
      {props.fehler && (
        <p role="alert" className="warnung">
          {props.fehler}
        </p>
      )}
      <div className="aktionen">
        <button type="button" className="primaer" onClick={props.onAbmelden}>
          Abmelden
        </button>
        <button type="button" className="sekundaer" onClick={props.onUeberallAbmelden}>
          Auf allen Geräten abmelden
        </button>
      </div>
    </section>
  );
}

export function Laedt() {
  return (
    <section className="karte" aria-busy="true">
      <p role="status">Einen Moment, die Anmeldung wird geprüft …</p>
    </section>
  );
}

export function Fehler(props: { text: string; onNeuLaden: Aktion }) {
  return (
    <section className="karte">
      <p role="alert" className="warnung">
        {props.text}
      </p>
      <div className="aktionen">
        <button type="button" className="primaer" onClick={props.onNeuLaden}>
          Erneut versuchen
        </button>
      </div>
    </section>
  );
}
