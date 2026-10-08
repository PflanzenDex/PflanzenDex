// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionArea } from "./collection-area";
import { EMPTY_DISTRIBUTION } from "./collection/distribution-test-helpers";
import { AnnouncerProvider } from "./platform/announcer/announcer";
import { VIEW_KEY } from "./sammlung-view";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const caught = {
  species: "Dracaena trifasciata",
  speciesId: "a1",
  genus: "Dracaena",
  chips: [],
  specimenCount: 1,
  caughtDate: { date: "2026-01-01", source: "caught_at" },
  germanName: null,
  familyLatin: null,
  familyGerman: null,
  genusSpeciesCount: null,
  source: null,
};

function stubServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/pokedex/ownership")
        return response(200, { ownership: { caught: [caught], unidentified: [] } });
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/specimens/cards") return response(200, { cards: [] });
      if (path === "/specimens/difficulty") return response(200, { rows: [] });
      if (path === "/wishes/candidates")
        return response(200, {
          candidates: [],
          zones: [],
          hint: { text: "Keine offenen Kandidaten.", nextAction: "Erfasse einen Wunsch." },
          replenishment: {
            buffer: 2,
            zones: [],
            actions: { discover: false, suggestions: false },
            nextAction: null,
          },
        });
      if (path === "/wishes/bought")
        return response(200, { bought: [], hint: { text: "Nichts gekauft.", nextAction: "x" } });
      if (path === "/wishes/discarded")
        return response(200, {
          discarded: [],
          hint: { text: "Nichts verworfen.", nextAction: "x" },
        });
      return response(200, {});
    }),
  );
}

function Probe() {
  const l = useLocation();
  return <p data-testid="address">{l.pathname + l.search}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AnnouncerProvider>
        <CollectionArea
          api="http://api"
          token={async () => "tok"}
          newSpecies={null}
          onSpeciesChoose={() => {}}
          onCompleted={() => {}}
        />
        <Probe />
      </AnnouncerProvider>
    </MemoryRouter>,
  );

const radio = (name: string) => screen.getByRole("button", { name });
const checked = (name: string) => radio(name).getAttribute("aria-pressed") === "true";

beforeAll(async () => {
  await Promise.all([
    import("./collection/collection-page/collection-page"),
    import("./pokedex/pokedex-page/pokedex-page"),
    import("./wishlist/wishlist-page/wishlist-page"),
    import("./collection/difficulty-page/difficulty-page"),
  ]);
}, 30_000);

