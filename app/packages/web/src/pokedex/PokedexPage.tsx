import type { CatchDate, CaughtSpecies, Ownership, UnidentifiedSpecimen } from "@pflanzendex/core";
import { useCallback } from "react";
import { LoadFrame } from "../kernel";
import { loadOwnership } from "./ownership-api";
import "./pokedex.css";

const countText = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/** `2026-03-05` becomes `05.03.2026`; a calendar date is never run through `Date` (NFR-08). */
const germanDate = (date: string) => date.split("-").reverse().join(".");

/** "gefangen 05.03.2026", "gefangen ≈ 05.03.2026" (creation date) or "Datum unbekannt" (US-POK-07, P-08). */
function catchText(d: CatchDate): string {
  if (d.date === null) return "Datum unbekannt";
  return `gefangen ${d.source === "created_at" ? "≈ " : ""}${germanDate(d.date)}`;
}

/**
 * The species the account has caught (US-POK-06): derived from the active specimens, never stored (P-01). A specimen
 * that does not count yet is named with the action that fixes it (P-09, P-10).
 */
export function PokedexPage(props: { api: string; token: () => Promise<string | undefined> }) {
  const { api, token } = props;
  const load = useCallback((t: string) => loadOwnership(api, t), [api]);
  return (
    <div className="pokedex">
      <LoadFrame token={token} load={load} loadingText="Pokédex wird geladen …">
        {(ownership: Ownership) => (
          <section aria-labelledby="pokedex-title">
            <h1 id="pokedex-title">Pokédex</h1>
            <Caught caught={ownership.caught} />
            <Unidentified specimens={ownership.unidentified} />
          </section>
        )}
      </LoadFrame>
    </div>
  );
}

function Caught(props: { caught: readonly CaughtSpecies[] }) {
  const n = props.caught.length;
  if (n === 0)
    return <p>Noch keine Art gefangen. Lege ein Exemplar mit bestimmter Art an, dann zählt es.</p>;
  return (
    <>
      <p className="quiet">{`${n} ${n === 1 ? "Art" : "Arten"} gefangen`}</p>
      <ul className="caught-grid" aria-label="Gefangene Arten">
        {props.caught.map((c) => (
          <li key={c.species} className="caught-card">
            <span className="species">{c.species}</span>
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
    </>
  );
}

function Unidentified(props: { specimens: readonly UnidentifiedSpecimen[] }) {
  if (props.specimens.length === 0) return null;
  return (
    <section aria-labelledby="unidentified-title">
      <h2 id="unidentified-title">Noch nicht gezählt</h2>
      <ul className="caught-grid">
        {props.specimens.map((s) => (
          <li key={s.specimenId} className="caught-card">
            <span>{s.text}</span>
            <span className="next-action">{s.nextAction}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
