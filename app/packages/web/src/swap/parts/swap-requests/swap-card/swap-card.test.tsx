// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { SwapCard } from "./swap-card";

afterEach(cleanup);

const side = (extra: Record<string, unknown> = {}) =>
  ({
    swapId: "s1",
    role: "giver",
    otherName: "Ben",
    offerId: "o1",
    speciesLatin: "Aloe vera",
    speciesGerman: "Echte Aloe",
    type: "cutting",
    mode: "swap",
    counterName: "Mein Haworthia",
    counterText: null,
    status: "requested",
    requestedAt: "2026-10-09T10:00:00.000Z",
    reason: null,
    cause: null,
    proposal: false,
    decidedAt: null,
    confirmedGiver: false,
    confirmedRecipient: false,
    specimenName: null,
    givenSpecimenId: null,
    receivedSpecimenId: null,
    handedOverAt: null,
    ...extra,
  }) as never;

const show = (extra: Record<string, unknown> = {}) =>
  render(<SwapCard s={side(extra)} busy={false} onAnswer={vi.fn()} onHandover={vi.fn()} />);

describe("US-QS-32 · SG-LIST-01 a swap card on a phone is dense enough for two whole rows", () => {
  it("US-QS-32 · SG-LIST-01 the status stands in the title row, so a request of mine needs no row for it", () => {
    show();
    const status = screen.getByText("Angefragt");
    const title = status.previousElementSibling as HTMLElement;
    expect(title.className).toContain("font-semibold");
    expect(status.parentElement?.contains(screen.getByText(/Aloe/))).toBe(true);
  });

  it("US-QS-32 · SG-LIST-01 the answer buttons are 44 px touch targets (SG-TOUCH-01), not 48 px, and stay next to each other", () => {
    show();
    for (const name of [/^Annehmen/, /^Ablehnen/, /^Anderes vorschlagen/]) {
      const button = screen.getByRole("button", { name });
      expect(button.className).toContain("min-h-[44px]");
      expect(button.className).not.toContain("min-h-[48px]");
    }
    expect(screen.getByRole("button", { name: /^Annehmen/ }).className).toContain("flex-1");
    expect(screen.getByRole("button", { name: /^Ablehnen/ }).className).toContain("flex-1");
  });

  it("US-QS-32 · SG-LIST-01 the title row wraps, so at 200 % text a long name puts the status under it instead of widening the card", () => {
    show();
    const row = screen.getByText("Angefragt").parentElement as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).toContain("min-w-0");
  });

  it("US-QS-32 · SG-LIST-01 the recipient's withdraw button keeps a row of its own below the facts", () => {
    show({ role: "recipient" });
    expect(screen.getByRole("button", { name: /Anfrage zurückziehen/ })).toBeTruthy();
    expect(screen.getByText("Angefragt").parentElement?.className).toContain("justify-between");
    expect(screen.getByRole("button", { name: /Anfrage zurückziehen/ }).className).toContain(
      "min-h-[44px]",
    );
  });
});

describe("US-QS-15 SG-TYPE-05 the facts line of a swap card breaks only between its parts (issue 2640)", () => {
  it("US-QS-15 at 360 px the friend, the type and the mode are one part each, and the text of the line is the same", () => {
    setViewportWidth(360);
    show();
    const parts = Array.from(document.querySelectorAll<HTMLElement>("[data-meta-part]"));
    expect(parts.map((p) => plain(p.textContent))).toEqual(["Ben ·", "Steckling ·", "Tauschen"]);
    for (const part of parts)
      expect(part.className.split(" ")).toEqual(
        expect.arrayContaining(["inline-block", "max-w-full", "align-top"]),
      );
    expect(plain(parts[0]?.parentElement?.textContent)).toBe("Ben · Steckling · Tauschen");
  });

  it("US-QS-15 a line of the card with no ' · ' stays one plain text", () => {
    setViewportWidth(360);
    show({ counterName: "Mein Haworthia" });
    expect(
      screen.getByText("Gegenangebot: Mein Haworthia").querySelector("[data-meta-part]"),
    ).toBeNull();
  });
});
