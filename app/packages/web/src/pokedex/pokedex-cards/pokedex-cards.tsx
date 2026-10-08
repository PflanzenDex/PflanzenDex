import { Button } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";
import type { CaughtSpecies } from "@pflanzendex/core";
import { catchText } from "@/components/collector-card/catch-text";

/** Layout of the species grids, shared by the cards and the "not counted yet" list. */
export const GRID = "m-0 mb-6 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3";
export const CARD =
  "grid min-w-0 content-start gap-1 break-words rounded-xl border border-border bg-card p-3 text-card-foreground";

/** Small pills for the additions of a species (chips). */
export function Chips(props: { chips: readonly string[] }) {
  if (props.chips.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Zusätze">
      {props.chips.map((chip) => (
        <li
          key={chip}
          className="rounded-full border border-border px-2.5 py-0.5 text-sm text-muted-foreground"
        >
          {chip}
        </li>
      ))}
    </ul>
  );
}

export { catchText };
export const countText = (n: number) => `${n} ${n === 1 ? "Exemplar" : "Exemplare"}`;

/** The cards of caught species (US-POK-06); a tap on the name opens the details (US-POK-09); the German name is shown where it is known, never invented (P-08). */
export function CardList(props: {
  label: string;
  species: readonly CaughtSpecies[];
  onOpen: (species: CaughtSpecies) => void;
}) {
  return (
    <ul className={GRID} aria-label={props.label}>
      {props.species.map((c) => (
        <li
          key={c.species}
          className={cn(
            CARD,
            "relative hover:border-muted-foreground focus-within:border-muted-foreground",
          )}
        >
          {/* The whole card is the tap target: the button's ::after covers it (US-POK-09). */}
          <Button
            type="button"
            variant="ghost"
            className="h-auto justify-start px-0 text-left font-semibold after:absolute after:inset-0 after:content-['']"
            data-species={c.species}
            aria-label={`Details zu ${c.species}`}
            onClick={() => props.onOpen(c)}
          >
            {c.species}
          </Button>
          <span
            data-chevron
            className="absolute right-3 top-3 text-2xl leading-none text-muted-foreground"
            aria-hidden="true"
          >
            ›
          </span>
          {c.germanName !== null && <span>{c.germanName}</span>}
          <span className="text-muted-foreground">{c.genus}</span>
          <Chips chips={c.chips} />
          <span className="text-sm">{catchText(c.caughtDate)}</span>
          <span className="text-muted-foreground">{countText(c.specimenCount)}</span>
        </li>
      ))}
    </ul>
  );
}
