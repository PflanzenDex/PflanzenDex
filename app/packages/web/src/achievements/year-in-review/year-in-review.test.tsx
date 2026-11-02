// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../kernel";
import { YearInReviewSection } from "./year-in-review";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const token = async () => "tok";
const thisYear = new Date().getFullYear();
const answer = (over: object = {}) => ({
  calmMode: false,
  year: thisYear,
  hasData: true,
  counts: {
    speciesCaught: 3,
    cuttingsRooted: 2,
    treatmentsCompleted: 1,
    measurements: 14,
    handovers: 1,
    achievementsEarned: 4,
  },
  growth: {
    specimenId: "a",
    name: "Alma",
    from: `${thisYear}-01-10`,
    until: `${thisYear}-09-10`,
    growth: 8,
    ratePerYear: 9.6,
  },
  photos: null,
  ...over,
});

/** The row "Jahresrückblick" with its layer open by address (`?sheet=year`): the year loads only while it is open. */
function show(body: unknown, status = 200) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    expect(new URL(String(url)).pathname).toBe("/achievements/year");
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetchFn);
  render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={["/?sheet=year"]}>
        <YearInReviewSection api="http://api" token={token} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return fetchFn;
}

describe("US-ACH-07 year in review", () => {
  it("US-ACH-07 shows counted facts with their basis and the largest healthy growth, no rating", async () => {
    show(answer());
    expect(await screen.findByText(`Jahresrückblick ${thisYear}`)).toBeTruthy();
    expect(screen.getByText(/Arten gefangen/)).toBeTruthy();
    expect(screen.getByText(/Fangdatum im Jahr/)).toBeTruthy();
    expect(screen.getByText(/Messungen erfasst/)).toBeTruthy();
    expect(screen.getByText(/Größtes gesundes Wachstum: „Alma“, 8 cm/)).toBeTruthy();
    expect(screen.queryByText(/%|besser|Platz|Rang/)).toBeNull();
  });

  it("US-ACH-07 unknown growth says unknown and what is needed (P-08)", async () => {
    show(answer({ growth: null }));
    expect(await screen.findByText(/Größtes gesundes Wachstum: unbekannt/)).toBeTruthy();
    expect(screen.getByText(/mindestens zwei gesunde Messungen/)).toBeTruthy();
  });

  it("US-ACH-07 a year without data says what would fill it (P-09)", async () => {
    show(answer({ hasData: false, growth: null }));
    expect(await screen.findByText(/liegen noch keine Daten vor/)).toBeTruthy();
    expect(screen.queryByText(/Arten gefangen/)).toBeNull();
  });

  it("US-ACH-07 Vorjahr asks for the previous year", async () => {
    const fetchFn = show(answer());
    fireEvent.click(await screen.findByRole("button", { name: "Vorjahr" }));
    await waitFor(() =>
      expect(fetchFn.mock.calls.some(([u]) => String(u).includes(`year=${thisYear - 1}`))).toBe(
        true,
      ),
    );
  });

  it("US-ACH-08 calm mode or a failed read shows nothing", async () => {
    show({ calmMode: true });
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/Arten gefangen/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Vorjahr" })).toBeNull();
    cleanup();
    show({ error: { code: "x" } }, 500);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(screen.queryByText(/Arten gefangen/)).toBeNull();
  });
});
