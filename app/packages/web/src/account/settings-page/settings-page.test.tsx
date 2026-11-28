// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { currentTimeZone, setProfileTimeZone } from "../../shared/data";
import {
  ShortcutProvider,
  useShortcuts,
} from "@/shared/platform/device/keyboard/shortcut-provider/shortcut-provider";
import { SettingsPage } from "./settings-page";
import { delayLoads } from "@/shared/ui/skeleton.loading-contract";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";

const PROFILE = {
  displayName: "Anna",
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
  keyboardShortcuts: "plain" as const,
  motion: "system" as const,
};

type Put = { body: Record<string, unknown>; key: string | undefined };

function fakeServer(
  profile: unknown = PROFILE,
  save: (body: unknown) => Promise<Response> = (b) => response(200, b),
) {
  const puts: Put[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/achievements/settings") return response(200, { calmMode: false });
      if (path === "/onboarding/style") return response(200, { style: "few", chosen: true });
      if (path !== "/account/profile") return response(404, {});
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        puts.push({ body, key: (init.headers as Record<string, string>)["Idempotency-Key"] });
        return save(body);
      }
      return typeof profile === "number" ? response(profile, {}) : response(200, profile);
    }),
  );
  return puts;
}
/** The settings; with `sheet` the address names the layer that is open (`?sheet=<group>`). */
const at = (sheet?: string) => `/${sheet ? `?sheet=${sheet}` : ""}`;
// The app shell mounts the announcer above the page; a switch says its save through it (US-QS-32).
const show = (sheet?: string) =>
  render(
    <AnnouncerProvider>
      <MemoryRouter initialEntries={[at(sheet)]}>
        <SettingsPage api="http://api" token={token} />
      </MemoryRouter>
    </AnnouncerProvider>,
  );
/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";
const isOn = (toggle: HTMLElement) => toggle.getAttribute("aria-checked") === "true";

beforeAll(() => setViewportWidth(1024));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setProfileTimeZone(null);
});

