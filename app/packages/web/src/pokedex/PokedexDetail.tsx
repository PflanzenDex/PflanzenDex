import type { CaughtSpecies } from "@pflanzendex/core";
import { useEffect, useRef } from "react";
import { catchText, countText } from "./PokedexCards";

/** A source is a link only if it is a plain http(s) address; anything else is shown as text, never as a link. */
function webAddress(source: string): URL | null {
  try {
    const url = new URL(source);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function Source(props: { source: string | null }) {
  if (props.source === null) return <p>Quelle: unbekannt</p>;
  const url = webAddress(props.source);
  if (url === null) return <p>{`Quelle: ${props.source}`}</p>;
  return (
    <p>
      <a href={url.href} target="_blank" rel="noopener noreferrer">
        {`Quelle öffnen (${url.hostname})`}
      </a>
    </p>
  );
}

const family = (c: CaughtSpecies) =>
  c.familyLatin === null
    ? "unbekannt"
    : c.familyGerman === null
      ? c.familyLatin
      : `${c.familyLatin} (${c.familyGerman})`;

/**
 * The detail view of one caught species (US-POK-09): replaces the list, so at most one is open; "Schließen" and
 * Escape close it. Image and short text come with the taxonomy build (US-POK-03): until then they are shown as
 * unknown, nothing is invented (P-08).
 */
export function SpeciesDetail(props: {
  species: CaughtSpecies;
  onClose: () => void;
  onOpenSpecies?: (id: string) => void;
}) {
  const { species: c, onClose, onOpenSpecies } = props;
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);
  useEffect(() => {
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <section className="detail" aria-label={`Details zu ${c.species}`}>
      <div className="detail-image">Noch kein Bild vorhanden.</div>
      <h2 ref={title} tabIndex={-1}>
        {c.germanName ?? c.species}
      </h2>
      {c.germanName !== null && <p className="species">{c.species}</p>}
      <p>Kurztext: unbekannt</p>
      <p>{`Gattung: ${c.genus}`}</p>
      <p>{`Familie: ${family(c)}`}</p>
      <p className="detail-status">Status: gefangen</p>
      <p>{countText(c.specimenCount)}</p>
      <p className="catch-date">{catchText(c.caughtDate)}</p>
      {c.chips.length > 0 && (
        <ul className="chips" aria-label="Zusätze">
          {c.chips.map((chip) => (
            <li key={chip} className="chip">
              {chip}
            </li>
          ))}
        </ul>
      )}
      <Source source={c.source} />
      <div className="detail-actions">
        {onOpenSpecies && (
          <button type="button" onClick={() => onOpenSpecies(c.speciesId)}>
            Zum Artprofil
          </button>
        )}
        <button type="button" className="secondary" onClick={onClose}>
          Schließen
        </button>
      </div>
    </section>
  );
}
