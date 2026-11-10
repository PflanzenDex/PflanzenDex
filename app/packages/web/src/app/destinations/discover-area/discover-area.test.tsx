// @vitest-environment jsdom
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider, type FeatureStates } from "@/shared/data";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { DiscoverArea } from "./discover-area";
import { DISCOVER_VIEW_KEY } from "./discover-view";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const empty = {
  deck: 1,
  suggestions: [],
  zoneFilter: null,
  empty: {
    reason: "all_decided",
    text: "Keine neuen Vorschläge.",
    nextAction: "Schlage eine Art vor.",
  },
};

function stubServer(deck: unknown = empty) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/discover/suggestions") return response(200, deck);
      if (path === "/species") return response(200, { species: [] });
      return response(200, {});
    }),
  );
}

function Probe() {
  const l = useLocation();
  return <p data-testid="address">{l.pathname + l.search}</p>;
}

const renderAt = (path: string, features?: FeatureStates) =>
  render(
    <FeaturesProvider features={features}>
      <MemoryRouter initialEntries={[path]}>
        <AnnouncerProvider>
          <DiscoverArea
            api="http://api"
            token={async () => "tok"}
            onChoose={() => {}}
            profileSection={() => null}
          />
          <Probe />
        </AnnouncerProvider>
      </MemoryRouter>
    </FeaturesProvider>,
  );

const radio = (name: string) => screen.getByRole("button", { name });
const checked = (name: string) => radio(name).getAttribute("aria-pressed") === "true";
const suggestionsShown = () => screen.findByText("Keine neuen Vorschläge.");
const catalogShown = () => screen.findByRole("heading", { level: 2, name: "Art wählen" });

beforeAll(async () => {
  await Promise.all([
    import("../../../discover/discover-page/discover-page"),
    import("../../../catalog/species-page/species-page"),
  ]);
}, 30_000);

beforeEach(() => {
  setViewportWidth(360);
  window.localStorage.clear();
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-QS-14 the destination Entdecken with its switch Vorschläge | Katalog", () => {
  it("US-QS-14 · US-ENT-01 without address and stored choice the suggestions show, under one heading Entdecken", async () => {
    renderAt("/discover");
    await suggestionsShown();
    expect(checked("Vorschläge")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Entdecken");
  });

  it("US-QS-14 · US-BES-01 the address with view=catalog shows the species catalog under the same single heading", async () => {
    renderAt("/discover?view=catalog");
    await catalogShown();
    expect(checked("Katalog")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Entdecken");
  });

  it("US-ENT-07 the address with zone=3 asks for the suggestions of that zone; a bad zone asks for none", async () => {
    renderAt("/discover?zone=3");
    await suggestionsShown();
    const asked = () => vi.mocked(fetch).mock.calls.map(([u]) => String(u));
    expect(asked().some((u) => u.includes("/discover/suggestions") && u.includes("zone=3"))).toBe(
      true,
    );
    cleanup();
    vi.mocked(fetch).mockClear();
    renderAt("/discover?zone=9");
    await suggestionsShown();
    expect(asked().some((u) => u.includes("zone="))).toBe(false);
  });

  it("US-QS-14 the stored choice is used when the address has none", async () => {
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "catalog");
    renderAt("/discover");
    await catalogShown();
    expect(checked("Katalog")).toBe(true);
  });

  it("US-QS-14 the address wins over the stored choice", async () => {
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "catalog");
    renderAt("/discover?view=suggestions");
    await suggestionsShown();
    expect(checked("Vorschläge")).toBe(true);
  });

  it("US-QS-14 an unknown value in the address or in the storage falls back to the suggestions", async () => {
    window.localStorage.setItem(DISCOVER_VIEW_KEY, "unsinn");
    renderAt("/discover?view=unsinn");
    await suggestionsShown();
    expect(checked("Vorschläge")).toBe(true);
  });

  it("US-QS-14 a click on Katalog changes the address, remembers the choice, announces it and keeps the focus", async () => {
    renderAt("/discover");
    await suggestionsShown();
    await userEvent.click(radio("Katalog"));
    expect(screen.getByTestId("address").textContent).toBe("/discover?view=catalog");
    expect(window.localStorage.getItem(DISCOVER_VIEW_KEY)).toBe("catalog");
    await catalogShown();
    expect(document.activeElement).toBe(radio("Katalog"));
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Katalog");
  });

  it("US-QS-14 the switch works from the keyboard and the focus stays on it", async () => {
    renderAt("/discover");
    await suggestionsShown();
    await userEvent.tab();
    expect(document.activeElement).toBe(radio("Vorschläge"));
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("address").textContent).toBe("/discover?view=catalog");
    await catalogShown();
    expect(document.activeElement).toBe(radio("Katalog"));
    await userEvent.tab({ shift: true });
    await userEvent.keyboard(" ");
    await suggestionsShown();
    expect(document.activeElement).toBe(radio("Vorschläge"));
  });

  it("US-QS-14 a failing storage neither breaks the switch nor the page", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAt("/discover");
    await suggestionsShown();
    await act(async () => radio("Katalog").click());
    await waitFor(() => expect(checked("Katalog")).toBe(true));
    await catalogShown();
  });

  it("US-QS-14 the switch is a named group of two toggle buttons in the order Vorschläge, Katalog", async () => {
    renderAt("/discover");
    await suggestionsShown();
    const group = screen.getByRole("group", { name: "Ansicht von Entdecken" });
    expect([...group.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Vorschläge",
      "Katalog",
    ]);
  });
});