describe("US-ACC-02 settings page: display name", () => {
  it("US-QS-32 · SG-SHEET-07 the Profil sheet opens with the focus on its title and no text selected", async () => {
    fakeServer();
    show("profile");
    const name = await screen.findByLabelText<HTMLInputElement>("Anzeigename");
    await waitFor(() => expect(document.activeElement?.tagName).toMatch(/^H[1-3]$/));
    expect(document.activeElement).not.toBe(name);
    expect(name.selectionStart).toBe(name.selectionEnd);
  });

  it("US-ACC-02 shows the saved profile and keeps Save inactive until something changes", async () => {
    fakeServer();
    delayLoads();
    show("profile");
    expect((await screen.findByRole("status")).textContent).toContain("werden geladen");
    expect((await screen.findByLabelText<HTMLInputElement>("Anzeigename")).value).toBe("Anna");
    // Inactive, not disabled: a focused button that turns disabled loses the focus (US-QS-32, PF-045).
    const save = screen.getByRole("button", { name: "Sichern" });
    expect(save.hasAttribute("disabled")).toBe(false);
    expect(save.getAttribute("aria-disabled")).toBe("true");
  });

  it("US-ACC-02 saves a free display name with an Idempotency-Key and confirms it", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.clear(name);
    await user.type(name, "Anna Beispiel");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBeTruthy();
    expect(puts[0]?.body["displayName"]).toBe("Anna Beispiel");
  });

  it("US-QS-32 · F-0085 a cleared display name is refused on the client: its message shows at the field and nothing is sent", async () => {
    const puts = fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          details: [{ field: "displayName", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Gib einen Namen ein.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toContain(alert.id);
    expect(puts).toEqual([]);
  });
});

describe("US-ACC-02 settings page: time zone", () => {
  it("US-ACC-02 prefills the time zone from the device when none is chosen and says so", async () => {
    fakeServer({ ...PROFILE, timeZone: null });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Tokyo",
    } as Intl.ResolvedDateTimeFormatOptions);
    show("profile");
    expect((await screen.findByLabelText<HTMLInputElement>("Zeitzone")).value).toBe("Asia/Tokyo");
    expect(screen.getByText(/Vom Gerät übernommen/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("US-QS-32 · SG-FORM-03 Zeitzone is the last field of the Profil sheet and says done, Anzeigename before it says next", async () => {
    fakeServer();
    const user = userEvent.setup();
    show("profile");
    const zone = await screen.findByLabelText("Zeitzone");
    await user.click(screen.getByLabelText("Anzeigename"));
    expect(screen.getByLabelText("Anzeigename").getAttribute("enterkeyhint")).toBe("next");
    await user.click(zone);
    expect(zone.getAttribute("enterkeyhint")).toBe("done");
  });

  it("US-ACC-02 saving a time zone makes it the zone of all later dates (NFR-08)", async () => {
    fakeServer();
    const user = userEvent.setup();
    show("profile");
    const zone = await screen.findByLabelText("Zeitzone");
    await user.clear(zone);
    await user.type(zone, "America/New_York");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
    expect(currentTimeZone()).toBe("America/New_York");
  });

  it("US-ACC-02 an empty time zone is sent as none", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("profile");
    await user.clear(await screen.findByLabelText("Zeitzone"));
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.body["timeZone"]).toBeNull();
  });

  it("US-ACC-02 a refused time zone stays visible with the German text, marks the field and keeps the input", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          details: [{ field: "timeZone", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    show("profile");
    const zone = await screen.findByLabelText("Zeitzone");
    await user.clear(zone);
    await user.type(zone, "Mars/Olympus");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Wähle eine Zeitzone aus der Liste.",
    );
    expect(zone.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Anzeigename").getAttribute("aria-invalid")).not.toBe("true");
    expect((zone as HTMLInputElement).value).toBe("Mars/Olympus");
    expect(currentTimeZone()).not.toBe("Mars/Olympus");
  });

  const refuse = (field?: string) =>
    response(400, {
      error: {
        code: "input.invalid",
        text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
        ...(field ? { details: [{ field, code: "input.invalid" }] } : {}),
      },
    });

  it("US-ACC-02 a refused field points at the error text (aria-describedby) and gets the focus", async () => {
    fakeServer(PROFILE, () => refuse("timeZone"));
    const user = userEvent.setup();
    show("profile");
    const zone = await screen.findByLabelText("Zeitzone");
    await user.clear(zone);
    await user.type(zone, "Mars/Olympus");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.id).not.toBe("");
    expect(zone.getAttribute("aria-describedby")).toContain(alert.id);
    expect(
      screen.getByLabelText("Anzeigename").getAttribute("aria-describedby") ?? "",
    ).not.toContain(alert.id);
    expect(document.activeElement).toBe(zone);
  });

  it("US-ACC-02 with two refused fields the first one in the form gets the focus", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          details: [
            { field: "timeZone", code: "input.invalid" },
            { field: "displayName", code: "input.invalid" },
          ],
        },
      }),
    );
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.type(name, "x");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await screen.findAllByRole("alert");
    expect(document.activeElement).toBe(name);
  });

  it("US-ACC-02 a refusal without a field moves the focus to the error text", async () => {
    fakeServer(PROFILE, () => refuse());
    const user = userEvent.setup();
    show("profile");
    await user.type(await screen.findByLabelText("Anzeigename"), "x");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    expect(document.activeElement).toBe(await screen.findByRole("alert"));
  });
});

