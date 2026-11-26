// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { drainOutbox } from "@/shared/testing/test-setup/drain-outbox";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { filledIn, hasOwnBorder, isPlain, isTinted } from "@/shared/ui/button.roles";
import type { SharedSpecimen } from "@pflanzendex/core";
import { createQueryClient } from "../../../shared/data";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { collectionTitle, FriendCollectionPage } from "./friend-collection";
import table from "../../social.de.json";

/**
 * The word of each whitelisted field the friend's collection cards show (QG-D2, P-05). A new field in `SharedSpecimen`
 * fails the type check here until it is decided: the repot day stays out, the cards do not show it (it reaches friends as
 * the feed event "Eingetopft", US-SOZ-05).
 */
const COLLECTION_WORDS: Record<
  Exclude<keyof SharedSpecimen, "id" | "photoShared" | "repottedAt">,
  string
> = {
  speciesLatin: "Art",
  speciesGerman: "Art",
  name: "Name",
  caughtAt: "Fangdatum",
  isCutting: "Stecklinge",
};

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const card = (extra: Record<string, unknown> = {}) => ({
  speciesLatin: "Haworthia fasciata",
  speciesGerman: "Zebra-Haworthie",
  specimens: 2,
  cuttings: 1,
  firstCaught: "2026-05-01",
  iHave: true,
  ...extra,
});
const CARDS = [
  card(),
  card({
    speciesLatin: "Aloe vera",
    speciesGerman: null,
    specimens: 1,
    cuttings: 0,
    firstCaught: null,
    iHave: false,
  }),
  card({ speciesLatin: null, speciesGerman: null, specimens: 1, cuttings: 0, iHave: null }),
];

const NO_DEVICES = { friend: { name: "Anna" }, devices: [] };

function show(body: unknown, status = 200, devices: unknown = NO_DEVICES, path = "/") {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("/equipment/friends/") ? response(200, devices) : response(status, body),
  );
  vi.stubGlobal("fetch", fetchFn);
  render(
    <MemoryRouter initialEntries={[path]}>
      <FriendCollectionPage api="http://api" token={token} friendId="f1" />
    </MemoryRouter>,
  );
  return fetchFn;
}

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
  // The offline ending leaves its write in the buffer; signed out, the buffer drops it and sends nothing (US-QS-10).
  await drainOutbox();
});

describe("US-QS-32 F-0265 the line names only whitelisted fields, each by its word (QG-D2, P-05)", () => {
  it("US-QS-32 F-0265 every word of the line is one of the fields the friend shares, and no field outside the whitelist", () => {
    const line = table["collection.shares"];
    for (const word of Object.values(COLLECTION_WORDS)) expect(line).toContain(word);
    expect(line).not.toMatch(/Anzahl|Standort|Messwert|Behandlung|Preis|Wertung|Vergleich/);
  });
});

