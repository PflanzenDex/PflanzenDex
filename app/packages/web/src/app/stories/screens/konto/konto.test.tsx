// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import { unmountStoryRuns } from "../../../../shared/testing/story-teardown/story-teardown";
import * as stories from "./konto.stories";

prepareStories();
const { Phone, DesktopDark } = composeStories(stories);

describe("US-QS-17 · page story Konto", () => {
  afterEach(() => unmountStoryRuns(Phone));

  it("US-QS-17 · the story shows the index with profile row and values from fixture data and no loading state", async () => {
    await Phone.run();
    expect((await screen.findAllByText("mara.beispiel@example.org")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Mara · Europe/Berlin")).toBeTruthy();
    expect(screen.queryByText(/wird geladen/)).toBeNull();
  });

  it("US-QS-17 · the desktop dark story renders the same screen", async () => {
    await DesktopDark.run();
    expect(await screen.findByRole("heading", { level: 1, name: "Konto" })).toBeTruthy();
  });
});
