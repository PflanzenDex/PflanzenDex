// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deviceTimeZone, setProfileTimeZone } from "../../shared/data";
import { PokedexPage } from "./pokedex-page";
import { expectOneLoadingStatus } from "@/shared/ui/display/skeleton/loading-contract";
import table from "./pokedex-page.de.json";
import { MilestonesSkeleton, ProgressSkeleton } from "./pokedex-page.skeleton";
import { delayLoads } from "@/shared/ui/display/skeleton/loading-contract";

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

/** The taxonomy tree of the server (US-POK-11); by default not built yet, so the progress says so (P-08). */
const notBuilt = () => response(200, { tree: null });

function fakeServer(answer: () => Promise<Response>, tree: () => Promise<Response> = notBuilt) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/pokedex/cards") return response(200, { cards: [] });
    if (path === "/pokedex/tree") return tree();
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
    delayLoads();
    view(<PokedexPage api="http://api" token={token} />);
    expect((await screen.findByRole("status")).textContent).toContain("geladen");
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

  it("US-POK-06 · US-QS-22 the progress row names the rank and the caught species in one line", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    const row = await screen.findByRole("button", { name: /· 2 gefangen/ });
    // Without the tree the total is unknown: one line, no invented total; the layer says why (P-08, US-QS-22).
    expect(row.textContent).toBe("Keimling · 2 gefangen");
    expect(row.textContent).not.toMatch(/\d+ von \d+ Arten/);
    await userEvent.click(row);
    expect(await screen.findByText(/Der Baum der Arten ist noch nicht aufgebaut/)).toBeTruthy();
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

  it("US-POK-06 · P-09 the layer of the uncounted plants opened by address without any says that all of them count (issue 1653, F24)", async () => {
    fakeServer(() => response(200, { ownership: { caught: [lemon], unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=uncounted");
    const layer = await screen.findByRole("dialog", { name: "Noch nicht gezählt" });
    expect(layer.textContent).toContain("Jede deiner Pflanzen zählt schon für den Pokédex.");
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

/** A built tree of five species: 2 of them caught (Citrus limon, Opuntia microdasys), 3 orders, 2 families. */
const tree = [
  {
    latin: "Citrus limon",
    german: "Zitrone",
    family: "Rutaceae",
    genus: "Citrus",
    order: "Sapindales",
  },
  {
    latin: "Citrus aurantium",
    german: "Bitterorange",
    family: "Rutaceae",
    genus: "Citrus",
    order: "Sapindales",
  },
  {
    latin: "Opuntia microdasys",
    german: "Hasenohr-Kaktus",
    family: "Cactaceae",
    genus: "Opuntia",
    order: "Caryophyllales",
  },
  {
    latin: "Opuntia ficus-indica",
    german: "Feigenkaktus",
    family: "Cactaceae",
    genus: "Opuntia",
    order: "Caryophyllales",
  },
  {
    latin: "Aloe vera",
    german: null,
    family: "Xanthorrhoeaceae",
    genus: "Aloe",
    order: "Asparagales",
  },
];
const treeCalls = (fetchFn: { mock: { calls: Parameters<typeof fetch>[] } }) =>
  fetchFn.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/pokedex/tree").length;

describe("US-POK-10 · US-POK-11 the progress with the tree of the server", () => {
  it("US-POK-10 · US-POK-11 the row shows the total, the layer the percent and the orders, the milestones open as their own layer", async () => {
    fakeServer(
      () => response(200, { ownership: { caught, unidentified: [] } }),
      () => response(200, { tree: { species: tree } }),
    );
    view(<PokedexPage api="http://api" token={token} />);
    const row = await screen.findByRole("button", { name: /Keimling · 2 von 5 Arten/ });
    await userEvent.click(row);
    const layer = await screen.findByRole("dialog", { name: "Fortschritt" });
    expect(within(layer).getByText("2 / 5 Arten gefangen (40 %)")).toBeTruthy();
    expect(within(layer).getByText("2 von 3 Ordnungen entdeckt")).toBeTruthy();
    expect(within(layer).getByText("Noch 3 bis „Setzling“")).toBeTruthy();
    expect(within(layer).queryByText(/noch nicht aufgebaut/)).toBeNull();
    expect(within(layer).queryByText(/Ordnungen: unbekannt/)).toBeNull();
    expect(within(layer).queryByText(/weil sie nicht im Baum/)).toBeNull();
    // The progress layer holds only the opener; the milestones are their own layer (DS-58, US-QS-22).
    expect(within(layer).queryByText("Citrus: Vollständig")).toBeNull();
    await userEvent.click(within(layer).getByRole("button", { name: "Meilensteine ansehen" }));
    const milestones = await screen.findByRole("dialog", { name: "Meilensteine" });
    expect(within(milestones).getByText("4 Meilensteine erreicht")).toBeTruthy();
    expect(within(milestones).getByText("Entdecker der Ordnungen")).toBeTruthy();
    expect(within(milestones).getByText("Seite 1 von 2")).toBeTruthy();
    expect(within(milestones).getByText("Cactaceae: Vollständig")).toBeTruthy();
    await userEvent.click(within(milestones).getByRole("button", { name: "Weiter" }));
    expect(await within(milestones).findByText("Citrus: Vollständig")).toBeTruthy();
    expect(within(milestones).getByText("Noch 1: Bitterorange (Citrus aurantium)")).toBeTruthy();
  });

  it("US-POK-10 the rank and N count the caught species of the tree; a caught species outside it is named as not counted yet (owner decision 2026-11-07)", async () => {
    const outside = { ...lemon, species: "Ficus elastica", genus: "Ficus" };
    fakeServer(
      () => response(200, { ownership: { caught: [...caught, outside], unidentified: [] } }),
      () => response(200, { tree: { species: tree } }),
    );
    view(<PokedexPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /Keimling · 2 von 5 Arten/ }));
    const layer = await screen.findByRole("dialog", { name: "Fortschritt" });
    expect(within(layer).getByText("2 / 5 Arten gefangen (40 %)")).toBeTruthy();
    expect(
      within(layer).getByText(
        "1 gefangene Art zählt noch nicht, weil sie nicht im Baum der Arten steht.",
      ),
    ).toBeTruthy();
  });

  it("US-POK-11 without open or reached milestones the progress layer says so instead of an opener (P-09)", async () => {
    fakeServer(
      () => response(200, { ownership: { caught: [], unidentified: [] } }),
      () => response(200, { tree: { species: [] } }),
    );
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=progress");
    const layer = await screen.findByRole("dialog", { name: "Fortschritt" });
    expect(await within(layer).findByText("Keine offenen Meilensteine.")).toBeTruthy();
    expect(within(layer).queryByRole("button", { name: "Meilensteine ansehen" })).toBeNull();
  });

  it("US-POK-11 while the tree is missing the progress layer names the reason and offers no milestones (P-08)", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />, "/?sheet=progress");
    const layer = await screen.findByRole("dialog", { name: "Fortschritt" });
    expect(await within(layer).findByText(/Meilensteine brauchen den Baum der Arten/)).toBeTruthy();
    expect(within(layer).queryByRole("button", { name: "Meilensteine ansehen" })).toBeNull();
  });

  it("US-POK-10 · P-10 if the tree cannot be read the layer says so and offers a retry, the row keeps the caught count", async () => {
    fakeServer(
      () => response(200, { ownership: { caught, unidentified: [] } }),
      () => response(500, serverError),
    );
    view(<PokedexPage api="http://api" token={token} />);
    const row = await screen.findByRole("button", { name: /· 2 gefangen/ });
    await userEvent.click(row);
    const layer = await screen.findByRole("dialog", { name: "Fortschritt" });
    expect((await within(layer).findByRole("alert")).textContent).toContain(
      "Der Server antwortet nicht.",
    );
    expect(within(layer).getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-POK-10 the tree is requested once for the row and the layer together (NFR-12)", async () => {
    const fetchFn = fakeServer(
      () => response(200, { ownership: { caught, unidentified: [] } }),
      () => response(200, { tree: { species: tree } }),
    );
    view(<PokedexPage api="http://api" token={token} />);
    await userEvent.click(await screen.findByRole("button", { name: /Keimling · 2 von 5 Arten/ }));
    expect(await screen.findByText("2 / 5 Arten gefangen (40 %)")).toBeTruthy();
    expect(treeCalls(fetchFn)).toBe(1);
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
    // The rank waits for the tree of the server; until it is there the layer shows its loader (US-POK-10).
    expect(await within(layer).findByText("Ordnungen: unbekannt")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: /· 2 gefangen/ })).toBeTruthy();
  });
});

describe("US-QS-22 neutral species entries", () => {
  it("US-QS-22 a species entry has a neutral border and a chevron, no primary outline (ADR 0017)", async () => {
    fakeServer(() => response(200, { ownership: { caught, unidentified: [] } }));
    view(<PokedexPage api="http://api" token={token} />);
    const entry = (await screen.findAllByRole("button", { name: /^Opuntia microdasys/ }))[0];
    expect(entry?.className).toContain("border-border");
    expect(entry?.className).not.toMatch(/border-primary|text-primary/);
    expect(entry?.querySelector("[data-chevron]")).toBeTruthy();
  });
});

describe("US-QS-14 issue 1697 · the progress show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <ProgressSkeleton label={table["progressLoading"]} />,
      table["progressLoading"],
    ));
});

describe("US-QS-14 issue 1697 · the milestones show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(
      <MilestonesSkeleton label={table["progressLoading"]} />,
      table["progressLoading"],
    ));
});
