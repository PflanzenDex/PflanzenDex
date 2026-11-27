import type { PokedexFilter, PokedexSort } from "@pflanzendex/core";
import { useId, type RefObject } from "react";
import { Check } from "lucide-react";
import { PRESSED_CHIP } from "@/shared/patterns/elements/chip-row/pressed-chip";
import { LayerOpener } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Button } from "@/shared/ui/button";
import { SearchInput } from "@/shared/ui/search-input";
import { Label } from "@/shared/ui/label";
import { Select } from "@/shared/ui/select";
import { cn } from "@/shared/lib/utils";
import { useShortcuts } from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";

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

/**
 * The row of controls (US-QS-22): the search field and the button that opens the layer "Filter". As in the Katalog search
 * (issue 1019), a 10 rem basis keeps the field from shrinking to a sliver: at 200 % text the row wraps and the button goes
 * under the field, so the placeholder keeps its word (US-QS-15, issue 2644).
 */
export function Controls(props: {
  query: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onQuery: (query: string) => void;
}) {
  const searchId = useId();
  const { hint } = useShortcuts();
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 grow basis-40">
        <Label htmlFor={searchId} className="sr-only">
          Suche (Art, deutscher Name, Gattung, Familie)
        </Label>
        <SearchInput
          id={searchId}
          ref={props.searchRef}
          placeholder="Suche"
          keyHint={hint("search")}
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          onClear={() => props.onQuery("")}
        />
      </div>
      <LayerOpener id={FILTER_LAYER} className="shrink-0">
        Filter
      </LayerOpener>
    </div>
  );
}

/**
 * The content of the layer "Filter" (US-POK-08, US-QS-22): the filters that work, the sorting and, as text, the
 * reasons why "Fehlend" and "Artenarm" cannot be used yet (P-08, P-10). The chosen filter is marked by a check mark and
 * a thicker border, not only by `aria-pressed`. The chosen chip is an outlined chip, not a tinted button (`PRESSED_CHIP`,
 * owner decision d-178, SG-TYPE-01, issue 2612).
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
              variant={selected ? "ghost" : "plain"}
              aria-pressed={selected}
              className={cn("rounded-full px-4", selected && PRESSED_CHIP)}
              onClick={() => props.onFilter(f.id)}
            >
              {selected && <Check aria-hidden="true" className="size-5 shrink-0" />}
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
          „Fehlend“: Fehlende Arten zeigt „Arten“ erst, wenn der Artenkatalog aufgebaut ist.
        </p>
        {!poorKnown && (
          <p className={HINT}>„Artenarm“: braucht die Artenzahl der Gattungen, die noch fehlt.</p>
        )}
      </div>
    </div>
  );
}
