// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/kernel";
import { setViewportWidth } from "@/lib/viewport-mock";
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
    equipment: true,
  },
  replenishBuffer: 2,
  positionThresholds: null,
  rarityConsent: false,
};

/** A server for the settings section; `status` is the answer to loading the profile, PUT returns what is sent. */
function fakeServer(status = 200, calmMode = false) {
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
      if (path === "/achievements/settings") return response(200, { calmMode });
      if (path === "/onboarding/style") return response(200, { style: "few", chosen: true });
      if (path === "/achievements")
        return response(200, {
          calmMode: false,
          earnedCount: 0,
          firstStep: { key: "first-measurement-photo.next", specimenId: null, specimenName: null },
          groups: [],
        });
      if (path === "/ai/connections") return response(200, { connections: [] });
      if (path === "/ai/drafts") return response(200, { drafts: [] });
      if (path === "/ai/tasks") return response(200, { clientConnected: false, tasks: [] });
      if (path === "/ai/log") return response(200, { log: [] });
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

function Address() {
  const { pathname, hash } = useLocation();
  return <p data-testid="address">{pathname + hash}</p>;
}

const show = (
  path = "/account",
  props: { signOut?: () => void; error?: string; overview?: boolean } = {},
) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Address />
      <AccountArea
        api="http://api"
        token={async () => "tok"}
        account={account}
        onSignOut={props.signOut ?? (() => undefined)}
        onEverywhereSignOut={() => undefined}
        {...(props.overview ? { overview: <p>Übersicht</p> } : {})}
        {...(props.error ? { error: props.error } : {})}
      />
    </MemoryRouter>,
  );

beforeAll(async () => {
  setViewportWidth(390);
  await import("@/account/settings-page/settings-page"); // the section is a lazy part: loading it first keeps the waits on the data
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-DEV-06 Konto without the AI function", () => {
  it("US-DEV-06 the row KI-Clients is gone while ai is off, its address leads to the index, nothing is asked of /ai", async () => {
    fakeServer();
    render(
      <FeaturesProvider features={{ social: true, ai: false, recommendations: false }}>
        <MemoryRouter initialEntries={["/account/ai-clients"]}>
          <Address />
          <AccountArea
            api="http://api"
            token={async () => "tok"}
            account={account}
            onSignOut={() => undefined}
            onEverywhereSignOut={() => undefined}
          />
        </MemoryRouter>
      </FeaturesProvider>,
    );
    const list = await screen.findByRole("navigation", { name: "Abschnitte von Konto" });
    expect(screen.getByTestId("address").textContent).toBe("/account");
    await within(list).findByRole("link", { name: /^Erinnerungen/ });
    expect(within(list).queryByRole("link", { name: /KI-Clients/ })).toBeNull();
    const asked = vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(asked.some((path) => path.startsWith("/ai"))).toBe(false);
  });
});

