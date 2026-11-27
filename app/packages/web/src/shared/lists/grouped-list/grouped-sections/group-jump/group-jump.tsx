import type { RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { ChipRow } from "@/shared/patterns/elements/chip-row/chip-row";
import { useChipsFit } from "./use-chips-fit";

export type GroupChoice = {
  key: string;
  label: string;
  count: number;
  /** What the count means in words (US-ACH-02); replaces the number in brackets. */
  countText?: string;
};

/** The count after the label: "(3)", or "· 2 von 3" when the choice says what it counts (`countText`). */
const countLabel = (c: GroupChoice) =>
  c.countText === undefined ? `(${c.count})` : `· ${c.countText}`;

/** The chips of the group row: they jump; a chip is no filter and holds no state (SG-LIST-06). */
function Chips({
  choices,
  onJump,
}: {
  choices: readonly GroupChoice[];
  onJump: (key: string) => void;
}) {
  return choices.map((c) => (
    <Button
      key={c.key}
      type="button"
      variant="plain"
      size="sm"
      onClick={() => onJump(c.key)}
      className="shrink-0 whitespace-nowrap"
    >
      {c.label} <span className="tabular-nums">{countLabel(c)}</span>
    </Button>
  ));
}

/** The width of every chip, for the decision of `useChipsFit`. Invisible, inert and out of the accessibility tree. */
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
            variant="plain"
            size="sm"
            className="shrink-0 whitespace-nowrap"
          >
            {c.label} <span className="tabular-nums">{countLabel(c)}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * A row to jump to a group of a grouped list (SG-LIST-06, owner decision 2026-11-22; owner decision 2026-11-21, issue 2417, which
 * replaces the selection field): the chips with their counts, wrapped in the row while they fit (one line below 768 px, up to
 * two lines from 768 px, simulated greedily with the measured chip widths in `useChipsFit`), otherwise in one line that scrolls
 * sideways inside the row, the next chip peeking in at the edge (`ChipRow`, marked `data-scroll-x="chips"`). Choosing scrolls
 * that group's section to the top of its region; no group is hidden, and the address holds nothing (SG-NAV-02).
 */
export function GroupJump({
  label,
  choices,
  onJump,
}: {
  label: string;
  choices: readonly GroupChoice[];
  onJump: (key: string) => void;
}) {
  const { row, measure, fits } = useChipsFit(choices.length > 0);
  if (choices.length === 0) return null;
  return (
    <div ref={row} data-group-row="" className="relative min-w-0">
      <ChipRow label={label} scroll={!fits}>
        <Chips choices={choices} onJump={onJump} />
      </ChipRow>
      <MeasureRow choices={choices} measure={measure} />
    </div>
  );
}
