// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

// A mocked module factory runs only when the module is imported: this records what the app shell loads up front.
const loaded = vi.hoisted(() => ({ pages: [] as string[] }));
vi.mock("./account/invitation-page", () => {
  loaded.pages.push("invitation");
  return { InvitationPage: () => null };
});
vi.mock("./start-page", () => {
  loaded.pages.push("start");
  return { StartPage: () => null };
});

vi.mock("./light/setup-steps", () => {
  loaded.pages.push("setup-steps");
  return { LocationsStep: () => null, ZonesStep: () => null };
});

vi.mock("./pokedex/PokedexPage", () => {
  loaded.pages.push("pokedex");
  return { PokedexPage: () => null };
});

vi.mock("@/components/routing/today-area/today-area", () => {
  loaded.pages.push("today-area");
  return { TodayArea: () => null };
});

vi.mock("./care/TreatmentsPage", () => {
  loaded.pages.push("treatments");
  return { TreatmentsPage: () => null };
});

vi.mock("./collection/HintsPage", () => {
  loaded.pages.push("hints");
  return { HintsPage: () => null };
});

vi.mock("vaul", () => {
  loaded.pages.push("vaul");
  return { Drawer: {} };
});

describe("#451 · DS-08 the entry bundle stays small", () => {
  it("#451 the invitation page (forms and validation) loads only when the invitation code is asked for", async () => {
    await import("./App");
    expect(loaded.pages).not.toContain("invitation");
  });

  it("#451 the start page (with the onboarding forms) loads only when its route opens", async () => {
    await import("./App");
    expect(loaded.pages).not.toContain("start");
  });

  it("#451 the onboarding steps (forms and validation) load only when a step opens", async () => {
    await import("./App");
    expect(loaded.pages).not.toContain("setup-steps");
  });

  it("US-QS-14 · DS-08 the species page of the Sammlung loads only when Arten is chosen", async () => {
    await import("./App");
    expect(loaded.pages).not.toContain("pokedex");
  });

  it("US-QS-14 · DS-08 Heute with its sections (treatments, hints) loads only when its route opens", async () => {
    await import("./App");
    for (const part of ["today-area", "treatments", "hints"])
      expect(loaded.pages).not.toContain(part);
  });

  it("US-QS-07 · DS-08 the sheet library (Vaul) loads only when a sheet is first opened", async () => {
    await import("./App");
    expect(loaded.pages).not.toContain("vaul");
  });
});
