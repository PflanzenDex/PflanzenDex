import { AbleitungsFormular, type Ableiten } from "./ableitung-ansicht";
import type { ApiFehler, LichtDaten } from "./licht-api";
import { StandortFormular, StandortKarte, type StandortEingabe } from "./standorte-ansicht";
import { ZonenFormular, ZonenKarte, type ZonenEingabe } from "./zonen-ansicht";

type Fehler = Promise<ApiFehler | null>;

export interface LichtAktionen {
  zoneAnlegen: (e: ZonenEingabe) => Fehler;
  zoneAendern: (id: string, e: ZonenEingabe) => Fehler;
  zoneLoeschen: (id: string) => Fehler;
  voreinstellung: () => Fehler;
  standortAnlegen: (e: StandortEingabe) => Fehler;
  standortAendern: (id: string, e: StandortEingabe) => Fehler;
  zoneAbleiten: Ableiten;
}

/** Hinweise (US-BES-08): jeder Hinweis nennt, was zu tun ist (P-09). */
function Hinweise({ daten }: { daten: LichtDaten }) {
  if (daten.hinweise.length === 0) return null;
  return (
    <section aria-labelledby="hinweise" className="hinweise">
      <h2 id="hinweise">Hinweise</h2>
      <ul>
        {daten.hinweise.map((h) => (
          <li key={h.standortId}>
            {h.text} {h.naechsteHandlung}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Zonen(props: { daten: LichtDaten; aktionen: LichtAktionen }) {
  const { daten, aktionen } = props;
  return (
    <section aria-labelledby="zonen">
      <h2 id="zonen">Lichtzonen</h2>
      {daten.zonen.length === 0 ? (
        <div className="leer">
          <p>
            Noch keine Lichtzonen. Übernimm die vier Standard-Lampen oder lege unten eine eigene
            Zone an.
          </p>
          <div className="aktionen">
            <ButtonVoreinstellung onKlick={aktionen.voreinstellung} />
          </div>
        </div>
      ) : (
        <ul className="liste">
          {daten.zonen.map((z) => (
            <ZonenKarte
              key={z.id}
              zone={z}
              onAendern={(e) => aktionen.zoneAendern(z.id, e)}
              onLoeschen={() => aktionen.zoneLoeschen(z.id)}
            />
          ))}
        </ul>
      )}
      <details className="neu" open={daten.zonen.length === 0}>
        <summary>Neue Lichtzone</summary>
        <ZonenFormular onSpeichern={aktionen.zoneAnlegen} />
      </details>
    </section>
  );
}

function ButtonVoreinstellung({ onKlick }: { onKlick: () => Fehler }) {
  return (
    <button type="button" className="primaer" onClick={() => void onKlick()}>
      Standard-Lampen übernehmen
    </button>
  );
}

function Standorte(props: { daten: LichtDaten; aktionen: LichtAktionen }) {
  const { daten, aktionen } = props;
  return (
    <section aria-labelledby="standorte">
      <h2 id="standorte">Standorte</h2>
      {daten.standorte.length === 0 ? (
        <p className="leer">
          Noch keine Standorte. Lege einen Platz an, z. B. „Fensterbank“, und ordne ihm eine
          Lichtzone zu.
        </p>
      ) : (
        <ul className="liste">
          {daten.standorte.map((s) => (
            <StandortKarte
              key={s.id}
              standort={s}
              zonen={daten.zonen}
              onAendern={(e) => aktionen.standortAendern(s.id, e)}
            />
          ))}
        </ul>
      )}
      <details className="neu">
        <summary>Neuer Standort</summary>
        <StandortFormular zonen={daten.zonen} onSpeichern={aktionen.standortAnlegen} />
      </details>
    </section>
  );
}

function Zuordnung({ aktionen }: { aktionen: LichtAktionen }) {
  return (
    <section aria-labelledby="zuordnung">
      <h2 id="zuordnung">Zone einer Art ermitteln</h2>
      <p className="leise">
        Die Zone folgt dem Lux-Bedarf der Art und deinen Lichtzonen. Stecklingslicht ist nie das
        Ziel für erwachsene Pflanzen.
      </p>
      <AbleitungsFormular onAbleiten={aktionen.zoneAbleiten} />
    </section>
  );
}

export function LichtAnsicht(props: {
  daten: LichtDaten;
  aktionen: LichtAktionen;
  fehler?: ApiFehler;
}) {
  return (
    <div className="licht">
      <h1>Standorte und Lichtzonen</h1>
      <p className="lead">
        Hier bildest du deinen Aufbau ab: wo deine Pflanzen stehen und wie viel Licht dort ankommt.
      </p>
      {props.fehler && (
        <p role="alert" className="warnung">
          {props.fehler.text}
        </p>
      )}
      <Hinweise daten={props.daten} />
      <Zonen daten={props.daten} aktionen={props.aktionen} />
      <Standorte daten={props.daten} aktionen={props.aktionen} />
      <Zuordnung aktionen={props.aktionen} />
    </div>
  );
}
