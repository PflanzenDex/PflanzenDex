import type { SpeciesHit } from "@pflanzendex/core";
import { useSearchParams } from "react-router";
import { Button } from "@/components/ui/button/button";
import { Select } from "@/components/ui/fields/select/select";
import { Checkbox } from "@/components/ui/fields/checkbox/checkbox";
import { LayerSheet, useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { DIFFICULTY } from "../../shared/text";

/** The layer id of the filters: the address holds `?sheet=filters` while it is open (US-QS-21). */
export const FILTERS_LAYER = "filters";
const DIFFICULTY_PARAM = "difficulty";
const OWN_PARAM = "own";

export type Filters = { difficulty: 1 | 2 | 3 | null; own: boolean };

function difficultyOf(raw: string | null): Filters["difficulty"] {
  return raw === "1" ? 1 : raw === "2" ? 2 : raw === "3" ? 3 : null;
}

/** The chosen filters live in the address (`?difficulty=1&own=1`), so a copied link shows the same list (US-QS-21). */
export function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters: Filters = {
    difficulty: difficultyOf(params.get(DIFFICULTY_PARAM)),
    own: params.get(OWN_PARAM) === "1",
  };
  const change = (patch: Partial<Filters>) => {
    const next = new URLSearchParams(params);
    const merged = { ...filters, ...patch };
    if (merged.difficulty === null) next.delete(DIFFICULTY_PARAM);
    else next.set(DIFFICULTY_PARAM, String(merged.difficulty));
    if (merged.own) next.set(OWN_PARAM, "1");
    else next.delete(OWN_PARAM);
    // A changed filter starts the list at page 1 (US-QS-15).
    next.delete("page");
    setParams(next, { replace: true });
  };
  return {
    filters,
    change,
    clear: () => change({ difficulty: null, own: false }),
    /** Changes with every filter, so the pages start again at page 1. */
    key: `${filters.difficulty ?? "-"}|${filters.own ? "own" : "-"}`,
    active: (filters.difficulty === null ? 0 : 1) + (filters.own ? 1 : 0),
  };
}

export function applyFilters(hits: readonly SpeciesHit[], f: Filters): readonly SpeciesHit[] {
  return hits.filter(
    (t) => (f.difficulty === null || t.difficulty === f.difficulty) && (!f.own || t.own),
  );
}

/** The chosen filters as removable chips, each a 44 px target with its own name (US-QS-21). */
export function FilterChips(props: {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const { filters, onChange } = props;
  const chips: { name: string; remove: () => void }[] = [];
  if (filters.difficulty !== null)
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
            variant="outline"
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

/** The layer with the filters of the catalog list; the one filled action is "Fertig" (US-QS-21, US-QS-15). */
export function FiltersLayer(props: {
  filters: Filters;
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
      </div>
    </LayerSheet>
  );
}
