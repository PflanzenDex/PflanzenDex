import { useId, type RefObject } from "react";
import { Check } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ChipRow } from "@/shared/patterns/elements/chip-row/chip-row";
import { useChipsFit } from "@/shared/lists/grouped-list/grouped-sections/group-jump/use-chips-fit";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { DIFFICULTY } from "../../shared/difficulty";
import type { Filters } from "../search-filters/search-filters";
import table from "../search-view.de.json";

const t = texts(table);

type Chip = {
  key: string;
  label: string;
  pressed: boolean;
  disabled: boolean;
  toggle: () => void;
};

/**
 * One toggle chip. Pressed it shows a check mark, a thicker border and a bold label besides `aria-pressed`, so the state
 * is not told by colour alone (SG-COLOR-03, as the filter of the species page does). It is a 44 px target that never
 * shrinks and never breaks its text.
 */
function ToggleChip(props: { chip: Chip; describedBy?: string | undefined; measure?: boolean }) {
  const { chip, measure } = props;
  const pressed = measure ? true : chip.pressed;
  return (
    <Button
      type="button"
      variant={pressed ? "secondary" : "plain"}
      aria-pressed={pressed}
      disabled={!measure && chip.disabled}
      aria-describedby={props.describedBy}
      tabIndex={measure ? -1 : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-4",
        pressed && "border-2 border-primary font-bold",
      )}
      onClick={chip.toggle}
    >
      {pressed && <Check aria-hidden="true" className="size-5 shrink-0" />}
      {chip.label}
    </Button>
  );
}

/**
 * The width of every chip in its widest (pressed) form, for the decision of `useChipsFit`: invisible, inert and out of the
 * accessibility tree, exactly as the measuring row of the group jump is.
 */
function MeasureRow(props: { chips: readonly Chip[]; measure: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      aria-hidden="true"
      inert
      className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden"
    >
      <div ref={props.measure} data-quick-measure="" className="flex w-max gap-2">
        {props.chips.map((chip) => (
          <ToggleChip key={chip.key} chip={chip} measure />
        ))}
      </div>
    </div>
  );
}

/**
 * The quick filters of "Entdecken", mode Katalog (US-QS-15, US-QS-21, owner decision d-166, issue 2587): "Leicht" and "Noch
 * nicht gefangen" as toggle chips in one chip row under the search field. They are the same filters as the layer "Filter"
 * holds (difficulty 1 and uncaught), so chips and layer are one state. The row wraps while the chips fit and scrolls sideways
 * inside itself when they do not (`ChipRow`, `useChipsFit`, the same logic as the group jump, SG-LIST-06). While the caught
 * species are not known (`caughtKnown` false) "Noch nicht gefangen" is disabled and says why, never filtering on a guess
 * (P-08, P-10).
 */
export function QuickFilterChips(props: {
  filters: Filters;
  caughtKnown: boolean;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const { filters, caughtKnown, onChange } = props;
  const { row, measure, fits } = useChipsFit(true);
  const whyId = useId();
  const chips: readonly Chip[] = [
    {
      key: "easy",
      label: DIFFICULTY[1] ?? "",
      pressed: filters.difficulty === 1,
      disabled: false,
      toggle: () => onChange({ difficulty: filters.difficulty === 1 ? null : 1 }),
    },
    {
      key: "uncaught",
      label: t("quick.uncaught"),
      pressed: filters.uncaught,
      disabled: !caughtKnown,
      toggle: () => onChange({ uncaught: !filters.uncaught }),
    },
  ];
  return (
    <div ref={row} data-quick-row="" className="relative min-w-0">
      <ChipRow label={t("quick.label")} scroll={!fits}>
        {chips.map((chip) => (
          <ToggleChip key={chip.key} chip={chip} describedBy={chip.disabled ? whyId : undefined} />
        ))}
        {!caughtKnown && (
          <span id={whyId} className="sr-only">
            {t("quick.uncaughtUnknown")}
          </span>
        )}
      </ChipRow>
      <MeasureRow chips={chips} measure={measure} />
    </div>
  );
}
