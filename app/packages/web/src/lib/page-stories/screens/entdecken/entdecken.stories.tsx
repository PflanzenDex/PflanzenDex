import type { Meta } from "@storybook/react-vite";
import { DiscoverArea } from "@/components/routing/areas/lazy-areas";
import { discoverEmpty, discoverRoutes } from "../../data/discover-data";
import { API, token } from "../../harness/fake-api.fixtures";
import { pageParameters, screenStory, variants } from "../../harness/screen-story/screen-story";

// Page stories of "Entdecken" (US-QS-14): one set per mode (Vorschläge, Katalog), at 360 and 1280 px, light and dark.
const meta = { title: "Seiten/Entdecken", parameters: pageParameters } satisfies Meta;
export default meta;

const screen = (
  <DiscoverArea api={API} token={token} onChoose={() => undefined} profileSection={() => null} />
);
const suggestions = variants(screenStory({ path: "/discover", routes: discoverRoutes, screen }));
const catalog = variants(
  screenStory({ path: "/discover?view=catalog", routes: discoverRoutes, screen }),
);

export const SuggestionsPhone = suggestions.phone;
export const SuggestionsPhoneDark = suggestions.phoneDark;
export const SuggestionsDesktop = suggestions.desktop;
export const SuggestionsDesktopDark = suggestions.desktopDark;
export const CatalogPhone = catalog.phone;
export const CatalogPhoneDark = catalog.phoneDark;
export const CatalogDesktop = catalog.desktop;
export const CatalogDesktopDark = catalog.desktopDark;
export const AllDecided = screenStory({ path: "/discover", routes: discoverEmpty, screen });
