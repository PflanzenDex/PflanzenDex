import type { Ownership, UnidentifiedSpecimen } from "@pflanzendex/core";
import { useCallback, useEffect } from "react";
import { CollectorCards } from "@/components/collector-cards/collector-cards";
import { LoadFrame } from "../kernel";
import { Browse } from "./PokedexBrowse";
import { loadOwnership } from "./caught/ownership-api";
import { PokedexPageSkeleton } from "./PokedexPage.skeleton";
import { CARD, GRID } from "./PokedexCards";
import { CollectorRank } from "./collector-rank/collector-rank";
import { Milestones } from "./milestones/milestones";
import { NewlyCaught } from "./caught/newly-caught/newly-caught";

/** Set when a destination shows this page below its own title (US-QS-14). */
type Host = { onCaption: (text: string | null) => void };

/** Tells the host the count line of the loaded page and takes it back when the page goes away (US-QS-14). */
function ReportCaption({ host, caught }: { host: Host | undefined; caught: number }) {
  useEffect(() => {
    host?.onCaption(`${caught} gefangen`);
    return () => host?.onCaption(null);
  }, [host, caught]);
  return null;
}

/**
 * The species the account has caught (US-POK-06): derived from the active specimens, never stored (P-01). A specimen
 * that does not count yet is named with the action that fixes it (P-09, P-10). Species caught since the last visit are
 * announced above the rank until the keeper confirms (US-POK-12).
 */
export function PokedexPage(props: {
  api: string;
  token: () => Promise<string | undefined>;
  /** Link from the details to the species profile; the app wires it to the catalog (US-POK-09). */
  onOpenSpecies?: (id: string) => void;
  /** The destination "Sammlung" shows the page below its title: the heading is then a section name (US-QS-14). */
  host?: Host;
}) {
  const { api, token, onOpenSpecies, host } = props;
  const load = useCallback((t: string) => loadOwnership(api, t), [api]);
  return (
    <div className="min-w-0">
      <LoadFrame
        queryKey={["pokedex", "ownership"]}
        token={token}
        load={load}
        loadingText="Pokédex wird geladen …"
        {...(host ? {} : { heading: "Pokédex" })}
        loadingFallback={<PokedexPageSkeleton label="Pokédex wird geladen …" />}
      >
        {(ownership: Ownership) => (
          <section aria-labelledby="pokedex-title">
            <ReportCaption host={host} caught={ownership.caught.length} />
            {host ? (
              <h2 id="pokedex-title" className="sr-only">
                Arten
              </h2>
            ) : (
              <h1 id="pokedex-title" className="mb-2 text-2xl font-semibold">
                Pokédex
              </h1>
            )}
            <NewlyCaught api={api} token={token} caught={ownership.caught} />
            <CollectorRank caught={ownership.caught.length} />
            <Milestones caught={ownership.caught} />
            <Browse caught={ownership.caught} {...(onOpenSpecies ? { onOpenSpecies } : {})} />
            <Unidentified specimens={ownership.unidentified} />
            <CollectorCards api={api} token={token} />
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
