// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { setProfileTimeZone } from "../../../../shared/data";
import type { AccountProfile } from "../../../api/account-api";
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
type Profile = Omit<typeof PROFILE, "displayName" | "timeZone"> & {
  displayName: string | null;
  timeZone: string | null;
};

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

  it("US-QS-32 · F-0085 · SG-CTRL-04 the buffer of the wishlist is a stepper: it cannot be emptied, so the rule is kept by the control", async () => {
    fakeServer();
    renderSettings("wishlist");
    const buffer = await screen.findByRole("group", {
      name: "Mindestzahl offener Wünsche je Zone",
    });
    expect(buffer.querySelector("output")?.textContent).toBe("2");
    expect(screen.queryByRole("textbox", { name: /Mindestzahl/ })).toBeNull();
    await userEvent.tab();
    expect(screen.queryByRole("alert")).toBeNull();
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
  it("US-QS-32 · F-0048 after a save no status box is in the page and the announcer says 'Einstellungen gesichert.'", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: "Sichern" }));
    await waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

/** One rendering update of the browser: a control that turns disabled loses the focus at the next one (PF-045). */
const renderingUpdate = () => new Promise<void>((done) => setTimeout(done, 50));

/** The settings with the announcer, so a test reads what is said (US-QS-32). */
function renderWithAnnouncer(sheet: string) {
  render(
    <MemoryRouter initialEntries={[`/?sheet=${sheet}`]}>
      <AnnouncerProvider>
        <SettingsPage api="http://api" token={token} />
      </AnnouncerProvider>
    </MemoryRouter>,
  );
}

/**
 * A profile API that holds each PUT until the test lets it answer, so a save is still on its way while the test looks at
 * the focus. It answers with the profile it was sent, as the server does.
 */
function heldProfileApi(profile: Profile = PROFILE) {
  const puts: AccountProfile[] = [];
  const answers: (() => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (path === "/achievements/settings") return response(200, { calmMode: false });
      if (path === "/onboarding/style") return response(200, { style: "few", chosen: true });
      if (path === "/account/profile" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as AccountProfile;
        puts.push(body);
        await new Promise<void>((done) => answers.push(done));
        return response(200, body);
      }
      if (path === "/account/profile") return response(200, profile);
      return response(404, {});
    }),
  );
  return {
    puts,
    /** Waits until a PUT is on its way, then lets the oldest one answer. */
    answerNext: async () => {
      await vi.waitFor(() => expect(answers.length).toBeGreaterThan(0));
      answers.shift()?.();
    },
  };
}

/** A group with its own "Sichern": the edit that makes its form dirty, and the value that the edit sends. */
type GroupEdit = {
  group: string;
  sheet: string;
  field: string;
  edit: (user: UserEvent, field: HTMLElement) => Promise<unknown>;
  sent: (profile: AccountProfile) => unknown;
  expected: unknown;
};

const GROUP_EDITS: readonly GroupEdit[] = [
  {
    group: "Profil",
    sheet: "profile",
    field: "Anzeigename",
    edit: (user, field) => user.type(field, " Beispiel"),
    sent: (p) => p.displayName,
    expected: "Anna Beispiel",
  },
  {
    group: "Wunschliste",
    sheet: "wishlist",
    field: "Mindestzahl offener Wünsche je Zone",
    // One press of "Mehr" takes the stored 2 to 3 (the stepper replaces the typed number, SG-CTRL-04).
    edit: (user, field) => user.click(within(field).getByRole("button", { name: "Mehr" })),
    sent: (p) => p.replenishBuffer,
    expected: 3,
  },
  {
    group: "Licht",
    sheet: "light",
    field: "Sehr nah ab",
    edit: async (user, field) => {
      await user.clear(field);
      await user.type(field, "16000");
    },
    sent: (p) => p.positionThresholds,
    expected: [50000, 16000, 8000, 4000],
  },
];

