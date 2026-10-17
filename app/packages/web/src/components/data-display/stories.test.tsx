// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import { setViewportWidth } from "@/lib/viewport-mock";
import * as avatar from "./avatar/avatar.stories";
import * as card from "./card/card.stories";
import * as accordion from "./panels/accordion/accordion.stories";
import * as menu from "./panels/menu/menu.stories";
import * as popover from "./panels/popover/popover.stories";
import * as loadMore from "./panels/pagination/load-more/load-more.stories";
import * as pagination from "./panels/pagination/pagination.stories";
import * as tabs from "./panels/tabs/tabs.stories";
import * as progress from "./progress/progress.stories";

setProjectAnnotations([preview]);

const catalog = {
  Accordion: composeStories(accordion),
  Avatar: composeStories(avatar),
  Card: composeStories(card),
  Menu: composeStories(menu),
  LoadMore: composeStories(loadMore),
  Pagination: composeStories(pagination),
  Popover: composeStories(popover),
  Progress: composeStories(progress),
  Tabs: composeStories(tabs),
};

describe("TE-17 · DS-02 data-display component stories", () => {
  afterEach(cleanup);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const width of [360, 768])
        for (const scheme of ["light", "dark"] as const)
          it(`TE-17 · ${component}/${name} renders at ${width}px in ${scheme} mode`, async () => {
            setViewportWidth(width);
            await Story.run({ globals: { colorScheme: scheme } });
            expect(document.body.children.length).toBeGreaterThan(0);
          });
});
