import { ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button/button";
import { SpeciesName } from "@/shared/species-name/species-name";
import { SPECIES_ENTRY_ROW } from "@/shared/patterns/responsive/layer-sheet/layer-part/layer-part";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { Pager } from "@/shared/patterns/responsive/pager/pager";
import { useRowPageSize } from "@/shared/patterns/responsive/pager/row-page-size";
import type { CaughtSpecies } from "@pflanzendex/core";
import { catchText } from "./collector-card/catch-text";

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
  return (
    <Button
      type="button"
      variant="outline"
      data-species={c.species}
      aria-haspopup="dialog"
      aria-expanded={open}
      className={SPECIES_ENTRY_ROW}
      onClick={(event) => openLayer(event.currentTarget)}
    >
      <span className="grid min-w-0 gap-0 break-words">
        <SpeciesName scientific={c.species} german={c.germanName} meta={catchText(c.caughtDate)} />
      </span>
      {/* An icon, not text: the button's visible text stays the name and the date (WCAG 2.5.3, US-QS-08; SG-ICON-01). */}
      <ChevronRight
        data-chevron
        aria-hidden="true"
        className="size-5 shrink-0 text-muted-foreground"
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
