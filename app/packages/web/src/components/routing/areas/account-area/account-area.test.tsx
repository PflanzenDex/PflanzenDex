// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AccountArea } from "./account-area";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const account = {
  id: "1",
  email: "lena@example.test",
  displayName: "Lena",
  timeZone: null,
  emailConfirmed: true,
  mayShareWithFriends: true,
};
const profile = {
  displayName: "Lena",
  timeZone: "Europe/Berlin",
  everythingPrivate: false,
  noRecommendations: false,
  notifications: {
    phase: true,
    treatment: true,
    measurement: true,
    watering: true,
    swap: true,
    friends: true,
  },
  replenishBuffer: 2,
};

/** A server for the settings section; `status` is the answer to loading the profile, PUT returns what is sent. */
function fakeServer(status = 200) {
  const puts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      // The section Erinnerungen (US-MON-08) has its own tests; here it only has to load quietly.
      if (path === "/reminders")
        return response(200, {
          reminders: [
            {
              id: "r",
              localDate: "2026-10-10",
              status: "in_app",
              attempts: 1,
              lastError: null,
              items: [],
            },
          ],
        });
      if (path === "/reminders/settings")
        return response(200, {
          sendTime: "08:00",
          quietFrom: null,
          quietTo: null,
          paused: {},
          measurementDays: 30,
        });
      if (path === "/reminders/subscriptions") return response(200, { subscriptions: [] });
      if (path === "/ai/connections") return response(200, { connections: [] });
      if (path === "/ai/drafts") return response(200, { drafts: [] });
      if (path === "/ai/tasks") return response(200, { clientConnected: false, tasks: [] });
      if (path !== "/account/profile") return response(404, {});
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        puts.push(body);
        return response(200, body);
      }
      return status === 200
        ? response(200, profile)
        : response(status, { error: { code: "server.error", text: "x" } });
    }),
  );
  return puts;
}

const show = (path = "/account", props: { signOut?: () => void; error?: string } = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AccountArea
        api="http://api"
        token={async () => "tok"}
        account={account}
        onSignOut={props.signOut ?? (() => undefined)}
        onEverywhereSignOut={() => undefined}
        {...(props.error ? { error: props.error } : {})}
      />
    </MemoryRouter>,
  );

