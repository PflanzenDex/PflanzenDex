import { Suspense } from "react";
import { CollectionPage } from "@/collection";
import { SammlungHeader } from "@/components/sammlung-header/sammlung-header";
import { SegmentedControl } from "@/components/segmented-control/segmented-control";
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
                <CollectionPage part="opener" />
              </Suspense>
            ),
          }
        : {})}
    >
      {view === "species" ? (
        <SegmentedControl
          label="Anordnung der Arten"
          options={SPECIES_SORTS}
          value={props.sort}
          onChange={props.onSort}
        />
      ) : null}
    </SammlungHeader>
  );
}
