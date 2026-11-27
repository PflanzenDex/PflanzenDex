// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import preview from "../../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import {
  layout,
  setWindowHeight,
  stubBoxes,
  stubSheetLayout,
} from "@/shared/ui/sheet.test-helpers";
import * as heights from "./layer-sheet.heights.stories";
import * as lists from "./layer-sheet.lists.stories";
import * as states from "./layer-sheet.states.stories";

// US-QS-15: the plays of the sheet heights measure only where there is layout, so a plain jsdom run skips them. Here jsdom
// gets the layout of a phone (360 x 640 px, `stubSheetLayout` and `stubBoxes`), and every play runs to its end: the fitting
// story with a short content, all others with a long one. The browser run of the conformance judges the real boxes.
setProjectAnnotations([preview]);

const catalog = {
  ...composeStories(heights),
  ...composeStories(lists),
  ...composeStories(states),
};

beforeEach(() => {
  layout.header = 90;
  layout.pinned = 60;
  stubSheetLayout();
  stubBoxes();
  setViewportWidth(360);
  setWindowHeight(640);
});

afterEach(async () => {
  await unmountStoryRuns();
  vi.restoreAllMocks();
});

describe("US-QS-15 · the plays of the sheet heights run with the layout of a phone", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-15 · play ${name} passes`, async () => {
      layout.content = name === "FitsContent" ? 60 : 1200;
      await Story.run();
    });
});
