import { Route, useParams } from "react-router";
import type { Species, Specimen } from "@pflanzendex/core";
import { CareProfileSection } from "@/collection";
import { loadSpecies, searchSpecies, SpeciesPage } from "@/catalog";
import type { WishToPlant } from "@/wishlist";
import { AddPlant, ContextHint } from "@/shell";
import { AreaSection } from "../../shared/area-section/area-section";
import { CollectionArea, DiscoverArea } from "../../shared/lazy-areas";
import {
  ADD_PLANT_PATH,
  PATHS,
  PROFILE_BASE,
} from "@/components/shared/navigation/nav-model/navigation/navigation";

/** The start page and the further-plant flow find species through the catalog without importing it (ADR 0003). */
export const SPECIES_LOOKUP = { search: searchSpecies, load: loadSpecies };
type Token = () => Promise<string | undefined>;

/** My care profile is a section of the species profile (US-BES-09, US-QS-14); the app wires `collection` into `catalog`. */
const careProfile = (api: string, token: Token) =>
  function CareProfile(species: Species) {
    return (
      <AreaSection
        anchor="pflegeprofil"
        title="Mein Pflegeprofil"
        loading="Pflegeprofil wird geladen …"
      >
        <CareProfileSection api={api} token={token} speciesId={species.id} />
      </AreaSection>
    );
  };

/** The species profile has its own address; the id comes from it (US-POK-09). */
function SpeciesProfileRoute(props: { api: string; token: Token; onChoose: (s: Species) => void }) {
  const { profileId } = useParams();
  return (
    <SpeciesPage
      {...props}
      openId={profileId ?? null}
      profileSection={careProfile(props.api, props.token)}
    />
  );
}

export type HandOver = {
  newSpecies: Species | null;
  setNewSpecies: (s: Species | null) => void;
  choose: (s: Species) => void;
  toTheCatalog: () => void;
  /** Opens the quick flow for a further plant (US-ONB-01, #896). */
  toAddPlant: () => void;
  /** A specimen was created for the chosen species: the app links it to its bought wish, if any (US-WUN-05). */
  onCreated: (specimen: Specimen) => void;
  /** Starts the way from a bought wish to its specimen (US-WUN-05). */
  startFromWish: (wish: WishToPlant) => void;
  /** The catalog search starts with this text while a bought wish is on its way to the specimen (US-WUN-05). */
  searchStart?: string;
};

/** The catalog and the collection hand the chosen species over to each other (US-BES-02); the wishlist starts the way to the plant (US-WUN-05). */
export function handOverRoutes(api: string, token: Token, h: HandOver, open: (id: string) => void) {
  return [
    <Route
      key="add-plant"
      path={ADD_PLANT_PATH}
      element={
        <AddPlant
          lookup={SPECIES_LOOKUP}
          api={api}
          token={token}
          onCatalog={h.toTheCatalog}
          onMore={h.choose}
        />
      }
    />,
    <Route
      key="collection"
      path={PATHS.collection}
      element={
        <CollectionArea
          api={api}
          token={token}
          newSpecies={h.newSpecies}
          onSpeciesChoose={h.toTheCatalog}
          onAdd={h.toAddPlant}
          onCompleted={h.onCreated}
          onOpenSpecies={open}
          onCreateSpecimen={h.startFromWish}
          renderHint={(a) => <ContextHint api={api} token={token} applicable={a} />}
        />
      }
    />,
    <Route
      key="discover"
      path={PATHS.discover}
      element={
        <DiscoverArea
          api={api}
          token={token}
          onChoose={h.choose}
          profileSection={careProfile(api, token)}
          {...(h.searchStart ? { searchStart: h.searchStart } : {})}
        />
      }
    />,
    <Route
      key="profile"
      path={`${PROFILE_BASE}/:profileId`}
      element={<SpeciesProfileRoute api={api} token={token} onChoose={h.choose} />}
    />,
  ];
}
