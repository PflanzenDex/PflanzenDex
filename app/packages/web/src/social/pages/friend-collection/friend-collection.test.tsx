// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { collectionTitle, FriendCollectionPage } from "./friend-collection";

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

function show(body: unknown, status = 200, devices: unknown = NO_DEVICES) {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    String(url).includes("/equipment/friends/") ? response(200, devices) : response(status, body),
  );
  vi.stubGlobal("fetch", fetchFn);
  render(
    <MemoryRouter>
      <FriendCollectionPage api="http://api" token={token} friendId="f1" />
    </MemoryRouter>,
  );
  return fetchFn;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

  it("US-SOZ-07 · US-QS-20 the heading names the friend in the genitive, the cards are paged", async () => {
    const many = Array.from({ length: 8 }, (_, n) => card({ speciesLatin: `Art ${n}` }));
    show({ friend: { name: "Clara" }, cards: many });
    expect(await screen.findByRole("heading", { level: 1, name: "Claras Sammlung" })).toBeTruthy();
    const list = await screen.findByRole("list", { name: "Sammlung von Clara" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(6);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    expect(collectionTitle("Lars")).toBe("Lars' Sammlung");
    expect(collectionTitle(null)).toBe("Sammlung eines Freundes");
  });

  it("US-SOZ-07 the filters 'Ich habe nicht' and 'Wir haben beide' narrow the cards", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Anna" });
    await userEvent.click(screen.getByRole("button", { name: "Ich habe nicht" }));
    const lack = within(screen.getByRole("list", { name: "Sammlung von Anna" })).getAllByRole(
      "listitem",
    );
    expect(lack).toHaveLength(1);
    expect(lack[0]?.textContent).toContain("Aloe vera");
    await userEvent.click(screen.getByRole("button", { name: "Wir haben beide" }));
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
    await userEvent.click(screen.getByRole("button", { name: "Ich habe nicht" }));
    expect(screen.getByText(/Du hast schon alle Arten/)).toBeTruthy();
    expect(screen.getByText(/Wähle „Alle“/)).toBeTruthy();
    cleanup();
    show({ friend: { name: "Anna" }, cards: [] });
    expect(await screen.findByText(/Anna hat noch nichts freigegeben/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: /Sammlung von/ })).toBeNull();
  });

  it("US-SOZ-07 facts only: no rank, no score, no comparison between friends; the way back is offered", async () => {
    show({ friend: { name: null }, cards: CARDS });
    await screen.findByRole("list", { name: "Sammlung von Name unbekannt" });
    expect(screen.getByText(/keine Wertung und keinen Vergleich/)).toBeTruthy();
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
    const fetchFn = show({ friend: { name: "Anna" }, cards: CARDS }, 200, {
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
    });
    const list = await screen.findByRole("list", { name: "Geräte von Anna" });
    expect(fetchFn.mock.calls.some(([u]) => String(u) === "http://api/equipment/friends/f1")).toBe(
      true,
    );
    const [lamp, timer] = within(list).getAllByRole("listitem");
    expect(lamp?.textContent).toContain("Lampe Alpha");
    expect(lamp?.textContent).toContain("GL-9");
    expect(lamp?.textContent).toMatch(/bis 15\.000 lx/);
    expect(lamp?.textContent).toContain("sehr hell");
    expect(lamp?.textContent).not.toMatch(/Preis|Kaufdatum|Seriennummer/);
    expect(timer?.textContent).toContain("Modell");
    expect(timer?.textContent).toContain("unbekannt");
  });

  it("US-EQU-12 a friend who shares no device says what to do next (P-09)", async () => {
    show({ friend: { name: "Anna" }, cards: CARDS });
    expect(await screen.findByText(/Anna hat noch kein Gerät freigegeben/)).toBeTruthy();
  });
});
