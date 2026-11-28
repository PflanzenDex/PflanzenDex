// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { OfferList } from "./offer-list";

afterEach(cleanup);

const offer = (extra: Record<string, unknown> = {}) =>
  ({
    id: "o1",
    specimenId: "s1",
    specimenName: "Haworthia",
    type: "cutting",
    mode: "swap",
    wish: "Ableger",
    note: null,
    status: "open",
    createdAt: "2026-10-08T10:00:00.000Z",
    health: { treatmentOpen: false, lastTreated: null },
    phase: null,
    ...extra,
  }) as never;

describe("US-QS-32 · SG-LIST-01 an offer card on a phone is dense enough for two whole rows", () => {
  it("US-QS-32 · SG-LIST-01 the status stands in the title row of the card, not in a row of its own", () => {
    setViewportWidth(360);
    render(
      <MemoryRouter>
        <OfferList offers={[offer({ status: "handed_over" })]} busy={false} onWithdraw={vi.fn()} />
      </MemoryRouter>,
    );
    const name = screen.getByText("Haworthia");
    const status = screen.getByText("Übergeben");
    expect(status.parentElement).toBe(name.parentElement);
  });

  it("US-QS-32 · SG-LIST-01 an open offer keeps its withdraw button, still a 48 px touch target", () => {
    setViewportWidth(360);
    render(
      <MemoryRouter>
        <OfferList offers={[offer()]} busy={false} onWithdraw={vi.fn()} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: /Haworthia/ });
    expect(button.className).toContain("min-h-[48px]");
    expect(screen.getByText("Offen").parentElement).toBe(
      screen.getByText("Haworthia").parentElement,
    );
  });

  it("US-QS-32 · SG-LIST-01 the title row wraps, so at 200 % text a long name puts the status under it instead of widening the card", () => {
    setViewportWidth(360);
    render(
      <MemoryRouter>
        <OfferList offers={[offer()]} busy={false} onWithdraw={vi.fn()} />
      </MemoryRouter>,
    );
    const row = screen.getByText("Offen").parentElement as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("min-w-0");
  });
});

describe("US-QS-15 SG-TYPE-05 the line 'type · mode' of an offer card breaks only between its parts (issue 2640)", () => {
  it("US-QS-15 at 360 px the type and the mode are one part each, and the text of the line is the same", () => {
    setViewportWidth(360);
    render(
      <MemoryRouter>
        <OfferList offers={[offer()]} busy={false} onWithdraw={vi.fn()} />
      </MemoryRouter>,
    );
    const parts = Array.from(document.querySelectorAll<HTMLElement>("[data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual(["Steckling ·", "Tauschen"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    expect(plain(parts[0]?.parentElement?.textContent)).toBe("Steckling · Tauschen");
  });
});
