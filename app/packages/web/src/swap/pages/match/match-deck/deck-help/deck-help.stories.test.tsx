// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, beforeAll, describe, it } from "vitest";
import preview from "../../../../../../.storybook/preview";
import { unmountStoryRuns } from "@/shared/testing/story-teardown/story-teardown";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import * as stories from "./deck-help.stories";

// US-QS-15 · issue 2611: the stories of the info button run with their play in jsdom, which has no layout: the play returns before
// its first measure. The browser run (`make sb-test STORY=swap-matchdeck-deckhelp--info-button-in-frame`, the conformance) judges
// the real boxes: the whole target and the whole focus ring inside the frame, clear of the counter text and of the card.
setProjectAnnotations([preview]);
const catalog = composeStories(stories);

beforeAll(() => setViewportWidth(360));

afterEach(unmountStoryRuns);

describe("US-QS-15 · the info button of the match deck in its frame", () => {
  for (const [name, Story] of Object.entries(catalog))
    it(`US-QS-15 · story ${name} renders and its play passes`, async () => {
      await Story.run();
    });
});