describe("US-QS-32 · a group's Sichern keeps the keyboard focus while it saves (PF-045)", () => {
  it.each(GROUP_EDITS)(
    "US-QS-32 · $group: Sichern keeps the focus while the save is held and after it is saved",
    async ({ sheet, field, edit, sent, expected }) => {
      const api = heldProfileApi();
      const user = userEvent.setup();
      renderWithAnnouncer(sheet);
      const input = await screen.findByLabelText<HTMLInputElement>(field);
      await edit(user, input);
      const save = screen.getByRole("button", { name: "Sichern" });

      save.focus();
      await user.keyboard("{Enter}");
      await vi.waitFor(() => expect(api.puts).toHaveLength(1));
      await renderingUpdate();
      expect(document.activeElement).toBe(save);

      await api.answerNext();
      await vi.waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
      await renderingUpdate();
      expect(document.activeElement).toBe(save);
      expect(api.puts.map(sent)).toEqual([expected]);
    },
  );

  it.each(GROUP_EDITS)(
    "US-QS-32 · $group: a second Enter on Sichern or in the field while the save is held sends nothing",
    async ({ sheet, field, edit }) => {
      const api = heldProfileApi();
      const user = userEvent.setup();
      renderWithAnnouncer(sheet);
      const input = await screen.findByLabelText<HTMLInputElement>(field);
      await edit(user, input);
      const save = screen.getByRole("button", { name: "Sichern" });

      save.focus();
      await user.keyboard("{Enter}");
      await vi.waitFor(() => expect(api.puts).toHaveLength(1));
      await renderingUpdate();
      expect(document.activeElement).toBe(save);

      await user.keyboard("{Enter}");
      await renderingUpdate();
      expect(api.puts).toHaveLength(1);

      input.focus();
      await user.keyboard("{Enter}");
      await renderingUpdate();
      expect(api.puts).toHaveLength(1);

      await api.answerNext();
      await vi.waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
      expect(api.puts).toHaveLength(1);
    },
  );

  it.each([
    { group: "Profil", sheet: "profile", field: "Anzeigename" },
    {
      group: "Wunschliste",
      sheet: "wishlist",
      field: "Mindestzahl offener Wünsche je Zone",
    },
  ])(
    "US-QS-32 · $group: Enter on Sichern with nothing changed sends nothing and says nothing",
    async ({ sheet, field }) => {
      const api = heldProfileApi();
      const user = userEvent.setup();
      renderWithAnnouncer(sheet);
      await screen.findByLabelText(field);
      const save = screen.getByRole("button", { name: "Sichern" });

      save.focus();
      expect(document.activeElement).toBe(save);
      await user.keyboard("{Enter}");
      await renderingUpdate();
      expect(api.puts).toHaveLength(0);
      expect(announced()).toBe("");
    },
  );

  it("US-QS-32 · Licht: Enter on Sichern with nothing changed still answers that nothing changed, and sends nothing", async () => {
    const api = heldProfileApi();
    const user = userEvent.setup();
    renderWithAnnouncer("light");
    await screen.findByLabelText("Sehr nah ab");
    const save = screen.getByRole("button", { name: "Sichern" });

    save.focus();
    await user.keyboard("{Enter}");
    await vi.waitFor(() =>
      expect(announced()).toBe("Keine Änderung: Die Werte sind schon gesichert."),
    );
    expect(api.puts).toHaveLength(0);
  });

  it("US-QS-32 · Profil without a stored time zone: Enter on Sichern with the device's zone sends the save", async () => {
    const api = heldProfileApi({ ...PROFILE, timeZone: null });
    const user = userEvent.setup();
    renderWithAnnouncer("profile");
    await screen.findByLabelText("Anzeigename");
    const save = screen.getByRole("button", { name: "Sichern" });

    save.focus();
    await user.keyboard("{Enter}");
    await vi.waitFor(() => expect(api.puts).toHaveLength(1));
    await api.answerNext();
    await vi.waitFor(() => expect(announced()).toBe("Einstellungen gesichert."));
  });
});
