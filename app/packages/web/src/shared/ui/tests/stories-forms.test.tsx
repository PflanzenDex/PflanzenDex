// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../../.storybook/preview";
import { unmountStoryRuns } from "../../testing/story-teardown/story-teardown";
import * as checkbox from "../fields/checkbox/checkbox.stories";
import * as input from "../fields/input/input.stories";
import * as select from "../fields/select/select.stories";
import * as textarea from "../fields/textarea/textarea.stories";

setProjectAnnotations([preview]);

const catalog = {
  Input: composeStories(input),
  Textarea: composeStories(textarea),
  Select: composeStories(select),
  Checkbox: composeStories(checkbox),
};

describe("TE-18 · DS-01 ui form primitive stories", () => {
  afterEach(() => unmountStoryRuns(catalog.Checkbox.Default));

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
