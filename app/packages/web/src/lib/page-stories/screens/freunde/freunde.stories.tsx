import type { Meta } from "@storybook/react-vite";
import { FriendsPage } from "@/social";
import { socialEmpty, socialRoutes } from "../../data/social-data";
import { API, token } from "../../harness/fake-api.fixtures";
import { pageParameters, screenStory, variants } from "../../harness/screen-story/screen-story";

// Page stories of "Freunde" (US-QS-14): friends, requests, invitation and sharing, at 360 and 1280 px, light and dark.
const meta = { title: "Seiten/Freunde", parameters: pageParameters } satisfies Meta;
export default meta;

const screen = <FriendsPage api={API} token={token} />;
const freunde = variants(screenStory({ path: "/friends", routes: socialRoutes, screen }));

export const Phone = freunde.phone;
export const PhoneDark = freunde.phoneDark;
export const Desktop = freunde.desktop;
export const DesktopDark = freunde.desktopDark;
export const NoFriendsYet = screenStory({ path: "/friends", routes: socialEmpty, screen });