describe("US-SOZ-07 a friend's shared collection", () => {
  it("US-SOZ-07 shows a card per species with count, date and 'you have it', unknown stays unknown (P-08)", async () => {
    const fetchFn = show({ friend: { name: "Anna" }, cards: CARDS });
    const list = await screen.findByRole("list", { name: "Sammlung von Anna" });
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe("http://api/friends/f1/collection");
    const [zebra, aloe, unknown] = within(list).getAllByRole("listitem");
    expect(zebra?.textContent).toContain("Haworthia fasciata");
    expect(zebra?.textContent).toContain("Zebra-Haworthie");
    expect(zebra?.textContent).toContain("2 Pflanzen, davon 1 Steckling");
    expect(zebra?.textContent).toContain("Gefangen seit 01.05.2026");
    expect(zebra?.textContent).toContain("Du hast sie");
    expect(aloe?.textContent).toContain("Fangdatum unbekannt");
    expect(aloe?.textContent).toContain("Du hast sie nicht");
    expect(unknown?.textContent).toContain("Art unbekannt");
    expect(unknown?.textContent).toContain("Vergleich unbekannt");
  });

  it("US-QS-32 · SG-COLOR-04 both ownership badges are neutral states, not amber or primary; the unknown one is outlined", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    const have = screen.getByText("Du hast sie", { exact: true }).className;
    const lack = screen.getByText("Du hast sie nicht", { exact: true }).className;
    for (const look of [have, lack]) {
      expect(look).toContain("bg-secondary");
      expect(look).not.toContain("bg-warning");
      expect(look).not.toContain("bg-primary");
    }
    expect(screen.getByText("Vergleich unbekannt").className).toContain("bg-card");
  });

  it("US-SOZ-07 · US-QS-20 the heading names the friend in the genitive, the cards are one scrolling list", async () => {
    // The list of a page scrolls at every width (US-QS-15, SG-LIST-01): every card, no pages, also from 1024 px.
    setViewportWidth(1024);
    const many = Array.from({ length: 20 }, (_, n) => card({ speciesLatin: `Art ${n}` }));
    show({ friend: { name: "Clara" }, cards: many });
    expect(await screen.findByRole("heading", { level: 1, name: "Claras Sammlung" })).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Sammlung von Clara" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(20);
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(collectionTitle("Lars")).toBe("Lars' Sammlung");
    expect(collectionTitle(null)).toBe("Sammlung eines Freundes");
  });

  it("US-SOZ-07 · US-QS-32 the filters 'Fehlen dir' and 'Hast du auch' narrow the cards", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Fehlen dir" }));
    const lack = within(screen.getByRole("list", { name: "Sammlung von Anna" })).getAllByRole(
      "listitem",
    );
    expect(lack).toHaveLength(1);
    expect(lack[0]?.textContent).toContain("Aloe vera");
    await userEvent.click(screen.getByRole("button", { name: "Hast du auch" }));
    const both = within(screen.getByRole("list", { name: "Sammlung von Anna" })).getAllByRole(
      "listitem",
    );
    expect(both).toHaveLength(1);
    expect(both[0]?.textContent).toContain("Haworthia fasciata");
    await userEvent.click(screen.getByRole("button", { name: "Alle" }));
    expect(
      within(screen.getByRole("list", { name: "Sammlung von Anna" })).getAllByRole("listitem"),
    ).toHaveLength(3);
  });

  it("US-SOZ-07 a filter without result and a friend who shares nothing say what to do next (P-09)", async () => {
    show({ friend: { name: "Anna" }, cards: [card()] });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Fehlen dir" }));
    expect(screen.getByText(/Du hast schon alle Arten/)).toBeTruthy();
    expect(screen.getByText(/Wähle „Alle“/)).toBeTruthy();
    cleanup();
    show({ friend: { name: "Anna" }, cards: [] });
    expect(await screen.findByText(/Anna teilt noch nichts\./)).toBeTruthy();
    // The one step: the sharing layer of the friends page (US-QS-32, SG-STATE-01).
    expect(screen.getByRole("link", { name: "Selbst etwas teilen" }).getAttribute("href")).toBe(
      "/friends?sheet=sharing",
    );
    expect(screen.queryByRole("list", { name: /Sammlung von/ })).toBeNull();
    // A friend who shares nothing gets no line about what is shared (US-QS-32, F-0265). The line starts with "Geteilt:".
    expect(document.body.textContent).not.toContain("Geteilt:");
  });

  it("US-QS-32 F-0265 the line names only the shared fields; the title already names the friend", async () => {
    show({ friend: { name: "Anna" }, cards: [card()] });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    expect(screen.getByText("Geteilt: Art, Name, Fangdatum und Stecklinge.")).toBeTruthy();
    expect(screen.queryByText(/Anna teilt/)).toBeNull();
    expect(document.body.textContent).not.toContain("ohne Wertung");
  });

  it("US-QS-32 F-0265 a long display name stays out of the line, so the line does not wrap at 360 px", async () => {
    const name = "Maximiliane-Friederike von Hohenzollern";
    show({ friend: { name }, cards: [card()] });
    await screen.findByRole("list", { name: `Sammlung von ${name}` });
    const line = screen.getByText("Geteilt: Art, Name, Fangdatum und Stecklinge.");
    expect(line.textContent).not.toContain(name);
    expect(line.textContent).not.toContain("Maximiliane");
    // The name is in the title once, the line names only the shared fields.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(collectionTitle(name));
  });

  it("US-SOZ-07 facts only: no rank, no score, no comparison between friends; the way back is offered", async () => {
    show({ friend: { name: null }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Name unbekannt" });
    // One line naming only what the friend shares (US-QS-32, F-0265); no rank, no comparison.
    expect(screen.getByText("Geteilt: Art, Name, Fangdatum und Stecklinge.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zurück zu Freunde" }).getAttribute("href")).toBe(
      "/friends",
    );
    expect(document.body.textContent).not.toMatch(/Platz|Rang|Punkte/);
  });

  it("US-SOZ-07 a friend that is none answers with the error text and a retry, not an empty page (P-10)", async () => {
    show({ error: { code: "friend.not_found", text: "x" } }, 404);
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("US-SOZ-07 a species I lack can go to the wishlist; a duplicate says so (P-09, P-10)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async (_u, init) =>
      init?.method === "POST"
        ? JSON.parse(String(init.body)).name === "Aloe vera"
          ? response(201, { wish: {} })
          : response(409, { error: { code: "wish.name_taken", text: "x" } })
        : String(_u).includes("/equipment/friends/")
          ? response(200, NO_DEVICES)
          : response(200, { friend: { name: "Anna" }, cards: CARDS }),
    );
    vi.stubGlobal("fetch", fetchFn);
    render(
      <MemoryRouter>
        <FriendCollectionPage api="http://api" token={token} friendId="f1" />
      </MemoryRouter>,
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Aloe vera auf die Wunschliste setzen" }),
    );
    expect(await screen.findByText("Aloe vera steht jetzt auf deiner Wunschliste.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Haworthia fasciata auf die Wunschliste/ }),
    ).toBeNull();
    const post = fetchFn.mock.calls.find(([, i]) => i?.method === "POST");
    expect(String(post?.[0])).toBe("http://api/wishes");
  });

  it("US-EQU-12 shows the devices a friend shares with type, model, light level and the note, and nothing else", async () => {
    const fetchFn = show(
      { friend: { name: "Anna" }, cards: CARDS },
      200,
      {
        friend: { name: "Anna" },
        devices: [
          {
            id: "d1",
            type: "Lamp",
            name: "Lampe Alpha",
            model: "GL-9",
            luxCeiling: 15000,
            note: "sehr hell",
          },
          {
            id: "d2",
            type: "Timer",
            name: "Zeitschaltuhr",
            model: null,
            luxCeiling: null,
            note: null,
          },
        ],
      },
      "/?sheet=equipment",
    );
    const list = await screen.findByRole("list", { name: "Geräte von Anna" });
    expect(fetchFn.mock.calls.some(([u]) => String(u) === "http://api/equipment/friends/f1")).toBe(
      true,
    );
    const [lamp, timer] = within(list).getAllByRole("listitem");
    expect(lamp?.textContent).toContain("Lampe Alpha");
    expect(lamp?.textContent).toContain("GL-9");
    expect(lamp?.textContent).toMatch(/bis 15\.000\u00a0lx/);
    expect(lamp?.textContent).toContain("sehr hell");
    expect(lamp?.textContent).not.toMatch(/Preis|Kaufdatum|Seriennummer/);
    expect(timer?.textContent).toContain("Modell");
    expect(timer?.textContent).toContain("unbekannt");
  });

  it("US-QS-32 the light level of a friend's lamp keeps number and unit together, and its facts stack in a narrow box (F-0367)", async () => {
    show(
      { friend: { name: "Anna" }, cards: CARDS },
      200,
      {
        friend: { name: "Anna" },
        devices: [
          {
            id: "d1",
            type: "Lamp",
            name: "Lampe Alpha",
            model: "GL-9",
            luxCeiling: 5000,
            note: null,
          },
        ],
      },
      "/?sheet=equipment",
    );
    const list = await screen.findByRole("list", { name: "Geräte von Anna" });
    const [lamp] = within(list).getAllByRole("listitem");
    expect(lamp?.textContent).toContain("bis 5.000\u00a0lx");
    const facts = lamp?.querySelector("dl");
    expect(facts?.className.split(" ")).toContain("grid-cols-1");
    expect(facts?.className).toContain("@min-[12rem]:grid-cols-[auto_minmax(0,1fr)]");
    expect(lamp?.firstElementChild?.className.split(" ")).toContain("@container");
  });

  it("US-EQU-12 a friend who shares no device says what to do next (P-09)", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS }, 200, NO_DEVICES, "/?sheet=equipment");
    expect(await screen.findByText(/Anna teilt keine Geräte\./)).toBeTruthy();
  });

  it("US-QS-32 the devices of a friend name the layer once: its title is the only heading 'Geräte von …' (issue 1981)", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS }, 200, NO_DEVICES, "/?sheet=equipment");
    await screen.findByText(/Anna teilt keine Geräte\./);
    expect(screen.getAllByRole("heading", { name: "Geräte von Anna" })).toHaveLength(1);
  });

  it("US-QS-20 the devices open from 'Geräte', not stacked below the cards", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    expect(screen.queryByText(/Anna teilt keine Geräte\./)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Geräte" }));
    expect(await screen.findByText(/Anna teilt keine Geräte\./)).toBeTruthy();
  });
});

