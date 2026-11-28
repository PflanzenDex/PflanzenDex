// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, describe, it } from "vitest";
import preview from "../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./switch-row.stories";

// US-QS-32: every story of the switch row runs with its play in jsdom (no layout: the browser run of the conformance judges the boxes).
setProjectAnnotations([preview]);
const catalog = composeStories(stories);

beforeAll(() => setViewportWidth(360));

afterEach(unmountStoryRuns);

describe("US-QS-32 · the stories of the switch row", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-32 · story ${name} renders and its play passes`, async () => {
      await Story.run();
    });
});
