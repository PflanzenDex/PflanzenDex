import type { PokedexFilter, PokedexSort } from "@pflanzendex/core";
import type { RefObject } from "react";

const FILTERS: readonly { id: PokedexFilter | "missing"; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "caught", label: "Gefangen" },
  { id: "missing", label: "Fehlend" },
  { id: "species_poor", label: "Artenarm" },
];
const SORTS: readonly { id: PokedexSort; label: string }[] = [
  { id: "alphabetical", label: "Alphabetisch" },
  { id: "family", label: "Familie" },
  { id: "catch_date", label: "Fangdatum" },
  { id: "species_count", label: "Artenzahl" },
];

/**
 * Search field, filter buttons and sort selection (US-POK-08). "Fehlend" needs the catalog tree and "Artenarm" the
 * species count of the genus (both US-POK-03): while they do not exist the buttons are disabled and say why (P-08, P-10).
 * The chosen filter has a visible marker (see `pokedex.css`), not only `aria-pressed`.
 */
export function Controls(props: {
  query: string;
  filter: PokedexFilter;
  sort: PokedexSort;
  poorKnown: boolean;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
  onFilter: (filter: PokedexFilter) => void;
  onSort: (sort: PokedexSort) => void;
}) {
  const { poorKnown } = props;
  return (
    <div className="browse">
      <label className="search">
        <span>Suche (Art, deutscher Name, Gattung, Familie)</span>
        <input
          ref={props.searchRef}
          type="search"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
        />
      </label>
      <FilterButtons filter={props.filter} poorKnown={poorKnown} onFilter={props.onFilter} />
      <p className="quiet hint">
        Fehlende Arten brauchen den Katalogaufbau (US-POK-03), bis dahin ist „Fehlend“ nicht
        verfügbar.
        {!poorKnown &&
          " „Artenarm“ braucht die Artenzahl der Gattung und ist ebenfalls noch nicht verfügbar."}
      </p>
      <label className="sort">
        <span>Sortierung</span>
        <select value={props.sort} onChange={(e) => props.onSort(e.target.value as PokedexSort)}>
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      {props.sort === "species_count" && !poorKnown && (
        <p className="quiet hint">
          Die Artenzahl der Gattungen ist noch unbekannt (US-POK-03), deshalb stehen die Arten
          alphabetisch.
        </p>
      )}
    </div>
  );
}

function FilterButtons(props: {
  filter: PokedexFilter;
  poorKnown: boolean;
  onFilter: (filter: PokedexFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter" className="filters">
      {FILTERS.map((f) => {
        const open =
          f.id === "all" || f.id === "caught" || (f.id === "species_poor" && props.poorKnown);
        const selected = f.id === props.filter;
        return (
          <button
            key={f.id}
            type="button"
            disabled={!open}
            aria-pressed={selected}
            className={selected ? "filter selected" : "filter"}
            onClick={() => open && f.id !== "missing" && props.onFilter(f.id)}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}
