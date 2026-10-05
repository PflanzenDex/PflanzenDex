// @vitest-environment jsdom
import { composeStories, setProjectAnnotations } from "@storybook/react-vite";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import preview from "./preview";
import * as stories from "./smoke.stories";

setProjectAnnotations([preview]);
const { Default } = composeStories(stories);

function darkRuleCondition(): string | undefined {
  for (const sheet of Array.from(document.styleSheets))
    for (const rule of Array.from(sheet.cssRules))
      if (rule instanceof CSSMediaRule && rule.cssText.includes("--grund"))
        return rule.media.mediaText;
  return undefined;
}

describe("TE-18 · storybook", () => {
  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
  });

  it("TE-18 · storybook renders a story in both color schemes", async () => {
    const style = document.createElement("style");
    style.textContent = "@media (prefers-color-scheme: dark) { :root { --grund: #000; } }";
    document.head.append(style);

    for (const scheme of ["light", "dark"] as const) {
      await Default.run({ globals: { colorScheme: scheme } });
      expect(screen.getAllByText("Katalog läuft").length).toBeGreaterThan(0);
      expect(document.documentElement.dataset.colorScheme).toBe(scheme);
      expect(darkRuleCondition()).toBe(scheme === "dark" ? "all" : "not all");
      cleanup();
    }
  });
});
