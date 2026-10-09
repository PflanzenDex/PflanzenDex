import {
  browsePokedex,
  type CaughtSpecies,
  type FamilyGroup,
  type PokedexFilter,
  type PokedexSort,
} from "@pflanzendex/core";
import { useRef, useState } from "react";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button/button";
import { CardList } from "../pokedex-cards/pokedex-cards";
import { SpeciesDetail } from "../pokedex-detail/pokedex-detail";
import { useDetail } from "../use-detail";
import { Controls } from "../pokedex-controls/pokedex-controls";

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
  const groups = useCollapsedGroups();
  const { chosen, open, close } = useDetail(caught);
  if (chosen)
    return (
      <SpeciesDetail
        species={chosen}
        onClose={close}
        {...(onOpenSpecies ? { onOpenSpecies } : {})}
      />
    );
  if (caught.length === 0) return <NothingCaught />;
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
      {/* Spacing to the search label below, which has no top margin (#593). */}
      <p className="mb-3 mt-0 text-muted-foreground">{`${plural(caught.length)} gefangen`}</p>
      <Controls
        query={query}
        filter={filter}
        sort={sort}
        poorKnown={caught.some((c) => c.genusSpeciesCount !== null)}
        searchRef={search}
        onQuery={setQuery}
        onFilter={setFilter}
        onSort={setSort}
      />
      {shown !== caught.length && (
        <p className="m-0 text-muted-foreground">{`${shown} von ${plural(caught.length)}`}</p>
      )}
      {shown === 0 ? (
        <NoHit onReset={reset} />
      ) : sort === "family" ? (
        <Groups groups={result.groups} state={groups} onOpen={open} />
      ) : (
        <CardList label="Gefangene Arten" species={result.flat} onOpen={open} />
      )}
    </>
  );
}

function NothingCaught() {
  return (
    <EmptyState
      title="Noch keine Art gefangen."
      description="Lege ein Exemplar mit bestimmter Art an, dann zählt es."
      action={{ label: "Exemplar anlegen", href: "/collection" }}
    />
  );
}

function NoHit(props: { onReset: () => void }) {
  return (
    <EmptyState
      title="Keine Art gefunden."
      description="Ändere die Suche oder den Filter."
      action={{ label: "Suche zurücksetzen", onClick: props.onReset }}
    />
  );
}

const keyOf = (g: FamilyGroup) => g.family ?? "";

/** Which family groups are collapsed; kept by `Browse`, so it survives the detail view (US-POK-08). */
function useCollapsedGroups() {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setClosed((c) => {
      const next = new Set(c);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return { closed, toggle };
}

/** Collapsible family groups with "n / m"; m is unknown without the tree (US-POK-03), never guessed (P-08). */
function Groups(props: {
  groups: readonly FamilyGroup[];
  state: ReturnType<typeof useCollapsedGroups>;
  onOpen: (species: CaughtSpecies) => void;
}) {
  const { closed, toggle } = props.state;
  return (
    <>
      {props.groups.map((g) => {
        const open = !closed.has(keyOf(g));
        const name = g.family === null ? "Ohne bekannte Familie" : g.family;
        const german = g.familyGerman === null ? "" : ` (${g.familyGerman})`;
        // Without a family there is no family total to compare with: "1 Art", not "1 / unbekannt" (P-08).
        const count =
          g.family === null ? plural(g.caught) : `${g.caught} / ${g.total ?? "unbekannt"}`;
        return (
          <section key={keyOf(g)}>
            <h2 className="my-2 text-lg">
              <Button
                type="button"
                variant="outline"
                className="h-auto justify-start text-left font-semibold"
                aria-expanded={open}
                onClick={() => toggle(keyOf(g))}
              >
                <span aria-hidden="true">{open ? "▾ " : "▸ "}</span>
                {`${name}${german} · ${count}`}
              </Button>
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
