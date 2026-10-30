import {
  browsePokedex,
  type CaughtSpecies,
  type PokedexFilter,
  type PokedexSort,
} from "@pflanzendex/core";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { EmptyState } from "@/components/shared/empty-state/empty-state";
import { LayerSheet } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { PagedGroups } from "@/components/shared/responsive/paged-groups/paged-groups";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import {
  SPECIES_LIST,
  SpeciesPager,
  SpeciesRow,
  speciesLayerId,
} from "../pokedex-cards/pokedex-cards";
import { SpeciesDetail } from "../pokedex-detail/pokedex-detail";
import { Controls, FILTER_LAYER, FilterPanel } from "../pokedex-controls/pokedex-controls";

const plural = (n: number) => `${n} ${n === 1 ? "Art" : "Arten"}`;

/**
 * Search, filter and sort of the caught species (US-POK-08) on one screen (US-QS-22): the row of search and "Filter",
 * and the species as pages of compact entries. "Fehlend" needs the catalog tree and "Artenarm" the species count of the
 * genus (both US-POK-03): while they do not exist the layer "Filter" says why instead of showing a dead chip (P-08,
 * P-10). A species opens its details in a layer.
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
  const [params] = useSearchParams();
  const chosen = caught.find((c) => speciesLayerId(c.species) === params.get("sheet"));
  if (caught.length === 0) return <NothingCaught />;
  const result = browsePokedex(caught, { query, filter, sort });
  const shown =
    sort === "family" ? result.groups.reduce((n, g) => n + g.caught, 0) : result.flat.length;
  const reset = () => {
    setQuery("");
    setFilter("all");
    search.current?.focus();
  };
  const poorKnown = caught.some((c) => c.genusSpeciesCount !== null);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Controls query={query} searchRef={search} onQuery={setQuery} />
      {shown !== caught.length && (
        <p className="m-0 text-sm text-muted-foreground">{`${shown} von ${plural(caught.length)}`}</p>
      )}
      {shown === 0 ? (
        <NoHit onReset={reset} />
      ) : sort === "family" ? (
        <Families result={result} />
      ) : (
        <SpeciesPager
          label="Gefangene Arten"
          species={result.flat}
          resetKey={`${query}|${filter}|${sort}`}
        />
      )}
      <LayerSheet id={FILTER_LAYER} title="Filter">
        <FilterPanel
          filter={filter}
          sort={sort}
          poorKnown={poorKnown}
          onFilter={setFilter}
          onSort={setSort}
        />
      </LayerSheet>
      {chosen ? (
        <LayerSheet id={speciesLayerId(chosen.species)} title={chosen.germanName ?? chosen.species}>
          <SpeciesDetail species={chosen} {...(onOpenSpecies ? { onOpenSpecies } : {})} />
        </LayerSheet>
      ) : null}
    </div>
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

/**
 * The species by family: the family is chosen from a row with its count, its species are paged. "n / m" keeps m
 * "unbekannt" without the catalog tree (US-POK-03), never guessed (P-08).
 */
function Families(props: { result: ReturnType<typeof browsePokedex> }) {
  const size = useRowPageSize();
  const groups = props.result.groups.map((g) => {
    const name = g.family === null ? "Ohne bekannte Familie" : g.family;
    const german = g.familyGerman === null ? "" : ` (${g.familyGerman})`;
    // Without a family there is no family total to compare with: "1 Art", not "1 / unbekannt" (P-08).
    const count = g.family === null ? plural(g.caught) : `${g.caught} / ${g.total ?? "unbekannt"}`;
    return {
      key: g.family ?? "",
      label: name,
      items: g.species,
      title: `${name}${german} · ${count}`,
    };
  });
  return (
    <PagedGroups
      choicesLabel="Familie wählen"
      listLabel="Gefangene Arten"
      groups={groups}
      pageSize={size}
      getKey={(c) => c.species}
      listClassName={SPECIES_LIST}
      renderItem={(c) => <SpeciesRow c={c} />}
      intro={(g) => (
        <p className="m-0 text-sm text-muted-foreground">
          {groups.find((x) => x.key === g.key)?.title}
        </p>
      )}
    />
  );
}
