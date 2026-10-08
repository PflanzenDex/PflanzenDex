import type { Meta } from "@storybook/react-vite";
import { AccountArea } from "@/components/routing/areas/lazy-areas";
import { account, accountRoutes } from "../../data/account-data";
import { API, token } from "../../harness/fake-api.fixtures";
import { pageParameters, screenStory, variants } from "../../harness/screen-story/screen-story";

// Page stories of "Konto" (US-QS-14): profile and settings in the page frame, at 360 and 1280 px, light and dark.
const meta = { title: "Seiten/Konto", parameters: pageParameters } satisfies Meta;
export default meta;

const konto = variants(
  screenStory({
    path: "/account",
    routes: accountRoutes,
    screen: (
      <AccountArea
        api={API}
        token={token}
        account={account}
        onSignOut={() => undefined}
        onEverywhereSignOut={() => undefined}
      />
    ),
  }),
);

export const Phone = konto.phone;
export const PhoneDark = konto.phoneDark;
export const Desktop = konto.desktop;
export const DesktopDark = konto.desktopDark;
