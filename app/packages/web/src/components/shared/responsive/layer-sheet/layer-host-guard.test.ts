// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** The `src` folder, found from this file (components/shared/responsive/layer-sheet). */
const SRC = fileURLToPath(new URL("../../../../", import.meta.url));

const AREA = "components/routing/areas";
const COLLECTION = `${AREA}/collection-area/collection-area.tsx`;
const DISCOVER = `${AREA}/discover-area/discover-area.tsx`;
const TODAY = `${AREA}/today-area/today-area.tsx`;
const PROFILE = `${AREA}/collection-area/hand-over-routes/hand-over-routes.tsx`;

/**
 * Every file that renders a `LayerSheet`, with the frames (files that render a `LayerHost`) its panes land in. A layer in
 * a new file must name its frames here, and every named frame must render a `LayerHost` (US-QS-15, DS-59): a layer
 * outside a frame would stack below the list from 1024 px. The runtime check is the test "US-QS-15 every destination opens
 * its layer in its frame" in app.test.tsx.
 */
const PANE_FRAMES: Record<string, readonly string[]> = {
  "account/operator/operator-page/operator-page.tsx": [
    "account/operator/operator-page/operator-page.tsx",
  ],
  "account/settings-page/settings-page.tsx": ["account/settings-page/settings-page.tsx"],
  "catalog/search-view/search-filters/search-filters.tsx": [DISCOVER],
  "catalog/species-page/species-page.tsx": [DISCOVER, PROFILE],
  "collection/other-pages/difficulty-page/difficulty-page.tsx": [COLLECTION],
  "collection/plants-screen/plant-layers/plant-layer/plant-layer.tsx": [COLLECTION],
  "collection/plants-screen/plant-layers/plant-layers.tsx": [COLLECTION],
  "components/routing/areas/today-area/today-area.tsx": [TODAY],
  "components/sammlung-header/view-layer/view-layer.tsx": [COLLECTION],
  "equipment/equipment-page/equipment-screen/item-layer/item-layer.tsx": [COLLECTION],
  "equipment/equipment-page/equipment-screen/layers/equipment-layers/equipment-layers.tsx": [
    COLLECTION,
  ],
  "pokedex/pokedex-browse/pokedex-browse.tsx": [COLLECTION],
  "pokedex/pokedex-page/pokedex-page.tsx": [COLLECTION],
  "care/treatments/planning/plan-layer/plan-layer.tsx": [TODAY],
  "shell/unlock/locked-rows/collapsed-rows/collapsed-rows.tsx": [TODAY],
  "social/pages/friends-page/friend-layers/layer/layer.tsx": [
    "social/pages/friends-page/friends-page.tsx",
  ],
  "today/today-page/today-page.tsx": [TODAY],
  "social/pages/friend-collection/friend-collection.tsx": [
    "social/pages/friend-collection/friend-collection.tsx",
  ],
  "swap/pages/exchange/exchange.tsx": ["swap/pages/exchange/exchange.tsx"],
  "wishlist/wishlist-page/layers/wishlist-layers/wishlist-layers.tsx": [COLLECTION],
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
  it("US-QS-15 every file that renders a LayerSheet is listed with the frames its panes land in", () => {
    const rendering = sourceFiles(SRC)
      .map(rel)
      .filter((file) => /<LayerSheet[\s/>]/.test(read(file)))
      .sort();
    expect(rendering).toEqual(Object.keys(PANE_FRAMES).sort());
  });

  it("US-QS-15 every frame named for a layer renders a LayerHost", () => {
    const frames = new Set(Object.values(PANE_FRAMES).flat());
    for (const frame of frames) {
      expect(read(frame), frame).toMatch(/<LayerHost[\s>]/);
    }
  });
});
