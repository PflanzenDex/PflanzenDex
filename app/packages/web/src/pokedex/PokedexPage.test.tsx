// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceTimeZone, setProfileTimeZone } from "../kernel";
import { PokedexPage } from "./PokedexPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const serverError = { error: { code: "server.error", text: "Der Server antwortet nicht." } };
const exact = { date: "2026-03-05", source: "caught_at" };
const lemon = {
  species: "Citrus limon",
  genus: "Citrus",
  chips: [],
  specimenCount: 1,
  caughtDate: exact,
};
const caught = [
  lemon,
  {
    species: "Opuntia microdasys",
    genus: "Opuntia",
    chips: ["'Albispina'"],
    specimenCount: 2,
    caughtDate: { date: "2026-09-01", source: "created_at" },
  },
];
const riddle = {
  specimenId: "e1",
  specimenName: "Amaryllis",
  latinName: "Hippeastrum",
  text: "„Amaryllis“ (Hippeastrum) hat noch keine bestimmte Art, das Exemplar zählt noch nicht.",
  nextAction: "Bestimme die Art, dann zählt es.",
};
const unidentified = [riddle];

function fakeServer(answer: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    new URL(String(url)).pathname === "/pokedex/ownership" ? answer() : response(404, {}),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const token = async () => "tok";

afterEach(() => {
  setProfileTimeZone(null);
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-POK-06 page of the caught species", () => {
  it("US-POK-06 shows every caught species with genus, chip and number of specimens", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    expect(await screen.findByRole("heading", { level: 1, name: "Pokédex" })).toBeTruthy();
    expect(screen.getByText("2 Arten gefangen")).toBeTruthy();
    const cards = within(screen.getByRole("list", { name: "Gefangene Arten" }))
      .getAllByRole("listitem")
      .filter((li) => li.classList.contains("caught-card"));
    expect(cards).toHaveLength(2);
    const [lemonCard, opuntia] = cards as [HTMLElement, HTMLElement];
    expect(within(lemonCard).getByText("Citrus limon")).toBeTruthy();
    expect(within(lemonCard).getByText("1 Exemplar")).toBeTruthy();
    expect(within(opuntia).getByText("'Albispina'")).toBeTruthy();
    expect(within(opuntia).getByText("2 Exemplare")).toBeTruthy();
    expect(screen.queryByText(/Noch nicht gezählt/)).toBeNull();
  });

  it("US-POK-06 one caught species is written in the singular", async () => {
    fakeServer(() => response(200, { ownership: { caught: [lemon], unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("1 Art gefangen")).toBeTruthy();
  });

  it("US-POK-06 an unidentified specimen is named with the action that fixes it (P-09, P-10)", async () => {
    fakeServer(() => response(200, { ownership: { caught: [lemon], unidentified } }));
    render(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText(riddle.text)).toBeTruthy();
    expect(screen.getByText("Bestimme die Art, dann zählt es.")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Noch nicht gezählt" })).toBeTruthy();
  });

  it("US-POK-06 without caught species it says what to do next (P-09)", async () => {
    fakeServer(() => response(200, { ownership: { caught: [], unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    expect((await screen.findByText(/Noch keine Art gefangen/)).textContent).toContain("Exemplar");
    expect(screen.queryByRole("list", { name: "Gefangene Arten" })).toBeNull();
  });

  it("US-POK-06 without sign-in the request to sign in comes and nothing is queried", async () => {
    const fetchFn = fakeServer(() =>
      response(200, { ownership: { caught: [], unidentified: [] } }),
    );
    render(<PokedexPage api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("US-POK-06 if loading fails the error stays visible and reload fetches again (P-10)", async () => {
    let attempt = 0;
    fakeServer(() =>
      ++attempt === 1
        ? response(500, serverError)
        : response(200, { ownership: { caught, unidentified: [] } }),
    );
    render(<PokedexPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(await screen.findByText("Citrus limon")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("US-POK-07 catch date on the card", () => {
  it("US-POK-07 an exact date reads 'gefangen TT.MM.JJJJ', a creation date reads '≈ TT.MM.JJJJ'", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("gefangen 05.03.2026")).toBeTruthy();
    expect(screen.getByText("gefangen ≈ 01.09.2026")).toBeTruthy();
  });

  it("US-POK-07 without a date the card says 'Datum unbekannt', never a made-up date (P-08)", async () => {
    const unknown = { ...lemon, caughtDate: { date: null, source: "unknown" } };
    fakeServer(() => response(200, { ownership: { caught: [unknown], unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("Datum unbekannt")).toBeTruthy();
    expect(screen.queryByText(/gefangen \d/)).toBeNull();
  });

  it("US-POK-07 the request carries the time zone of the profile (NFR-08, US-ACC-02)", async () => {
    setProfileTimeZone("Asia/Tokyo");
    const fetchFn = fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    await screen.findByText("Citrus limon");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "http://api/pokedex/ownership?timeZone=Asia%2FTokyo",
    );
  });

  it("US-POK-07 without a profile time zone the request falls back to the device zone", async () => {
    setProfileTimeZone("Asia/Tokyo");
    setProfileTimeZone(null);
    const fetchFn = fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    render(<PokedexPage api="http://api" token={token} />);
    await screen.findByText("Citrus limon");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      `http://api/pokedex/ownership?timeZone=${encodeURIComponent(deviceTimeZone())}`,
    );
  });
});
