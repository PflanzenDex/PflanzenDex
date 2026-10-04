import type { Ownership, UnidentifiedSpecimen } from "@pflanzendex/core";
import { useCallback } from "react";
import { LoadFrame } from "../kernel";
import { Browse } from "./PokedexBrowse";
import { loadOwnership } from "./ownership-api";
import "./pokedex.css";

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
            <Browse caught={ownership.caught} />
            <Unidentified specimens={ownership.unidentified} />
          </section>
        )}
      </LoadFrame>
    </div>
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