describe("US-QS-14 · US-QS-15 a friend's collection is a sub-page with one page header", () => {
  it("US-QS-14 has exactly one h1 while the collection loads, and its back control is the page header's", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Sammlung eines Freundes",
    ]);
    expect(screen.getByRole("link", { name: "Zurück zu Freunde" }).getAttribute("href")).toBe(
      "/friends",
    );
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Annas Sammlung",
    ]);
  });

  it("US-QS-15 the header with its back control stays while the friend's collection fails (P-10)", async () => {
    show({ error: { code: "friend.not_found", text: "x" } }, 404);
    await screen.findByRole("alert");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Zurück zu Freunde" })).toBeTruthy();
  });

  it("US-QS-15 the frame is one screen, so at a large text size only the content region scrolls (DS-61)", () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    expect(document.querySelector("[data-fit-screen]")).not.toBeNull();
  });
});

describe("US-QS-32 ending a friendship is in the menu of the friend's collection (US-SOZ-03)", () => {
  beforeAll(() => {
    Element.prototype.setPointerCapture ??= () => undefined;
    Element.prototype.releasePointerCapture ??= () => undefined;
  });
  // A test that stubs the network state must not leak it into the next test, even when it fails.
  afterEach(() => vi.restoreAllMocks());

  /** A fake server: the collection and the devices read, and the end of the friendship answers `endStatus`. */
  function endServer(endStatus = 200) {
    const calls: { path: string; method: string }[] = [];
    const fetchFn = vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push({ path, method: init?.method ?? "GET" });
      if (init?.method === "POST" && path === "/friends/f1/end")
        return endStatus === 200
          ? response(200, { status: "ended" })
          : response(endStatus, { error: { code: "friend.not_found", text: "raw" } });
      if (path.includes("/equipment/friends/")) return response(200, NO_DEVICES);
      return response(200, { friend: { name: "Anna" }, cards: CARDS });
    });
    vi.stubGlobal("fetch", fetchFn);
    return { calls };
  }

  /**
   * Where the keeper ends up: the friends page shows the outcome as the hint of its address (P-10). `data-navigation` says
   * how it was entered: "REPLACE" means the friend's page is not in the history any more.
   */
  function Landing() {
    const location = useLocation();
    const how = useNavigationType();
    return (
      <p data-navigation={how}>
        Freunde-Startseite {(location.state as { hint?: string } | null)?.hint ?? ""}
      </p>
    );
  }

  /** The page at the friend's address with its own query client (the cache is read back) and, optionally, the announcer. */
  function showAt(
    options: { client?: ReturnType<typeof createQueryClient>; announcer?: boolean } = {},
  ) {
    const client = options.client ?? createQueryClient();
    const page = (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/friends/f1"]}>
          <Routes>
            <Route
              path="/friends/:friendId"
              element={<FriendCollectionPage api="http://api" token={token} friendId="f1" />}
            />
            <Route path="/friends" element={<Landing />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    return {
      client,
      ...render(options.announcer ? <AnnouncerProvider>{page}</AnnouncerProvider> : page),
    };
  }

  it("US-QS-32 the top bar's 'Mehr' holds 'Freundschaft beenden' as a red menu action, and the body has no end button", async () => {
    endServer();
    showAt();
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    expect(screen.queryByRole("button", { name: /Freundschaft beenden/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    const item = screen.getByRole("menuitem", { name: "Freundschaft beenden" });
    expect(item.className).toContain("text-destructive");
  });

  it("US-QS-32 the menu opens a question first; 'Abbrechen' ends nothing (US-SOZ-03, P-10)", async () => {
    const { calls } = endServer();
    showAt();
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Freundschaft beenden" }));
    expect(await screen.findByText(/alle Freigaben gelten dann nicht mehr/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText(/alle Freigaben gelten dann nicht mehr/)).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("US-QS-32 'Beenden' ends the friendship and the friends page says so (US-SOZ-03, P-10)", async () => {
    const { calls } = endServer();
    showAt();
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Freundschaft beenden" }));
    await userEvent.click(await screen.findByRole("button", { name: "Beenden" }));
    expect(
      await screen.findByText(/Freunde-Startseite Freundschaft mit Anna beendet/),
    ).toBeTruthy();
    expect(calls.find((c) => c.method === "POST")?.path).toBe("/friends/f1/end");
    // The friend's page is replaced, so Back never returns to it with the question (US-QS-32).
    expect(document.querySelector("[data-navigation]")?.getAttribute("data-navigation")).toBe(
      "REPLACE",
    );
  });

  it("US-QS-32 a refused end keeps the question on screen with its error and does not leave the page (P-10)", async () => {
    endServer(404);
    showAt();
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Freundschaft beenden" }));
    await userEvent.click(await screen.findByRole("button", { name: "Beenden" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/alle Freigaben gelten dann nicht mehr/)).toBeTruthy();
    expect(screen.queryByText(/Freunde-Startseite/)).toBeNull();
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("US-QS-32 Abbrechen returns the focus to the 'Mehr' trigger, not to the menu item that unmounted (WCAG 2.4.3)", async () => {
    endServer();
    showAt();
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    const more = screen.getByRole("button", { name: "Mehr" });
    await userEvent.click(more);
    await userEvent.click(screen.getByRole("menuitem", { name: "Freundschaft beenden" }));
    await userEvent.click(await screen.findByRole("button", { name: "Abbrechen" }));
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it("US-QS-32 a friendship ended offline leaves the page at once; the write waits in the buffer and says so (US-QS-10)", async () => {
    const { calls } = endServer();
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    showAt({ announcer: true });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Freundschaft beenden" }));
    await userEvent.click(await screen.findByRole("button", { name: "Beenden" }));
    // The question is gone with the page: the friends page is shown, and the buffered state is said as text.
    expect(await screen.findByText(/Freunde-Startseite/)).toBeTruthy();
    // The note on screen and the polite announcement say the same text (US-QS-10).
    expect(
      (
        await screen.findAllByText(
          /Du bist offline\. Wird gesendet, sobald du wieder online bist: Freundschaft mit Anna beendet/,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    online.mockRestore();
  });

  it("US-QS-32 a friendship that has ended drops the friend's cached collection and devices, so none of it shows again (P-05)", async () => {
    endServer();
    const { client } = showAt();
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    client.setQueryData(["social", "friend-equipment", "f1"], NO_DEVICES);
    await userEvent.click(screen.getByRole("button", { name: "Mehr" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Freundschaft beenden" }));
    await userEvent.click(await screen.findByRole("button", { name: "Beenden" }));
    expect(
      await screen.findByText(/Freunde-Startseite Freundschaft mit Anna beendet/),
    ).toBeTruthy();
    expect(client.getQueryData(["social", "friend-collection", "f1"])).toBeUndefined();
    expect(client.getQueryData(["social", "friend-equipment", "f1"])).toBeUndefined();
  });
});

describe("US-QS-32 · SG-BTN-01 the buttons of a friend's collection are tinted or plain, none has a border", () => {
  it("US-QS-32 · SG-BTN-02 each card's 'Auf die Wunschliste' is tinted, never filled, and 'Geräte' in the bar is plain", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    const wish = screen.getByRole("button", { name: "Aloe vera auf die Wunschliste setzen" });
    expect(isTinted(wish)).toBe(true);
    expect(hasOwnBorder(wish)).toBe(false);
    const devices = screen.getByRole("button", { name: "Geräte" });
    expect(isPlain(devices)).toBe(true);
    expect(hasOwnBorder(devices)).toBe(false);
    expect(filledIn(document.body)).toHaveLength(0);
  });

  it("US-QS-32 · SG-BTN-03 the question to end a friendship has a red filled 'Beenden' and a plain 'Abbrechen'", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS }, 200, NO_DEVICES, "/?sheet=end-friendship");
    const yes = await screen.findByRole("button", { name: "Beenden" });
    expect(yes.className).toContain("bg-destructive");
    const no = screen.getByRole("button", { name: "Abbrechen" });
    expect(isPlain(no)).toBe(true);
    expect(hasOwnBorder(no)).toBe(false);
  });
});
