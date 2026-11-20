// US-QS-14 · DS-25: the bars and the room they reserve follow one threshold, the tall window of 30 rem of height. jsdom has
// no layout, so this test reads the rule text of tokens.css (as focus-ring.test.ts does) and scans the source for a second
// copy of the number.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const flat = tokensCss.replace(/\s+/g, " ");
const srcDir = fileURLToPath(new URL("..", import.meta.url));

/** The web source files that could carry a height query: components and stylesheets, not tests. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("US-QS-14 tall window: one threshold for the bars and their room", () => {
  it("US-QS-14 the tall window is one variant of 30 rem of height, defined in tokens.css", () => {
    expect(flat).toContain("@custom-variant tall-window (@media (min-height: 30rem));");
  });

  it("US-QS-14 no other source file writes the 30 rem height query; the components use the variant", () => {
    const offenders = sourceFiles(srcDir)
      .filter((path) => /-height:\s*30rem/.test(readFileSync(path, "utf8")))
      .map((path) => relative(srcDir, path));
    expect(offenders).toEqual(["styles/tokens.css"]);
  });

  it("US-QS-14 by default the scroll padding for the bars is zero; the tall window applies the measured heights", () => {
    expect(flat).toContain("html { scroll-padding-top: 0; scroll-padding-bottom: 0; }");
    expect(flat).toContain(
      "@variant tall-window { html { scroll-padding-top: var(--header-clearance, 0px); scroll-padding-bottom: var(--bar-clearance, 0px); }",
    );
  });

  it("US-QS-14 by default nothing is pinned to the window height; the tall window restores the one-screen frame", () => {
    expect(flat).toContain("main > div:has(> [data-fit-fill]) { height: auto; }");
    expect(flat).toContain("main > div > [data-fit-fill] { margin: -0.5rem -1rem;");
    expect(flat).toContain("main:has([data-fit-screen]) { overflow-y: visible;");
    expect(flat).toContain("@variant tall-window { ");
    expect(flat).toContain("div:has(> div > main [data-fit-screen]) { height: 100dvh; }");
    expect(flat).toContain(
      "main > div > [data-fit-fill] { height: calc(100% + 1rem); overflow-y: auto;",
    );
    expect(flat).toContain(
      "main:has([data-fit-screen]) { overflow-y: auto; overscroll-behavior: contain; }",
    );
    // Issue 1835: with the bottom bar the view ends at the room for the bar, so its last 0.5 rem is never under it.
    expect(flat).toContain(
      "@media (width < 48rem) { main > div > [data-fit-fill] { height: calc(100% + 0.5rem); margin-bottom: 0; } }",
    );
  });
});
