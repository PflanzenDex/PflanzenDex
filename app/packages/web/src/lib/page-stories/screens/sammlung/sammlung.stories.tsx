import type { Meta } from "@storybook/react-vite";
import { CollectionArea } from "@/components/routing/areas/lazy-areas";
import { collectionEmpty, collectionRoutes } from "../../data/collection-data";
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
const plants = mode("plants");
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
export const PlantsEmpty = screenStory({
  path: "/collection?view=plants",
  routes: collectionEmpty,
  screen,
});