describe("US-ACC-02 settings page: notifications and global switches", () => {
  it("US-ACC-02 · US-QS-17 a switch saves at once and sends all seven occasions", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("notifications");
    await user.click(await screen.findByRole("switch", { name: "Behandlungen" }));
    await vi.waitFor(() => expect(announced()).toBe("Gesichert."));
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body["notifications"]).toEqual({ ...PROFILE.notifications, treatment: false });
    await user.click(screen.getByRole("switch", { name: "Tausch" }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]?.body["notifications"]).toEqual({
      ...PROFILE.notifications,
      treatment: false,
      swap: false,
    });
  });

  it("US-ACC-02 offers a switch for every occasion", async () => {
    fakeServer();
    show("notifications");
    for (const name of [
      "Pflegephasen",
      "Behandlungen",
      "Messungen",
      "Gießen",
      "Tausch",
      "Freunde",
      "Geräte-Prüfung",
    ])
      expect(await screen.findByRole("switch", { name })).toBeTruthy();
  });

  it("US-ACC-02 · US-QS-17 · SG-CTRL-05 'Alles privat' and 'Empfehlungen zeigen' save at once; switching the second off stores 'no recommendations'", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("privacy");
    await user.click(await screen.findByRole("switch", { name: "Alles privat" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    await user.click(screen.getByRole("switch", { name: "Empfehlungen zeigen" }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]?.body).toMatchObject({ everythingPrivate: true, noRecommendations: true });
  });

  it("US-POK-14 the rarity consent is off by default and is saved when switched on", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("privacy");
    const box = await screen.findByRole("switch", {
      name: "Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen",
    });
    expect(isOn(box)).toBe(false);
    await user.click(box);
    await vi.waitFor(() => expect(announced()).toBe("Gesichert."));
    expect(puts[0]?.body).toMatchObject({ rarityConsent: true });
  });

  it("US-ACC-02 a default account shows 'Alles privat' off and 'Empfehlungen zeigen' on", async () => {
    fakeServer();
    show("privacy");
    expect(isOn(await screen.findByRole("switch", { name: "Alles privat" }))).toBe(false);
    expect(isOn(screen.getByRole("switch", { name: "Empfehlungen zeigen" }))).toBe(true);
  });

  it("US-QS-32 · SG-CTRL-02 the privacy layer is three switch rows with one line each and no checkbox or 'Mehr erfahren'", async () => {
    fakeServer();
    show("privacy");
    await screen.findByRole("switch", { name: "Alles privat" });
    expect(screen.getAllByRole("switch")).toHaveLength(3);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("Mehr erfahren")).toBeNull();
  });

  it("US-QS-17 · P-10 a refused switch keeps its stored state and shows the German text of the error code", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: { code: "input.invalid", text: "RAW SERVER TEXT" },
      }),
    );
    const user = userEvent.setup();
    show("notifications");
    const box = await screen.findByRole("switch", { name: "Tausch" });
    await user.click(box);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Die Eingabe ist ungültig");
    // The error stands at the row of the switch (SG-FEED-02).
    expect(box.closest("li")?.contains(alert)).toBe(true);
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(isOn(box)).toBe(true);
  });
});

