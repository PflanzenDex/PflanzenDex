import {
  browsePokedex,
  type CaughtSpecies,
  type PokedexFilter,
  type PokedexSort,
} from "@pflanzendex/core";
import { useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { EmptyState } from "@/shared/patterns/elements/empty-state/empty-state";
import { useExitValue } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { IndexedList } from "@/shared/lists/indexed-list/indexed-list";
import { texts } from "@/shared/lib/text-rules/texts";
import { GroupSections } from "@/shared/lists/grouped-list/grouped-sections/grouped-sections";
import type { SectionGroup } from "@/shared/lists/grouped-list/grouped-sections/group-section/group-section";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { SpeciesList, SpeciesRow, speciesLayerId } from "../pokedex-cards/pokedex-cards";
import { germanNameOf } from "@/shared/species-name/species-name";
import { Controls } from "../pokedex-controls/pokedex-controls";
import { BrowseLayers } from "./browse-layers/browse-layers";
import table from "../pokedex-page/pokedex-page.de.json";

const ui = texts(table);

/** The name a species is sorted and filed by: the one its row shows, the German name where there is one (P-08). */
const shownName = (c: CaughtSpecies): string => germanNameOf(c.species, c.germanName) ?? c.species;

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
  /** The heading level of the families: one below the heading of the page or its section (SG-HEAD-03). */
  level?: 2 | 3;
}) {
  const { caught, onOpenSpecies } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PokedexFilter>("all");
  const [sort, setSort] = useState<PokedexSort>("alphabetical");
  const search = useRef<HTMLInputElement>(null);
  const [params] = useSearchParams();
  const chosen = caught.find((c) => speciesLayerId(c.species) === params.get("sheet"));
  // The species layer keeps its species while it slides out: the address has lost it at once (US-QS-15, F12).
  const shownChosen = useExitValue(chosen);
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <Controls query={query} searchRef={search} onQuery={setQuery} />
      {shown !== caught.length && (
        <p className="m-0 text-sm text-muted-foreground">{`${shown} von ${plural(caught.length)}`}</p>
      )}
      {shown === 0 ? (
        <NoHit onReset={reset} />
      ) : sort === "family" ? (
        <Families result={result} level={props.level ?? 2} />
      ) : (
        // Over 100 species sorted by name: the letter strip at the trailing edge (SG-LIST-11, issue 2419).
        <IndexedList
          items={result.flat}
          nameOf={shownName}
          byName={sort === "alphabetical"}
          label={ui("letterIndex")}
        >
          <SpeciesList
            label="Gefangene Arten"
            species={result.flat}
            resetKey={`${query}|${filter}|${sort}`}
          />
        </IndexedList>
      )}
      <BrowseLayers
        filter={filter}
        sort={sort}
        poorKnown={poorKnown}
        onFilter={setFilter}
        onSort={setSort}
        chosen={shownChosen}
        onOpenSpecies={onOpenSpecies}
      />
    </div>
  );
}

function NothingCaught() {
  return (
    <EmptyState
      title="Noch keine Art gefangen"
      description="Lege eine Pflanze mit bestimmter Art an, dann zählt sie."
      action={{ label: "Pflanze anlegen", href: "/collection" }}
    />
  );
}

function NoHit(props: { onReset: () => void }) {
  return (
    <EmptyState
      title="Keine Art gefunden"
      description="Ändere die Suche oder den Filter."
      action={{ label: "Suche zurücksetzen", onClick: props.onReset }}
    />
  );
}

/**
 * The species by family (SG-LIST-06): every family is a section of one scrolling list, in the order of the sort, the species
 * without a known family last. "n / m" keeps m "unbekannt" without the catalog tree (US-POK-03), never guessed (P-08). The
 * chips jump to a family.
 */
function Families(props: { result: ReturnType<typeof browsePokedex>; level: 2 | 3 }) {
  const groups: SectionGroup<CaughtSpecies>[] = props.result.groups.map((g) => {
    const name = g.family === null ? "Ohne bekannte Familie" : g.family;
    const german = g.familyGerman === null ? "" : ` (${g.familyGerman})`;
    // Without a family there is no family total to compare with: "1 Art", not "1 / unbekannt" (P-08).
    const count = g.family === null ? plural(g.caught) : `${g.caught} / ${g.total ?? "unbekannt"}`;
    return {
      key: g.family ?? "none",
      label: name,
      count: g.caught,
      countText: count,
      heading: `${name}${german} · ${count}`,
      items: g.species,
    };
  });
  return (
    <GroupSections
      label="Gefangene Arten"
      jumpLabel={ui("familyJump")}
      level={props.level}
      groups={groups}
      list={{
        listLabel: "Gefangene Arten",
        pageSize: 20,
        getKey: (c) => c.species,
        listClassName: OBJECT_GROUP,
        renderItem: (c) => <SpeciesRow c={c} />,
      }}
    />
  );
}
