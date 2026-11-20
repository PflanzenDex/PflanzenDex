import { describe, expect, it } from "vitest";
import { PLANT_TAB_PARAM } from "@/shared/patterns/navigation/navigation/navigation";
import { LAYER_PARTS, withoutLayer } from "./use-layer.history";

describe("US-QS-15 issue 2147 · the list a layer closes to", () => {
  it("US-QS-15 issue 2147 · withoutLayer drops sheet and the layer's own parts, and keeps the list behind the layer", () => {
    expect(
      withoutLayer(
        "?view=plants&from=40&sheet=plant-e1&tab=pflege&teil=profil&course=leaves&vfrom=2&verlauf=3&ofrom=1&lfrom=4",
      ),
    ).toBe("?view=plants&from=40&lfrom=4");
  });

  it("US-QS-15 issue 2147 · a layer on an address without other parts leaves the bare list address", () => {
    expect(withoutLayer("?sheet=plant-e1&tab=standort")).toBe("");
  });

  it("US-QS-15 issue 2147 · LAYER_PARTS names the tab of the plant layer, so the list drops it too", () => {
    expect(LAYER_PARTS).toContain(PLANT_TAB_PARAM);
  });
});
