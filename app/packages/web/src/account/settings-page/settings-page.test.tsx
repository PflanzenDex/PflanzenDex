// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { currentTimeZone, setProfileTimeZone } from "../../kernel";
import { SettingsPage } from "./settings-page";

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
const show = (sheet?: string) =>
  render(
    <MemoryRouter initialEntries={[at(sheet)]}>
      <SettingsPage api="http://api" token={token} />
    </MemoryRouter>,
  );

beforeAll(() => setViewportWidth(1024));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setProfileTimeZone(null);
});

describe("US-ACC-02 settings page: display name", () => {
  it("US-ACC-02 shows the saved profile and keeps Save disabled until something changes", async () => {
    fakeServer();
    show("profile");
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect((await screen.findByLabelText<HTMLInputElement>("Anzeigename")).value).toBe("Anna");
    expect(screen.getByRole("button", { name: "Speichern" }).hasAttribute("disabled")).toBe(true);
  });

  it("US-ACC-02 saves a free display name with an Idempotency-Key and confirms it", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.clear(name);
    await user.type(name, "Anna Beispiel");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBeTruthy();
    expect(puts[0]?.body["displayName"]).toBe("Anna Beispiel");
  });

  it("US-ACC-02 a cleared display name is sent as empty text so the server refuses it and the field is marked", async () => {
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    const alert = await screen.findByRole("alert");
    expect(puts[0]?.body["displayName"]).toBe("");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toContain(alert.id);
    expect(screen.getByText(/darf aber nicht leer sein/)).toBeTruthy();
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

  it("US-ACC-02 saving a time zone makes it the zone of all later dates (NFR-08)", async () => {
    fakeServer();
    const user = userEvent.setup();
    show("profile");
    const zone = await screen.findByLabelText("Zeitzone");
    await user.clear(zone);
    await user.type(zone, "America/New_York");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
    expect(currentTimeZone()).toBe("America/New_York");
  });

  it("US-ACC-02 an empty time zone is sent as none", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("profile");
    await user.clear(await screen.findByLabelText("Zeitzone"));
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Die Eingabe ist ungültig");
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findAllByRole("alert");
    expect(document.activeElement).toBe(name);
  });

  it("US-ACC-02 a refusal without a field moves the focus to the error text", async () => {
    fakeServer(PROFILE, () => refuse());
    const user = userEvent.setup();
    show("profile");
    await user.type(await screen.findByLabelText("Anzeigename"), "x");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect(document.activeElement).toBe(await screen.findByRole("alert"));
  });
});

describe("US-ACC-02 settings page: notifications and global switches", () => {
  it("US-ACC-02 · US-QS-17 a switch saves at once and sends all seven occasions", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("notifications");
    await user.click(await screen.findByRole("checkbox", { name: "Behandlungen" }));
    await screen.findByRole("status");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body["notifications"]).toEqual({ ...PROFILE.notifications, treatment: false });
    await user.click(screen.getByRole("checkbox", { name: "Tausch" }));
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
      "Equipment-Prüfung",
    ])
      expect(await screen.findByRole("checkbox", { name })).toBeTruthy();
  });

  it("US-ACC-02 · US-QS-17 'Alles privat' and 'Keine Empfehlungen' save at once", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("privacy");
    await user.click(await screen.findByRole("checkbox", { name: "Alles privat" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    await user.click(screen.getByRole("checkbox", { name: "Keine Empfehlungen" }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1]?.body).toMatchObject({ everythingPrivate: true, noRecommendations: true });
  });

  it("US-POK-14 the rarity consent is off by default and is saved when switched on", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("privacy");
    const box = await screen.findByRole("checkbox", {
      name: "Meine Sammlung in die Seltenheit in PflanzenDex einrechnen",
    });
    expect((box as HTMLInputElement).checked).toBe(false);
    await user.click(box);
    await screen.findByRole("status");
    expect(puts[0]?.body).toMatchObject({ rarityConsent: true });
  });

  it("US-ACC-02 a private default account shows both switches off", async () => {
    fakeServer();
    show("privacy");
    expect(
      (await screen.findByRole<HTMLInputElement>("checkbox", { name: "Alles privat" })).checked,
    ).toBe(false);
  });

  it("US-QS-17 · US-QS-15 the privacy layer shows one line of help and the rest behind 'Mehr erfahren'", async () => {
    fakeServer();
    show("privacy");
    await screen.findByRole("checkbox", { name: "Alles privat" });
    expect(screen.getByText("Mehr erfahren")).toBeTruthy();
  });

  it("US-QS-17 · P-10 a refused switch keeps its stored state and shows the German text of the error code", async () => {
    fakeServer(PROFILE, () =>
      response(400, {
        error: { code: "input.invalid", text: "RAW SERVER TEXT" },
      }),
    );
    const user = userEvent.setup();
    show("notifications");
    const box = await screen.findByRole<HTMLInputElement>("checkbox", { name: "Tausch" });
    await user.click(box);
    expect((await screen.findByRole("alert")).textContent).toContain("Die Eingabe ist ungültig");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(box.checked).toBe(true);
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("melde dich an");
    expect((name as HTMLInputElement).value).toBe("Annax");
  });
});

