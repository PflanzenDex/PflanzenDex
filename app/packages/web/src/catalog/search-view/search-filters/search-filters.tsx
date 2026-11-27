import type { SpeciesHit } from "@pflanzendex/core";
import { useSearchParams } from "react-router";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
import { Checkbox } from "@/shared/ui/checkbox";
import { LayerSheet, useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { dropPageParts, PAGE_PARAM } from "@/shared/patterns/responsive/entry-list/paging/address";
import { texts } from "@/shared/lib/text-rules/texts";
import { DIFFICULTY } from "../../shared/text";
import table from "../search-view.de.json";

const t = texts(table);

/** The layer id of the filters: the address holds `?sheet=filters` while it is open (US-QS-21). */
export const FILTERS_LAYER = "filters";
const DIFFICULTY_PARAM = "difficulty";
const OWN_PARAM = "own";
const UNCAUGHT_PARAM = "uncaught";

export type Filters = { difficulty: 1 | 2 | 3 | null; own: boolean; uncaught: boolean };

/**
 * The quick filters of "Entdecken" (US-QS-15, US-QS-21, owner decision d-166, issues 2587 and 2615): the chips "Leicht" and
 * "Noch nicht gefangen" above the list. `caught` holds the ids of the species the account has caught, which the app reads
 * (`catalog` does not know `pokedex`); `null` while that is not known, and then the filter "Noch nicht gefangen" is off
 * (P-08, P-10). `loading` (default false) says the species are still on their way: the chip waits without a reason, so the
 * row does not shift when they arrive; `null` with `loading` false means the load failed, and the chip says why.
 * Without this prop (the collection's hand-over) the page has no chips and no such filter.
 */
export type QuickFilters = { caught: ReadonlySet<string> | null; loading?: boolean };

function difficultyOf(raw: string | null): Filters["difficulty"] {
  return raw === "1" ? 1 : raw === "2" ? 2 : raw === "3" ? 3 : null;
}

/**
 * The chosen filters live in the address (`?difficulty=1&own=1&uncaught=1`), so a copied link shows the same list
 * (US-QS-21). `canUncaught` says whether "Noch nicht gefangen" can work (the caught species are known): without it the
 * filter reads as off, so no view claims or applies a filter that the list cannot keep; the address keeps its choice and
 * it takes effect as soon as the species are known.
 */
function useFilters(canUncaught: boolean) {
  const [params, setParams] = useSearchParams();
  const chosen: Filters = {
    difficulty: difficultyOf(params.get(DIFFICULTY_PARAM)),
    own: params.get(OWN_PARAM) === "1",
    uncaught: params.get(UNCAUGHT_PARAM) === "1",
  };
  const filters: Filters = { ...chosen, uncaught: chosen.uncaught && canUncaught };
  const change = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(params);
    const merged = { ...chosen, ...patch };
    if (merged.difficulty === null) next.delete(DIFFICULTY_PARAM);
    else next.set(DIFFICULTY_PARAM, String(merged.difficulty));
    if (merged.own) next.set(OWN_PARAM, "1");
    else next.delete(OWN_PARAM);
    if (merged.uncaught) next.set(UNCAUGHT_PARAM, "1");
    else next.delete(UNCAUGHT_PARAM);
    // A changed filter starts the list at the first entry (US-QS-15).
    dropPageParts(next, PAGE_PARAM);
    setParams(next, { replace: true });
  };
  return {
    filters,
    change,
    clear: () => change({ difficulty: null, own: false, uncaught: false }),
    /** Changes with every filter, so the pages start again at the first entry. */
    key: `${filters.difficulty ?? "-"}|${filters.own ? "own" : "-"}|${filters.uncaught ? "uncaught" : "-"}`,
    /** The filters in force, each counted once ("Filter (n)"). */
    active:
      (filters.difficulty === null ? 0 : 1) + (filters.own ? 1 : 0) + (filters.uncaught ? 1 : 0),
  };
}

/**
 * The filters of the catalog list and the hits that pass them: "Noch nicht gefangen" works when `quick` holds the caught
 * species (US-QS-21, issue 2587).
 */
