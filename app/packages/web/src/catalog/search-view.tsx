import type { SpeciesHit, NameField } from "@pflanzendex/core";
import { badge } from "./text";

const FOUND: Record<NameField, string> = {
  latin: "lateinischen Namen",
  german: "deutschen Namen",
  english: "englischen Namen",
  synonym: "Synonym",
};

function Hit({ t, onOpen }: { t: SpeciesHit; onOpen: (id: string) => void }) {
  // Searching by the own Latin/German name is self-evident; explain only what deviates.
  const over = t.hit && t.hit.field !== "latin" && t.hit.field !== "german";
  return (
    <li className="entry">
      <button type="button" className="species-button" onClick={() => onOpen(t.id)}>
        <span className="species-name">
          <i>{t.latinName}</i>
        </span>
        {t.germanName && <span className="quiet">{t.germanName}</span>}
        {over && t.hit && (
          <span className="quiet">
            Gefunden über {FOUND[t.hit.field]}: {t.hit.display}
          </span>
        )}
        <span className="badge">{badge(t)}</span>
      </button>
    </li>
  );
}

function Empty(props: { searchText: string; onPropose: () => void }) {
  return (
    <div className="empty">
      <p>
        {props.searchText.trim()
          ? `Keine Art zu „${props.searchText.trim()}“ gefunden. Prüfe die Schreibweise oder schlage die Art vor.`
          : "Der gemeinsame Katalog ist noch leer. Schlage die erste Art vor."}
      </p>
      <div className="actions">
        <button type="button" className="primary" onClick={props.onPropose}>
          Art vorschlagen
        </button>
      </div>
    </div>
  );
}

/** Catalog search by Latin or German name and synonyms; without hits "Propose species" follows (P-09). */
export function SpeciesSearch(props: {
  searchText: string;
  hit: readonly SpeciesHit[];
  loading?: boolean;
  onSearch: (text: string) => void;
  onOpen: (id: string) => void;
  onPropose: () => void;
}) {
  return (
    <section aria-labelledby="search-title">
      <h1 id="search-title">Art wählen</h1>
      <p className="lead">
        Suche die Art deiner Pflanze im Katalog. Findest du sie nicht, schlage sie vor.
      </p>
      <form role="search" className="form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Lateinischer oder deutscher Name
          <input
            type="search"
            name="search"
            value={props.searchText}
            autoComplete="off"
            maxLength={120}
            onChange={(e) => props.onSearch(e.target.value)}
          />
        </label>
      </form>
      <div role="status" aria-live="polite">
        {props.loading && <p className="quiet">Suche läuft …</p>}
      </div>
      {props.hit.length === 0 ? (
        !props.loading && <Empty searchText={props.searchText} onPropose={props.onPropose} />
      ) : (
        <>
          <ul className="list">
            {props.hit.map((t) => (
              <Hit key={t.id} t={t} onOpen={props.onOpen} />
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="secondary" onClick={props.onPropose}>
              Nicht dabei? Art vorschlagen
            </button>
          </div>
        </>
      )}
    </section>
  );
}
