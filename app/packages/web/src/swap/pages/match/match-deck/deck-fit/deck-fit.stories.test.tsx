// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, describe, it } from "vitest";
import preview from "../../../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./deck-fit.stories";

// US-QS-15, US-TAU-01 · issue 2637: the stories of the card of the deck run with their play in jsdom, which has no layout: the
// play returns before its first measure. The browser run (`make sb-test STORY=swap-matchdeck-deckfit--card-keeps-content-at-large-text`,
// the conformance) judges the real boxes at 360 x 640 px: at 200 % text the card keeps the height of its content and the buttons
// stand below it; at the normal size the card takes the free height.
setProjectAnnotations([preview]);
const catalog = composeStories(stories);

beforeAll(() => setViewportWidth(360));

afterEach(unmountStoryRuns);

describe("US-QS-15 · US-TAU-01 · the card of the match deck in its frame", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-15 · US-TAU-01 · story ${name} renders and its play passes`, async () => {
      await Story.run();
    });
});
