// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refusalText } from "@/shared/lib/error-text";
import type { AccountProfile } from "../../../api/account-api";
import type { ProfileSaver } from "../profile-saver";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { PrivacyGroup } from "./switch-groups";

const PROFILE: AccountProfile = {
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
  } as AccountProfile["notifications"],
  replenishBuffer: 2,
  positionThresholds: null,
  rarityConsent: false,
  keyboardShortcuts: "plain",
  motion: "system",
};

/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";

function saverWith(save: ProfileSaver["save"]): ProfileSaver {
  return { saved: PROFILE, saving: false, save };
}

afterEach(() => {
  cleanup();
});

describe("US-QS-32 · F-0048 a switch is its own result", () => {
  it("US-QS-32 · F-0048 after a switch save no status box is in the DOM and the announcer says 'Gespeichert.'", async () => {
    const save = vi.fn<ProfileSaver["save"]>(async (next) => ({ ok: true, value: next }));
    const user = userEvent.setup();
    render(
      <AnnouncerProvider>
        <PrivacyGroup saver={saverWith(save)} />
      </AnnouncerProvider>,
    );
    await user.click(screen.getByRole("checkbox", { name: "Alles privat" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(announced()).toBe("Gespeichert."));
    expect(screen.queryByRole("status")).toBeNull();
    expect(save.mock.calls[0]?.[0]).toMatchObject({ everythingPrivate: true });
  });

  it("US-QS-32 · F-0048 a refused switch keeps its error Banner with the German text of its code (P-10)", async () => {
    const refusal = { code: "access.not_signed_in", text: "raw server text" };
    const save = vi.fn<ProfileSaver["save"]>(async () => ({ ok: false, error: refusal }));
    const user = userEvent.setup();
    render(
      <AnnouncerProvider>
        <PrivacyGroup saver={saverWith(save)} />
      </AnnouncerProvider>,
    );
    await user.click(screen.getByRole("checkbox", { name: "Alles privat" }));
    expect(await screen.findByText(refusalText(refusal))).toBeTruthy();
    expect(screen.queryByText("raw server text")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(announced()).toBe("");
  });
});
