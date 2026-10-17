// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import * as stories from "./konto.stories";

prepareStories();
const { Phone, DesktopDark } = composeStories(stories);

describe("US-QS-14 · page story Konto", () => {
  afterEach(cleanup);

  it("US-QS-14 · the story shows profile and settings with fixture data and no loading state", async () => {
    await Phone.run();
    expect((await screen.findAllByText("mara.beispiel@example.org")).length).toBeGreaterThan(0);
    expect(await screen.findByLabelText(/Anzeigename/)).toBeTruthy();
    expect(screen.queryByText(/wird geladen/)).toBeNull();
  });

  it("US-QS-14 · the desktop dark story renders the same screen", async () => {
    await DesktopDark.run();
    expect(await screen.findByRole("heading", { level: 1, name: "Konto" })).toBeTruthy();
  });
});
