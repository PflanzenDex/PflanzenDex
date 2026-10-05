// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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

import { BrowserRouter, MemoryRouter } from "react-router";
import { App } from "./App";
import { EMPTY_DISTRIBUTION } from "./collection/distribution-test-helpers";

/** The app runs inside a router; a memory router stands for the address bar. */
const renderApp = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );

/** The main navigation of the shared shell: the header row lists every destination as a link (DS-25). */
const header = () => within(screen.getByRole("navigation", { name: "Hauptnavigation" }));
const tab = (name: string) => header().getByRole("link", { name });
const queryTab = (name: string) => header().queryByRole("link", { name });
const findTab = async (name: string) => {
  await screen.findByRole("navigation", { name: "Hauptnavigation" });
  return tab(name);
};

const account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  emailConfirmed: true,
  mayShareWithFriends: true,
};
const response = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const SPECIMEN_HINTS = [
  {
    kind: "location_without_zone",
    specimenId: "e1",
    specimenName: "Aloe",
    locationId: "s1",
    text: "„Aloe“ steht am Standort „Kiste“, der noch keine Lichtzone hat.",
    nextAction: "Weise dem Standort „Kiste“ eine Lichtzone zu.",
  },
];

function fakeServer(accountStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/account") return response(accountStatus, account);
      if (path === "/species") return response(200, { species: [] });
      if (path === "/specimens/count") return response(200, { count: 0, archived: 0 });
      if (path === "/specimens/cards") return response(200, { cards: [] });
      if (path === "/specimens/archived") return response(200, { archived: [] });
      if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
      if (path === "/locations") return response(200, { locations: [] });
      if (path === "/light-zones") return response(200, { zones: [] });
      if (path === "/care-profiles") return response(200, { entries: [] });
      if (path === "/hints") return response(200, { hints: [] });
      if (path === "/specimens/hints") return response(200, { hints: SPECIMEN_HINTS });
      if (path === "/specimens/light-overview") return response(200, { rows: [] });
      if (path === "/specimens/difficulty") return response(200, { rows: [] });
      if (path === "/wishes/candidates")
        return response(200, {
          candidates: [],
          zones: [],
          hint: {
            text: "Keine offenen Kandidaten in der Wunschliste.",
            nextAction: "Erfasse einen Wunsch mit Ziel-Lichtzone.",
          },
        });
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
    renderApp();
    expect(screen.getByRole("status").textContent).toContain("Anmeldung wird geprüft");
    await userEvent.click(await screen.findByRole("button", { name: "Konto anlegen" }));
    expect(mgr.signinRedirect).toHaveBeenCalledWith({ prompt: "create" });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it('an error while loading the account offers "Erneut versuchen" and then loads the account', async () => {
    fakeServer(500);
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    expect((await screen.findByRole("alert")).textContent).toContain("nicht geladen werden");
    fakeServer();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("navigation", { name: "Hauptnavigation" })).toBeTruthy();
  });

  it("US-ACC-05 a new person without account is asked for the invitation code, then lands in the app", async () => {
    let registered = false;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/registration/invitation" && init?.method === "POST") {
          registered = true;
          return response(200, { registered: true });
        }
        if (path === "/account")
          return registered
            ? response(200, account)
            : response(403, {
                error: { code: "invitation.required", text: "Nur mit Einladungscode." },
              });
        return response(404);
      }),
    );
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    expect(await screen.findByRole("heading", { name: "Einladungscode" })).toBeTruthy();
    expect(screen.queryByRole("navigation")).toBeNull();
    await userEvent.type(screen.getByRole("textbox", { name: "Einladungscode" }), "ABCD-EFGH");
    await userEvent.click(screen.getByRole("button", { name: "Registrieren" }));
    expect(await screen.findByRole("navigation", { name: "Hauptnavigation" })).toBeTruthy();
    expect(queryTab("Betreiber")).toBeNull();
  });

  it("US-ACC-05 the operator sees the tab Betreiber and its numbers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/account") return response(200, { ...account, operator: true });
        if (path === "/operator/overview")
          return response(200, {
            accounts: 3,
            activeAccounts: 2,
            activeWindowDays: 30,
            cost: null,
            costPerUser: { known: false, reason: "no_figure" },
            invitationOnly: false,
            invitations: [],
          });
        return response(404);
      }),
    );
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Betreiber"));
    expect(await screen.findByRole("heading", { name: "Betreiber" })).toBeTruthy();
    expect((await screen.findByText("Kosten pro Nutzer")).nextElementSibling?.textContent).toMatch(
      /^unbekannt/,
    );
  });

  it("US-ACC-03 signed in: starts on the start page with the guided onboarding for a new account", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    expect(await screen.findByRole("heading", { name: "Wo stehen deine Pflanzen?" })).toBeTruthy();
    expect(tab("Start").getAttribute("aria-current")).toBe("page");
    await userEvent.click(screen.getByRole("button", { name: "Einstieg beenden" }));
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Art im Katalog wählen" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
    expect(tab("Arten").getAttribute("aria-current")).toBe("page");
  });

  it("signed in: the navigation switches between all views", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Arten"));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
    const species = tab("Arten");
    expect(species.getAttribute("aria-current")).toBe("page");

    await userEvent.click(tab("Bestand"));
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(tab("Bestand").getAttribute("aria-current")).toBe("page");
    expect(species.getAttribute("aria-current")).toBeNull();

    await userEvent.click(tab("Standorte und Licht"));
    expect(await screen.findByRole("heading", { name: "Standorte" })).toBeTruthy();

    await userEvent.click(tab("Konto"));
    expect(await screen.findByRole("heading", { name: "Hallo, Lena" })).toBeTruthy();
    expect(screen.getByText("lena@example.test")).toBeTruthy();
  });

  it("US-BES-09 the tab Pflegeprofil opens the own care profile and says what to do without a species", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Pflegeprofil"));
    expect(await screen.findByRole("heading", { name: "Pflegeprofil" })).toBeTruthy();
    expect(screen.getByText(/Lege zuerst im Bestand ein Exemplar an/)).toBeTruthy();
    expect(tab("Pflegeprofil").getAttribute("aria-current")).toBe("page");
  });

  it("US-BES-05 the tab Artenvergleich opens the difficulty overview and says what to do without a species", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Artenvergleich"));
    expect(await screen.findByRole("heading", { name: "Artenvergleich" })).toBeTruthy();
    expect(screen.getByText(/Noch keine Art/)).toBeTruthy();
    expect(tab("Artenvergleich").getAttribute("aria-current")).toBe("page");
  });

  it("US-WUN-01 the tab Wunschliste opens the candidate list and says what to do without a wish", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Wunschliste"));
    expect(await screen.findByRole("heading", { name: "Wunschliste" })).toBeTruthy();
    expect(await screen.findByText("Erfasse einen Wunsch mit Ziel-Lichtzone.")).toBeTruthy();
    expect(tab("Wunschliste").getAttribute("aria-current")).toBe("page");
  });

  it("US-BES-08 the tab Hinweise lists incomplete specimens and its action leads to the view that fixes it", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Hinweise"));
    expect(await screen.findByText(SPECIMEN_HINTS[0]?.text ?? "")).toBeTruthy();
    expect(tab("Hinweise").getAttribute("aria-current")).toBe("page");
    await userEvent.click(screen.getByRole("button", { name: "Zu Standorte und Licht" }));
    expect(await screen.findByRole("heading", { name: "Standorte" })).toBeTruthy();
    expect(tab("Standorte und Licht").getAttribute("aria-current")).toBe("page");
  });

  it("US-LIC-03 the empty light overview offers the way to the collection by switching the tab", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Standorte und Licht"));
    await userEvent.click(await screen.findByRole("button", { name: "Zum Bestand" }));
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(tab("Bestand").getAttribute("aria-current")).toBe("page");
    expect(tab("Standorte und Licht").getAttribute("aria-current")).toBeNull();
  });

  it('choosing a species in the catalog leads to the form "Exemplar anlegen"; back leads to the catalog (US-BES-02)', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/account") return response(200, account);
        if (path === "/locations") return response(200, { locations: [] });
        if (path === "/light-zones") return response(200, { zones: [] });
        if (path === "/specimens/count") return response(200, { count: 0, archived: 0 });
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
    renderApp();
    await userEvent.click(await findTab("Arten"));
    await userEvent.click(await screen.findByRole("button", { name: /Dracaena trifasciata/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Diese Art wählen" }));
    expect(await screen.findByRole("heading", { name: "Exemplar anlegen" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurück zur Art" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });

  it("US-POK-09 after the way Pokédex, species profile, collection, back the catalog search opens, not the old profile", async () => {
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
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const path = new URL(String(url)).pathname;
        if (path === "/account") return response(200, account);
        if (path === "/pokedex/ownership")
          return response(200, { ownership: { caught: [caught], unidentified: [] } });
        if (path === "/locations") return response(200, { locations: [] });
        if (path === "/light-zones") return response(200, { zones: [] });
        if (path === "/specimens/count") return response(200, { count: 0, archived: 0 });
        if (path === "/specimens/cards") return response(200, { cards: [] });
        if (path === "/specimens/archived") return response(200, { archived: [] });
        if (path === "/specimens/distribution") return response(200, EMPTY_DISTRIBUTION);
        return response(
          200,
          path === "/species" ? { species: [{ ...species, hit: null }] } : species,
        );
      }),
    );
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp();
    await userEvent.click(await findTab("Pokédex"));
    await userEvent.click(
      await screen.findByRole("button", { name: "Details zu Dracaena trifasciata" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Zum Artprofil" }));
    await userEvent.click(await screen.findByRole("button", { name: "Diese Art wählen" }));
    await userEvent.click(await screen.findByRole("button", { name: "Zurück zur Art" }));
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
  });

  it("a version line is at the end of the page", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue(null);
    renderApp();
    expect((await screen.findByText(/^Version /)).textContent).toMatch(/^Version \S+/);
  });

  it("US-QS-07 · a deep link opens the page of its address", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp("/collection");
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(tab("Bestand").getAttribute("aria-current")).toBe("page");
  });

  it("US-QS-07 · an unknown address lands on the start page", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp("/gibt-es-nicht");
    await screen.findByRole("navigation", { name: "Hauptnavigation" });
    await waitFor(() => expect(tab("Start").getAttribute("aria-current")).toBe("page"));
  });

  it("US-QS-07 · the address shows the page and a species profile has its own address", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp("/species/a1");
    await screen.findByRole("navigation", { name: "Hauptnavigation" });
    expect(tab("Arten").getAttribute("aria-current")).toBe("page");
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.map((c) => new URL(String(c[0])).pathname)).toContain(
        "/species/a1",
      ),
    );
  });

  it("US-BES-10 · without the reviewer role /review lands on the start page with a German hint", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp("/review");
    expect((await screen.findByRole("alert")).textContent).toContain("Prüfliste");
    expect(tab("Start").getAttribute("aria-current")).toBe("page");
  });

  it("US-ACC-05 · without the operator role /operator lands on the start page with a German hint", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    renderApp("/operator");
    expect((await screen.findByRole("alert")).textContent).toContain("Betreiber");
    expect(tab("Start").getAttribute("aria-current")).toBe("page");
  });
});

describe("US-QS-07 browser history", () => {
  it("US-QS-07 · back button returns to the previous page", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    window.localStorage.clear();
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>,
    );
    await screen.findByRole("navigation", { name: "Hauptnavigation" });
    await userEvent.click(tab("Bestand"));
    await userEvent.click(tab("Einstellungen"));
    expect(window.location.pathname).toBe("/settings");
    await act(async () => {
      window.history.back();
      await waitFor(() => expect(window.location.pathname).toBe("/collection"));
    });
    expect((await findTab("Bestand")).getAttribute("aria-current")).toBe("page");
    await act(async () => {
      window.history.back();
      await waitFor(() => expect(window.location.pathname).toBe("/"));
    });
    await waitFor(() => expect(tab("Start").getAttribute("aria-current")).toBe("page"));
  });
});
