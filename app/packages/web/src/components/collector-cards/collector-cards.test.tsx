// @vitest-environment jsdom
import type { CollectorCard } from "@pflanzendex/core";
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CollectorCards } from "./collector-cards";

/** Renders in a router, because layers and pages live in the address (US-QS-22); `url` opens a layer. */
const view = (ui: ReactElement, url = "/") =>
  render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

const card = (extra: Partial<CollectorCard>): CollectorCard => ({
  number: 1,
  species: "Ficus benjamina",
  state: "missing",
  order: null,
  germanName: null,
  germanNameFull: null,
  summary: null,
  summaryLanguage: null,
  genus: "Ficus",
  genusSpeciesCount: null,
  natureRarity: { iucn: null, occurrences: null, threatened: false },
  appRarity: null,
  speciesPoor: false,
  difficulty: null,
  lightZone: null,
  imageUrl: null,
  sourceUrl: null,
  family: null,
  caughtDate: null,
  specimenCount: 0,
  ...extra,
});
const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-POK-01 collector cards section", () => {
  it("US-POK-01 shows caught and missing cards with the catch chip, loaded with the time zone", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      response(200, {
        cards: [
          card({
            state: "caught",
            caughtDate: { date: "2026-03-05", source: "caught_at" },
            specimenCount: 1,
          }),
          card({ number: 2, species: "Ficus lyrata" }),
          card({
            number: 3,
            species: "Aloe vera",
            state: "caught",
            caughtDate: { date: null, source: "unknown" },
          }),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchFn);
    view(<CollectorCards api="http://api" token={token} />);
    const list = await screen.findByRole("list", { name: "Sammlerkarten" });
    // US-QS-22: two cards per page, the rest on the next page.
    const items = [...list.querySelectorAll<HTMLElement>("li[data-state]")];
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("gefangen 05.03.2026")).toBeTruthy();
    expect(within(items[1] as HTMLElement).getByText("noch nicht gefangen")).toBeTruthy();
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByText("Datum unbekannt")).toBeTruthy();
    expect(String(fetchFn.mock.calls[0]?.[0])).toMatch(/^http:\/\/api\/pokedex\/cards\?timeZone=/);
  });

  it("US-POK-01 without a tree it says what happens next instead of staying blank (P-09)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => response(200, { cards: [] })),
    );
    view(<CollectorCards api="http://api" token={token} />);
    expect(await screen.findByText(/Noch keine Sammlerkarten/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Sammlerkarten" })).toBeNull();
  });

  it("US-POK-01 a failing load shows the error with a retry (P-10)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
      ),
    );
    view(<CollectorCards api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
