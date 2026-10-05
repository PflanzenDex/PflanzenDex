import type { Ownership, UnidentifiedSpecimen } from "@pflanzendex/core";
import { useCallback } from "react";
import { LoadFrame } from "../kernel";
import { Browse } from "./PokedexBrowse";
import { loadOwnership } from "./ownership-api";
import { PokedexPageSkeleton } from "./PokedexPage.skeleton";
import { CARD, GRID } from "./PokedexCards";

/**
 * The species the account has caught (US-POK-06): derived from the active specimens, never stored (P-01). A specimen
 * that does not count yet is named with the action that fixes it (P-09, P-10).
 */
export function PokedexPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  /** Link from the details to the species profile; the app wires it to the catalog (US-POK-09). */
  onOpenSpecies?: (id: string) => void;
}) {
  const { api, token, onOpenSpecies } = props;
  const load = useCallback((t: string) => loadOwnership(api, t), [api]);
  return (
    <div className="min-w-0">
      <LoadFrame
        token={token}
        load={load}
        loadingText="Pokédex wird geladen …"
        loadingFallback={<PokedexPageSkeleton label="Pokédex wird geladen …" />}
      >
        {(ownership: Ownership) => (
          <section aria-labelledby="pokedex-title">
            <h1 id="pokedex-title" className="mb-2 text-2xl font-semibold">
              Pokédex
            </h1>
            <Browse caught={ownership.caught} {...(onOpenSpecies ? { onOpenSpecies } : {})} />
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
      <h2 id="unidentified-title" className="mb-2 text-lg font-semibold">
        Noch nicht gezählt
      </h2>
      <ul className={GRID}>
        {props.specimens.map((s) => (
          <li key={s.specimenId} className={CARD}>
            <span>{s.text}</span>
            <span className="font-semibold">{s.nextAction}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
