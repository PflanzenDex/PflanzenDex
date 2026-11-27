// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, describe, it } from "vitest";
import preview from "../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./object-row.stories";

// US-QS-32: every story of the object row runs with its play in jsdom (no layout: a play that measures a box returns before its first
// measure, and the browser run of the conformance judges the boxes; P-B, issue 2432).
setProjectAnnotations([preview]);
const catalog = composeStories(stories);

beforeAll(() => setViewportWidth(360));

afterEach(unmountStoryRuns);

describe("US-QS-32 · the stories of the object row", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-32 · story ${name} renders and its play passes`, async () => {
      await Story.run();
    });
});
