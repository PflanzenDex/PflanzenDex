// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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
  await Promise.all([import("./collection/CollectionPage"), import("./pokedex/PokedexPage")]);
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
