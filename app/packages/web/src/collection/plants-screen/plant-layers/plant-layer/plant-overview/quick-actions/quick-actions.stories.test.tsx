// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, beforeEach, describe, it, vi } from "vitest";
import preview from "../../../../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./quick-actions.stories";

// US-QS-15 · issue 2536: the play of the result under the row runs in jsdom, where it checks the order of the page, the focus
// and the live region; the browser run (`make sb-test`, the conformance) measures the scroll position and the heights.
setProjectAnnotations([preview]);

const catalog = composeStories(stories);

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

beforeEach(() => setViewportWidth(360));

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
