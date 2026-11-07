// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../../.storybook/preview";
import * as badge from "../../ui/display/badge/badge.stories";
import { unmountStoryRuns } from "./story-teardown";

setProjectAnnotations([preview]);

const { Default } = composeStories(badge);

describe("FR-QG-03 · story teardown after run()", () => {
  afterEach(() => unmountStoryRuns(Default));

  it("FR-QG-03 · unmountStoryRuns removes the root and container that run() left in the document", async () => {
    await Default.run();
    expect(document.body.children.length).toBeGreaterThan(0);
    await unmountStoryRuns(Default);
    expect(document.body.children.length).toBe(0);
  });

  it("FR-QG-03 · control: RTL cleanup alone leaves the run() container in the document", async () => {
    await Default.run();
    cleanup();
    expect(document.body.children.length).toBeGreaterThan(0);
    await unmountStoryRuns(Default);
  });
});
