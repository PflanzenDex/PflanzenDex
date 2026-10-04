import type { CatchDate, CaughtSpecies } from "@pflanzendex/core";

export const countText = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/** `2026-03-05` becomes `05.03.2026`; a calendar date is never run through `Date` (NFR-08). */
const germanDate = (date: string) => date.split("-").reverse().join(".");

/** "gefangen 05.03.2026", "gefangen ≈ 05.03.2026" (creation date) or "Datum unbekannt" (US-POK-07, P-08). */
export function catchText(d: CatchDate): string {
  if (d.date === null) return "Datum unbekannt";
  return `gefangen ${d.source === "created_at" ? "≈ " : ""}${germanDate(d.date)}`;
}

/** The cards of caught species (US-POK-06); a tap on the name opens the details (US-POK-09); the German name is shown where it is known, never invented (P-08). */
export function CardList(props: {
  label: string;
  species: readonly CaughtSpecies[];
  onOpen: (species: CaughtSpecies) => void;
}) {
  return (
    <ul className="caught-grid" aria-label={props.label}>
      {props.species.map((c) => (
        <li key={c.species} className="caught-card">
          <button
            type="button"
            className="species card-open"
            data-species={c.species}
            aria-label={`Details zu ${c.species}`}
            onClick={() => props.onOpen(c)}
          >
            {c.species}
          </button>
          {c.germanName !== null && <span>{c.germanName}</span>}
          <span className="quiet">{c.genus}</span>
          {c.chips.length > 0 && (
            <ul className="chips" aria-label="Zusätze">
              {c.chips.map((chip) => (
                <li key={chip} className="chip">
                  {chip}
                </li>
              ))}
            </ul>
          )}
          <span className="catch-date">{catchText(c.caughtDate)}</span>
          <span className="quiet">{countText(c.specimenCount)}</span>
        </li>
      ))}
    </ul>
  );
}
