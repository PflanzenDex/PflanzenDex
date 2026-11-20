// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { setProfileTimeZone } from "../../../../shared/data";
import { SettingsPage } from "../../settings-page";

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

/**
 * The settings with the server of the profile. A save answers `refusal` (400) when one is given, else the profile it
 * sends back; the tests that do not save never reach that branch.
 */
type Profile = Omit<typeof PROFILE, "displayName"> & { displayName: string | null };

function fakeServer(options: { profile?: Profile; refusal?: unknown } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/achievements/settings") return response(200, { calmMode: false });
      if (path === "/onboarding/style") return response(200, { style: "few", chosen: true });
      if (path === "/account/profile" && init?.method === "PUT") {
        return options.refusal
          ? response(400, options.refusal)
          : response(200, options.profile ?? PROFILE);
      }
      if (path === "/account/profile") return response(200, options.profile ?? PROFILE);
      return response(404, {});
    }),
  );
}

/** The address of the test render, so a test reads whether the layer is still named (US-QS-32). */
let address = "";
function Address() {
  const location = useLocation();
  address = location.search;
  return null;
}

function renderSettings(sheet: string) {
  render(
    <MemoryRouter initialEntries={[`/?sheet=${sheet}`]}>
      <Address />
      <SettingsPage api="http://api" token={token} />
    </MemoryRouter>,
  );
}

beforeAll(() => setViewportWidth(1024));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setProfileTimeZone(null);
});

const QUESTION = { name: "Eingabe verwerfen?" };

describe("US-QS-32 a settings group with its own save asks before it discards typed input", () => {
  it("US-QS-32 Profil: typing in Anzeigename and Escape asks; Weiter bearbeiten keeps the name in the pane", async () => {
    fakeServer();
    renderSettings("profile");
    const name = await screen.findByLabelText<HTMLInputElement>("Anzeigename");
    await userEvent.type(name, " Beispiel");
    await userEvent.keyboard("{Escape}");
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Weiter bearbeiten" }));
    await waitFor(() => expect(screen.queryByRole("dialog", QUESTION)).toBeNull());
    expect(screen.getByRole("complementary", { name: "Profil" })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Anzeigename").value).toBe("Anna Beispiel");
    expect(address).toContain("sheet=profile");
  });

  it("US-QS-32 Profil: Verwerfen after typed input closes the group and the typed name is not kept", async () => {
    fakeServer();
    renderSettings("profile");
    const name = await screen.findByLabelText("Anzeigename");
    await userEvent.type(name, " Beispiel");
    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));
    const question = await screen.findByRole("dialog", QUESTION);
    await userEvent.click(within(question).getByRole("button", { name: "Eingabe verwerfen" }));
    await waitFor(() => expect(screen.queryByLabelText("Anzeigename")).toBeNull());
    expect(address).not.toContain("sheet=profile");
  });

  it("US-QS-32 Profil without typed input: Escape closes the group at once, with no question", async () => {
    fakeServer();
    renderSettings("profile");
    await screen.findByLabelText("Anzeigename");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByLabelText("Anzeigename")).toBeNull());
    expect(screen.queryByRole("dialog", QUESTION)).toBeNull();
  });
});

describe("US-QS-32 the settings groups say how to fix a field (F-0085, F-0092)", () => {
  it("US-QS-32 · F-0085 an emptied Anzeigename shows its message at the field when it is left", async () => {
    fakeServer();
    renderSettings("profile");
    const name = await screen.findByLabelText<HTMLInputElement>("Anzeigename");
    await userEvent.clear(name);
    await userEvent.tab();
    expect((await screen.findByRole("alert")).textContent).toBe("Gib einen Namen ein.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-32 · F-0085 no name stored yet: an empty Anzeigename is valid when it is left", async () => {
    fakeServer({ profile: { ...PROFILE, displayName: null } });
    renderSettings("profile");
    const name = await screen.findByLabelText<HTMLInputElement>("Anzeigename");
    await userEvent.click(name);
    await userEvent.tab();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(name.getAttribute("aria-invalid")).toBeNull();
  });

  it("US-QS-32 · F-0085 an emptied buffer of the wishlist shows its rule when it is left", async () => {
    fakeServer();
    renderSettings("wishlist");
    const buffer = await screen.findByLabelText<HTMLInputElement>(
      "Mindestzahl offener Wünsche je Zone",
    );
    await userEvent.clear(buffer);
    await userEvent.tab();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Gib eine ganze Zahl von 0 bis 10 ein.",
    );
    expect(buffer.getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-32 · F-0085 an emptied light threshold shows its rule at that field when it is left", async () => {
    fakeServer();
    renderSettings("light");
    const first = await screen.findByLabelText<HTMLInputElement>("Direkt unter der Lampe ab");
    await userEvent.clear(first);
    await userEvent.tab();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Gib eine ganze Zahl von 1 bis 200.000 Lux ein.",
    );
    expect(first.getAttribute("aria-invalid")).toBe("true");
  });

  it("US-QS-32 · F-0092 a refused name says how to fix it at its field, not the generic line", async () => {
    fakeServer({
      refusal: {
        error: {
          code: "input.invalid",
          details: [{ field: "displayName", code: "input.invalid" }],
        },
      },
    });
    renderSettings("profile");
    const name = await screen.findByLabelText<HTMLInputElement>("Anzeigename");
    await userEvent.type(name, " Beispiel");
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Gib einen Namen ein, höchstens 80 Zeichen.");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(
      screen.queryByText("Die Eingabe ist ungültig. Bitte prüfe die markierten Felder."),
    ).toBeNull();
  });
});

/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";

describe("US-QS-32 · F-0048 a saved group is its own result", () => {
  it("US-QS-32 · F-0048 after a save no status box is in the page and the announcer says 'Einstellungen gespeichert.'", async () => {
    fakeServer();
    render(
      <MemoryRouter initialEntries={["/?sheet=profile"]}>
        <AnnouncerProvider>
          <SettingsPage api="http://api" token={token} />
        </AnnouncerProvider>
      </MemoryRouter>,
    );
    const name = await screen.findByLabelText("Anzeigename");
    await userEvent.clear(name);
    await userEvent.type(name, "Lena L");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gespeichert."));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
