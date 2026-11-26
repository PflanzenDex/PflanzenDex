import { describe, expect, it } from "vitest";
import { firstIndexes, LETTERS, letterAt, letterOf, MIN_ROWS } from "./letter-strip.letters";

describe("US-QS-15 · SG-LIST-11 the letters of the index", () => {
  it("US-QS-15 the strip has A to Z and then '#', and it shows from more than 100 rows on", () => {
    expect(LETTERS).toHaveLength(27);
    expect(LETTERS[0]).toBe("A");
    expect(LETTERS[25]).toBe("Z");
    expect(LETTERS.at(-1)).toBe("#");
    expect(MIN_ROWS).toBe(100);
  });

  it("US-QS-15 a name is filed under its first letter, without accent and in upper case", () => {
    expect(letterOf("Aloe vera")).toBe("A");
    expect(letterOf("ficus lyrata")).toBe("F");
    expect(letterOf("Ägerling")).toBe("A");
    expect(letterOf("Östliche Zwergpalme")).toBe("O");
    expect(letterOf("  Monstera")).toBe("M");
  });

  it("US-QS-15 a name that does not start with a letter A to Z is filed under '#'", () => {
    expect(letterOf("1000-Blatt")).toBe("#");
    expect(letterOf("„Glücksfeder“")).toBe("#");
    expect(letterOf("ßtraße")).toBe("#");
    expect(letterOf("")).toBe("#");
  });

  it("US-QS-15 the first entry of every letter is found by its index, and only letters with an entry are keys", () => {
    const first = firstIndexes(["Aloe", "Anthurie", "Efeu", "Ficus", "Ficus lyrata", "3-Blatt"]);
    expect([...first]).toEqual([
      ["A", 0],
      ["E", 2],
      ["F", 3],
      ["#", 5],
    ]);
    expect(first.has("B")).toBe(false);
  });

  it("US-QS-15 a touch lands on the letter under the finger, or on the next one that has an entry", () => {
    const present = new Set(["A", "F", "M"]);
    // 27 places: share 0 is A, share 0.2 is G (index 5 = F), and a letter without entry goes on to the next present one.
    expect(letterAt(0, present)).toBe("A");
    expect(letterAt(5.5 / 27, present)).toBe("F");
    expect(letterAt(6.5 / 27, present)).toBe("M");
  });

  it("US-QS-15 below the last letter with an entry the touch lands on that last letter, and a touch outside the strip is clamped", () => {
    const present = new Set(["A", "F"]);
    expect(letterAt(0.9, present)).toBe("F");
    expect(letterAt(2, present)).toBe("F");
    expect(letterAt(-1, present)).toBe("A");
  });

  it("US-QS-15 without any entry there is no letter to land on", () => {
    expect(letterAt(0.5, new Set())).toBeUndefined();
  });
});
