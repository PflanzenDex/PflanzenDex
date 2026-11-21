// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Species, SpeciesHit } from "@pflanzendex/core";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { AccountIndex } from "../../destinations/account-area/account-index/account-index";
import { NEWS_ENTRIES } from "../../destinations/account-area/whats-new/whats-new";
import { lineKey } from "../../destinations/account-area/whats-new/news-keys";
import { WhatsNewHint } from "../../destinations/account-area/whats-new/whats-new-hint/whats-new-hint";
import { TodayFilter } from "../../destinations/today-area/watering-view/today-filter/today-filter";
import { OnboardingWizard } from "../../flows/onboarding/onboarding-wizard/onboarding-wizard";
import type { SpeciesLookup } from "../../flows/onboarding/onboarding-wizard/species-step/species-step";
import { filledIn, isFilled, isPlain, isTinted } from "./button-roles";

// US-QS-32 (SG-BTN-01, SG-BTN-02), FX-39 sweep 1: the app shell. The banner's trigger, the filter's control and the second
// action of the sign-out dialog are tinted, going back in the first-plant flow is plain, and each view keeps at most one
// filled button.
beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  Element.prototype.releasePointerCapture ??= () => undefined;
});
beforeEach(() => setViewportWidth(1024));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });
const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe("US-QS-32 · SG-BTN-01 Heute: the filter's one control is tinted", () => {
  it("US-QS-32 'Filter aufheben' is a tinted button and the view has no filled one", () => {
    render(
      <TodayFilter onClear={vi.fn()}>
        <p>Die Liste</p>
      </TodayFilter>,
    );
    expect(isTinted(button("Alle Aufgaben zeigen"))).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-BTN-01 Heute: the banner after an update", () => {
  it("US-QS-32 'Neuerungen ansehen' is a tinted button in the banner, and the banner has no filled one", async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubEnv("VITE_APP_VERSION", "1.2.3");
    // The first line is unseen: the banner shows.
    window.localStorage.setItem(
      "pflanzendex.news-seen-lines",
      JSON.stringify(NEWS_ENTRIES.slice(1).map((entry) => lineKey(entry.text))),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => json(200, { calmMode: false })),
    );
    render(
      <MemoryRouter>
        <WhatsNewHint api="http://api" token={async () => "tok"} />
      </MemoryRouter>,
    );
    const open = await screen.findByRole("button", { name: "Neuerungen ansehen" });
    expect(isTinted(open)).toBe(true);
    expect(filledIn(document.body)).toHaveLength(0);
  });
});

describe("US-QS-32 · SG-BTN-02 Konto: the sign-out confirmation has one filled button", () => {
  it("US-QS-32 'Abmelden' is filled, 'Auf allen Geräten abmelden' is tinted, 'Abbrechen' is neither", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => json(404, {})),
    );
    render(
      <FeaturesProvider
        features={{ social: true, ai: false, recommendations: false, achievement_views: false }}
      >
        <MemoryRouter initialEntries={["/account"]}>
          <AccountIndex
            api="http://api"
            token={async () => "tok"}
            account={{
              id: "1",
              email: "lena@example.test",
              displayName: "Lena",
              timeZone: null,
              emailConfirmed: true,
              mayShareWithFriends: true,
            }}
            current={undefined}
            hasOverview
            onSignOut={vi.fn()}
            onEverywhereSignOut={vi.fn()}
          />
        </MemoryRouter>
      </FeaturesProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Abmelden …" }));
    const dialog = await screen.findByRole("dialog", { name: "Abmelden?" });
    expect(filledIn(dialog).map((b) => b.textContent)).toEqual(["Abmelden"]);
    expect(
      isTinted(within(dialog).getByRole("button", { name: "Auf allen Geräten abmelden" })),
    ).toBe(true);
    const cancel = within(dialog).getByRole("button", { name: "Abbrechen" });
    expect(isFilled(cancel) || isTinted(cancel)).toBe(false);
  });
});

describe("US-QS-32 · SG-BTN-01 the first plant: going back is plain", () => {
  const hit: SpeciesHit = {
    id: "s1",
    latinName: "Monstera deliciosa",
    germanName: "Fensterblatt",
  } as SpeciesHit;
  const species = {
    id: "s1",
    latinName: "Monstera deliciosa",
    germanName: "Fensterblatt",
  } as Species;
  const lookup: SpeciesLookup = {
    search: vi.fn(() => Promise.resolve({ ok: true as const, value: [hit] })),
    load: vi.fn(() => Promise.resolve({ ok: true as const, value: species })),
  };

  it("US-QS-32 on the second step 'Zurück' is plain, the save is the one filled button", async () => {
    // The zones cannot be read: the save step says so (issue 2098); its buttons are the same.
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => json(500, { error: { code: "server.error", text: "x" } })),
    );
    render(
      <MemoryRouter>
        <OnboardingWizard
          lookup={lookup}
          api="http://api"
          token={async () => "tok"}
          onChoosePlant={vi.fn()}
          onSkip={vi.fn()}
          onCreated={vi.fn()}
        />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText("Art"), "Monstera");
    await userEvent.click(await screen.findByRole("button", { name: /Monstera deliciosa/ }));
    await waitFor(() => expect((button("Weiter") as HTMLButtonElement).disabled).toBe(false));
    await userEvent.click(button("Weiter"));
    const back = await screen.findByRole("button", { name: "Zurück" });
    expect(isPlain(back)).toBe(true);
    expect(filledIn(document.body).map((b) => b.textContent)).toEqual(["Pflanze sichern"]);
  });
});