describe("US-ACC-02 · DS-48 states and primitives", () => {
  it("US-ACC-02 · DS-52 while loading, a skeleton of the form stands in with one status and hidden blocks", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { container } = show("profile");
    expect(screen.getByRole("status").textContent).toContain("Einstellungen werden geladen");
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findAllByRole("alert");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    expect(document.body.textContent).toContain("Die Eingabe ist ungültig");
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
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findAllByRole("alert");
    await user.type(name, "y");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("US-WUN-02 settings page: buffer of the wishlist warning", () => {
  const field = async () => screen.findByLabelText<HTMLInputElement>(/Mindestzahl offener Wünsche/);

  it("shows the saved buffer and says what it does and that 0 switches the warning off", async () => {
    fakeServer({ ...PROFILE, replenishBuffer: 4 });
    show("wishlist");
    expect((await field()).value).toBe("4");
    expect(screen.getByText(/0 schaltet die Warnung aus/)).toBeTruthy();
  });

  it("saves a whole number from 0 to 10 with the profile", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("wishlist");
    const input = await field();
    await user.clear(input);
    await user.type(input, "5");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts[0]?.body["replenishBuffer"]).toBe(5);
  });

  it.each(["11", "-1", "2,5", "abc", ""])(
    "refuses %j before sending and names the fix",
    async (text) => {
      const puts = fakeServer();
      const user = userEvent.setup();
      show("wishlist");
      const input = await field();
      await user.clear(input);
      if (text) await user.type(input, text);
      await user.click(screen.getByRole("button", { name: "Speichern" }));
      expect((await screen.findAllByRole("alert"))[0]?.textContent).toContain(
        "ganze Zahl von 0 bis 10",
      );
      expect(puts).toHaveLength(0);
    },
  );

  it("a server refusal of the field marks it (P-10)", async () => {
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
    const input = await field();
    await user.clear(input);
    await user.type(input, "3");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("alert");
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
});

describe("US-LIC-03 settings page: thresholds of the position recommendation", () => {
  const field = async () =>
    screen.findByLabelText<HTMLInputElement>(/Schwellen der Positionsempfehlung/);

  it("shows the standard values as an assumption while none are set", async () => {
    fakeServer();
    show("light");
    expect((await field()).value).toBe("50000, 15000, 8000, 4000");
    expect(screen.getByText(/eine Annahme/)).toBeTruthy();
  });

  it("saves four descending values with the profile", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("light");
    const input = await field();
    await user.clear(input);
    await user.type(input, "60000, 20000, 9000, 3000");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts[0]?.body["positionThresholds"]).toEqual([60000, 20000, 9000, 3000]);
  });

  it("keeps the standard values unset when only another setting changes", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("privacy");
    await user.click(await screen.findByRole("checkbox", { name: "Alles privat" }));
    await screen.findByRole("status");
    expect(puts[0]?.body["positionThresholds"]).toBeNull();
  });

  it.each(["1, 2, 3", "4000, 8000, 15000, 50000", "50000, 15000, 8000, 0", "a, b, c, d", ""])(
    "refuses %j before sending and names the fix",
    async (text) => {
      const puts = fakeServer();
      const user = userEvent.setup();
      show("light");
      const input = await field();
      await user.clear(input);
      if (text) await user.type(input, text);
      await user.click(screen.getByRole("button", { name: "Speichern" }));
      expect((await screen.findAllByRole("alert"))[0]?.textContent).toContain(
        "von hoch nach niedrig",
      );
      expect(puts).toHaveLength(0);
    },
  );
});

