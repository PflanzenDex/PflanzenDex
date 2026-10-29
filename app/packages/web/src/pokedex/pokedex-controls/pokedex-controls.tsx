import type { PokedexFilter, PokedexSort } from "@pflanzendex/core";
import { useId, type RefObject } from "react";
import { LayerOpener } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { cn } from "@/lib/utils";

export const FILTER_LAYER = "filters";

const HINT = "m-0 text-sm text-muted-foreground";

/** The filters that work today; "Artenarm" needs the genus counts and appears as a chip once they exist. */
const FILTERS: readonly { id: PokedexFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "caught", label: "Gefangen" },
  { id: "species_poor", label: "Artenarm" },
];
const SORTS: readonly { id: PokedexSort; label: string }[] = [
  { id: "alphabetical", label: "Alphabetisch" },
  { id: "family", label: "Familie" },
  { id: "catch_date", label: "Fangdatum" },
  { id: "species_count", label: "Artenzahl" },
];

/** The row of controls (US-QS-22): the search field and the button that opens the layer "Filter". */
export function Controls(props: {
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
}) {
  const searchId = useId();
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Label htmlFor={searchId} className="sr-only">
          Suche (Art, deutscher Name, Gattung, Familie)
        </Label>
        <Input
          id={searchId}
          ref={props.searchRef}
          type="search"
          placeholder="Suche"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
        />
      </div>
      <LayerOpener id={FILTER_LAYER}>Filter</LayerOpener>
    </div>
  );
}

/**
 * The content of the layer "Filter" (US-POK-08, US-QS-22): the filters that work, the sorting and, as text, the
 * reasons why "Fehlend" and "Artenarm" cannot be used yet (P-08, P-10). The chosen filter is marked by a check mark and
 * a thicker border, not only by `aria-pressed`.
 */
export function FilterPanel(props: {
  filter: PokedexFilter;
  sort: PokedexSort;
  poorKnown: boolean;
  onFilter: (filter: PokedexFilter) => void;
  onSort: (sort: PokedexSort) => void;
}) {
  const { poorKnown } = props;
  const sortId = useId();
  return (
    <div className="grid min-w-0 gap-3">
      <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
        {FILTERS.filter((f) => f.id !== "species_poor" || poorKnown).map((f) => {
          const selected = f.id === props.filter;
          return (
            <Button
              key={f.id}
              type="button"
              variant="outline"
              aria-pressed={selected}
              className={cn("rounded-full px-4", selected && "border-2 border-primary font-bold")}
              onClick={() => props.onFilter(f.id)}
            >
              {selected && <span aria-hidden="true">✓ </span>}
              {f.label}
            </Button>
          );
        })}
      </div>
      <div className="grid gap-1">
        <Label htmlFor={sortId}>Sortierung</Label>
        <Select
          id={sortId}
          value={props.sort}
          onChange={(e) => props.onSort(e.target.value as PokedexSort)}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      {props.sort === "species_count" && !poorKnown && (
        <p className={HINT}>
          Die Artenzahl der Gattungen ist noch unbekannt, deshalb stehen die Arten alphabetisch.
        </p>
      )}
      <div className="grid gap-1">
        <p className="m-0 font-semibold">Noch nicht verfügbar</p>
        <p className={HINT}>
          „Fehlend“: Fehlende Arten zeigt der Pokédex erst, wenn der Artenkatalog aufgebaut ist.
        </p>
        {!poorKnown && (
          <p className={HINT}>„Artenarm“: braucht die Artenzahl der Gattungen, die noch fehlt.</p>
        )}
      </div>
    </div>
  );
}
