import { describe, expect, it } from "vitest";
import { stecklingslicht } from "./index";

const zone = (id: string, reihenfolge: number) => ({
  id,
  name: `Zone ${reihenfolge}`,
  luxDecke: 1000 * reihenfolge,
  ppfd: null,
  reihenfolge,
});

describe("US-BES-04 Stecklingslicht", () => {
  it("US-BES-04: Stecklingslicht ist die niedrigste Zone des Kontos, unabhängig von der Reihenfolge der Liste", () => {
    expect(stecklingslicht([zone("c", 3), zone("a", 1), zone("b", 2)])?.id).toBe("a");
  });

  it("US-BES-04: ohne Zonen gibt es kein Stecklingslicht (unbekannt, P-08)", () => {
    expect(stecklingslicht([])).toBeNull();
  });
});
