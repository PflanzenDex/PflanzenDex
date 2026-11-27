import type { ReactNode } from "react";
import { ObjectRow } from "@/shared/lists/object-row/object-row";
import { OBJECT_GROUP } from "@/shared/lists/grouped-list/group-classes";
import { germanNameOf, SCIENTIFIC } from "@/shared/species-name/species-name";
import { useLayer } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { ScrollEntries } from "@/shared/patterns/responsive/entry-list/paging/scroll-entries/scroll-entries";
import { useRowPageSize } from "@/shared/patterns/responsive/entry-list/row-page-size";
import type { CaughtSpecies } from "@pflanzendex/core";
import { catchText } from "./collector-card/catch-text";

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

/** The layer of one caught species is named after the species: `?sheet=species-<name>` (US-QS-22). */
export const speciesLayerId = (species: string): string => `species-${species}`;

/**
 * The title and the meta line of a caught species (US-QS-22, SG-TYPE-08): the German name, upright, where the catalog has
 * one, else the scientific name in italics. With a German name the scientific name leads the meta line, before the catch
 * date. No name is invented where the catalog has none (P-08).
 */
function speciesLines(c: CaughtSpecies): { title: ReactNode; meta: ReactNode } {
  const german = germanNameOf(c.species, c.germanName);
  const date = catchText(c.caughtDate);
  if (german === null) return { title: <i className={SCIENTIFIC}>{c.species}</i>, meta: date };
  return {
    title: german,
    meta: (
      <>
        <i className={SCIENTIFIC}>{c.species}</i>
        {` · ${date}`}
      </>
    ),
  };
}

/**
 * One caught species as an object row (US-QS-22, US-QS-32, FX-35 step 5): the drawn placeholder (CaughtSpecies has no
 * photo, P-08), the name and the catch date. Choosing the row opens the species in its layer. The wrapper keeps the
 * `data-species` hook of the lists and their tests.
 */
export function SpeciesRow({ c }: { c: CaughtSpecies }) {
  const { openLayer, open } = useLayer(speciesLayerId(c.species));
  const { title, meta } = speciesLines(c);
  return (
    <div data-species={c.species}>
      <ObjectRow
        title={title}
        meta={meta}
        haspopup="dialog"
        expanded={open}
        onClick={(event) => openLayer(event.currentTarget)}
      />
    </div>
  );
}

/**
 * The caught species as one scrolling list of object rows in one group (US-POK-06, US-QS-22, US-QS-32); a tap opens the details as a
 * layer (US-POK-09); the German name is shown where it is known, never invented (P-08).
 */
export function SpeciesList(props: {
  label: string;
  species: readonly CaughtSpecies[];
  resetKey: string;
}) {
  const size = useRowPageSize();
  return (
    <ScrollEntries
      items={props.species}
      pageSize={size}
      fit
      label={props.label}
      resetKey={props.resetKey}
      getKey={(c) => c.species}
      listClassName={OBJECT_GROUP}
      renderItem={(c) => <SpeciesRow c={c} />}
    />
  );
}
