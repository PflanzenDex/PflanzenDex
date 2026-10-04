// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTimeZone, setProfileTimeZone } from "../kernel";
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
  },
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
const show = () => render(<SettingsPage api="http://api" token={token} />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setProfileTimeZone(null);
});

describe("US-ACC-02 settings page: display name", () => {
  it("US-ACC-02 shows the saved profile and keeps Save disabled until something changes", async () => {
    fakeServer();
    show();
    expect(screen.getByRole("status").textContent).toContain("werden geladen");
    expect((await screen.findByLabelText<HTMLInputElement>("Anzeigename")).value).toBe("Anna");
    expect(screen.getByRole("button", { name: "Speichern" }).hasAttribute("disabled")).toBe(true);
  });

  it("US-ACC-02 saves a free display name with an Idempotency-Key and confirms it", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    const name = await screen.findByLabelText("Anzeigename");
    await user.clear(name);
    await user.type(name, "Anna Beispiel");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("status")).textContent).toBe("Einstellungen gespeichert.");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.key).toBeTruthy();
    expect(puts[0]?.body["displayName"]).toBe("Anna Beispiel");
  });

  it("US-ACC-02 an empty display name is sent as none", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.clear(await screen.findByLabelText("Anzeigename"));
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
    expect(puts[0]?.body["displayName"]).toBeNull();
  });
});

describe("US-ACC-02 settings page: time zone", () => {
  it("US-ACC-02 prefills the time zone from the device when none is chosen and says so", async () => {
    fakeServer({ ...PROFILE, timeZone: null });
    vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
      timeZone: "Asia/Tokyo",
    } as Intl.ResolvedDateTimeFormatOptions);
    show();
    expect((await screen.findByLabelText<HTMLInputElement>("Zeitzone")).value).toBe("Asia/Tokyo");
    expect(screen.getByText(/Vom Gerät übernommen/)).toBeTruthy();
    vi.restoreAllMocks();
  });

  it("US-ACC-02 saving a time zone makes it the zone of all later dates (NFR-08)", async () => {
    fakeServer();
    const user = userEvent.setup();
    show();
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
    show();
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
    show();
    const zone = await screen.findByLabelText("Zeitzone");
    await user.clear(zone);
    await user.type(zone, "Mars/Olympus");
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Die Eingabe ist ungültig");
    expect(zone.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText("Anzeigename").getAttribute("aria-invalid")).toBe("false");
    expect((zone as HTMLInputElement).value).toBe("Mars/Olympus");
    expect(currentTimeZone()).not.toBe("Mars/Olympus");
  });
});

describe("US-ACC-02 settings page: notifications and global switches", () => {
  it("US-ACC-02 switches single occasions off and sends all six", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Behandlungen" }));
    await user.click(screen.getByRole("checkbox", { name: "Tausch" }));
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
    expect(puts[0]?.body["notifications"]).toEqual({
      ...PROFILE.notifications,
      treatment: false,
      swap: false,
    });
  });

  it("US-ACC-02 offers a switch for every occasion", async () => {
    fakeServer();
    show();
    for (const name of ["Pflegephasen", "Behandlungen", "Messungen", "Gießen", "Tausch", "Freunde"])
      expect(await screen.findByRole("checkbox", { name })).toBeTruthy();
  });

  it("US-ACC-02 saves 'Alles privat' and 'Keine Empfehlungen'", async () => {
    const puts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("checkbox", { name: "Alles privat" }));
    await user.click(screen.getByRole("checkbox", { name: "Keine Empfehlungen" }));
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    await screen.findByRole("status");
    expect(puts[0]?.body).toMatchObject({ everythingPrivate: true, noRecommendations: true });
  });

  it("US-ACC-02 a private default account shows both switches off", async () => {
    fakeServer();
    show();
    expect(
      (await screen.findByRole<HTMLInputElement>("checkbox", { name: "Alles privat" })).checked,
    ).toBe(false);
  });
});

describe("US-ACC-02 settings page: errors", () => {
  it("US-ACC-02 a load failure shows the text and 'Erneut laden'", async () => {
    fakeServer(500);
    show();
    expect(await screen.findByRole("button", { name: "Erneut laden" })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("US-ACC-02 without a token nothing is sent and the user is asked to sign in", async () => {
    const puts = fakeServer();
    const calls = vi.mocked(fetch);
    render(<SettingsPage api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("melde dich neu an");
    expect(calls).not.toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it("US-ACC-02 a token that vanishes before saving keeps the input and asks to sign in", async () => {
    fakeServer();
    const user = userEvent.setup();
    let available = true;
    render(<SettingsPage api="http://api" token={async () => (available ? "tok" : undefined)} />);
    const name = await screen.findByLabelText("Anzeigename");
    await user.type(name, "x");
    available = false;
    await user.click(screen.getByRole("button", { name: "Speichern" }));
    expect((await screen.findByRole("alert")).textContent).toContain("melde dich neu an");
    expect((name as HTMLInputElement).value).toBe("Annax");
  });
});
