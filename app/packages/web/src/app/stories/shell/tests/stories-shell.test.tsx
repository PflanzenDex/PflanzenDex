// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../../../.storybook/preview";
import { unmountStoryRuns } from "../../../../shared/testing/story-teardown/story-teardown";
import * as appShell from "../../../frame/app-shell/app-shell.stories";
import * as globalHeader from "../../../frame/global-header/global-header.stories";
import * as mobileNavBar from "../../../frame/mobile-nav-bar/mobile-nav-bar.stories";
import * as sideNav from "../../../frame/side-nav/side-nav.stories";

setProjectAnnotations([preview]);

const catalog = {
  AppShell: composeStories(appShell),
  GlobalHeader: composeStories(globalHeader),
  MobileNavBar: composeStories(mobileNavBar),
  SideNav: composeStories(sideNav),
};

describe("TE-18 · DS-25 shared shell stories", () => {
  afterEach(unmountStoryRuns);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
