// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MatchEntry } from "@pflanzendex/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AnswerLists } from "./answer-lists";

const entry = (extra: Partial<MatchEntry> = {}): MatchEntry =>
  ({
    offerId: "o1",
    answer: "later",
    answeredOn: "2026-10-12",
    speciesLatin: "Aloe vera",
    speciesGerman: "Echte Aloe",
    giverName: "Ben",
    state: "open",
    card: null,
    ...extra,
  }) as MatchEntry;

const show = (entries: MatchEntry[]) =>
  render(
    <MemoryRouter>
      <AnswerLists
        entries={entries}
        busy={false}
        onShowLater={vi.fn()}
        onReconsider={vi.fn()}
        onRemove={vi.fn()}
      />
    </MemoryRouter>,
  );

beforeEach(() => setViewportWidth(360));
afterEach(cleanup);

describe("US-QS-15 SG-TYPE-05 the line of an answered offer breaks only between its parts (issue 2640)", () => {
  it("US-QS-15 at 360 px the offer and the date are one part each, so the date never breaks inside", () => {
    show([entry()]);
    const item = within(
      screen.getByRole("heading", { name: /Später ansehen/ }).closest("section") as HTMLElement,
    ).getByRole("listitem");
    const parts = Array.from(item.querySelectorAll<HTMLElement>("[data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual(["Echte Aloe von Ben ·", "12.10.2026"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    // The text is the one of the line before the split (WCAG 2.5.3).
    expect(plain(parts[0]?.parentElement?.textContent)).toBe("Echte Aloe von Ben · 12.10.2026");
  });

  it("US-QS-15 the line of a declined offer is split the same way", () => {
    show([entry({ answer: "no", speciesGerman: null, giverName: null })]);
    const section = screen.getByRole("heading", { name: /Abgelehnt/ }).closest("section");
    const parts = Array.from(
      (section as HTMLElement).querySelectorAll<HTMLElement>("[data-meta-part]"),
    );
    expect(parts.map((p) => plain(p.textContent))).toEqual([
      "Aloe vera von einem Freund ·",
      "12.10.2026",
    ]);
  });
});
