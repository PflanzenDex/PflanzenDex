import type { Meta } from "@storybook/react-vite";
import type { MeasurementView } from "@pflanzendex/core";
import { CollectionArea } from "@/app/destinations/area-parts/lazy-areas";
import { collectionEmpty, collectionMany, collectionRoutes } from "../../data/collection-data";
import { API, token } from "../../harness/fake-api.fixtures";
import { pageParameters, screenStory, variants } from "../../harness/screen-story/screen-story";

// Page stories of "Sammlung" (US-QS-14): one set per mode (Pflanzen, Arten, Wunschliste), at 360 and 1280 px, light and dark.
const meta = { title: "Seiten/Sammlung", parameters: pageParameters } satisfies Meta;
export default meta;

const screen = (
  <CollectionArea
    api={API}
    token={token}
    newSpecies={null}
    onSpeciesChoose={() => undefined}
    onCompleted={() => undefined}
  />
);
const mode = (view: string) =>
  variants(screenStory({ path: `/collection?view=${view}`, routes: collectionRoutes, screen }));
/** The measurements of "Aloe" (US-WAC-01): its plant layer reads them when a tile of the plants opens it (US-QS-26). */
const aloeMeasurements: MeasurementView = {
  specimenId: "a",
  status: "plant",
  growthMeasure: "rosette_diameter",
  etiolationSigns: null,
  measurements: [
    {
      id: "m-a-1",
      specimenId: "a",
      date: "2026-10-01",
      value: 24,
      quality: "healthy",
      note: null,
      ratedBy: "keeper",
      photo: null,
    },
  ],
  last: {
    id: "m-a-1",
    specimenId: "a",
    date: "2026-10-01",
    value: 24,
    quality: "healthy",
    note: null,
    ratedBy: "keeper",
    photo: null,
  },
  lastRating: "healthy",
  growth: { count: 1, ratePerYear: null, trend: null, signal: null },
};
const plantRoutes = { ...collectionRoutes, "/specimens/a/measurements": aloeMeasurements };
const plants = variants(
  screenStory({ path: "/collection?view=plants", routes: plantRoutes, screen }),
);
const species = mode("species");
const wishlist = mode("wishlist");

export const PlantsPhone = plants.phone;
export const PlantsPhoneDark = plants.phoneDark;
export const PlantsDesktop = plants.desktop;
export const PlantsDesktopDark = plants.desktopDark;
export const SpeciesPhone = species.phone;
export const SpeciesPhoneDark = species.phoneDark;
export const SpeciesDesktop = species.desktop;
export const SpeciesDesktopDark = species.desktopDark;
export const WishlistPhone = wishlist.phone;
export const WishlistPhoneDark = wishlist.phoneDark;
export const WishlistDesktop = wishlist.desktop;
export const WishlistDesktopDark = wishlist.desktopDark;
// Many plants (issue 1108): at 360 x 640 a page holds 6 tiles (US-QS-19).
const plantsMany = variants(
  screenStory({ path: "/collection?view=plants", routes: collectionMany, screen }),
);
export const PlantsManyPhone = plantsMany.phone;
export const PlantsManyPhoneDark = plantsMany.phoneDark;
export const PlantsManyDesktop = plantsMany.desktop;
export const PlantsEmpty = screenStory({
  path: "/collection?view=plants",
  routes: collectionEmpty,
  screen,
});
