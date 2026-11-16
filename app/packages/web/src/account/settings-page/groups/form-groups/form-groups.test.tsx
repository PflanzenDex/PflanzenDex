// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
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

/** The settings with the server of the profile; the saves are not part of these tests. */
function fakeServer() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/achievements/settings") return response(200, { calmMode: false });
      if (path === "/onboarding/style") return response(200, { style: "few", chosen: true });
      if (path === "/account/profile") return response(200, PROFILE);
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
