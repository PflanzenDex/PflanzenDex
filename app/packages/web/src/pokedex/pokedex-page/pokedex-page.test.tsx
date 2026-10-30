// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceTimeZone, setProfileTimeZone } from "../../kernel";
import { PokedexPage } from "./pokedex-page";

/** Renders in a router, because layers and pages live in the address (US-QS-22); `url` opens a layer. */
const view = (ui: ReactElement, url = "/") =>
  render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;

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
  text: "„Amaryllis“ (Hippeastrum) hat noch keine bestimmte Art, die Pflanze zählt noch nicht.",
  nextAction: "Bestimme die Art, dann zählt sie.",
};
const unidentified = [riddle];

function fakeServer(answer: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/pokedex/cards") return response(200, { cards: [] });
    return path === "/pokedex/ownership" ? answer() : response(404, {});
  });
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
  it("US-POK-06 · US-QS-22 shows every caught species as a compact entry with its catch date", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    expect(await screen.findByRole("heading", { level: 1, name: "Pokédex" })).toBeTruthy();
    const entries = within(screen.getByRole("list", { name: "Gefangene Arten" })).getAllByRole(
      "listitem",
    );
    expect(entries).toHaveLength(2);
    expect(within(entries[0] as HTMLElement).getByText("Citrus limon")).toBeTruthy();
    expect(within(entries[1] as HTMLElement).getByText("Opuntia microdasys")).toBeTruthy();
    expect(screen.queryByText(/Noch nicht gezählt/)).toBeNull();
  });

  it("US-POK-06 · US-QS-22 genus, chip and number of specimens are in the details layer of the species", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=species-Opuntia microdasys");
    const layer = await screen.findByRole("dialog", { name: "Opuntia microdasys" });
    expect(within(layer).getByText("Gattung: Opuntia")).toBeTruthy();
    expect(within(layer).getByText("'Albispina'")).toBeTruthy();
    expect(within(layer).getByText("2 Pflanzen")).toBeTruthy();
  });

  it("US-POK-06 · US-QS-22 the progress row names the rank and the caught species in one row", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    const row = await screen.findByRole("button", { name: /· 2 gefangen/ });
    // Without the tree the total is unknown and one line says so (P-08).
    expect(row.textContent).toContain("Die Gesamtzahl folgt");
    expect(row.textContent).not.toMatch(/\d+ von \d+ Arten/);
  });

  it("US-POK-06 one caught species reads '1 gefangen' in the progress row", async () => {
    fakeServer(() => response(200, { ownership: { caught: [lemon], unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByRole("button", { name: /· 1 gefangen/ })).toBeTruthy();
  });

  it("US-POK-06 an unidentified specimen is named with the action that fixes it (P-09, P-10)", async () => {
    fakeServer(() => response(200, { ownership: { caught: [lemon], unidentified } }));
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=uncounted");
    expect(await screen.findByText(riddle.text)).toBeTruthy();
    expect(screen.getByText("Bestimme die Art, dann zählt sie.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Noch nicht gezählt" })).toBeTruthy();
  });

  it("US-POK-06 · P-10 the progress row says how many specimens do not count yet and the layer leads to them", async () => {
    fakeServer(() => response(200, { ownership: { caught: [lemon], unidentified } }));
    view(<PokedexPage api="http://api" token={token} />);
    const row = await screen.findByRole("button", { name: /· 1 gefangen/ });
    expect(row.textContent).toContain("1 Pflanze zählt noch nicht");
    await userEvent.click(row);
    await userEvent.click(await screen.findByRole("button", { name: "Noch nicht gezählt (1)" }));
    expect(await screen.findByText(riddle.text)).toBeTruthy();
  });

  it("US-POK-06 without caught species it says what to do next (P-09)", async () => {
    fakeServer(() => response(200, { ownership: { caught: [], unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    await screen.findByText(/Noch keine Art gefangen/);
    expect(screen.getByText(/Lege eine Pflanze/).textContent).toContain("Pflanze");
    // DS-26, DS-48: the empty state carries the next step as a control, not only as text.
    expect(screen.getByRole("link", { name: "Pflanze anlegen" }).getAttribute("href")).toBe(
      "/collection",
    );
    expect(screen.queryByRole("list", { name: "Gefangene Arten" })).toBeNull();
    expect(screen.getByRole("button", { name: /· 0 gefangen/ })).toBeTruthy();
  });

  it("US-POK-06 without sign-in the request to sign in comes and nothing is queried", async () => {
    const fetchFn = fakeServer(() =>
      response(200, { ownership: { caught: [], unidentified: [] } }),
    );
    view(<PokedexPage api="http://api" token={async () => undefined} />);
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
    view(<PokedexPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Citrus limon")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("US-POK-07 catch date on the card", () => {
  it("US-POK-07 an exact date reads 'gefangen TT.MM.JJJJ', a creation date reads '≈ TT.MM.JJJJ'", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("gefangen 05.03.2026")).toBeTruthy();
    expect(screen.getByText("gefangen ≈ 01.09.2026")).toBeTruthy();
  });

  it("US-POK-07 a back-dated catch date (FR-BES-04) reads 'gefangen 03.02.2022', not '≈'", async () => {
    const backDated = { ...lemon, caughtDate: { date: "2022-02-03", source: "caught_at" } };
    fakeServer(() => response(200, { ownership: { caught: [backDated], unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("gefangen 03.02.2022")).toBeTruthy();
    expect(screen.queryByText(/≈/)).toBeNull();
  });

  it("US-POK-07 without a date the card says 'Datum unbekannt', never a made-up date (P-08)", async () => {
    const unknown = { ...lemon, caughtDate: { date: null, source: "unknown" } };
    fakeServer(() => response(200, { ownership: { caught: [unknown], unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("Datum unbekannt")).toBeTruthy();
    expect(screen.queryByText(/gefangen \d/)).toBeNull();
  });

  it("US-POK-07 the request carries the time zone of the profile (NFR-08, US-ACC-02)", async () => {
    setProfileTimeZone("Asia/Tokyo");
    const fetchFn = fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    await screen.findByText("Citrus limon");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      "http://api/pokedex/ownership?timeZone=Asia%2FTokyo",
    );
  });

  it("US-POK-07 without a profile time zone the request falls back to the device zone", async () => {
    setProfileTimeZone("Asia/Tokyo");
    setProfileTimeZone(null);
    const fetchFn = fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    await screen.findByText("Citrus limon");
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(
      `http://api/pokedex/ownership?timeZone=${encodeURIComponent(deviceTimeZone())}`,
    );
  });
});

describe("US-POK-12 newly caught species on the page", () => {
  it("US-POK-12 announces the species caught since the last visit above the rank", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/pokedex/ownership")
        return response(200, { ownership: { caught, unidentified: [] } });
      return path === "/pokedex/seen"
        ? response(200, { seen: ["Citrus limon"] })
        : response(404, {});
    });
    vi.stubGlobal("fetch", fetchFn);
    view(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByText("Neu gefangen: Opuntia microdasys")).toBeTruthy();
  });

  it("US-POK-12 a failing seen state does not break the page and shows no banner", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Pokédex" })).toBeTruthy();
    expect(screen.queryByText(/Neu gefangen/)).toBeNull();
  });
});

describe("US-QS-22 the species fit one screen", () => {
  const five = ["Aloe vera", "Citrus limon", "Ficus elastica", "Ficus lyrata", "Opuntia ficus"].map(
    (species) => ({ ...lemon, species, genus: species.split(" ")[0] }),
  );

  it("US-QS-22 the caught species are compact entries in pages", async () => {
    fakeServer(() => response(200, { ownership: { caught: five, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    const list = await screen.findByRole("list", { name: "Gefangene Arten" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByText("Opuntia ficus")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Gefangene Arten" })).getAllByRole("listitem"),
    ).toHaveLength(1);
  });

  it("US-QS-22 the progress layer holds the rank, the orders and the way to the collector cards", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=progress");
    const layer = await screen.findByRole("dialog", { name: "Fortschritt" });
    expect(within(layer).getByText("Ordnungen: unbekannt")).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Sammlerkarten ansehen" })).toBeTruthy();
  });

  it("US-QS-22 the collector cards load only while their layer is open", async () => {
    const fetchFn = fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    await screen.findByRole("list", { name: "Gefangene Arten" });
    expect(fetchFn.mock.calls.some(([url]) => String(url).includes("/pokedex/cards"))).toBe(false);
    cleanup();
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=cards");
    await screen.findByRole("dialog", { name: "Sammlerkarten" });
    await vi.waitFor(() =>
      expect(fetchFn.mock.calls.some(([url]) => String(url).includes("/pokedex/cards"))).toBe(true),
    );
  });

  it("US-QS-22 without the tree no filter 'Fehlend' is shown as a chip and the progress names the missing total (P-08)", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    await screen.findByRole("list", { name: "Gefangene Arten" });
    expect(screen.queryByRole("button", { name: "Fehlend" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Artenarm" })).toBeNull();
    expect(screen.getByRole("button", { name: /Die Gesamtzahl folgt/ })).toBeTruthy();
  });
});