describe("US-ACH-08 calm mode on the profile page", () => {
  it("US-ACH-08 the profile offers the calm mode switch, off by default", async () => {
    fakeServer();
    show("style");
    const box = await screen.findByRole<HTMLInputElement>("checkbox", { name: "Ruhemodus" });
    expect(box.checked).toBe(false);
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
    expect((await row("Profil")).textContent).toContain("Anna · Europe/Berlin");
    expect((await row("Benachrichtigungen")).textContent).toContain("7 von 7 an");
    expect((await row("Datenschutz und Empfehlungen")).textContent).toContain("Standard");
    expect((await row("Wie nutzt du die App?")).textContent).toContain("ein paar Pflanzen");
    expect((await row("Wunschliste")).textContent).toContain("mind. 2 je Zone");
    expect((await row("Licht")).textContent).toContain("Standard-Schwellen");
    expect(screen.queryByLabelText("Anzeigename")).toBeNull();
  });

  it("US-QS-17 · P-08 an unknown name or time zone reads 'unbekannt'", async () => {
    fakeServer({ ...PROFILE, displayName: null, timeZone: null });
    show();
    expect((await row("Profil")).textContent).toContain("unbekannt · unbekannt");
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
    expect((await row("Benachrichtigungen")).textContent).toContain("6 von 7 an");
  });

  it("US-QS-17 · P-10 a failing style load reads 'unbekannt' in its row only", async () => {
    fakeServer();
    const ok = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (url, init) =>
        new URL(String(url)).pathname === "/onboarding/style" ? response(500, {}) : ok(url, init),
      ),
    );
    show();
    await waitFor(
      () =>
        expect(screen.getByRole("button", { name: /^Wie nutzt/ }).textContent).toContain(
          "unbekannt",
        ),
      { timeout: 4000 },
    );
    expect((await row("Profil")).textContent).toContain("Anna");
  });

  it.each([
    ["profile", "Profil", /Anzeigename/],
    ["notifications", "Benachrichtigungen", /Gießen/],
    ["privacy", "Datenschutz und Empfehlungen", /Alles privat/],
    ["style", "Wie nutzt du die App?", /Ruhemodus/],
    ["wishlist", "Wunschliste", /Mindestzahl offener Wünsche/],
    ["light", "Licht", /Schwellen der Positionsempfehlung/],
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
    expect(await screen.findByLabelText(/Mindestzahl offener Wünsche/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Browser zurück" }));
    await waitFor(() => expect(screen.queryByLabelText(/Mindestzahl/)).toBeNull());
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
    expect(screen.getByLabelText(/Schwellen der Positionsempfehlung/)).toBeTruthy();
    setViewportWidth(1024);
  });

  it("US-QS-17 Profil saves only with 'Speichern' and the row shows the new value afterwards", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await user.clear(name);
    await user.type(name, "Berta");
    expect(puts).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts).toHaveLength(1);
    expect((await row("Profil")).textContent).toContain("Berta · Europe/Berlin");
  });

  it("US-QS-17 Wunschliste and Licht save only their own field with the rest of the stored profile", async () => {
    const puts = fakeServer({ ...PROFILE, displayName: null });
    const user = userEvent.setup();
    show("wishlist");
    const input = await screen.findByLabelText(/Mindestzahl offener Wünsche/);
    await user.clear(input);
    await user.type(input, "4");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
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
    const input = await screen.findByLabelText(/Schwellen der Positionsempfehlung/);
    await user.clear(input);
    await user.type(input, "60000, 20000, 9000, 3000");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Die Eingabe ist ungültig");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
  });
});
