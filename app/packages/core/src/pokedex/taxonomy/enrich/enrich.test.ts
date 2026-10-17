import { describe, expect, it } from "vitest";
import { shortText } from "./summary";

describe("US-POK-03 short text", () => {
  it("US-POK-03 keeps at most 2 sentences", () => {
    expect(shortText("Eins ist hier. Zwei folgt. Drei fällt weg.")).toBe(
      "Eins ist hier. Zwei folgt.",
    );
  });

  it("US-POK-03 cuts at a sentence boundary to stay within 240 characters", () => {
    const first = "A".repeat(100) + ".";
    const second = "B".repeat(150) + ".";
    expect(shortText(`${first} ${second}`)).toBe(first);
  });

  it("US-POK-03 gives no text (unknown) when the first sentence alone is too long", () => {
    expect(shortText("C".repeat(300) + ". Kurz.")).toBeNull();
  });

  it("US-POK-03 does not split after an author abbreviation", () => {
    expect(shortText("Ficus benjamina L. ist eine Art. Sie ist beliebt. Mehr nicht.")).toBe(
      "Ficus benjamina L. ist eine Art. Sie ist beliebt.",
    );
  });
});