export function useCatalogFilters(hits: readonly SpeciesHit[], quick: QuickFilters | undefined) {
  const caught = quick?.caught ?? null;
  const filtering = useFilters(caught !== null);
  return { ...filtering, shown: applyFilters(hits, filtering.filters, caught) };
}

/** The hits that pass the filters; "Noch nicht gefangen" drops the species of `caught` (US-QS-21, issue 2587). */
function applyFilters(
  hits: readonly SpeciesHit[],
  f: Filters,
  caught: ReadonlySet<string> | null,
): readonly SpeciesHit[] {
  return hits.filter(
    (h) =>
      (f.difficulty === null || h.difficulty === f.difficulty) &&
      (!f.own || h.own) &&
      !(f.uncaught && caught?.has(h.id)),
  );
}

/**
 * The chosen filters as removable chips, each a 44 px target with its own name (US-QS-21). With the quick filters on
 * (`quick`) "Leicht" and "Noch nicht gefangen" are pressed chips above the list and are not repeated here (SG-LIST-07);
 * "Noch nicht gefangen" is only in force with the quick filters, so it has no entry of its own.
 */
export function FilterChips(props: {
  filters: Filters;
  quick?: boolean;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const { filters, onChange } = props;
  const chips: { name: string; remove: () => void }[] = [];
  if (filters.difficulty !== null && !(props.quick && filters.difficulty === 1))
    chips.push({
      name: `Schwierigkeit: ${DIFFICULTY[filters.difficulty]}`,
      remove: () => onChange({ difficulty: null }),
    });
  if (filters.own)
    chips.push({ name: "Nur meine Vorschläge", remove: () => onChange({ own: false }) });
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Gewählte Filter" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {chips.map((chip) => (
        <li key={chip.name}>
          <Button
            type="button"
            variant="tinted"
            size="sm"
            aria-label={`Filter entfernen: ${chip.name}`}
            onClick={chip.remove}
          >
            {chip.name} <span aria-hidden="true">×</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Done() {
  const { closeLayer } = useLayer(FILTERS_LAYER);
  return (
    <Button type="button" onClick={closeLayer}>
      Fertig
    </Button>
  );
}

const CHOICES: readonly { value: Filters["difficulty"]; label: string }[] = [
  { value: null, label: "Alle" },
  { value: 1, label: DIFFICULTY[1] ?? "" },
  { value: 2, label: DIFFICULTY[2] ?? "" },
  { value: 3, label: DIFFICULTY[3] ?? "" },
];

/**
 * The layer with the filters of the catalog list; the one filled action is "Fertig" (US-QS-21, US-QS-15). With the quick
 * filters on (`quick`) it also holds the checkbox "Noch nicht gefangen", the same filter as the chip; it is disabled while
 * the caught species are not known.
 */
export function FiltersLayer(props: {
  filters: Filters;
  quick: QuickFilters | undefined;
  onChange: (patch: Partial<Filters>) => void;
}) {
  return (
    <LayerSheet id={FILTERS_LAYER} title="Filter" primaryAction={<Done />}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Schwierigkeit
          <Select
            value={props.filters.difficulty === null ? "" : String(props.filters.difficulty)}
            onChange={(e) => props.onChange({ difficulty: difficultyOf(e.target.value || null) })}
          >
            {CHOICES.map((c) => (
              <option key={c.label} value={c.value === null ? "" : String(c.value)}>
                {c.label}
              </option>
            ))}
          </Select>
        </label>
        <Checkbox
          checked={props.filters.own}
          onChange={(e) => props.onChange({ own: e.target.checked })}
        >
          Nur meine Vorschläge
        </Checkbox>
        {props.quick && (
          <Checkbox
            checked={props.filters.uncaught}
            disabled={props.quick.caught === null}
            onChange={(e) => props.onChange({ uncaught: e.target.checked })}
          >
            {t("quick.uncaught")}
          </Checkbox>
        )}
      </div>
    </LayerSheet>
  );
}
