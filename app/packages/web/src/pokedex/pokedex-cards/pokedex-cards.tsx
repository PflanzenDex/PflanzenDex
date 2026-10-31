import { Button } from "@/components/ui/button/button";
import { useLayer } from "@/components/shared/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/components/shared/responsive/pager/pager";
import { useRowPageSize } from "@/components/shared/responsive/pager/row-page-size";
import type { CaughtSpecies } from "@pflanzendex/core";
import { catchText } from "@/components/collector-card/catch-text";

/** Layout of an entry that is not a button, e.g. a specimen that does not count yet. */
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
export const countText = (n: number) => `${n} ${n === 1 ? "Pflanze" : "Pflanzen"}`;

export const SPECIES_LIST = "md:grid md:grid-cols-2";

/** The layer of one caught species is named after the species: `?sheet=species-<name>` (US-QS-22). */
export const speciesLayerId = (species: string): string => `species-${species}`;

/** One caught species as a compact entry (US-QS-22): the name, the German name where known and the catch date. */
export function SpeciesRow({ c }: { c: CaughtSpecies }) {
  const { openLayer, open } = useLayer(speciesLayerId(c.species));
  const second = [c.germanName, catchText(c.caughtDate)]
    .filter((t): t is string => typeof t === "string")
    .join(" · ");
  return (
    <Button
      type="button"
      variant="outline"
      data-species={c.species}
      aria-haspopup="dialog"
      aria-expanded={open}
      className="h-auto w-full justify-between gap-2 whitespace-normal border-border px-3 py-1.5 text-left text-foreground"
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="grid min-w-0 gap-0 break-words">
        <span className="font-semibold">{c.species}</span>{" "}
        <span className="text-sm font-normal text-muted-foreground">{second}</span>
      </span>
      {/* Drawn by CSS, not in the text: the button's visible text stays the name and the date (WCAG 2.5.3, US-QS-08). */}
      <span
        data-chevron
        className="text-2xl leading-none text-muted-foreground after:content-['›']"
        aria-hidden="true"
      />
    </Button>
  );
}

/**
 * The caught species as pages of compact entries (US-POK-06, US-QS-22); a tap opens the details as a layer (US-POK-09);
 * the German name is shown where it is known, never invented (P-08).
 */
export function SpeciesPager(props: {
  label: string;
  species: readonly CaughtSpecies[];
  resetKey: string;
}) {
  const size = useRowPageSize();
  return (
    <Pager
      items={props.species}
      pageSize={size}
      fit
      label={props.label}
      resetKey={props.resetKey}
      getKey={(c) => c.species}
      listClassName={SPECIES_LIST}
      renderItem={(c) => <SpeciesRow c={c} />}
    />
  );
}
