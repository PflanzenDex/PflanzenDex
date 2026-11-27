// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, describe, it } from "vitest";
import preview from "../../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./card-row.stories";

// US-QS-15: every story of the card row runs with its play in jsdom, which has no layout, so a play that measures a box returns
// before its first measure and the browser run of the conformance judges the boxes (P-B, issue 2432).
setProjectAnnotations([preview]);
const catalog = composeStories(stories);

beforeAll(() => {
  // jsdom has no pointer capture; Vaul calls it on pointerdown inside the sheet.
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
  setViewportWidth(360);
});

afterEach(unmountStoryRuns);

describe("US-QS-15 · the stories of the card row", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-15 · story ${name} renders and its play passes`, async () => {
      await Story.run();
    });
});