beforeAll(async () => {
  await import("@/account/settings-page/settings-page"); // the section is a lazy part: loading it first keeps the waits on the data
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-14 Konto with its sections", () => {
  it("US-QS-14 · US-ACC-01 one h1 Konto and the sections Profil, Einstellungen, Erinnerungen, Was wird gemessen? as h2 in this order", async () => {
    fakeServer();
    show();
    await screen.findByLabelText("Anzeigename");
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Konto",
    ]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Profil",
      "Einstellungen",
      "Erinnerungen",
      "KI-Clients",
      "Was wird gemessen?",
    ]);
  });

  it("US-QS-14 · US-ACC-01 the section Profil shows name, e-mail and both ways to sign out", async () => {
    fakeServer();
    const signOut = vi.fn();
    show("/account", { signOut });
    const profileSection = screen.getByRole("region", { name: "Profil" });
    expect(within(profileSection).getByText("Hallo, Lena")).toBeTruthy();
    expect(within(profileSection).getByText("lena@example.test")).toBeTruthy();
    await userEvent.click(within(profileSection).getByRole("button", { name: "Abmelden" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(
      within(profileSection).getByRole("button", { name: "Auf allen Geräten abmelden" }),
    ).toBeTruthy();
    await screen.findByLabelText("Anzeigename");
  });

  it("US-QS-14 · US-ACC-01 a sign-in error stays visible in the section Profil", async () => {
    fakeServer();
    show("/account", { error: "Die Abmeldung ist fehlgeschlagen." });
    expect(
      within(screen.getByRole("region", { name: "Profil" })).getByRole("alert").textContent,
    ).toContain("Abmeldung ist fehlgeschlagen");
    await screen.findByLabelText("Anzeigename");
  });

  it("US-QS-14 · US-ACC-02 settings still save through the composed page", async () => {
    const puts = fakeServer();
    show();
    const name = await screen.findByLabelText("Anzeigename");
    await userEvent.clear(name);
    await userEvent.type(name, "Lena L");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.["displayName"]).toBe("Lena L");
  });

  it("US-QS-14 · P-09 the section Einstellungen shows a skeleton with one status while loading", () => {
    fakeServer();
    show();
    const section = screen.getByRole("region", { name: "Einstellungen" });
    expect(within(section).getByRole("status").textContent).toContain(
      "Einstellungen werden geladen",
    );
  });

  it("US-QS-14 · P-10 failing settings show their error with a retry; the profile stays usable", async () => {
    fakeServer(500);
    show();
    const section = screen.getByRole("region", { name: "Einstellungen" });
    expect(await within(section).findByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
    expect(
      within(screen.getByRole("region", { name: "Profil" })).getByText("Hallo, Lena"),
    ).toBeTruthy();
  });
});

describe("US-QS-14 the address points at a section", () => {
  it.each([
    ["#profil", "Profil"],
    ["#einstellungen", "Einstellungen"],
  ])("US-QS-14 /account%s focuses the heading %s", async (hash, name) => {
    fakeServer();
    show(`/account${hash}`);
    const heading = screen.getByRole("heading", { level: 2, name });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await screen.findByLabelText("Anzeigename");
  });

  it("US-QS-14 an unknown anchor changes nothing", async () => {
    fakeServer();
    show("/account#gibt-es-nicht");
    await screen.findByLabelText("Anzeigename");
    expect(document.activeElement).toBe(document.body);
  });

  it("US-QS-14 the section list links to the anchors, marks the current one and moves the focus to its heading", async () => {
    fakeServer();
    show();
    const list = screen.getByRole("navigation", { name: "Abschnitte von Konto" });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Profil",
      "Einstellungen",
      "Erinnerungen",
      "KI-Clients",
      "Was wird gemessen?",
    ]);
    expect(links[0]?.getAttribute("aria-current")).toBe("location");
    await userEvent.click(links[1] as HTMLElement);
    const heading = screen.getByRole("heading", { level: 2, name: "Einstellungen" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(links[1]?.getAttribute("aria-current")).toBe("location");
    expect(links[0]?.getAttribute("aria-current")).toBeNull();
    await screen.findByLabelText("Anzeigename");
  });
});

describe("US-QS-14 Konto links to the management of the locations", () => {
  it("US-QS-14 · US-LIC-01 the section Einstellungen has a link to Standorte und Lichtzonen in the Sammlung", async () => {
    fakeServer();
    show();
    await screen.findByLabelText("Anzeigename");
    const link = screen.getByRole("link", { name: "Standorte und Lichtzonen verwalten" });
    expect(link.getAttribute("href")).toBe("/collection?view=plants&manage=locations");
    expect(
      within(screen.getByRole("region", { name: "Einstellungen" })).getByRole("link", {
        name: "Standorte und Lichtzonen verwalten",
      }),
    ).toBeTruthy();
  });
});

describe("US-QS-05 the page Was wird gemessen?", () => {
  it("US-QS-05 names what is recorded about the use: no click counting, no analytics, the last activity as one date", async () => {
    fakeServer();
    show();
    const section = within(screen.getByRole("region", { name: "Was wird gemessen?" }));
    expect(section.getByText(/Keine Klickzählung und keine Nutzungsanalyse/)).toBeTruthy();
    expect(section.getByText(/wann du zuletzt aktiv warst/)).toBeTruthy();
    expect(section.getByText(/nur die Zahl der aktiven Konten/)).toBeTruthy();
    expect(section.getByText(/Ort- und Kameradaten/)).toBeTruthy();
    expect(section.getByText(/Standort, Notizen, Behandlungen/)).toBeTruthy();
  });

  it("US-QS-05 the address #gemessen leads to the section", async () => {
    fakeServer();
    show("/account#gemessen");
    const heading = screen.getByRole("heading", { level: 2, name: "Was wird gemessen?" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
