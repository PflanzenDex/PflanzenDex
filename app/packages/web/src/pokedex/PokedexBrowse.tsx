import {
  browsePokedex,
  type CaughtSpecies,
  type FamilyGroup,
  type PokedexFilter,
  type PokedexSort,
} from "@pflanzendex/core";
import { useRef, useState } from "react";
import { CardList } from "./PokedexCards";
import { SpeciesDetail } from "./PokedexDetail";
import { useDetail } from "./use-detail";
import { Controls } from "./PokedexControls";

const plural = (n: number) => `${n} ${n === 1 ? "Art" : "Arten"}`;

/**
 * Search, filter and sort of the caught species (US-POK-08). "Fehlend" needs the catalog tree and "Artenarm" the species
 * count of the genus (both US-POK-03): while they do not exist the buttons are disabled and say why (P-08, P-10).
 */
export function Browse(props: {
  caught: readonly CaughtSpecies[];
  onOpenSpecies?: (id: string) => void;
}) {
  const { caught, onOpenSpecies } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PokedexFilter>("all");
  const [sort, setSort] = useState<PokedexSort>("alphabetical");
  const search = useRef<HTMLInputElement>(null);
  const { chosen, open, close } = useDetail(caught);
  if (chosen)
    return (
      <SpeciesDetail
        species={chosen}
        onClose={close}
        {...(onOpenSpecies ? { onOpenSpecies } : {})}
      />
    );
  if (caught.length === 0)
    return <p>Noch keine Art gefangen. Lege ein Exemplar mit bestimmter Art an, dann zählt es.</p>;
  const poorKnown = caught.some((c) => c.genusSpeciesCount !== null);
  const result = browsePokedex(caught, { query, filter, sort });
  const shown =
    sort === "family" ? result.groups.reduce((n, g) => n + g.caught, 0) : result.flat.length;
  const reset = () => {
    setQuery("");
    setFilter("all");
    search.current?.focus();
  };
  return (
    <>
      <p className="quiet">{`${plural(caught.length)} gefangen`}</p>
      <Controls
        query={query}
        filter={filter}
        sort={sort}
        poorKnown={poorKnown}
        searchRef={search}
        onQuery={setQuery}
        onFilter={setFilter}
        onSort={setSort}
      />
      {shown !== caught.length && (
        <p className="quiet">{`${shown} von ${plural(caught.length)}`}</p>
      )}
      {shown === 0 ? (
        <div>
          <p role="status">Keine Art gefunden.</p>
          <button type="button" onClick={reset}>
            Suche zurücksetzen
          </button>
        </div>
      ) : sort === "family" ? (
        <Groups groups={result.groups} onOpen={open} />
      ) : (
        <CardList label="Gefangene Arten" species={result.flat} onOpen={open} />
      )}
    </>
  );
}

const keyOf = (g: FamilyGroup) => g.family ?? "";

/** Collapsible family groups with "n / m"; m is unknown without the tree (US-POK-03), never guessed (P-08). */
function Groups(props: {
  groups: readonly FamilyGroup[];
  onOpen: (species: CaughtSpecies) => void;
}) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setClosed((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <>
      {props.groups.map((g) => {
        const open = !closed.has(keyOf(g));
        const name = g.family === null ? "Familie unbekannt" : g.family;
        const german = g.familyGerman === null ? "" : ` (${g.familyGerman})`;
        return (
          <section key={keyOf(g)} className="family">
            <h2>
              <button
                type="button"
                className="family-toggle"
                aria-expanded={open}
                onClick={() => toggle(keyOf(g))}
              >
                <span aria-hidden="true">{open ? "▾ " : "▸ "}</span>
                {`${name}${german} · ${g.caught} / ${g.total ?? "unbekannt"}`}
              </button>
            </h2>
            {open && (
              <CardList
                label={`Gefangene Arten: ${name}`}
                species={g.species}
                onOpen={props.onOpen}
              />
            )}
          </section>
        );
      })}
    </>
  );
}
