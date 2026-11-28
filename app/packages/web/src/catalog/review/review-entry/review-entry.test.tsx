// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReviewEntry } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ReviewRow } from "./review-entry";

const entry = {
  reviewCase: { id: "c1", status: "open", createdAt: "2026-11-27T00:00:00Z" },
  species: { latinName: "Echeveria elegans" },
  issues: [],
  similar: [],
  aiCreated: false,
} as unknown as ReviewEntry;

afterEach(cleanup);

// The review list scrolls and clips what lies outside its rows: a ring with an offset reaches 4 px out and loses
// its top and its sides (issue 2650, DS-37). jsdom has no layout, so the class check stands for it.
describe("US-BES-10 · US-QS-15 the focus ring of a review row stays inside its row (issue 2650, WCAG 2.4.7)", () => {
  const classes = () => {
    render(
      <MemoryRouter>
        <ReviewRow entry={entry} now={Date.parse("2026-11-28T00:00:00Z")} />
      </MemoryRouter>,
    );
    return screen.getByRole("button").className.split(" ");
  };

  it("US-QS-15 the ring is inset and has no offset, so the scrolling list does not clip it", () => {
    const cls = classes();
    expect(cls).toEqual(
      expect.arrayContaining(["focus-visible:ring-inset", "focus-visible:ring-offset-0"]),
    );
    expect(cls).not.toContain("focus-visible:ring-offset-2");
  });

  it("US-QS-15 the button has the radius of the card around it, not the pill of the default size", () => {
    const cls = classes();
    expect(cls).toContain("rounded-xl");
    expect(cls).not.toContain("rounded-pill");
    expect(cls).not.toContain("rounded-none");
  });
});

// The kind and the age of a proposal and its flags are meta lines of a compact row: they break between their " · " parts and
// not inside one, like the lines of the hit list (issue 2640).
describe("US-QS-15 SG-TYPE-05 the lines of a review row break only between their parts (issue 2640)", () => {
  beforeEach(() => setViewportWidth(360));

  const lines = (extra: Record<string, unknown> = {}) => {
    render(
      <MemoryRouter>
        <ReviewRow
          entry={{ ...entry, ...extra } as unknown as ReviewEntry}
          now={Date.parse("2026-11-28T00:00:00Z")}
        />
      </MemoryRouter>,
    );
    return Array.from(screen.getByRole("button").querySelectorAll<HTMLElement>("span.text-sm"));
  };
  const partsOf = (line: HTMLElement | undefined) =>
    Array.from(line?.querySelectorAll<HTMLElement>("[data-meta-part]") ?? []);

  it("US-QS-15 the kind and the age of a proposal are one part each, and the text of the line is the same", () => {
    const [kind] = lines();
    const parts = partsOf(kind);
    expect(parts.map((p) => plain(p.textContent))).toEqual(["Nutzervorschlag ·", "vor 1 Tag"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    expect(plain(kind?.textContent)).toBe("Nutzervorschlag · vor 1 Tag");
  });

  it("US-QS-15 each flag is one part, so 'Angaben fehlen' never breaks inside", () => {
    const [, flags] = lines({
      aiCreated: true,
      issues: [{ field: "light", reason: "missing" }],
      similar: [{}],
    });
    expect(partsOf(flags).map((p) => plain(p.textContent))).toEqual([
      "KI-erstellt ·",
      "Angaben fehlen ·",
      "Mögliche Dublette",
    ]);
    expect(plain(flags?.textContent)).toBe("KI-erstellt · Angaben fehlen · Mögliche Dublette");
  });

  it("US-QS-15 a batch has no age and one flag: no part, one plain text", () => {
    const [kind, flags] = lines({
      reviewCase: { id: "c1", status: "curated", createdAt: "2026-11-27T00:00:00Z" },
      aiCreated: true,
    });
    expect(partsOf(kind)).toHaveLength(0);
    expect(partsOf(flags)).toHaveLength(0);
    expect(plain(kind?.textContent)).toBe("Betreiber-Charge");
  });
});
