import { Suspense } from "react";
import { PlantsViewOpener } from "@/collection";
import { SammlungHeader } from "@/components/sammlung-header/sammlung-header";
import { Select } from "@/components/ui/fields/select/select";
import {
  SAMMLUNG_VIEWS,
  SPECIES_SORTS,
  type SammlungView,
  type SpeciesSort,
} from "../../../../../sammlung-view";

/** The title area of the Sammlung: the switch, the layer opener of the plants and the arrangement of the species. */
export function AreaHeader(props: {
  view: SammlungView;
  caption: string | null;
  onChoose: (v: SammlungView) => void;
  sort: SpeciesSort;
  onSort: (s: SpeciesSort) => void;
}) {
  const { view } = props;
  return (
    <SammlungHeader
      view={view}
      options={SAMMLUNG_VIEWS}
      onChoose={props.onChoose}
      caption={props.caption}
      {...(view === "plants"
        ? {
            action: (
              <Suspense fallback={null}>
                <PlantsViewOpener />
              </Suspense>
            ),
          }
        : view === "species"
          ? {
              // The arrangement sits beside the title instead of in a row of its own (US-QS-22).
              action: (
                <Select
                  aria-label="Anordnung der Arten"
                  className="w-auto"
                  value={props.sort}
                  onChange={(e) => props.onSort(e.target.value as SpeciesSort)}
                >
                  {SPECIES_SORTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ),
            }
          : {})}
    />
  );
}
