import type { CaughtSpecies, PokedexFilter, PokedexSort } from "@pflanzendex/core";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { germanNameOf } from "@/shared/species-name/species-name";
import { speciesLayerId } from "../../pokedex-cards/pokedex-cards";
import { FILTER_LAYER, FilterPanel } from "../../pokedex-controls/pokedex-controls";
import { SpeciesDetail, SpeciesProfileAction } from "../../pokedex-detail/pokedex-detail";
import { texts } from "@/shared/lib/text-rules/texts";
import table from "../../pokedex-page/pokedex-page.de.json";

const ui = texts(table);

/** The layers of the browse: "Filter" with the sorting, and the details of the chosen species (US-POK-09, US-QS-22). */
export function BrowseLayers(props: {
  filter: PokedexFilter;
  sort: PokedexSort;
  poorKnown: boolean;
  onFilter: (filter: PokedexFilter) => void;
  onSort: (sort: PokedexSort) => void;
  chosen: CaughtSpecies | undefined;
  onOpenSpecies: ((id: string) => void) | undefined;
}) {
  const { chosen } = props;
  return (
    <>
      <LayerSheet id={FILTER_LAYER} title={ui("filterTitle")}>
        <FilterPanel
          filter={props.filter}
          sort={props.sort}
          poorKnown={props.poorKnown}
          onFilter={props.onFilter}
          onSort={props.onSort}
        />
      </LayerSheet>
      {chosen ? <SpeciesLayer species={chosen} onOpenSpecies={props.onOpenSpecies} /> : null}
    </>
  );
}

/** The layer of one species: its details scroll, "Zum Artprofil" stays below them when the profile is wired. */
function SpeciesLayer(props: {
  species: CaughtSpecies;
  onOpenSpecies: ((id: string) => void) | undefined;
}) {
  const { species, onOpenSpecies } = props;
  return (
    <LayerSheet
      id={speciesLayerId(species.species)}
      title={germanNameOf(species.species, species.germanName) ?? species.species}
      primaryAction={
        onOpenSpecies ? (
          <SpeciesProfileAction speciesId={species.speciesId} onOpen={onOpenSpecies} />
        ) : undefined
      }
    >
      <SpeciesDetail species={species} />
    </LayerSheet>
  );
}
