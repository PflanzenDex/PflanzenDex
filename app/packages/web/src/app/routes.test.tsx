// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// A mocked module factory runs only when the module is imported: this records which page chunks a route loads.
const loaded = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("../care/measure/measure-page/measure-page", () => {
  loaded.pages.push("care");
  return { MeasurePage: () => null };
});
vi.mock("../light/light-page/light-page", () => {
  loaded.pages.push("light");
  return { LightPage: () => null };
});
vi.mock("../catalog/species-page/species-page", () => {
  loaded.pages.push("catalog");
  return { SpeciesPage: () => null };
});
vi.mock("@/app/destinations/today-area/today-area", () => {
  loaded.pages.push("today-area");
  return { TodayArea: () => <h1>Heute</h1> };
});
vi.mock("@/app/flows/add-plant/add-plant", () => {
  loaded.pages.push("add-plant");
  return { AddPlant: () => <h2 id="add-plant-title">Pflanze anlegen</h2> };
});
vi.mock("@/app/destinations/account-area/account-area", () => {
  loaded.pages.push("account-area");
  return { AccountArea: () => null };
});
// The collection chunk arrives when its test releases it (issue 1726): a chunk that arrives sooner shows no status.
const chunk = vi.hoisted(() => ({ ready: Promise.resolve() as Promise<void> }));
vi.mock("@/app/destinations/collection-area/collection-area", async (importOriginal) => {
  await chunk.ready;
  return importOriginal<typeof import("@/app/destinations/collection-area/collection-area")>();
});
vi.mock("../pokedex/pokedex-page/pokedex-page", () => {
  loaded.pages.push("pokedex");
  throw new Error("Failed to fetch dynamically imported module");
});

import { AppRoutes } from "./routes";
import { AddPlant } from "@/app/flows";
import { AccountArea, TodayArea } from "@/app/destinations/area-parts/lazy-areas";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const renderAt = (path: string) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response(200, { candidates: [], zones: [], hint: null })),
  );
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes
        api="http://api.test"
        session={{ token: async () => "tok" } as never}
        account={{ id: "1" } as never}
        onOpen={() => undefined}
        onOpenProfile={() => undefined}
        handOver={{
          newSpecies: null,
          setNewSpecies: () => undefined,
          choose: () => undefined,
          toTheCatalog: () => undefined,
          toAddPlant: () => undefined,
          onCreated: () => undefined,
          startFromWish: () => undefined,
        }}
      />
    </MemoryRouter>,
  );
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  loaded.pages.length = 0;
});

describe("US-QS-07 · DS-08 route-level lazy loading", () => {
  it("US-QS-07 · DS-08 a route shows one loading status while its page chunk loads, after the delay (issue 1697)", async () => {
    let release: () => void = () => undefined;
    chunk.ready = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    renderAt("/collection?view=wishlist");
    expect(await screen.findByRole("status")).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
    release();
    await screen.findByRole("heading", { name: /Wunschliste/ });
  });

  it("US-QS-07 · DS-08 a route whose chunk arrives within the delay shows no loading status (issue 1726)", async () => {
    renderAt("/collection?view=wishlist");
    expect(screen.queryByRole("status")).toBeNull();
    await screen.findByRole("heading", { name: /Wunschliste/ });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("US-QS-07 · DS-08 a first load of the wishlist mode does not load the chunks of the other modes (issue 1645)", async () => {
    renderAt("/collection?view=wishlist");
    await screen.findByRole("heading", { name: /Wunschliste/ });
    expect(loaded.pages).not.toContain("pokedex");
    expect(loaded.pages).not.toContain("catalog");
    expect(loaded.pages).not.toContain("light");
    expect(loaded.pages).not.toContain("care");
  });

  it("US-QS-07 · DS-08 a failed page chunk shows an error with retry instead of a blank page", async () => {
    renderAt("/collection?view=species");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Seite konnte nicht geladen werden.",
    );
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("US-QS-14 · DS-08 the Sammlung in plants mode does not load the species page chunk", async () => {
    renderAt("/collection?view=plants");
    await screen.findByRole("heading", { name: "Sammlung" });
    expect(loaded.pages).not.toContain("pokedex");
  });

  it("US-QS-14 · the old Pokédex address and its sub-paths open the species mode of the Sammlung", async () => {
    // The species page chunk is mocked to fail: only the species mode requests it, so an alert proves the redirect.
    renderAt("/pokedex/irgendwas");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Seite konnte nicht geladen werden.",
    );
  });

  it("US-QS-16 · DS-08 the root address leads to Heute, whose chunk is in hand once it shows", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Heute" })).toBeTruthy();
    expect(TodayArea.loaded()).not.toBeNull();
  });

  it("US-QS-16 an unknown address leads to Heute", async () => {
    renderAt("/gibt-es-nicht");
    expect(await screen.findByRole("heading", { name: "Heute" })).toBeTruthy();
  });

  it("US-QS-07 the new-plant form chunk is requested before the form opens, so the form shows at once (issue 1645)", async () => {
    renderAt("/collection?view=plants");
    await screen.findByRole("heading", { name: "Sammlung" });
    // The shell is idle a moment later: the form's chunk is in hand before any tap on "+".
    await waitFor(() => expect(AddPlant.loaded()).not.toBeNull());
    cleanup();
    renderAt("/collection/new");
    expect(screen.getByRole("heading", { name: "Pflanze anlegen" })).toBeTruthy();
  });

  it("US-QS-07 the destination chunks are in hand once the shell is idle, without a visit (issue 1645)", async () => {
    renderAt("/collection?view=plants");
    await screen.findByRole("heading", { name: "Sammlung" });
    // Konto is not on this screen: its chunk comes from the idle preload of the shell (issue 1645).
    await waitFor(() => expect(AccountArea.loaded()).not.toBeNull());
  });
});