beforeEach(() => {
  window.localStorage.clear();
  stubServer();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("US-QS-14 the destination Sammlung with its switch", () => {
  it("US-QS-14 · US-BES-02 without address and stored choice the plants show, under one heading Sammlung", async () => {
    renderAt("/collection");
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(checked("Pflanzen")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sammlung");
    expect(await screen.findByText("0 Pflanzen")).toBeTruthy();
  });

  it("US-QS-14 · US-POK-06 the address with view=species shows the species mode and its count line", async () => {
    renderAt("/collection?view=species");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
    expect(checked("Arten")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("US-QS-14 the stored choice is used when the address has none", async () => {
    window.localStorage.setItem(VIEW_KEY, "species");
    renderAt("/collection");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
    expect(checked("Arten")).toBe(true);
  });

  it("US-QS-14 the address wins over the stored choice", async () => {
    window.localStorage.setItem(VIEW_KEY, "species");
    renderAt("/collection?view=plants");
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(checked("Pflanzen")).toBe(true);
  });

  it("US-QS-14 an unknown value in the address or in the storage falls back to the plants", async () => {
    window.localStorage.setItem(VIEW_KEY, "unsinn");
    renderAt("/collection?view=unsinn");
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
  });

  it("US-QS-14 a click on Arten changes the address, remembers the choice, announces it and keeps the focus", async () => {
    renderAt("/collection");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    await userEvent.click(screen.getByText("Arten"));
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=species");
    expect(window.localStorage.getItem(VIEW_KEY)).toBe("species");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
    expect(document.activeElement).toBe(radio("Arten"));
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Arten");
  });

  it("US-QS-14 the switch works from the keyboard and the focus stays on it", async () => {
    renderAt("/collection");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    await userEvent.tab();
    expect(document.activeElement).toBe(radio("Pflanzen"));
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=species");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
    expect(document.activeElement).toBe(radio("Arten"));
    await userEvent.tab({ shift: true });
    await userEvent.keyboard(" ");
    expect(await screen.findByText("0 Pflanzen")).toBeTruthy();
    expect(document.activeElement).toBe(radio("Pflanzen"));
  });

  it("US-QS-14 history: back returns to the other mode", async () => {
    renderAt("/collection");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    await userEvent.click(screen.getByText("Arten"));
    await screen.findByText("1 gefangen");
    await act(async () => window.history.back());
    // A memory router has no browser history: the address entry is what counts, so check the chosen mode is address driven.
    expect(screen.getByTestId("address").textContent).toContain("view=species");
  });

  it("US-QS-14 a failing storage neither breaks the switch nor the page", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderAt("/collection");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    await userEvent.click(screen.getByText("Arten"));
    await waitFor(() => expect(checked("Arten")).toBe(true));
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
  });
});

describe("US-QS-14 the third mode Wunschliste", () => {
  it("US-QS-14 · US-WUN-01 the address with view=wishlist shows the wishlist, its count line and one main heading", async () => {
    renderAt("/collection?view=wishlist");
    expect(await screen.findByText("0 offene Wünsche")).toBeTruthy();
    expect(checked("Wunschliste")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Sammlung");
    expect(screen.getByRole("heading", { level: 2, name: "Wunschliste" })).toBeTruthy();
    expect(screen.getByText("Erfasse einen Wunsch.")).toBeTruthy();
  });

  it("US-QS-14 the switch offers three modes in the order Pflanzen, Arten, Wunschliste", async () => {
    renderAt("/collection");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    const group = screen.getByRole("group", { name: "Ansicht der Sammlung" });
    expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["Pflanzen", "Arten", "Wunschliste"]);
  });

  it("US-QS-14 a click on Wunschliste changes the address, remembers it, announces it and keeps the focus", async () => {
    renderAt("/collection");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    await userEvent.click(screen.getByText("Wunschliste"));
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=wishlist");
    expect(window.localStorage.getItem(VIEW_KEY)).toBe("wishlist");
    expect(await screen.findByText("0 offene Wünsche")).toBeTruthy();
    expect(document.activeElement).toBe(radio("Wunschliste"));
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Wunschliste");
  });

  it("US-QS-14 the wishlist mode is reachable from the keyboard", async () => {
    renderAt("/collection?view=species");
    await screen.findByText("1 gefangen");
    radio("Wunschliste").focus();
    await userEvent.keyboard("{Enter}");
    expect(await screen.findByText("0 offene Wünsche")).toBeTruthy();
    expect(document.activeElement).toBe(radio("Wunschliste"));
  });

  it("US-QS-14 the stored wishlist mode is used without an address, and the address wins over it", async () => {
    window.localStorage.setItem(VIEW_KEY, "wishlist");
    renderAt("/collection");
    expect(await screen.findByText("0 offene Wünsche")).toBeTruthy();
    cleanup();
    renderAt("/collection?view=plants");
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
  });
});

describe("US-QS-14 · US-BES-05 the comparison by difficulty in the Arten mode", () => {
  it("US-QS-14 · US-BES-05 sort=difficulty in the address shows the comparison with its count line under one heading", async () => {
    renderAt("/collection?view=species&sort=difficulty");
    expect(await screen.findByRole("heading", { level: 2, name: "Artenvergleich" })).toBeTruthy();
    expect(await screen.findByText("0 Arten im Vergleich")).toBeTruthy();
    expect(checked("Arten")).toBe(true);
    expect(checked("Schwierigkeit")).toBe(true);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/Lege im Bestand ein Exemplar an/)).toBeTruthy();
  });

  it("US-QS-14 the species mode offers the arrangement Pokédex and Schwierigkeit; the Pokédex is the default", async () => {
    renderAt("/collection?view=species");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
    expect(checked("Pokédex")).toBe(true);
    expect(checked("Schwierigkeit")).toBe(false);
  });

  it("US-QS-14 choosing Schwierigkeit keeps the species mode, changes the address, announces it and keeps the focus", async () => {
    renderAt("/collection?view=species");
    await screen.findByText("1 gefangen");
    await userEvent.click(radio("Schwierigkeit"));
    expect(screen.getByTestId("address").textContent).toBe(
      "/collection?view=species&sort=difficulty",
    );
    expect(await screen.findByText("0 Arten im Vergleich")).toBeTruthy();
    expect(document.activeElement).toBe(radio("Schwierigkeit"));
    expect(document.querySelector("[aria-live=polite]")?.textContent).toContain("Schwierigkeit");
    await userEvent.click(radio("Pokédex"));
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=species");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
  });

  it("US-QS-14 the arrangement is not offered in the other modes and an unknown sort shows the Pokédex", async () => {
    renderAt("/collection?view=plants&sort=difficulty");
    await screen.findByText("Du hast noch kein Exemplar", { exact: false });
    expect(screen.queryByRole("button", { name: "Schwierigkeit" })).toBeNull();
    cleanup();
    renderAt("/collection?view=species&sort=unsinn");
    expect(await screen.findByText("1 gefangen")).toBeTruthy();
  });

  it("US-QS-14 leaving the species mode drops the arrangement from the address", async () => {
    renderAt("/collection?view=species&sort=difficulty");
    await screen.findByText("0 Arten im Vergleich");
    await userEvent.click(screen.getByText("Wunschliste"));
    expect(screen.getByTestId("address").textContent).toBe("/collection?view=wishlist");
  });
});
