// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, beforeEach, describe, it, vi } from "vitest";
import preview from "../../../../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import {
  layout,
  setWindowHeight,
  stubBoxes,
  stubSheetLayout,
} from "@/shared/ui/sheet.test-helpers";
import * as stories from "./quick-actions.stories";

// US-QS-15 · issue 2536: the play of the result under the row runs in jsdom with the layout of a phone (360 x 640 px, as the
// plays of the sheet heights), so it checks the order of the page, the focus, the live region, the scroll position and the
// height; the browser run (`make sb-test`, the conformance) judges the real boxes.
setProjectAnnotations([preview]);

const catalog = composeStories(stories);

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

beforeEach(() => {
  layout.header = 90;
  layout.pinned = 60;
  layout.content = 1200;
  stubSheetLayout();
  stubBoxes();
  setViewportWidth(360);
  setWindowHeight(640);
});

afterEach(async () => {
  await unmountStoryRuns();
  vi.restoreAllMocks();
});

describe("US-QS-15 · the plays of the result of Gießen run in jsdom", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-15 · issue 2536 · play ${name} passes`, async () => {
      await Story.run();
    });
});
