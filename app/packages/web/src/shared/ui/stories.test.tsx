// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import { unmountStoryRuns } from "../testing/story-teardown/story-teardown";
import * as badge from "./badge.stories";
import * as button from "./button.stories";
import * as dialog from "./dialog.stories";
import * as label from "./label.stories";
import * as letterStrip from "./letter-strip.stories";
import * as moreHelp from "./more-help.stories";
import * as sheet from "./sheet.stories";

setProjectAnnotations([preview]);

const catalog = {
  Button: composeStories(button),
  Badge: composeStories(badge),
  Label: composeStories(label),
  LetterStrip: composeStories(letterStrip),
  MoreHelp: composeStories(moreHelp),
  Dialog: composeStories(dialog),
  Sheet: composeStories(sheet),
};

describe("TE-18 · DS-01 ui primitive stories", () => {
  afterEach(unmountStoryRuns);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
