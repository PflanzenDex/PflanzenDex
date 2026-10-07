// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscoverPage } from "./discover-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const attributes = { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null };
const suggestion = (species: string, extra: Record<string, unknown> = {}) => ({
  species,
  germanName: "Schusterpalme",
  summary: "Eine robuste Zimmerpflanze.",
  family: "Asparagaceae",
  lightZone: 3,
  difficulty: 2,
  imageUrl: "https://upload.example/aspidistra.jpg",
  sourceUrl: "https://de.wikipedia.org/wiki/Aspidistra",
  attributes,
  reasons: [
    "Diese Art hast du noch nicht gefangen.",
    "Neue Familie: Asparagaceae fehlt dir noch im Pokédex.",
  ],
  ...extra,
});
const deckOf = (...suggestions: unknown[]) => ({ deck: 1, suggestions, empty: null });
const nothing = {
  deck: 1,
  suggestions: [],
  empty: {
    reason: "all_decided",
    text: "Keine neuen Vorschläge: Du besitzt alle Arten des Katalogs oder hast dich schon entschieden.",
    nextAction: "Schlage eine neue Art für den Katalog vor.",
  },
};

function fakeServer(answer: (deck: number) => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) => {
    const u = new URL(String(url));
    return u.pathname === "/discover/suggestions"
      ? answer(Number(u.searchParams.get("deck")))
      : response(404, {});
  });
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const token = async () => "tok";
const card = () => screen.findByRole("article");

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ENT-01 suggestions as a card", () => {
  it("US-ENT-01 shows one card with names, text, zone, difficulty, attributes as unbekannt, source and reasons", async () => {
    fakeServer(async () =>
      response(200, deckOf(suggestion("Aspidistra elatior"), suggestion("Ficus lyrata"))),
    );
    render(<DiscoverPage api="http://api" token={token} />);
    const c = within(await card());
    expect(c.getByRole("heading", { name: "Aspidistra elatior" })).toBeTruthy();
    expect(c.getByText("Schusterpalme")).toBeTruthy();
    expect(c.getByText("Eine robuste Zimmerpflanze.")).toBeTruthy();
    expect(c.getByText("Zone 3")).toBeTruthy();
    expect(c.getByLabelText("2 von 3").textContent).toBe("★★☆");
    for (const name of ["Luftfeuchte", "Mindesttemperatur", "Haustiere", "Wuchsgröße"])
      expect(c.getByText(name).nextElementSibling?.textContent).toBe("unbekannt");
    expect(c.getByRole("link", { name: /Wikipedia \(CC BY-SA\)/ }).getAttribute("href")).toBe(
      "https://de.wikipedia.org/wiki/Aspidistra",
    );
    expect(c.getAllByRole("listitem")).toHaveLength(2);
    expect(c.getByRole("img").getAttribute("alt")).toBe("Bild von Aspidistra elatior");
    expect(screen.getByText("Vorschlag 1 von 2")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%|Match/);
  });

  it("US-ENT-01 reads every unknown value as unbekannt, never a number", async () => {
    fakeServer(async () =>
      response(
        200,
        deckOf(
          suggestion("Aloe vera", {
            germanName: null,
            summary: null,
            lightZone: null,
            difficulty: null,
            imageUrl: null,
            sourceUrl: null,
          }),
        ),
      ),
    );
    render(<DiscoverPage api="http://api" token={token} />);
    const c = within(await card());
    expect(c.getByText("Deutscher Name unbekannt")).toBeTruthy();
    expect(c.getByText("Keine Beschreibung vorhanden.")).toBeTruthy();
    expect(c.getByText("Lichtzone").nextElementSibling?.textContent).toBe("unbekannt");
    expect(c.getByText("Schwierigkeit").nextElementSibling?.textContent).toBe("unbekannt");
    expect(c.queryByRole("link")).toBeNull();
  });

  it("US-ENT-01 offers Nein, Später and Ja as buttons and moves to the next card", async () => {
    fakeServer(async () =>
      response(200, deckOf(suggestion("Aspidistra elatior"), suggestion("Ficus lyrata"))),
    );
    const user = userEvent.setup();
    render(<DiscoverPage api="http://api" token={token} />);
    await card();
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Nein",
      "Später",
      "Ja",
    ]);
    await user.click(screen.getByRole("button", { name: "Später" }));
    expect(within(await card()).getByRole("heading", { name: "Ficus lyrata" })).toBeTruthy();
    expect(screen.getByText("Vorschlag 2 von 2")).toBeTruthy();
  });

  it("US-ENT-01 a swipe to the left or right decides like the buttons", async () => {
    fakeServer(async () =>
      response(
        200,
        deckOf(
          suggestion("Aspidistra elatior"),
          suggestion("Ficus lyrata"),
          suggestion("Aloe vera"),
        ),
      ),
    );
    render(<DiscoverPage api="http://api" token={token} />);
    const swipe = (el: HTMLElement, from: number, to: number) => {
      fireEvent.pointerDown(el, { clientX: from, clientY: 100 });
      fireEvent.pointerUp(el, { clientX: to, clientY: 105 });
    };
    swipe(await card(), 200, 60);
    expect(within(await card()).getByRole("heading", { name: "Ficus lyrata" })).toBeTruthy();
    swipe(await card(), 60, 200);
    expect(within(await card()).getByRole("heading", { name: "Aloe vera" })).toBeTruthy();
    swipe(await card(), 100, 120);
    expect(within(await card()).getByRole("heading", { name: "Aloe vera" })).toBeTruthy();
  });

  it("US-ENT-01 after the last card says Für heute durch with the number of new wishes and offers Neuer Stapel", async () => {
    const fetchFn = fakeServer(async (deck) =>
      response(200, deck === 1 ? deckOf(suggestion("Aspidistra elatior")) : { ...nothing, deck }),
    );
    const user = userEvent.setup();
    render(<DiscoverPage api="http://api" token={token} />);
    await card();
    await user.click(screen.getByRole("button", { name: "Ja" }));
    expect(await screen.findByText("Für heute durch. 0 neu auf der Wunschliste.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Neuer Stapel" }));
    expect(await screen.findByText(/Keine neuen Vorschläge/)).toBeTruthy();
    expect(fetchFn.mock.calls.map(([u]) => new URL(String(u)).searchParams.get("deck"))).toEqual([
      "1",
      "2",
    ]);
  });

  it("US-ENT-01 without candidates says why and offers to propose a species", async () => {
    fakeServer(async () => response(200, nothing));
    render(<DiscoverPage api="http://api" token={token} />);
    expect(
      await screen.findByText(
        /Du besitzt alle Arten des Katalogs oder hast dich schon entschieden/,
      ),
    ).toBeTruthy();
    expect(screen.getByText("Schlage eine neue Art für den Katalog vor.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Art vorschlagen" }).getAttribute("href")).toBe(
      "/species",
    );
  });

  it("US-ENT-01 a failing server shows the error with a retry, not an empty deck (P-10)", async () => {
    fakeServer(async () =>
      response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
    );
    render(<DiscoverPage api="http://api" token={token} />);
    expect(await screen.findByText(/Der Server antwortet nicht/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
  });
});
