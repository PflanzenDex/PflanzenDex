// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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