describe("US-ACC-02 settings page: errors", () => {
  it("US-ACC-02 a load failure shows the text and 'Erneut versuchen'", async () => {
    fakeServer(500);
    show();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("US-ACC-02 without a token nothing is sent and the user is asked to sign in", async () => {
    const puts = fakeServer();
    const calls = vi.mocked(fetch);
    render(
      <MemoryRouter>
        <SettingsPage api="http://api" token={async () => undefined} />
      </MemoryRouter>,
    );
    expect((await screen.findByRole("alert")).textContent).toContain("melde dich neu an");
    expect(calls).not.toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it("US-ACC-02 a token that vanishes before saving keeps the input and asks to sign in", async () => {
    fakeServer();
    const user = userEvent.setup();
    let available = true;
    render(
      <MemoryRouter initialEntries={[at("profile")]}>
        <SettingsPage api="http://api" token={async () => (available ? "tok" : undefined)} />
      </MemoryRouter>,
    );
    const name = await screen.findByLabelText("Anzeigename");
    await user.type(name, "x");
    available = false;
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("melde dich an");
    expect((name as HTMLInputElement).value).toBe("Annax");
  });
});

describe("US-ACC-02 · DS-48 states and primitives", () => {
  it("US-ACC-02 · DS-52 while loading, a skeleton of the form stands in with one status and hidden blocks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    delayLoads();
    const { container } = show("profile");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Einstellungen werden geladen",
    );
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(3);
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("US-ACC-02 · DS-49 a refusal shows the German text of its error code, never the raw server text", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "RAW SERVER TEXT",
          details: [{ field: "displayName", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    show("profile");
    await user.type(await screen.findByLabelText("Anzeigename"), "x");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await screen.findAllByRole("alert");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(document.body.textContent).toContain("Gib einen Namen ein, höchstens 80 Zeichen.");
    expect(document.body.textContent).not.toContain("Die Eingabe ist ungültig");
  });

  it("US-ACC-02 · DS-48 editing a refused field takes its error away", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "x",
          details: [{ field: "displayName", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.type(name, "x");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await screen.findAllByRole("alert");
    await user.type(name, "y");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("US-WUN-02 settings page: buffer of the wishlist warning", () => {
  const group = async () =>
    screen.findByRole("group", { name: "Mindestzahl offener Wünsche je Zone" });
  const value = (g: HTMLElement) => g.querySelector("output")?.textContent;

  it("US-WUN-02 · US-QS-32 shows the saved buffer as a stepper and says what it does and that 0 switches the warning off", async () => {
    fakeServer({ ...PROFILE, replenishBuffer: 4 });
    show("wishlist");
    expect(value(await group())).toBe("4");
    expect(screen.getByText(/0 schaltet die Warnung aus/)).toBeTruthy();
    // A whole number from 0 to 10 is no text field: nothing is typed and no phone keyboard opens (SG-CTRL-04).
    expect(screen.queryByRole("textbox", { name: /Mindestzahl/ })).toBeNull();
  });

  it("US-WUN-02 · US-QS-32 saves the number chosen with Mehr and Weniger with the profile", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("wishlist");
    const g = await group();
    await user.click(within(g).getByRole("button", { name: "Mehr" }));
    await user.click(within(g).getByRole("button", { name: "Mehr" }));
    await user.click(within(g).getByRole("button", { name: "Weniger" }));
    expect(value(g)).toBe("3");
    expect(puts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
    expect(puts[0]?.body["replenishBuffer"]).toBe(3);
  });

  it("US-WUN-02 · SG-CTRL-04 the stepper stops at 0 and at 10, so no wrong number can be sent", async () => {
    const puts = fakeServer({ ...PROFILE, replenishBuffer: 10 });
    const user = userEvent.setup();
    show("wishlist");
    const g = await group();
    await user.click(within(g).getByRole("button", { name: "Mehr" }));
    expect(value(g)).toBe("10");
    for (let i = 0; i < 12; i += 1)
      await user.click(within(g).getByRole("button", { name: "Weniger" }));
    expect(value(g)).toBe("0");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.body["replenishBuffer"]).toBe(0);
  });

  it("US-WUN-02 a server refusal of the field shows the fix at the stepper and links it (P-10)", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "x",
          details: [{ field: "replenishBuffer", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    show("wishlist");
    const g = await group();
    await user.click(within(g).getByRole("button", { name: "Mehr" }));
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => a.textContent?.includes("ganze Zahl von 0 bis 10"))).toBe(true);
    expect(g.getAttribute("aria-describedby")).toBeTruthy();
  });
});

describe("US-LIC-03 settings page: thresholds of the position recommendation", () => {
  const LABELS = ["Direkt unter der Lampe ab", "Sehr nah ab", "Nah ab", "Mittlerer Abstand ab"];
  const fields = async () =>
    Promise.all(LABELS.map((label) => screen.findByLabelText<HTMLInputElement>(label)));
  const values = async () => (await fields()).map((input) => input.value);
  const field = (label: string) => screen.findByLabelText<HTMLInputElement>(label);

  it("US-LIC-03 shows four labelled lux fields with German grouping and the standard values as an assumption", async () => {
    fakeServer();
    show("light");
    expect(await values()).toEqual(["50.000", "15.000", "8.000", "4.000"]);
    expect(screen.getAllByText("Lux")).toHaveLength(4);
    expect(screen.getByText(/eine Annahme/)).toBeTruthy();
  });

  it("US-LIC-03 'Sichern' is enabled before anything changed; an unchanged save answers with a message and sends nothing", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("light");
    await fields();
    const save = screen.getByRole("button", { name: "Sichern" });
    expect(save.hasAttribute("disabled")).toBe(false);
    await user.click(save);
    await waitFor(() =>
      expect(announced()).toBe("Keine Änderung: Die Werte sind schon gesichert."),
    );
    expect(puts).toHaveLength(0);
  });

  it("US-LIC-03 saves four whole values as numbers with the profile, typed with or without grouping", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("light");
    await fields();
    const second = await field("Sehr nah ab");
    await user.clear(second);
    await user.type(second, "16000");
    const fourth = await field("Mittlerer Abstand ab");
    await user.clear(fourth);
    await user.type(fourth, "3.000");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
    expect(puts[0]?.body["positionThresholds"]).toEqual([50000, 16000, 8000, 3000]);
    expect(await values()).toEqual(["50.000", "16.000", "8.000", "3.000"]);
  });

  it("US-LIC-03 keeps the standard values unset when only another setting changes", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("privacy");
    await user.click(await screen.findByRole("switch", { name: "Alles privat" }));
    await vi.waitFor(() => expect(announced()).toBe("Gesichert."));
    expect(puts[0]?.body["positionThresholds"]).toBeNull();
  });

  it.each([
    ["Sehr nah ab", "60000", "Der Wert muss kleiner sein als der Wert darüber."],
    ["Mittlerer Abstand ab", "9000", "Der Wert muss kleiner sein als der Wert darüber."],
    ["Nah ab", "abc", "Gib eine ganze Zahl von 1 bis 200.000 Lux ein."],
    ["Direkt unter der Lampe ab", "250000", "Gib eine ganze Zahl von 1 bis 200.000 Lux ein."],
  ])(
    "US-LIC-03 refuses %j in '%s' before sending, names the field and answers the save",
    async (label, text, message) => {
      const puts = fakeServer();
      const user = userEvent.setup();
      show("light");
      const input = await field(label);
      await user.clear(input);
      await user.type(input, text);
      await user.click(screen.getByRole("button", { name: "Sichern" }));
      expect(await screen.findByText(message)).toBeTruthy();
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(screen.getByText("Prüfe die markierten Felder.")).toBeTruthy();
      expect(puts).toHaveLength(0);
    },
  );

  it("US-LIC-03 a refusal that names the thresholds marks all four fields", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "x",
          details: [{ field: "positionThresholds", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    show("light");
    const first = await field("Direkt unter der Lampe ab");
    await user.clear(first);
    await user.type(first, "60000");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(first.getAttribute("aria-invalid")).toBe("true"));
    for (const input of await fields()) expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("US-ACH-08 calm mode on the settings page", () => {
  it("US-ACH-08 · US-QS-32 the settings list has the calm mode as its own switch row, off by default, outside every layer", async () => {
    fakeServer();
    show();
    const toggle = await screen.findByRole("switch", { name: "Ruhemodus" });
    expect(isOn(toggle)).toBe(false);
    expect(screen.queryByRole("heading", { name: "Wie nutzt du die App?" })).toBeNull();
  });

  it("US-ACH-08 · US-QS-32 the layer 'Wie nutzt du die App?' keeps only the usage style", async () => {
    fakeServer();
    show("style");
    await screen.findByRole("combobox", { name: "Wie nutzt du die App?" });
    // The calm mode, the shortcuts and the motion stand on the settings list, not in this layer.
    const title = screen.getByRole("heading", { name: "Wie nutzt du die App?" });
    const layer = document.querySelector<HTMLElement>(`[aria-labelledby="${title.id}"]`);
    if (!layer) throw new Error("the layer of the heading is missing");
    expect(within(layer).getAllByRole("combobox")).toHaveLength(1);
    expect(within(layer).queryByRole("switch")).toBeNull();
    expect(within(layer).queryByText("Tastenkürzel")).toBeNull();
    expect(within(layer).queryByText("Bewegung")).toBeNull();
  });
});

describe("US-QS-15 · US-QS-32 the settings list holds nine rows and scrolls in its own marked region (DS-58, DS-61)", () => {
  it("US-QS-15 the rows, the calm mode, the shortcuts and the motion stand in one data-scroll-region, so the frame does not scroll", async () => {
    fakeServer();
    show();
    const calm = await screen.findByRole("switch", { name: "Ruhemodus" });
    const region = calm.closest("[data-scroll-region]");
    expect(region).not.toBeNull();
    expect(region?.contains(screen.getByRole("button", { name: /^Profil/ }))).toBe(true);
    expect(region?.contains(screen.getByRole("combobox", { name: "Tastenkürzel" }))).toBe(true);
    expect(region?.contains(screen.getByRole("combobox", { name: "Bewegung" }))).toBe(true);
  });
});

describe("US-ONB-03 keeper style on the profile page", () => {
  it("US-ONB-03 the profile offers 'Wie nutzt du die App?' with the stored style", async () => {
    fakeServer();
    show("style");
    const select = await screen.findByRole<HTMLSelectElement>("combobox", {
      name: "Wie nutzt du die App?",
    });
    expect(select.value).toBe("few");
  });
});

function Where() {
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="where">{useLocation().search}</output>
      <button onClick={() => void navigate(-1)}>Browser zurück</button>
    </>
  );
}
const showWithBack = () =>
  render(
    <MemoryRouter>
      <Where />
      <SettingsPage api="http://api" token={token} />
    </MemoryRouter>,
  );

describe("US-QS-17 settings as a list of groups", () => {
  const row = (title: string) =>
    screen.findByRole("button", { name: (name) => name.startsWith(title) });

  it("US-QS-17 lists the six groups, each with its current value", async () => {
    fakeServer();
    show();
    expect((await row("Profil")).textContent).toContain("Anna · Europe/\u200bBerlin");
    expect((await row("Benachrichtigungen")).textContent).toContain("noch nicht eingerichtet");
    expect((await row("Datenschutz und Empfehlungen")).textContent).toContain("Standard");
    expect((await row("Wie nutzt du die App?")).textContent).toContain("ein paar Pflanzen");
    expect((await row("Wunschliste")).textContent).toContain("mind. 2 je Zone");
    expect((await row("Licht")).textContent).toContain("Standard-Schwellen");
    expect(screen.queryByLabelText("Anzeigename")).toBeNull();
  });

  it("US-QS-32 · F-0315 an unknown name and an unsaved zone read Name unbekannt and Zeitzone vom Gerät, never a bare unbekannt", async () => {
    fakeServer({ ...PROFILE, displayName: null, timeZone: null });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Europe/Berlin",
    } as Intl.ResolvedDateTimeFormatOptions);
    try {
      show();
      const text = (await row("Profil")).textContent ?? "";
      expect(text).toContain("Name unbekannt · Zeitzone vom Gerät");
      expect(text).not.toMatch(/(^|[^ ])unbekannt · /);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("US-QS-32 · F-0315 without a saved zone and without a device zone the row reads Zeitzone unbekannt", async () => {
    fakeServer({ ...PROFILE, timeZone: null });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: undefined,
    } as unknown as Intl.ResolvedDateTimeFormatOptions);
    try {
      show();
      expect((await row("Profil")).textContent).toContain("Anna · Zeitzone unbekannt");
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("US-QS-17 summarises what is on in the privacy group and own light thresholds", async () => {
    fakeServer({
      ...PROFILE,
      everythingPrivate: true,
      rarityConsent: true,
      positionThresholds: [60000, 20000, 9000, 3000],
      notifications: { ...PROFILE.notifications, swap: false },
    });
    show();
    expect((await row("Datenschutz und Empfehlungen")).textContent).toContain(
      "alles privat · Seltenheit zählt mit",
    );
    expect((await row("Licht")).textContent).toContain("eigene Schwellen");
    expect((await row("Benachrichtigungen")).textContent).toContain("noch nicht eingerichtet");
  });

  it("US-QS-32 the row Benachrichtigungen says noch nicht eingerichtet and counts no switch, also with every switch off", async () => {
    fakeServer({
      ...PROFILE,
      notifications: {
        phase: false,
        treatment: false,
        measurement: false,
        watering: false,
        swap: false,
        friends: false,
        equipment: false,
      },
    });
    show();
    const text = (await row("Benachrichtigungen")).textContent ?? "";
    expect(text).toContain("noch nicht eingerichtet");
    expect(text).not.toMatch(/von \d+ an/);
  });

  it("US-QS-32 · P-08 a failing style load reads Nicht geladen beside its row, with a retry that loads it again, never unbekannt", async () => {
    fakeServer();
    const ok = globalThis.fetch;
    let failing = true;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) =>
        new URL(String(url)).pathname === "/onboarding/style" && failing
          ? response(500, {})
          : ok(url, init),
      ),
    );
    show();
    const retry = await screen.findByRole("button", {
      name: "Erneut versuchen: Wie nutzt du die App?",
    });
    const rowText = screen.getByRole("button", { name: /^Wie nutzt/ }).textContent ?? "";
    expect(rowText).toContain("Nicht geladen");
    expect(rowText).not.toContain("unbekannt");
    expect((await row("Profil")).textContent).toContain("Anna");
    failing = false;
    await userEvent.click(retry);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Wie nutzt/ }).textContent).toContain(
        "ein paar Pflanzen",
      ),
    );
    expect(
      screen.queryByRole("button", { name: "Erneut versuchen: Wie nutzt du die App?" }),
    ).toBeNull();
  });

  it.each([
    ["profile", "Profil", /Anzeigename/],
    ["notifications", "Benachrichtigungen", /Gießen/],
    ["privacy", "Datenschutz und Empfehlungen", /Alles privat/],
    ["style", "Wie nutzt du die App?", /Wie nutzt du die App\?/],
    ["wishlist", "Wunschliste", /Mindestzahl offener Wünsche/],
    ["light", "Licht", /Direkt unter der Lampe ab/],
  ])("US-QS-17 the address ?sheet=%s opens the layer %s", async (sheet, title, content) => {
    fakeServer();
    show(sheet);
    expect(await screen.findByLabelText(content)).toBeTruthy();
    expect(screen.getByRole("heading", { name: title })).toBeTruthy();
  });

  it("US-QS-17 a row opens its layer, Back closes it and the list stays", async () => {
    fakeServer();
    const user = userEvent.setup();
    showWithBack();
    await user.click(await row("Wunschliste"));
    expect(screen.getByTestId("where").textContent).toBe("?sheet=wishlist");
    expect(await screen.findByRole("group", { name: /Mindestzahl offener Wünsche/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Browser zurück" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: /Mindestzahl/ })).toBeNull());
    expect(screen.getByTestId("where").textContent).toBe("");
    expect(await row("Wunschliste")).toBeTruthy();
  });

  it("US-QS-17 on a phone the layer is a sheet and a closed layer holds no form", async () => {
    setViewportWidth(360);
    fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(await row("Licht"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Direkt unter der Lampe ab")).toBeTruthy();
    setViewportWidth(1024);
  });

  it("US-QS-17 Profil saves only with 'Sichern' and the row shows the new value afterwards", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.clear(name);
    await user.type(name, "Berta");
    expect(puts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
    expect(puts).toHaveLength(1);
    expect((await row("Profil")).textContent).toContain("Berta · Europe/\u200bBerlin");
  });

  it("US-QS-17 Wunschliste and Licht save only their own field with the rest of the stored profile", async () => {
    const puts = fakeServer({ ...PROFILE, displayName: null });
    const user = userEvent.setup();
    show("wishlist");
    const stepper = await screen.findByRole("group", { name: /Mindestzahl offener Wünsche/ });
    await user.click(within(stepper).getByRole("button", { name: "Mehr" }));
    await user.click(within(stepper).getByRole("button", { name: "Mehr" }));
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.body).toMatchObject({
      replenishBuffer: 4,
      displayName: null,
      timeZone: "Europe/Berlin",
      positionThresholds: null,
    });
  });

  it("US-QS-17 · P-10 a refused save of a group shows the German text of its error code", async () => {
    fakeServer(PROFILE, () =>
      response(400, { error: { code: "input.invalid", text: "RAW SERVER TEXT" } }),
    );
    const user = userEvent.setup();
    show("light");
    const input = await screen.findByLabelText("Sehr nah ab");
    await user.clear(input);
    await user.type(input, "16000");
    await user.click(screen.getByRole("button", { name: "Sichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Die Eingabe ist ungültig");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
  });
});

/** Shows the mode the shortcut provider holds, so a test sees the change take effect at once (US-QS-11). */
function ModeOut() {
  return <output data-testid="mode">{useShortcuts().mode ?? "unbekannt"}</output>;
}

describe("US-QS-11 settings: keyboard shortcuts", () => {
  const targets = {
    search: "/discover?view=catalog",
    today: "/today",
    collection: "/collection",
    species: "/collection?view=species",
    wishlist: "/collection?view=wishlist",
  };
  const showWithProvider = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <ShortcutProvider mode="plain" targets={targets}>
          <ModeOut />
          <SettingsPage api="http://api" token={token} />
        </ShortcutProvider>
      </MemoryRouter>,
    );

  it("US-QS-11 the choice 'Alt und Umschalt' saves at once with the profile and takes effect at once", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    showWithProvider();
    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Tastenkürzel" }),
      "Alt und Umschalt",
    );
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.body["keyboardShortcuts"]).toBe("modifier");
    expect(puts[0]?.body["notifications"]).toEqual(PROFILE.notifications);
    expect(screen.getByTestId("mode").textContent).toBe("modifier");
    await waitFor(() =>
      expect(
        (screen.getByRole("combobox", { name: "Tastenkürzel" }) as HTMLSelectElement).value,
      ).toBe("modifier"),
    );
  });

  it("US-QS-11 the choice 'Aus' turns every shortcut off; choosing the stored one again sends nothing", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    showWithProvider();
    const field = await screen.findByRole("combobox", { name: "Tastenkürzel" });
    await user.selectOptions(field, "Aus");
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.body["keyboardShortcuts"]).toBe("disabled");
    expect(screen.getByTestId("mode").textContent).toBe("disabled");
    await waitFor(() => expect((field as HTMLSelectElement).value).toBe("disabled"));
    await user.selectOptions(field, "Aus");
    expect(puts).toHaveLength(1);
  });

  it("US-QS-11 · P-10 a refused choice keeps the stored mode and shows the German text of the error code", async () => {
    const puts = fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          details: [{ field: "keyboardShortcuts", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    showWithProvider();
    await user.selectOptions(await screen.findByRole("combobox", { name: "Tastenkürzel" }), "Aus");
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("mode").textContent).toBe("plain");
  });
});

describe("US-QS-33 settings: motion", () => {
  const root = document.documentElement;
  afterEach(() => {
    delete root.dataset.motion;
    window.localStorage.clear();
  });
  const showStyle = () =>
    render(
      <MemoryRouter initialEntries={["/"]}>
        <SettingsPage api="http://api" token={token} />
      </MemoryRouter>,
    );

  it("US-QS-33 · US-QS-32 the settings list has its own row 'Bewegung' with 'Wie auf dem Gerät' (default) and 'Bewegung aus' and one line of help", async () => {
    fakeServer();
    showStyle();
    const field = (await screen.findByRole("combobox", { name: "Bewegung" })) as HTMLSelectElement;
    expect([...field.options].map((o) => o.text)).toEqual(["Wie auf dem Gerät", "Bewegung aus"]);
    expect(field.value).toBe("system");
    expect(
      screen.getByText(
        "Aus: Ansichten, Karten und Ebenen wechseln ohne Animation. Alles bleibt erreichbar.",
      ),
    ).toBeTruthy();
  });

  it("US-QS-33 'Bewegung aus' saves with the profile and applies at once on the open screen, without a reload", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    showStyle();
    const field = await screen.findByRole("combobox", { name: "Bewegung" });
    await user.selectOptions(field, "Bewegung aus");
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]?.body["motion"]).toBe("reduced");
    expect(puts[0]?.body["keyboardShortcuts"]).toBe("plain");
    await waitFor(() => expect(root.dataset.motion).toBe("reduced"));
    await user.selectOptions(field, "Wie auf dem Gerät");
    await waitFor(() => expect(puts).toHaveLength(2));
    await waitFor(() => expect(root.dataset.motion).toBeUndefined());
  });

  it("US-QS-33 · P-10 a refused save keeps the old value and shows the German text of the error code", async () => {
    const puts = fakeServer(PROFILE, () =>
      response(400, {
        error: {
          code: "input.invalid",
          text: "Die Eingabe ist ungültig. Bitte prüfe die markierten Felder.",
          details: [{ field: "motion", code: "input.invalid" }],
        },
      }),
    );
    const user = userEvent.setup();
    showStyle();
    const field = (await screen.findByRole("combobox", { name: "Bewegung" })) as HTMLSelectElement;
    await user.selectOptions(field, "Bewegung aus");
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(root.dataset.motion).toBeUndefined();
    await waitFor(() => expect(field.value).toBe("system"));
  });
});

describe("US-QS-32 settings: one line of hint, the rest behind Mehr erfahren (SG-COPY-05)", () => {
  it("US-QS-32 the Wunschliste warning says its one line; the zones and the default sit behind Mehr erfahren", async () => {
    fakeServer();
    show("wishlist");
    await screen.findByRole("group", { name: /Mindestzahl offener Wünsche/ });
    const line = screen.getByText("Warnt bei zu wenigen offenen Wünschen.");
    expect(line.closest("details")).toBeNull();
    const more = line.closest("div")?.querySelector("details");
    expect(more?.textContent).toContain("Gilt je Zone 2 bis 4.");
    expect(more?.textContent).not.toContain("Warnt bei zu wenigen offenen Wünschen.");
  });

  it("US-QS-32 the notification group says in one line that reminders need a setup", async () => {
    fakeServer();
    show("notifications");
    await screen.findByRole("switch", { name: "Tausch" });
    expect(screen.getByText("Erinnerungen nur, wenn eingerichtet.")).toBeTruthy();
    expect(document.body.textContent).not.toContain("werden erst verschickt");
  });
});
