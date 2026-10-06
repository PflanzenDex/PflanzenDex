// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

// A mocked module factory runs only when the module is imported: this records which page chunks a route loads.
const loaded = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("./care/MeasurePage", () => {
  loaded.pages.push("care");
  return { MeasurePage: () => null };
});
vi.mock("./light/LightPage", () => {
  loaded.pages.push("light");
  return { LightPage: () => null };
});
vi.mock("./catalog/SpeciesPage", () => {
  loaded.pages.push("catalog");
  return { SpeciesPage: () => null };
});
vi.mock("./start-page", () => {
  loaded.pages.push("start");
  return { StartPage: () => null };
});
vi.mock("./pokedex/PokedexPage", () => {
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
    renderAt("/wishlist");
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByText("Lädt…")).toBeTruthy();
  });

  it("US-QS-07 · DS-08 a first load of /wishlist does not load the chunks of other modules", async () => {
    renderAt("/wishlist");
    await screen.findByRole("heading", { name: /Wunschliste/ });
    expect(loaded.pages).toEqual([]);
  });

  it("US-QS-07 · DS-08 a failed page chunk shows an error with retry instead of a blank page", async () => {
    renderAt("/pokedex");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Die Seite konnte nicht geladen werden.",
    );
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });

  it("#451 · DS-08 the start route loads the start page chunk on demand", async () => {
    renderAt("/");
    await vi.waitFor(() => expect(loaded.pages).toContain("start"));
  });
});