describe("US-QS-17 Konto with its sections as views", () => {
  it("US-QS-17 · US-ACC-01 a section has one h1 with its name and a way back Konto", async () => {
    fakeServer();
    show("/account/reminders");
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Erinnerungen",
    ]);
    expect(screen.getByRole("link", { name: "Konto" }).getAttribute("href")).toBe("/account");
    await screen.findByRole("region", { name: "Erinnerungen" });
  });

  it("US-QS-17 · US-ACC-01 the section Profil shows name, e-mail and both ways to sign out", async () => {
    fakeServer();
    const signOut = vi.fn();
    show("/account/profile", { signOut });
    const profileSection = screen.getByRole("region", { name: "Profil" });
    expect(within(profileSection).getByText("Hallo, Lena")).toBeTruthy();
    expect(within(profileSection).getByText("lena@example.test")).toBeTruthy();
    await userEvent.click(within(profileSection).getByRole("button", { name: "Abmelden" }));
    expect(signOut).toHaveBeenCalledOnce();
    expect(
      within(profileSection).getByRole("button", { name: "Auf allen Geräten abmelden" }),
    ).toBeTruthy();
  });

  it("US-QS-17 · US-ACC-01 a sign-in error stays visible in the section Profil", () => {
    fakeServer();
    show("/account/profile", { error: "Die Abmeldung ist fehlgeschlagen." });
    expect(
      within(screen.getByRole("region", { name: "Profil" })).getByRole("alert").textContent,
    ).toContain("Abmeldung ist fehlgeschlagen");
  });

  it("US-QS-17 · US-ACC-02 settings still save through the section Einstellungen", async () => {
    const puts = fakeServer();
    show("/account/settings");
    const name = await screen.findByLabelText("Anzeigename");
    await userEvent.clear(name);
    await userEvent.type(name, "Lena L");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.["displayName"]).toBe("Lena L");
  });

  it("US-QS-17 · P-09 the section Einstellungen shows a skeleton with one status while loading", () => {
    fakeServer();
    show("/account/settings");
    const section = screen.getByRole("region", { name: "Einstellungen" });
    expect(within(section).getByRole("status").textContent).toContain(
      "Einstellungen werden geladen",
    );
  });

  it("US-QS-17 · P-10 failing settings show their error with a retry", async () => {
    fakeServer(500);
    show("/account/settings");
    const section = screen.getByRole("region", { name: "Einstellungen" });
    expect(await within(section).findByRole("button", { name: /Erneut versuchen/ })).toBeTruthy();
  });

  it("US-QS-17 · US-LIC-01 the section Einstellungen has a link to Standorte und Lichtzonen in the Sammlung", async () => {
    fakeServer();
    show("/account/settings");
    await screen.findByLabelText("Anzeigename");
    const link = screen.getByRole("link", { name: "Standorte und Lichtzonen verwalten" });
    expect(link.getAttribute("href")).toBe("/collection?view=plants&manage=locations");
  });

  it("US-QS-17 · US-QS-05 the section Was wird gemessen? names what is recorded about the use", () => {
    fakeServer();
    show("/account/measured");
    const section = within(screen.getByRole("region", { name: "Was wird gemessen?" }));
    expect(section.getByText(/Keine Klickzählung und keine Nutzungsanalyse/)).toBeTruthy();
    expect(section.getByText(/wann du zuletzt aktiv warst/)).toBeTruthy();
    expect(section.getByText(/nur die Zahl der aktiven Konten/)).toBeTruthy();
    expect(section.getByText(/Ort- und Kameradaten/)).toBeTruthy();
    expect(section.getByText(/Standort, Notizen, Behandlungen/)).toBeTruthy();
  });

  it("US-QS-17 · US-ONB-05 the app hands the locked rows of AI access and the achievement parts to their sections", async () => {
    fakeServer();
    const locks = (ids: readonly string[]) => <p>{`Zeile ${ids.join(",")}`}</p>;
    const view = (path: string) =>
      render(
        <MemoryRouter initialEntries={[path]}>
          <AccountArea
            api="http://api"
            token={async () => "tok"}
            account={account}
            onSignOut={() => undefined}
            onEverywhereSignOut={() => undefined}
            locks={locks}
          />
        </MemoryRouter>,
      );
    view("/account/ai-clients");
    expect(await screen.findByText("Zeile ai_access")).toBeTruthy();
    cleanup();
    view("/account/achievements");
    expect(await screen.findByText("Zeile care_rhythm,anniversaries,year_in_review")).toBeTruthy();
  });

  it("US-QS-17 · US-ONB-06 the section Was die App kann shows the overview of the shell", () => {
    fakeServer();
    show("/account/functions", { overview: true });
    expect(
      within(screen.getByRole("region", { name: "Was die App kann" })).getByText("Übersicht"),
    ).toBeTruthy();
  });

  it("US-QS-17 · US-ONB-06 without an overview its address leads to the index", () => {
    fakeServer();
    show("/account/functions");
    expect(screen.getByTestId("address").textContent).toBe("/account");
  });
});

describe("US-QS-17 the address names a section", () => {
  it.each([
    ["profile", "Profil"],
    ["settings", "Einstellungen"],
    ["data", "Meine Daten"],
  ])("US-QS-17 /account/%s focuses the heading %s", async (segment, name) => {
    fakeServer();
    show(`/account/${segment}`);
    const heading = screen.getByRole("heading", { level: 1, name });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it.each([
    ["#profil", "/account/profile"],
    ["#einstellungen", "/account/settings"],
    ["#erfolge", "/account/achievements"],
    ["#erinnerungen", "/account/reminders"],
    ["#ki-clients", "/account/ai-clients"],
    ["#gemessen", "/account/measured"],
    ["#daten", "/account/data"],
  ])(
    "US-QS-17 the former address /account%s opens %s and replaces the address",
    async (hash, to) => {
      fakeServer();
      show(`/account${hash}`);
      expect(screen.getByTestId("address").textContent).toBe(to);
    },
  );

  it("US-QS-17 an unknown anchor or section shows the index", () => {
    fakeServer();
    show("/account#gibt-es-nicht");
    expect(screen.getByTestId("address").textContent).toBe("/account#gibt-es-nicht");
    cleanup();
    show("/account/gibt-es-nicht");
    expect(screen.getByTestId("address").textContent).toBe("/account");
  });

  it("US-QS-17 Back to the index puts the focus on the row the keeper came from", async () => {
    fakeServer();
    show();
    const row = await screen.findByRole("link", { name: /^Erinnerungen/ });
    await userEvent.click(row);
    const heading = await screen.findByRole("heading", { level: 1, name: "Erinnerungen" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await userEvent.click(screen.getByRole("link", { name: "Konto" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("link", { name: /^Erinnerungen/ })),
    );
  });
});
