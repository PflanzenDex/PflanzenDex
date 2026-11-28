// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, describe, it } from "vitest";
import preview from "../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./sensors-view.stories";

// US-QS-32: every story of the sensor assignment runs with its play in jsdom (no layout: the measures of the plays return before
// their first box, and the browser run of the conformance and `make sb-test` judge the boxes; issue 2307, Q-108).
setProjectAnnotations([preview]);
const catalog = composeStories(stories);

beforeAll(() => {
  // The pick list is a sheet; Vaul calls pointer capture, which jsdom lacks.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  setViewportWidth(360);
});

afterEach(unmountStoryRuns);

describe("US-QS-32 · the stories of the sensor assignment", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-32 · story ${name} renders and its play passes`, async () => {
      await Story.run();
    });
});
