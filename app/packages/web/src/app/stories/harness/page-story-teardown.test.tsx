// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { afterEach, describe, expect, it } from "vitest";
import { unmountStoryRuns } from "../../../shared/testing/story-teardown/story-teardown";
import * as heute from "../screens/heute/heute.stories";
import { prepareStories } from "./story-test-helpers";

prepareStories();
const { Phone } = composeStories(heute);

describe("FR-QG-03 · story teardown of a page story", () => {
  afterEach(unmountStoryRuns);

  it("FR-QG-03 · after run() the teardown leaves nothing in the document and runs no beforeEach again", async () => {
    await Phone.run();
    expect(document.body.children.length).toBeGreaterThan(0);
    await unmountStoryRuns();
    expect(document.body.children.length).toBe(0);
    // The page stories set a new fetch in their beforeEach (screen-story.tsx): an unchanged identity proves none ran.
    const fetchAfterRun = globalThis.fetch;
    await unmountStoryRuns();
    expect(globalThis.fetch).toBe(fetchAfterRun);
    expect(document.body.children.length).toBe(0);
  });

  it("FR-QG-03 · control: Phone.load() runs the beforeEach, which replaces globalThis.fetch", async () => {
    const before = globalThis.fetch;
    await Phone.load();
    expect(globalThis.fetch).not.toBe(before);
    await unmountStoryRuns();
  });
});
