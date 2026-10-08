import type { PokedexFilter, PokedexSort } from "@pflanzendex/core";
import { useId, type RefObject } from "react";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/fields/input/input";
import { Label } from "@/components/ui/display/label/label";
import { Select } from "@/components/ui/fields/select/select";
import { cn } from "@/lib/utils";

const HINT = "m-0 text-sm text-muted-foreground";

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
 * species count of the genus (both come with the taxonomy build, US-POK-03): while they do not exist the buttons are disabled and say why (P-08, P-10).
 * The chosen filter has a visible marker (check mark and a thicker border), not only `aria-pressed`.
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
  const searchId = useId();
  const sortId = useId();
  return (
    <div className="mb-4 grid min-w-0 gap-2">
      <div className="grid gap-1">
        <Label htmlFor={searchId}>Suche (Art, deutscher Name, Gattung, Familie)</Label>
        <Input
          id={searchId}
          ref={props.searchRef}
          type="search"
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
        />
      </div>
      <FilterButtons filter={props.filter} poorKnown={poorKnown} onFilter={props.onFilter} />
      <p id="hint-missing" className={HINT}>
        Fehlende Arten zeigt der Pokédex erst, wenn der Artenkatalog aufgebaut ist; bis dahin ist
        „Fehlend“ nicht verfügbar.
      </p>
      {!poorKnown && (
        <p id="hint-poor" className={HINT}>
          „Artenarm“ braucht die Artenzahl der Gattungen, die noch fehlt, und ist deshalb noch nicht
          verfügbar.
        </p>
      )}
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
    </div>
  );
}

function FilterButtons(props: {
  filter: PokedexFilter;
  poorKnown: boolean;
  onFilter: (filter: PokedexFilter) => void;
}) {
  return (
    <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
      {FILTERS.map((f) => {
        const open =
          f.id === "all" || f.id === "caught" || (f.id === "species_poor" && props.poorKnown);
        const selected = f.id === props.filter;
        return (
          <Button
            key={f.id}
            type="button"
            variant="outline"
            disabled={!open}
            aria-describedby={open ? undefined : f.id === "missing" ? "hint-missing" : "hint-poor"}
            aria-pressed={selected}
            className={cn(
              "rounded-full px-4",
              selected && "border-2 border-primary font-bold",
              !open && "line-through",
            )}
            onClick={() => open && f.id !== "missing" && props.onFilter(f.id)}
          >
            {selected && <span aria-hidden="true">✓ </span>}
            {f.label}
          </Button>
        );
      })}
    </div>
  );
}
