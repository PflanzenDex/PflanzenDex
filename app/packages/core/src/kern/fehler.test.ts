import { describe, expect, it } from "vitest";
import { FEHLERCODE_FORMAT, FEHLERTEXTE, fehler, kanonisch } from "./index";

describe("FR-QG-11 Fehlercodes", () => {
  it("jeder Code hat das Format <domäne>.<grund> und einen nichtleeren Text", () => {
    for (const [code, text] of Object.entries(FEHLERTEXTE)) {
      expect(code).toMatch(FEHLERCODE_FORMAT);
      expect(text.trim().length).toBeGreaterThan(0);
    }
  });

  it("fehler() trägt Code und Text", () => {
    expect(fehler("zugriff.verweigert")).toEqual({
      code: "zugriff.verweigert",
      text: FEHLERTEXTE["zugriff.verweigert"],
    });
  });
});

describe("kanonisch", () => {
  it("ignoriert Schlüsselreihenfolge und undefined", () => {
    expect(kanonisch({ b: 1, a: { d: [1, 2], c: undefined } })).toBe(
      kanonisch({ a: { d: [1, 2] }, b: 1 }),
    );
  });
  it("unterscheidet verschiedene Werte", () => {
    expect(kanonisch({ a: 1 })).not.toBe(kanonisch({ a: "1" }));
  });
});
