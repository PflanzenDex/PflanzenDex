import { describe, expect, it } from "vitest";
import { cuttingLight } from "./index";

const zone = (id: string, sortOrder: number) => ({
  id,
  name: `Zone ${sortOrder}`,
  luxCeiling: 1000 * sortOrder,
  ppfd: null,
  sortOrder,
});

describe("US-BES-04 cutting light", () => {
  it("US-BES-04: cutting light is the lowest zone of the account, regardless of the order of the list", () => {
    expect(cuttingLight([zone("c", 3), zone("a", 1), zone("b", 2)])?.id).toBe("a");
  });

  it("US-BES-04: without zones there is no cutting light (unknown, P-08)", () => {
    expect(cuttingLight([])).toBeNull();
  });
});
