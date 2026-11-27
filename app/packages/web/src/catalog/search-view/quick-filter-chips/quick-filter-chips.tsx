import { useId, type RefObject } from "react";
import { Check } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ChipRow } from "@/shared/patterns/elements/chip-row/chip-row";
import { PRESSED_CHIP } from "@/shared/patterns/elements/chip-row/pressed-chip";
import { useChipsFit } from "@/shared/lists/grouped-list/grouped-sections/group-jump/use-chips-fit";
import { texts } from "@/shared/lib/text-rules/texts";
import { cn } from "@/shared/lib/utils";
import { DIFFICULTY } from "../../shared/difficulty";
import type { Filters, FilterChange } from "../search-filters/search-filters";
import table from "../search-view.de.json";

const t = texts(table);

/**
 * The most lines the chips may take on a phone (issue 2612): both pressed they need 317 px, and a phone of 360 px leaves the
 * row 294 px, so the second chip would stand half out of the row and read as cut. Two lines show every chip whole; only a
 * chip that is wider than the row itself (large text) scrolls.
 */
const MAX_LINES = 2;

/** A chip stays on the page when it is pressed, so the focus stays on it (US-QS-15, issue 2628). */
const KEEP_FOCUS = { keepFocus: true };

type Chip = {
  key: string;
  label: string;
  pressed: boolean;
  disabled: boolean;
  toggle: () => void;
};

/**
 * One toggle chip, an outlined chip in both states (owner decisions d-171 and d-178, issue 2612). Unpressed it is outlined on
 * the neutral surface: the fill of the search field next to it (`bg-card`, so the two cannot differ in dark mode), the
 * `--input` border and the text colour. Pressed it keeps the card fill and takes a 2 px primary border, primary text and a
 * check mark (`PRESSED_CHIP`, SG-TYPE-01: weight 600), so it is no tinted button and the state is not told by colour alone
 * (SG-COLOR-03, SG-COLOR-05; `aria-pressed` besides). The variant is the neutral `ghost` for both. It is a 44 px target that
 * never shrinks and never breaks its text.
 */
function ToggleChip(props: { chip: Chip; describedBy?: string | undefined; measure?: boolean }) {
  const { chip, measure } = props;
  const pressed = measure ? true : chip.pressed;
  return (
    <Button
      type="button"
      variant="ghost"
      aria-pressed={pressed}
      disabled={!measure && chip.disabled}
      aria-describedby={props.describedBy}
      tabIndex={measure ? -1 : undefined}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-4",
        // Unpressed: outlined on the neutral surface, the card fill of the search field; the border is `--input`, the 1.4.11
        // boundary token (owner decision d-171, issue 2612).
        pressed ? PRESSED_CHIP : "border border-input bg-card text-foreground",
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
 * inside itself when they do not (`ChipRow`, `useChipsFit`, the same logic as the group jump, SG-LIST-06), with one change: on
 * a phone it may take two lines (`MAX_LINES`), so at 360 px both pressed chips are whole in two lines and none stands half out
 * of the row (issue 2612). The form never depends on the chosen chips: the decision reads the widest (pressed) form. While the caught
 * species are not known (`caughtKnown` false) "Noch nicht gefangen" is disabled, never filtering on a guess (P-08, P-10). When
 * the load has failed (`caughtLoading` false) it says why in a visible line under the row (`aria-describedby` points to it;
 * SG-BTN-05, issue 2610). While the species still load (`caughtLoading` true) the chip is disabled and the line stays away,
 * so it does not flash on every cold start and push the list down (issue 2615). The line stands outside the row, so it stays
 * in view when the chips scroll sideways, and the measuring row does not count it.
 */
export function QuickFilterChips(props: {
  filters: Filters;
  caughtKnown: boolean;
  /** The caught species are on their way: the chip is disabled, but the reason is not shown yet. */
  caughtLoading?: boolean;
  onChange: FilterChange;
}) {
  const { filters, caughtKnown, caughtLoading = false, onChange } = props;
  const showWhy = !caughtKnown && !caughtLoading;
  const { row, measure, fits } = useChipsFit(true, MAX_LINES);
  const whyId = useId();
  const chips: readonly Chip[] = [
    {
      key: "easy",
      label: DIFFICULTY[1] ?? "",
      pressed: filters.difficulty === 1,
      disabled: false,
      toggle: () => onChange({ difficulty: filters.difficulty === 1 ? null : 1 }, KEEP_FOCUS),
    },
    {
      key: "uncaught",
      label: t("quick.uncaught"),
      pressed: filters.uncaught,
      disabled: !caughtKnown,
      toggle: () => onChange({ uncaught: !filters.uncaught }, KEEP_FOCUS),
    },
  ];
  return (
    <div ref={row} data-quick-row="" className="relative min-w-0">
      <ChipRow label={t("quick.label")} scroll={!fits}>
        {chips.map((chip) => (
          <ToggleChip
            key={chip.key}
            chip={chip}
            describedBy={chip.disabled && showWhy ? whyId : undefined}
          />
        ))}
      </ChipRow>
      {showWhy && (
        <p id={whyId} className="mt-2 text-sm text-muted-foreground">
          {t("quick.uncaughtUnknown")}
        </p>
      )}
      <MeasureRow chips={chips} measure={measure} />
    </div>
  );
}
