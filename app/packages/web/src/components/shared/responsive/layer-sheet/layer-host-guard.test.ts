// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The `src` folder, found from this file (components/shared/responsive/layer-sheet). */
const SRC = fileURLToPath(new URL("../../../../", import.meta.url));

/**
 * Every file that renders a `LayerSheet`, with the file of the frame (`LayerHost`) its panes land in. A layer in a new
 * file must name its frame here, and the frame must render a `LayerHost` (US-QS-15, DS-59): a layer outside a frame
 * would stack below the list from 1024 px.
 */
const PANE_FRAMES: Record<string, string> = {
  "account/settings-page/settings-page.tsx": "account/settings-page/settings-page.tsx",
  "catalog/search-view/search-filters/search-filters.tsx":
    "components/routing/areas/discover-area/discover-area.tsx",
  "catalog/species-page/species-page.tsx":
    "components/routing/areas/discover-area/discover-area.tsx",
  "collection/other-pages/difficulty-page/difficulty-page.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "collection/plants-screen/plant-layers/plant-layer/plant-layer.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "collection/plants-screen/plant-layers/plant-layers.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "components/routing/areas/today-area/today-area.tsx":
    "components/routing/areas/today-area/today-area.tsx",
  "components/sammlung-header/view-layer/view-layer.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "equipment/equipment-page/equipment-screen/layers/equipment-layers/equipment-layers.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "pokedex/pokedex-browse/pokedex-browse.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "pokedex/pokedex-page/pokedex-page.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
  "shell/unlock/locked-rows/collapsed-rows/collapsed-rows.tsx":
    "components/routing/areas/today-area/today-area.tsx",
  "social/pages/friends-page/friend-layers/layer/layer.tsx":
    "social/pages/friends-page/friends-page.tsx",
  "today/today-page/today-page.tsx": "components/routing/areas/today-area/today-area.tsx",
  "wishlist/wishlist-page/layers/wishlist-layers/wishlist-layers.tsx":
    "components/routing/areas/collection-area/collection-area.tsx",
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const component = /\.tsx$/.test(entry.name) && !/\.(test|stories)\.tsx$/.test(entry.name);
    return component ? [path] : [];
  });
}

const rel = (path: string) => relative(SRC, path).split(sep).join("/");
const read = (file: string) => readFileSync(join(SRC, file), "utf8");

describe("LayerHost guard (US-QS-15)", () => {
  it("US-QS-15 every file that renders a LayerSheet is listed with the frame its panes land in", () => {
    const rendering = sourceFiles(SRC)
      .map(rel)
      .filter((file) => /<LayerSheet[\s/>]/.test(read(file)))
      .sort();
    expect(rendering).toEqual(Object.keys(PANE_FRAMES).sort());
  });

  it("US-QS-15 every frame named for a layer renders a LayerHost", () => {
    for (const frame of new Set(Object.values(PANE_FRAMES))) {
      expect(read(frame), frame).toMatch(/<LayerHost[\s>]/);
    }
  });
});
