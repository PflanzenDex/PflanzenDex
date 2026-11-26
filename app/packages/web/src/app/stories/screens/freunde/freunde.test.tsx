// @vitest-environment jsdom
import { composeStories } from "@storybook/react-vite";
import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { prepareStories } from "../../harness/story-test-helpers";
import { unmountStoryRuns } from "../../../../shared/testing/story-teardown/story-teardown";
import * as stories from "./freunde.stories";

prepareStories();
const { Phone, NoFriendsYet } = composeStories(stories);

describe("US-QS-14 · page story Freunde", () => {
  afterEach(unmountStoryRuns);

  it("US-QS-20 · the story shows the page with its action, the two counted rows, the friends and the rows", async () => {
    await Phone.run();
    expect(await screen.findByRole("button", { name: "Freund hinzufügen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Anfragen/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Neu bei Freunden/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /^Meine Freunde/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Was Freunde sehen/ })).toBeTruthy();
  });

  it("US-QS-14 · a new account is asked to invite a friend", async () => {
    await NoFriendsYet.run();
    expect(await screen.findByText("Noch keine Freunde")).toBeTruthy();
  });
});
