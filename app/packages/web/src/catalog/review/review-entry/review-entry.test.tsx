// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { ReviewEntry } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
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
