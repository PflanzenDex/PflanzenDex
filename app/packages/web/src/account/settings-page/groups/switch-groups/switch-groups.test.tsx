// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refusalText } from "@/shared/lib/error-text";
import type { AccountProfile } from "../../../api/account-api";
import { useProfileSaver, type ProfileSaver } from "../profile-saver";
import { AnnouncerProvider } from "@/shared/platform/announcer/announcer";
import { NotificationsGroup, PrivacyGroup } from "./switch-groups";

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

const TOKEN = async () => "tok";

/**
 * One rendering update of the browser. A control that becomes disabled while it has the focus loses the focus at the next
 * rendering update (jsdom runs that focus fixup on a 16 ms tick), so a focus check waits for one.
 */
const renderingUpdate = () => new Promise<void>((done) => setTimeout(done, 50));

/** The settings page's own saver, so `saving` flips the way it does in the app (US-QS-32). */
function LiveGroup(props: { group: "privacy" | "notifications" }) {
  const saver = useProfileSaver("http://api", TOKEN, PROFILE);
  return props.group === "privacy" ? (
    <PrivacyGroup saver={saver} />
  ) : (
    <NotificationsGroup saver={saver} />
  );
}

/**
 * A profile API that holds each PUT until the test lets it answer, so the save is still on its way while the test looks
 * at the focus. It answers with the profile it was sent.
 */
function heldProfileApi() {
  const puts: AccountProfile[] = [];
  const answers: (() => void)[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as AccountProfile;
      puts.push(body);
      await new Promise<void>((done) => answers.push(done));
      return new Response(JSON.stringify(body), { status: 200 });
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

/** Every switch of the two groups that save at once, with the stored value it writes. */
const SWITCHES: readonly {
  group: "privacy" | "notifications";
  label: string;
  value: (p: AccountProfile) => boolean;
}[] = [
  { group: "privacy", label: "Alles privat", value: (p) => p.everythingPrivate },
  { group: "privacy", label: "Keine Empfehlungen", value: (p) => p.noRecommendations },
  {
    group: "privacy",
    label: "Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen",
    value: (p) => p.rarityConsent,
  },
  { group: "notifications", label: "Pflegephasen", value: (p) => p.notifications.phase },
];

describe("US-QS-32 · F-0048 a switch keeps its focus while it saves", () => {
  it.each(SWITCHES)(
    "US-QS-32 · F-0048 $group switch '$label' keeps the focus through its save and takes a second Space",
    async ({ group, label, value }) => {
      const api = heldProfileApi();
      const user = userEvent.setup();
      render(
        <AnnouncerProvider>
          <LiveGroup group={group} />
        </AnnouncerProvider>,
      );
      const box = screen.getByRole<HTMLInputElement>("checkbox", { name: label });
      const before = box.checked;

      box.focus();
      await user.keyboard(" ");
      await vi.waitFor(() => expect(api.puts).toHaveLength(1));
      await renderingUpdate();
      expect(api.puts.map(value)).toEqual([!before]);
      expect(document.activeElement).toBe(box);

      await api.answerNext();
      await vi.waitFor(() => expect(announced()).toBe("Gespeichert."));
      await renderingUpdate();
      expect(box.checked).toBe(!before);
      expect(document.activeElement).toBe(box);

      await user.keyboard(" ");
      await vi.waitFor(() => expect(api.puts).toHaveLength(2));
      expect(api.puts.map(value)).toEqual([!before, before]);
      await api.answerNext();
      await vi.waitFor(() => expect(box.checked).toBe(before));
      await renderingUpdate();
      expect(document.activeElement).toBe(box);
    },
  );

  it("US-QS-32 · F-0048 a switch pressed while another one saves sends nothing and keeps its state", async () => {
    const api = heldProfileApi();
    const user = userEvent.setup();
    render(
      <AnnouncerProvider>
        <LiveGroup group="privacy" />
      </AnnouncerProvider>,
    );
    const first = screen.getByRole<HTMLInputElement>("checkbox", { name: "Alles privat" });
    const second = screen.getByRole<HTMLInputElement>("checkbox", { name: "Keine Empfehlungen" });

    first.focus();
    await user.keyboard(" ");
    await vi.waitFor(() => expect(api.puts).toHaveLength(1));

    second.focus();
    await user.keyboard(" ");
    expect(api.puts).toHaveLength(1);
    expect(second.checked).toBe(false);

    await api.answerNext();
    await vi.waitFor(() => expect(announced()).toBe("Gespeichert."));
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
  });
});
