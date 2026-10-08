import type { Meta } from "@storybook/react-vite";
import { TodayArea } from "@/components/routing/areas/lazy-areas";
import { todayEmpty, todayRoutes } from "../../data/today-data";
import { API, token } from "../../harness/fake-api.fixtures";
import { pageParameters, screenStory, variants } from "../../harness/screen-story/screen-story";

// Page stories of "Heute" (US-QS-14): "Jetzt dran", treatments and hints in the page frame, at 360 and 1280 px, light and dark.
const meta = { title: "Seiten/Heute", parameters: pageParameters } satisfies Meta;
export default meta;

const screen = <TodayArea api={API} token={token} onOpen={() => undefined} />;
const heute = variants(screenStory({ path: "/today", routes: todayRoutes, screen }));

export const Phone = heute.phone;
export const PhoneDark = heute.phoneDark;
export const Desktop = heute.desktop;
export const DesktopDark = heute.desktopDark;
export const NothingDue = screenStory({ path: "/today", routes: todayEmpty, screen });
