import type { RefObject } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/shared/ui/button/button";
import { Select } from "@/shared/ui/fields/select/select";
import { cn } from "@/shared/lib/utils";
import { useChipsFit } from "./use-chips-fit";

/** The query parameter of the chosen group, e.g. `?group=location&part=Regal` (US-QS-19). */
export const PART_PARAM = "part";

export type GroupChoice = { key: string; label: string; count: number };

/** The chosen group of the address: the one named by `part=`, else the first (US-QS-19). */
export function usePart(choices: readonly GroupChoice[]): GroupChoice | undefined {
  const [params] = useSearchParams();
  const wanted = params.get(PART_PARAM);
  return choices.find((c) => c.key === wanted) ?? choices[0];
}

/** The chips, in one line below 768 px and up to two lines from 768 px: the chosen one has the check mark and the filled style, besides colour (US-QS-19). */
function ChipRow({
  label,
  choices,
  chosen,
  onChoose,
}: {
  label: string;
  choices: readonly GroupChoice[];
  chosen: GroupChoice | undefined;
  onChoose: (key: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {choices.map((c) => {
        const selected = c.key === chosen?.key;
        return (
          <Button
            key={c.key}
            type="button"
            variant={selected ? "secondary" : "outline"}
            size="sm"
            aria-pressed={selected}
            onClick={() => onChoose(c.key)}
            className={cn("shrink-0 whitespace-nowrap", selected && "font-semibold")}
          >
            {selected ? <span aria-hidden="true">✓</span> : null}
            {c.label} <span className="tabular-nums">({c.count})</span>
          </Button>
        );
      })}
    </div>
  );
}

/**
 * The width of every chip as the widest form (outline with the check mark, at least as wide as the chosen and the other
 * chip), for the decision of `useChipsFit`. Invisible, inert and out of the accessibility tree.
 */
function MeasureRow({
  choices,
  measure,
}: {
  choices: readonly GroupChoice[];
  measure: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
    >
      <div ref={measure} data-group-measure="" className="flex w-max gap-2">
        {choices.map((c) => (
          <Button
            key={c.key}
            type="button"
            tabIndex={-1}
            variant="outline"
            size="sm"
            className="shrink-0 whitespace-nowrap"
          >
            <span aria-hidden="true">✓</span>
            {c.label} <span className="tabular-nums">({c.count})</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * A row of group choices with their counts (US-QS-19, issue 1281): the chips when they fit the row (one line below
 * 768 px, up to two lines from 768 px, simulated greedily with the measured chip widths in `useChipsFit`), otherwise one
 * selection field with the same names and counts. The row never scrolls sideways. The choice is in the address
 * (`part=`), so back, forward and a copied link lead to the same group; choosing starts at page 1. The selection field
 * is named by the row's `label` only (no visible label) and keeps the keyboard focus across a choice.
 */
export function GroupChoices({
  label,
  choices,
}: {
  label: string;
  choices: readonly GroupChoice[];
}) {
  const [params, setParams] = useSearchParams();
  const chosen = usePart(choices);
  const { row, measure, fits } = useChipsFit(choices.length > 0);
  const choose = (key: string) => {
    const next = new URLSearchParams(params);
    next.set(PART_PARAM, key);
    next.delete("page");
    setParams(next, { state: { keepFocus: true } });
  };
  if (choices.length === 0) return null;
  return (
    <div ref={row} data-group-row="" className="relative min-w-0">
      {fits ? (
        <ChipRow label={label} choices={choices} chosen={chosen} onChoose={choose} />
      ) : (
        <Select
          aria-label={label}
          value={chosen?.key ?? ""}
          onChange={(event) => choose(event.target.value)}
        >
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {`${c.label} (${c.count})`}
            </option>
          ))}
        </Select>
      )}
      <MeasureRow choices={choices} measure={measure} />
    </div>
  );
}
