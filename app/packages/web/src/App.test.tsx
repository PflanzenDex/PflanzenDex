// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Der Anmeldedienst ist ein Fremdsystem: UserManager wird ersetzt, App und Module laufen echt.
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
import { LEERE_VERTEILUNG } from "./bestand/verteilung-testhilfe";

const konto = {
  id: "1",
  email: "lena@example.test",
  anzeigename: "Lena",
  emailBestaetigt: true,
  darfMitFreundenTeilen: true,
};
const antwort = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function fakeServer(kontoStatus = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const pfad = new URL(String(url)).pathname;
      if (pfad === "/konto") return antwort(kontoStatus, konto);
      if (pfad === "/arten") return antwort(200, { arten: [] });
      if (pfad === "/exemplare/karten") return antwort(200, { karten: [] });
      if (pfad === "/exemplare/verteilung") return antwort(200, LEERE_VERTEILUNG);
      if (pfad === "/standorte") return antwort(200, { standorte: [] });
      if (pfad === "/lichtzonen") return antwort(200, { zonen: [] });
      if (pfad === "/hinweise") return antwort(200, { hinweise: [] });
      return antwort(404);
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
  it("abgemeldet: Willkommensseite mit Konto anlegen und Anmelden, keine Navigation", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue(null);
    render(<App />);
    expect(screen.getByRole("status").textContent).toContain("Anmeldung wird geprüft");
    await userEvent.click(await screen.findByRole("button", { name: "Konto anlegen" }));
    expect(mgr.signinRedirect).toHaveBeenCalledWith({ prompt: "create" });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("ein Fehler beim Konto-Laden bietet „Erneut versuchen“ an und lädt dann das Konto", async () => {
    fakeServer(500);
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain("nicht geladen werden");
    fakeServer();
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("navigation", { name: "Hauptnavigation" })).toBeTruthy();
  });

  it("angemeldet: startet im Katalog; die Navigation wechselt zwischen allen vier Ansichten", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue({ access_token: "tok", expired: false });
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Art wählen" })).toBeTruthy();
    const arten = screen.getByRole("button", { name: "Arten" });
    expect(arten.getAttribute("aria-current")).toBe("page");

    await userEvent.click(screen.getByRole("button", { name: "Bestand" }));
    expect(await screen.findByText("Du hast noch kein Exemplar", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Bestand" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(arten.getAttribute("aria-current")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Standorte und Licht" }));
    expect(await screen.findByRole("heading", { name: "Standorte" })).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Konto" }));
    expect(await screen.findByRole("heading", { name: "Hallo, Lena" })).toBeTruthy();
    expect(screen.getByText("lena@example.test")).toBeTruthy();
  });

  it("Art wählen im Katalog führt zum Formular „Exemplar anlegen“; Zurück führt zum Katalog (US-BES-02)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url) => {
        const pfad = new URL(String(url)).pathname;
        if (pfad === "/konto") return antwort(200, konto);
        if (pfad === "/standorte") return antwort(200, { standorte: [] });
        if (pfad === "/exemplare/karten") return antwort(200, { karten: [] });
        if (pfad === "/exemplare/verteilung") return antwort(200, LEERE_VERTEILUNG);
        const art = {
          id: "a1",
          lateinischerName: "Dracaena trifasciata",
          deutscherName: null,
          synonyme: [],
          schwierigkeit: 1,
          standardStufe: 2,
          lichtbedarfLux: 15000,
          wachstumsmass: "hoehe",
          vergeilungAnzeichen: "x",
          erfolgskriterien: "y",
          pruefstatus: "geprueft",
        };
        return antwort(200, pfad === "/arten" ? { arten: [{ ...art, treffer: null }] } : art);
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

  it("am Seitenende steht eine Versionszeile", async () => {
    fakeServer();
    mgr.getUser.mockResolvedValue(null);
    render(<App />);
    expect((await screen.findByText(/^Version /)).textContent).toMatch(/^Version \S+/);
  });
});
