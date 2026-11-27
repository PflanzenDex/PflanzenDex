import type { RefObject } from "react";
import { Button } from "@/shared/ui/button";
import { Select } from "@/shared/ui/select";
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

/** The chips, in one line below 768 px and up to two lines from 768 px. A chip jumps; it is no filter and holds no state (SG-LIST-06). */
function ChipRow({
  label,
  choices,
  onJump,
}: {
  label: string;
  choices: readonly GroupChoice[];
  onJump: (key: string) => void;
}) {
  return (
    // The chip row is a marked sideways region at every size (DS-63, issue 2417); it wraps while the chips fit.
    <div role="group" aria-label={label} data-scroll-x="chips" className="flex flex-wrap gap-2">
      {choices.map((c) => (
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
      ))}
    </div>
  );
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
 * A row to jump to a group of a grouped list (SG-LIST-06, owner decision 2026-11-22): the chips with their counts when they
 * fit the row (one line below 768 px, up to two lines from 768 px, simulated greedily with the measured chip widths in
 * `useChipsFit`), otherwise one selection field with the same names. Choosing scrolls that group's section to the top of its
 * region; no group is hidden, and the address holds nothing (SG-NAV-02). The selection field is named by the row's `label`
 * and shows that name as its resting option, so it keeps no choice. The row never scrolls sideways.
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
      {fits ? (
        <ChipRow label={label} choices={choices} onJump={onJump} />
      ) : (
        <Select aria-label={label} value="" onChange={(event) => onJump(event.target.value)}>
          <option value="">{label}</option>
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {`${c.label} ${countLabel(c)}`}
            </option>
          ))}
        </Select>
      )}
      <MeasureRow choices={choices} measure={measure} />
    </div>
  );
}
