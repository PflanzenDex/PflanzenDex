// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider, type FeatureStates } from "@/shared/data";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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
  it("US-QS-17 · US-QS-15 Konto is one screen: its frame carries data-fit-screen, so main scrolls inside itself at a larger text size (DS-61, issue 1019)", async () => {
    fakeServer();
    show("/account");
    await screen.findByRole("navigation", { name: "Abschnitte von Konto" });
    expect(document.querySelector("[data-fit-screen]")).not.toBeNull();
  });

  it("US-QS-17 · US-ACC-01 a section has one h1 with its name and a way back Konto", async () => {
    fakeServer();
    show("/account/reminders");
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual([
      "Erinnerungen",
    ]);
    expect(screen.getByRole("link", { name: "Zurück zu Konto" }).getAttribute("href")).toBe(
      "/account",
    );
    await screen.findByRole("region", { name: "Erinnerungen" });
  });

  it("US-MON-08 the section Erinnerungen names its quiet window Erinnerungspause, not Ruhezeit (issue 897)", async () => {
    fakeServer();
    show("/account/reminders");
    const region = await screen.findByRole("region", { name: "Erinnerungen" });
    expect(await within(region).findByText("Uhrzeit, Erinnerungspause und Messung")).toBeTruthy();
    expect(region.textContent).not.toContain("Ruhezeit");
  });

  it("US-QS-17 · US-ACC-01 the section Profil shows name and e-mail and no sign-out that skips the confirmation (issue 1098)", async () => {
    fakeServer();
    const signOut = vi.fn();
    show("/account/profile", { signOut });
    const profileSection = screen.getByRole("region", { name: "Profil" });
    expect(await within(profileSection).findByText("Hallo, Lena")).toBeTruthy();
    expect(within(profileSection).getByText("lena@example.test")).toBeTruthy();
    // The one way out is "Abmelden…" in the index, which asks first; nothing signs out with a single tap.
    expect(within(profileSection).queryByRole("button", { name: /abmelden/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Abmelden" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Auf allen Geräten abmelden" })).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("US-QS-17 · US-ACC-01 a sign-in error stays visible in the section Profil", async () => {
    fakeServer();
    show("/account/profile", { error: "Die Abmeldung ist fehlgeschlagen." });
    expect(
      (await within(screen.getByRole("region", { name: "Profil" })).findByRole("alert"))
        .textContent,
    ).toContain("Abmeldung ist fehlgeschlagen");
  });

  it("US-ACC-01 a failed sign-out shows its error in the sign-out dialog, which stays open for another try", async () => {
    fakeServer();
    const signOut = vi.fn();
    show("/account", { signOut, error: "Abmelden hat nicht geklappt: Prüfe deine Verbindung." });
    await userEvent.click(screen.getByRole("button", { name: "Abmelden…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("alert").textContent).toContain("Abmelden hat nicht geklappt");
    expect(within(dialog).getByRole("button", { name: "Abmelden" })).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("US-QS-17 · US-ACC-02 settings still save through the section Einstellungen", async () => {
    const puts = fakeServer();
    show("/account/settings?sheet=profile");
    const name = await screen.findByLabelText("Anzeigename");
    await userEvent.clear(name);
    await userEvent.type(name, "Lena L");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.["displayName"]).toBe("Lena L");
  });

  it("US-QS-08 closing a layer of a section gives the focus back to its row, not to the heading (issue 1315)", async () => {
    fakeServer();
    show("/account/settings");
    const row = await screen.findByRole("button", { name: /^Profil/ });
    await userEvent.click(row);
    await screen.findByLabelText("Anzeigename");
    await userEvent.keyboard("{Escape}");
    await vi.waitFor(() => expect(screen.queryByLabelText("Anzeigename")).toBeNull());
    await vi.waitFor(() => expect(document.activeElement?.textContent).toContain("Profil"));
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
    await screen.findByRole("button", { name: /^Profil/ });
    const link = screen.getByRole("link", { name: "Standorte und Lichtzonen verwalten" });
    expect(link.getAttribute("href")).toBe("/collection?view=plants&manage=locations");
  });

  it("US-QS-17 · US-QS-05 the section Was wird gemessen? names what is recorded about the use", async () => {
    fakeServer();
    show("/account/measured");
    const section = within(screen.getByRole("region", { name: "Was wird gemessen?" }));
    expect(await section.findByText(/Keine Klickzählung und keine Nutzungsanalyse/)).toBeTruthy();
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
    await userEvent.click(screen.getByRole("link", { name: "Zurück zu Konto" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("link", { name: /^Erinnerungen/ })),
    );
  });
});

describe("US-QS-15 · US-QS-17 Konto opens Einstellungen in the pane on a wide screen", () => {
  afterEach(() => setViewportWidth(390));

  /** The column of the index: the wrapper of its navigation. */
  const indexColumn = () =>
    screen.getByRole("navigation", { name: "Abschnitte von Konto" }).parentElement as HTMLElement;

  it("US-QS-15 · US-QS-17 from 1280 px /account shows Einstellungen in the pane beside the index, never the placeholder (#1027)", async () => {
    setViewportWidth(1280);
    fakeServer();
    show("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Einstellungen" })).toBeTruthy();
    expect(screen.queryByText("Wähle links einen Abschnitt.")).toBeNull();
    expect(screen.getByTestId("address").textContent).toBe("/account");
    expect(indexColumn().className).not.toContain("hidden");
  });

  it("US-QS-15 · US-QS-17 at 1024 px the index stays visible beside the default Einstellungen (#1027)", async () => {
    setViewportWidth(1024);
    fakeServer();
    show("/account");
    await screen.findByRole("heading", { level: 1, name: "Einstellungen" });
    expect(indexColumn().className).not.toContain("hidden");
  });

  it("US-QS-17 the default Einstellungen takes no focus on arrival (#1027)", async () => {
    setViewportWidth(1280);
    fakeServer();
    show("/account");
    const heading = await screen.findByRole("heading", { level: 1, name: "Einstellungen" });
    expect(document.activeElement).not.toBe(heading);
  });

  it("US-QS-17 · US-QS-15 below 1024 px /account shows the index alone, no section", async () => {
    setViewportWidth(390);
    fakeServer();
    show("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Konto" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1, name: "Einstellungen" })).toBeNull();
  });

  it("US-QS-15 · US-QS-17 a section beside the index keeps its layer frame free to widen from 1024 px (nested frame, #1027)", async () => {
    setViewportWidth(1440);
    fakeServer();
    show("/account/reminders");
    const heading = await screen.findByRole("heading", { level: 1, name: "Erinnerungen" });
    const frame = heading.closest("[data-layer-host]") as HTMLElement;
    const content = frame.firstElementChild as HTMLElement;
    expect(content.className).toContain("lg:max-w-none");
  });
});

describe("US-QS-15 the index yields while a settings layer is open, from 1280 px", () => {
  beforeEach(() => setViewportWidth(1280));
  afterEach(() => setViewportWidth(390));

  /** The column of the index: the wrapper of its navigation; it is shown beside the section with `xl:block`. */
  const indexColumn = () =>
    screen.getByRole("navigation", { name: "Abschnitte von Konto" }).parentElement as HTMLElement;
  const shownBesideSection = () => indexColumn().className.includes("xl:block");

  it("US-QS-15 an open settings layer hides the index beside the section", async () => {
    fakeServer();
    show("/account/settings?sheet=profile");
    await screen.findByRole("complementary", { name: "Profil" });
    expect(shownBesideSection()).toBe(false);
  });

  it("US-QS-15 an address with an unknown sheet keeps the index beside the section", async () => {
    fakeServer();
    show("/account/settings?sheet=bogus");
    await screen.findByRole("heading", { level: 1, name: "Einstellungen" });
    expect(shownBesideSection()).toBe(true);
  });

  it("US-QS-15 a settings layer address of another section keeps the index beside it", async () => {
    fakeServer();
    show("/account/profile?sheet=profile");
    await screen.findByRole("heading", { level: 1 });
    expect(shownBesideSection()).toBe(true);
  });

  it("US-QS-15 closing the settings layer brings the index back beside the section", async () => {
    fakeServer();
    show("/account/settings?sheet=profile");
    const pane = await screen.findByRole("complementary", { name: "Profil" });
    await userEvent.click(within(pane).getByRole("button", { name: "Schließen" }));
    await waitFor(() => expect(shownBesideSection()).toBe(true));
  });
});

describe("US-QS-14 · US-QS-17 Konto has exactly one h1 on every width", () => {
  afterEach(() => setViewportWidth(390));

  const headings1 = () => screen.queryAllByRole("heading", { level: 1 }).map((h) => h.textContent);

  it("US-QS-14 · US-QS-17 on a wide screen the index and the default section have one h1 (desktop Konto)", async () => {
    setViewportWidth(1440);
    fakeServer();
    show("/account");
    await screen.findByRole("heading", { level: 1, name: "Einstellungen" });
    expect(headings1()).toEqual(["Einstellungen"]);
  });

  it("US-QS-14 · US-QS-17 on a wide screen a section beside the index keeps one h1, its name", async () => {
    setViewportWidth(1440);
    fakeServer();
    show("/account/profile");
    await screen.findByRole("region", { name: "Profil" });
    expect(headings1()).toEqual(["Profil"]);
  });

  it("US-QS-14 · US-QS-17 on a phone the section Profil has one h1 and the page header's way back", async () => {
    setViewportWidth(390);
    fakeServer();
    show("/account/profile");
    await screen.findByRole("region", { name: "Profil" });
    expect(headings1()).toEqual(["Profil"]);
    expect(screen.getByRole("link", { name: "Zurück zu Konto" }).getAttribute("href")).toBe(
      "/account",
    );
  });

  it("US-QS-14 the index on a phone keeps the one h1 Konto", async () => {
    setViewportWidth(390);
    fakeServer();
    show("/account");
    await screen.findByRole("navigation", { name: "Abschnitte von Konto" });
    expect(headings1()).toEqual(["Konto"]);
  });
});

describe("US-ONB-09 the keeper's switch achievement_views hides the section Erfolge in Konto", () => {
  /** Konto with the keeper's features, the way the signed-in shell gives them to the area. */
  const showWith = (path: string, features: FeatureStates) =>
    render(
      <FeaturesProvider features={features}>
        <MemoryRouter initialEntries={[path]}>
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
  const index = () => screen.findByRole("navigation", { name: "Abschnitte von Konto" });

  it("US-ONB-09 with achievement_views off the index has no row Erfolge and asks nothing of /achievements", async () => {
    fakeServer();
    showWith("/account", { achievement_views: false });
    const list = await index();
    await within(list).findByRole("link", { name: /^Erinnerungen/ });
    expect(within(list).queryByRole("link", { name: /^Erfolge/ })).toBeNull();
    const asked = vi.mocked(fetch).mock.calls.map(([u]) => new URL(String(u)).pathname);
    expect(asked.some((path) => path.startsWith("/achievements"))).toBe(false);
  });

  it("US-ONB-09 with achievement_views on the index has the row Erfolge", async () => {
    fakeServer();
    showWith("/account", { achievement_views: true });
    expect(await within(await index()).findByRole("link", { name: /^Erfolge/ })).toBeTruthy();
  });

  it("US-ONB-09 with achievement_views off the address /account/achievements leads to the index", async () => {
    fakeServer();
    showWith("/account/achievements", { achievement_views: false });
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("/account"));
    expect(screen.queryByRole("heading", { level: 1, name: "Erfolge" })).toBeNull();
  });

  it("US-ONB-09 with achievement_views off the former anchor /account#erfolge does not land on the section", async () => {
    fakeServer();
    showWith("/account#erfolge", { achievement_views: false });
    await waitFor(() => expect(screen.getByTestId("address").textContent).toBe("/account"));
    expect(screen.queryByRole("heading", { level: 1, name: "Erfolge" })).toBeNull();
  });

  it("US-ONB-09 with achievement_views on the address /account/achievements opens the section Erfolge", async () => {
    fakeServer();
    showWith("/account/achievements", { achievement_views: true });
    expect(await screen.findByRole("heading", { level: 1, name: "Erfolge" })).toBeTruthy();
    expect(screen.getByTestId("address").textContent).toBe("/account/achievements");
  });

  it("US-ONB-09 a switch state that is not sent counts as on: the index has the row Erfolge", async () => {
    fakeServer();
    showWith("/account", {});
    expect(await within(await index()).findByRole("link", { name: /^Erfolge/ })).toBeTruthy();
  });
});
