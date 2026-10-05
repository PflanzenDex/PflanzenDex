// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "../../../.storybook/preview";
import * as badge from "./badge.stories";
import * as button from "./button.stories";
import * as dialog from "./dialog.stories";
import * as label from "./label.stories";
import * as sheet from "./sheet.stories";
import * as shell from "../shared/shell.stories";

setProjectAnnotations([preview]);

const catalog = {
  Button: composeStories(button),
  Badge: composeStories(badge),
  Label: composeStories(label),
  Dialog: composeStories(dialog),
  Sheet: composeStories(sheet),
  Shell: composeStories(shell),
};

describe("TE-18 · DS-01 ui primitive stories", () => {
  afterEach(cleanup);

  for (const [component, stories] of Object.entries(catalog))
    for (const [name, Story] of Object.entries(stories))
      for (const scheme of ["light", "dark"] as const)
        it(`TE-18 · ${component}/${name} renders in ${scheme} mode`, async () => {
          await Story.run({ globals: { colorScheme: scheme } });
          expect(document.body.children.length).toBeGreaterThan(0);
        });
});
