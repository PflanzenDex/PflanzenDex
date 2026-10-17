// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import * as stories from "./freunde.stories";

prepareStories();
const { Phone, NoFriendsYet } = composeStories(stories);

describe("US-QS-14 · page story Freunde", () => {
  afterEach(cleanup);

  it("US-QS-14 · the story shows friends, requests and sharing", async () => {
    await Phone.run();
    expect(await screen.findByText("Sven möchte mit dir befreundet sein.")).toBeTruthy();
    expect(screen.getByText("befreundet seit 14.08.2026")).toBeTruthy();
  });

  it("US-QS-14 · a new account is asked to invite a friend", async () => {
    await NoFriendsYet.run();
    expect(await screen.findByText(/Noch keine Freunde/)).toBeTruthy();
  });
});
