// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { SpeciesHit } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { HitList } from "./hit-list";

// The meta line of a catalog hit is "German name · fact" ("Frauenhaarfarn · Schwierigkeit: unbekannt"). At 360 px it is wider than
// the column, so it wraps; it breaks only between its parts, like the meta line of an object row (issue 2606, d-168, issue 2632).
const hit = (extra: Partial<SpeciesHit> = {}): SpeciesHit =>
  ({
    id: "s1",
    latinName: "Adiantum raddianum",
    germanName: "Frauenhaarfarn",
    difficulty: null,
    reviewStatus: "reviewed",
    hit: null,
    ...extra,
  }) as SpeciesHit;

function list(hits: readonly SpeciesHit[]) {
  return render(
    <MemoryRouter>
      <HitList hit={hits} onOpen={vi.fn()} resetKey="" />
    </MemoryRouter>,
  );
}
/** The meta line of the one row: the span under the scientific name. */
const metaOf = () => {
  const row = within(screen.getByRole("list", { name: "Treffer" })).getByRole("button");
  return row.querySelector("i")?.parentElement?.nextElementSibling as HTMLElement;
};
const partsOf = (line: HTMLElement) =>
  Array.from(line.querySelectorAll<HTMLElement>("[data-meta-part]"));

beforeEach(() => setViewportWidth(360));
afterEach(cleanup);

describe("US-QS-32 · US-QS-15 the meta line of a catalog hit breaks only between its parts (issue 2632)", () => {
  it("US-QS-32 · US-QS-15 at 360 px the name and the fact are one part each, so 'Schwierigkeit: unbekannt' never breaks inside", () => {
    list([hit()]);
    const parts = partsOf(metaOf());
    expect(parts.map((p) => plain(p.textContent))).toEqual([
      "Frauenhaarfarn ·",
      "Schwierigkeit: unbekannt",
    ]);
    // Each part is an inline box as wide as its text, never wider than the column: it moves to the next line as a whole.
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    // The dot ends the first part (after a no-break space), so a line never starts with it.
    expect(parts[0]?.textContent?.endsWith("\u00A0·")).toBe(true);
    expect(parts[1]?.textContent?.trimStart().startsWith("·")).toBe(false);
  });

  it("US-QS-32 · US-QS-15 the text of the line and the name of the row keep their order (WCAG 2.5.3)", () => {
    list([hit()]);
    expect(plain(metaOf().textContent)).toBe("Frauenhaarfarn · Schwierigkeit: unbekannt");
    // The name of the row is its visible text: the scientific name, then the meta line as one string (the split adds no word).
    const row = within(screen.getByRole("list", { name: "Treffer" })).getByRole("button");
    expect(plain(row.textContent)).toBe(
      "Adiantum raddianumFrauenhaarfarn · Schwierigkeit: unbekannt",
    );
  });

  it("US-QS-15 the line keeps its classes: small muted text that breaks a long word as a last resort", () => {
    list([hit()]);
    expect(metaOf().className.split(" ")).toEqual(
      expect.arrayContaining(["text-sm", "text-muted-foreground", "[overflow-wrap:anywhere]"]),
    );
  });

  it("US-QS-15 a fact found by another name is its own part, the name before it ends with the dot", () => {
    list([hit({ hit: { field: "synonym", display: "Venushaar" } })]);
    expect(partsOf(metaOf()).map((p) => plain(p.textContent))).toEqual([
      "Frauenhaarfarn ·",
      "Gefunden über Synonym: Venushaar",
    ]);
  });

  it("US-QS-15 a hit without a German name shows the fact alone, as one plain text with no part", () => {
    list([hit({ germanName: null })]);
    expect(partsOf(metaOf())).toHaveLength(0);
    expect(plain(metaOf().textContent)).toBe("Schwierigkeit: unbekannt");
  });
});
