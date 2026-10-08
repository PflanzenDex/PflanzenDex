// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// A mocked module factory runs only when the module is imported: this records which page chunks a route loads.
const loaded = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("./care/measure/measure-page/measure-page", () => {
  loaded.pages.push("care");
  return { MeasurePage: () => null };
});
vi.mock("./light/light-page/light-page", () => {
  loaded.pages.push("light");
  return { LightPage: () => null };
});
vi.mock("./catalog/species-page/species-page", () => {
  loaded.pages.push("catalog");
  return { SpeciesPage: () => null };
});
vi.mock("./shell/start-page/start-page", () => {
  loaded.pages.push("start");
  return { StartPage: () => null };
});
vi.mock("./pokedex/pokedex-page/pokedex-page", () => {
  loaded.pages.push("pokedex");
  throw new Error("Failed to fetch dynamically imported module");
});

import { AppRoutes } from "./routes";

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
  it("US-QS-07 · DS-08 a route shows one loading status while its page chunk loads", () => {
    renderAt("/collection?view=wishlist");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
  });

  it("US-QS-07 · DS-08 a first load of the wishlist mode does not load the chunks of other modules", async () => {
    renderAt("/collection?view=wishlist");
    await screen.findByRole("heading", { name: /Wunschliste/ });
    expect(loaded.pages).toEqual([]);
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

  it("#451 · DS-08 the start route loads the start page chunk on demand", async () => {
    renderAt("/");
    await vi.waitFor(() => expect(loaded.pages).toContain("start"));
  });
});
