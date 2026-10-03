import type { ArtTreffer, NamensFeld } from "@pflanzendex/core";
import { marke } from "./text";

const GEFUNDEN: Record<NamensFeld, string> = {
  lateinisch: "lateinischen Namen",
  deutsch: "deutschen Namen",
  englisch: "englischen Namen",
  synonym: "Synonym",
};

function Treffer({ t, onOeffnen }: { t: ArtTreffer; onOeffnen: (id: string) => void }) {
  // Über den eigenen lateinischen/deutschen Namen zu suchen ist selbstverständlich; nur Abweichendes erklären.
  const ueber = t.treffer && t.treffer.feld !== "lateinisch" && t.treffer.feld !== "deutsch";
  return (
    <li className="eintrag">
      <button type="button" className="artknopf" onClick={() => onOeffnen(t.id)}>
        <span className="artname">
          <i>{t.lateinischerName}</i>
        </span>
        {t.deutscherName && <span className="leise">{t.deutscherName}</span>}
        {ueber && t.treffer && (
          <span className="leise">
            Gefunden über {GEFUNDEN[t.treffer.feld]}: {t.treffer.anzeige}
          </span>
        )}
        <span className="marke">{marke(t)}</span>
      </button>
    </li>
  );
}

function Leer(props: { suchtext: string; onVorschlagen: () => void }) {
  return (
    <div className="leer">
      <p>
        {props.suchtext.trim()
          ? `Keine Art zu „${props.suchtext.trim()}“ gefunden. Prüfe die Schreibweise oder schlage die Art vor.`
          : "Der gemeinsame Katalog ist noch leer. Schlage die erste Art vor."}
      </p>
      <div className="aktionen">
        <button type="button" className="primaer" onClick={props.onVorschlagen}>
          Art vorschlagen
        </button>
      </div>
    </div>
  );
}

/** Suche im Katalog nach lateinischem oder deutschem Namen und Synonymen; ohne Treffer folgt „Art vorschlagen“ (P-09). */
export function ArtSuche(props: {
  suchtext: string;
  treffer: readonly ArtTreffer[];
  laedt?: boolean;
  onSuche: (text: string) => void;
  onOeffnen: (id: string) => void;
  onVorschlagen: () => void;
}) {
  return (
    <section aria-labelledby="suche-titel">
      <h1 id="suche-titel">Art wählen</h1>
      <p className="lead">
        Suche die Art deiner Pflanze im Katalog. Findest du sie nicht, schlage sie vor.
      </p>
      <form role="search" className="formular" onSubmit={(e) => e.preventDefault()}>
        <label>
          Lateinischer oder deutscher Name
          <input
            type="search"
            name="suche"
            value={props.suchtext}
            autoComplete="off"
            maxLength={120}
            onChange={(e) => props.onSuche(e.target.value)}
          />
        </label>
      </form>
      <div role="status" aria-live="polite">
        {props.laedt && <p className="leise">Suche läuft …</p>}
      </div>
      {props.treffer.length === 0 ? (
        !props.laedt && <Leer suchtext={props.suchtext} onVorschlagen={props.onVorschlagen} />
      ) : (
        <>
          <ul className="liste">
            {props.treffer.map((t) => (
              <Treffer key={t.id} t={t} onOeffnen={props.onOeffnen} />
            ))}
          </ul>
          <div className="aktionen">
            <button type="button" className="sekundaer" onClick={props.onVorschlagen}>
              Nicht dabei? Art vorschlagen
            </button>
          </div>
        </>
      )}
    </section>
  );
}
