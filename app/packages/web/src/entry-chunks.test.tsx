// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// A mocked module factory runs only when the module is imported: this records what the app shell loads up front.
const loaded = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("./account/invitation-page/invitation-page", () => {
  loaded.pages.push("invitation");
  return { InvitationPage: () => null };
});
vi.mock("./shell/start-page/start-page", () => {
  loaded.pages.push("start");
  return { StartPage: () => null };
});

vi.mock("./light/views/setup-steps/setup-steps", () => {
  loaded.pages.push("setup-steps");
  return { LocationsStep: () => null, ZonesStep: () => null };
});

vi.mock("./pokedex/pokedex-page/pokedex-page", () => {
  loaded.pages.push("pokedex");
  return { PokedexPage: () => null };
});

vi.mock("@/components/routing/areas/today-area/today-area", () => {
  loaded.pages.push("today-area");
  return { TodayArea: () => null };
});

vi.mock("./care/treatments/treatments-page/treatments-page", () => {
  loaded.pages.push("treatments");
  return { TreatmentsPage: () => null };
});

vi.mock("./collection/hints-page/hints-page", () => {
  loaded.pages.push("hints");
  return { HintsPage: () => null };
});

vi.mock("./wishlist/wishlist-page/wishlist-page", () => {
  loaded.pages.push("wishlist");
  return { WishlistPage: () => null };
});

vi.mock("./collection/difficulty-page/difficulty-page", () => {
  loaded.pages.push("difficulty");
  return { DifficultyPage: () => null };
});

vi.mock("./components/routing/areas/collection-area/collection-area", () => {
  loaded.pages.push("collection-area");
  return { CollectionArea: () => null };
});

vi.mock("@/components/routing/areas/discover-area/discover-area", () => {
  loaded.pages.push("discover-area");
  return { DiscoverArea: () => null };
});

vi.mock("./discover/discover-page/discover-page", () => {
  loaded.pages.push("discover-page");
  return { DiscoverPage: () => null };
});

vi.mock("./catalog/species-page/species-page", () => {
  loaded.pages.push("species-page");
  return { SpeciesPage: () => null };
});

vi.mock("vaul", () => {
  loaded.pages.push("vaul");
  return { Drawer: {} };
});

describe("#451 · DS-08 the entry bundle stays small", () => {
  it("#451 the invitation page (forms and validation) loads only when the invitation code is asked for", async () => {
    await import("./shell/app/app");
    expect(loaded.pages).not.toContain("invitation");
  });

  it("#451 the start page (with the onboarding forms) loads only when its route opens", async () => {
    await import("./shell/app/app");
    expect(loaded.pages).not.toContain("start");
  });

  it("#451 the onboarding steps (forms and validation) load only when a step opens", async () => {
    await import("./shell/app/app");
    expect(loaded.pages).not.toContain("setup-steps");
  });

  it("US-QS-14 · DS-08 the species page of the Sammlung loads only when Arten is chosen", async () => {
    await import("./shell/app/app");
    expect(loaded.pages).not.toContain("pokedex");
  });

  it("US-QS-14 · DS-08 the Sammlung with its modes (wishlist, comparison by difficulty) loads only when its route opens", async () => {
    await import("./shell/app/app");
    for (const part of ["collection-area", "wishlist", "difficulty"])
      expect(loaded.pages).not.toContain(part);
  });

  it("US-QS-14 · DS-08 Heute with its sections (treatments, hints) loads only when its route opens", async () => {
    await import("./shell/app/app");
    for (const part of ["today-area", "treatments", "hints"])
      expect(loaded.pages).not.toContain(part);
  });

  it("US-QS-14 · DS-08 Entdecken with its modes (suggestions, catalog) loads only when its route opens", async () => {
    await import("./shell/app/app");
    for (const part of ["discover-area", "discover-page", "species-page"])
      expect(loaded.pages).not.toContain(part);
  });

  it("US-QS-07 · DS-08 the sheet library (Vaul) loads only when a sheet is first opened", async () => {
    await import("./shell/app/app");
    expect(loaded.pages).not.toContain("vaul");
  });
});