describe("US-ONB-09 the keeper's switch of the wishlist hides the suggestions with Ja and Nein", () => {
  /** One suggestion on the deck: a card with its buttons Nein, Später and Ja. */
  const deckWithCard = {
    deck: 1,
    suggestions: [
      {
        species: "Aspidistra elatior",
        germanName: "Schusterpalme",
        summary: "Eine robuste Zimmerpflanze.",
        family: "Asparagaceae",
        lightZone: 3,
        difficulty: 2,
        imageUrl: "https://upload.example/aspidistra.jpg",
        sourceUrl: "https://de.wikipedia.org/wiki/Aspidistra",
        attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
        reasons: ["Diese Art hast du noch nicht gefangen."],
      },
    ],
    empty: null,
    zoneFilter: null,
  };

  it("US-ONB-09 with wishlist off Entdecken offers the catalog only: no Vorschläge, no Ja and no Nein, and no suggestion is asked", async () => {
    stubServer(deckWithCard);
    renderAt("/discover?view=suggestions", { wishlist: false });
    await catalogShown();
    expect(screen.queryByRole("button", { name: "Vorschläge" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ja" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Nein" })).toBeNull();
    const asked = vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(asked).not.toContain("/discover/suggestions");
  });

  it("US-ONB-09 with wishlist on Entdecken shows the card with Nein and Ja", async () => {
    stubServer(deckWithCard);
    renderAt("/discover", { wishlist: true });
    expect(await screen.findByRole("article")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nein" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ja" })).toBeTruthy();
  });

  it("US-ONB-09 with discover off Entdecken offers the catalog only, as before", async () => {
    renderAt("/discover", { discover: false, wishlist: true });
    await catalogShown();
    expect(screen.queryByRole("button", { name: "Vorschläge" })).toBeNull();
  });
});

/** Holds the answer of one path until the returned function is called (US-QS-14 issue 1697). */
function holdPath(path: string): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const fetchFn = vi.mocked(fetch);
  const base = fetchFn.getMockImplementation() as typeof fetch;
  fetchFn.mockImplementation(async (url, init) => {
    if (new URL(String(url)).pathname === path) await gate;
    return base(url, init);
  });
  return release;
}

/** The loading statuses of the page: the status texts that say a part is loading (DS-56), not the messages. */
const loadingStatuses = () =>
  screen.queryAllByRole("status").filter((s) => /geladen/.test(s.textContent ?? ""));

describe("US-QS-14 issue 1697 · Entdecken shows its shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow suggestions load shows one card skeleton with its loading text, then the card once", async () => {
    const release = holdPath("/discover/suggestions");
    renderAt("/discover");
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    expect(loadingStatuses()[0]?.textContent).toContain("Vorschläge werden geladen …");
    release();
    await suggestionsShown();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it("US-QS-14 issue 1697 · a fast suggestions load shows no loading status at all", async () => {
    renderAt("/discover");
    await suggestionsShown();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it("US-QS-14 issue 1697 · the catalog mode of a fast load shows no loading status at all", async () => {
    renderAt("/discover?view=catalog");
    await catalogShown();
    expect(loadingStatuses()).toHaveLength(0);
  });
});

/** A deck with one card of the species, to tell two decks apart on screen (US-ENT-01). */
function deckOfOne(species: string, germanName: string) {
  return {
    deck: 1,
    suggestions: [
      {
        species,
        germanName,
        summary: "Eine robuste Zimmerpflanze.",
        family: "Asparagaceae",
        lightZone: 3,
        difficulty: 2,
        imageUrl: "https://upload.example/card.jpg",
        sourceUrl: "https://de.wikipedia.org/wiki/Aspidistra",
        attributes: { humidity: null, minTemperature: null, toxicToPets: null, growthSize: null },
        reasons: ["Diese Art hast du noch nicht gefangen."],
      },
    ],
    empty: null,
    zoneFilter: null,
  };
}

describe("US-ENT-01 issue 1652 · Vorschläge keep the last deck while they refetch", () => {
  it("US-ENT-01 issue 1652 · back from Katalog the last deck is on screen at once while the refetch runs, then the new deck replaces it", async () => {
    let decks = 0;
    let answerSecond: () => void = () => undefined;
    const second = new Promise<void>((done) => {
      answerSecond = done;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/discover/suggestions") {
          decks += 1;
          if (decks === 1) return response(200, deckOfOne("Aspidistra elatior", "Schusterpalme"));
          // The refetch answers only when the test lets it: the old deck must be on screen meanwhile.
          await second;
          return response(200, deckOfOne("Ficus lyrata", "Geigenfeige"));
        }
        if (path === "/species") return response(200, { species: [] });
        return response(200, {});
      }),
    );
    renderAt("/discover");
    expect(await screen.findByRole("heading", { name: "Aspidistra elatior" })).toBeTruthy();
    await userEvent.click(radio("Katalog"));
    await catalogShown();
    await userEvent.click(radio("Vorschläge"));
    // Back on Vorschläge: the last deck is there at once, with no loading status (DS-09, DS-11, DS-57).
    expect(screen.getByRole("heading", { name: "Aspidistra elatior" })).toBeTruthy();
    expect(loadingStatuses()).toHaveLength(0);
    await waitFor(() => expect(decks).toBe(2));
    expect(screen.getByRole("heading", { name: "Aspidistra elatior" })).toBeTruthy();
    expect(loadingStatuses()).toHaveLength(0);
    answerSecond();
    expect(await screen.findByRole("heading", { name: "Ficus lyrata" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Aspidistra elatior" })).toBeNull();
  });
});
