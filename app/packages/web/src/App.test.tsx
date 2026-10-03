// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The sign-in service is a foreign system: UserManager is replaced, app and modules run for real.
const mgr = vi.hoisted(() => ({
  getUser: vi.fn(),
  removeUser: vi.fn(async () => undefined),
  signinRedirect: vi.fn(async () => undefined),
  signoutRedirect: vi.fn(async () => undefined),
}));
vi.mock("oidc-client-ts", () => ({
  WebStorageStateStore: vi.fn(),
  UserManager: class {
    settings = { authority: "http://auth/realm" };
    events = {
      addUserSignedOut: () => undefined,
      removeUserSignedOut: () => undefined,
      addSilentRenewError: () => undefined,
      removeSilentRenewError: () => undefined,
    };
    getUser = mgr.getUser;
    removeUser = mgr.removeUser;
    signinRedirect = mgr.signinRedirect;
    signoutRedirect = mgr.signoutRedirect;
  },
}));

import { App } from "./App";
import { EMPTY_DISTRIBUTION } from "./collection/distribution-test-helpers";

const account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  emailConfirmed: true,
  mayShareWithFriends: true,
};
const response = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function fakeServer(accountStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/account") return response(accountStatus, account);
      if (path === "/species") return response(200, { species: [] });
      if (path === "/specimens/cards") return response(200, { cards: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/light-zones") return response(200, { zones: [] });
      if (path === "/hints") return response(200, { hints: [] });
      return response(404);
    }),
  );
}

beforeEach(() => {
  mgr.getUser.mockReset();
  mgr.signinRedirect.mockClear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-ACC-01 App", () => {
  it("signed out: welcome page with create account and sign in, no navigation", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue(null);
    render(<App />);
    expect(screen.getByRole("status").textContent).toContain("Anmeldung wird geprüft");
    await userEvent.click(await screen.findByRole("button", { name: "Konto anlegen" }));
    expect(mgr.signinRedirect).toHaveBeenCalledWith({ prompt: "create" });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it('an error while loading the account offers "Erneut versuchen" and then loads the account', async () => {
    fakeServer(500);
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("nicht geladen werden");
    fakeServer();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("navigation", { name: "Hauptnavigation" })).toBeTruthy();
  });

  it("signed in: starts in the catalog; the navigation switches between all four views", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
    const species = screen.getByRole("button", { name: "Arten" });
    expect(species.getAttribute("aria-current")).toBe("page");

    await userEvent.click(screen.getByRole("button", { name: "Bestand" }));
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bestand" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(species.getAttribute("aria-current")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Standorte und Licht" }));
    expect(await screen.findByRole("heading", { name: "Standorte" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Konto" }));
    expect(await screen.findByRole("heading", { name: "Hallo, Lena" })).toBeTruthy();
    expect(screen.getByText("lena@example.test")).toBeTruthy();
  });

  it('choosing a species in the catalog leads to the form "Exemplar anlegen"; back leads to the catalog (US-BES-02)', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/account") return response(200, account);
        if (path === "/locations") return response(200, { locations: [] });
        if (path === "/specimens/cards") return response(200, { cards: [] });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
        const species = {
          id: "a1",
          latinName: "Dracaena trifasciata",
          germanName: null,
          synonyms: [],
          difficulty: 1,
          standardLevel: 2,
          lightDemandLux: 15000,
          growthMeasure: "height",
          etiolationSigns: "x",
          successCriteria: "y",
          reviewStatus: "reviewed",
        };
        return response(
          200,
          path === "/species" ? { species: [{ ...species, hit: null }] } : species,
        );
      }),
    );
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Diese Art wählen" }));
    expect(await screen.findByRole("heading", { name: "Exemplar anlegen" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Art" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });

  it("a version line is at the end of the page", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue(null);
    render(<App />);
    expect((await screen.findByText(/^Version /)).textContent).toMatch(/^Version \S+/);
  });
});
