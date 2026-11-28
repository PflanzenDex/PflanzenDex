// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
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

const isOn = (toggle: HTMLElement) => toggle.getAttribute("aria-checked") === "true";

/** What the announcer says (its polite live region, `sr-only`). */
const announced = () =>
  document.querySelector<HTMLElement>('.sr-only[aria-live="polite"]')?.textContent ?? "";

function saverWith(save: ProfileSaver["save"]): ProfileSaver {
  return { saved: PROFILE, saving: false, save };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("US-QS-32 · F-0048 a switch is its own result", () => {
  it("US-QS-32 · F-0048 after a switch save no status box is in the DOM and the announcer says 'Gesichert.'", async () => {
    const save = vi.fn<ProfileSaver["save"]>(async (next) => ({ ok: true, value: next }));
    const user = userEvent.setup();
    render(
      <AnnouncerProvider>
        <PrivacyGroup saver={saverWith(save)} />
      </AnnouncerProvider>,
    );
    await user.click(screen.getByRole("switch", { name: "Alles privat" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(announced()).toBe("Gesichert."));
    expect(screen.queryByRole("status")).toBeNull();
    expect(save.mock.calls[0]?.[0]).toMatchObject({ everythingPrivate: true });
  });

  it("US-QS-32 · F-0048 a refused switch shows the German text of its code at its row (P-10)", async () => {
    const refusal = { code: "access.not_signed_in", text: "raw server text" };
    const save = vi.fn<ProfileSaver["save"]>(async () => ({ ok: false, error: refusal }));
    const user = userEvent.setup();
    render(
      <AnnouncerProvider>
        <PrivacyGroup saver={saverWith(save)} />
      </AnnouncerProvider>,
    );
    const toggle = screen.getByRole("switch", { name: "Alles privat" });
    await user.click(toggle);
    // The error stands at the row of the switch, is linked to it, and the switch keeps its old state (SG-FEED-02, P-10).
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(refusalText(refusal));
    expect(toggle.getAttribute("aria-describedby")).toContain(alert.id);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(toggle.closest("li")?.contains(alert)).toBe(true);
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
  // Worded positively (SG-CTRL-05): on shows recommendations, so the stored flag is its opposite.
  { group: "privacy", label: "Empfehlungen zeigen", value: (p) => !p.noRecommendations },
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
      const box = screen.getByRole<HTMLButtonElement>("switch", { name: label });
      const before = isOn(box);

      box.focus();
      await user.keyboard(" ");
      await vi.waitFor(() => expect(api.puts).toHaveLength(1));
      await renderingUpdate();
      expect(api.puts.map(value)).toEqual([!before]);
      expect(document.activeElement).toBe(box);

      await api.answerNext();
      await vi.waitFor(() => expect(announced()).toBe("Gesichert."));
      await renderingUpdate();
      expect(isOn(box)).toBe(!before);
      expect(document.activeElement).toBe(box);

      await user.keyboard(" ");
      await vi.waitFor(() => expect(api.puts).toHaveLength(2));
      expect(api.puts.map(value)).toEqual([!before, before]);
      await api.answerNext();
      await vi.waitFor(() => expect(isOn(box)).toBe(before));
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
    const first = screen.getByRole<HTMLButtonElement>("switch", { name: "Alles privat" });
    const second = screen.getByRole<HTMLButtonElement>("switch", { name: "Empfehlungen zeigen" });

    first.focus();
    await user.keyboard(" ");
    await vi.waitFor(() => expect(api.puts).toHaveLength(1));

    second.focus();
    await user.keyboard(" ");
    expect(api.puts).toHaveLength(1);
    expect(isOn(second)).toBe(true);

    await api.answerNext();
    await vi.waitFor(() => expect(announced()).toBe("Gesichert."));
    expect(isOn(first)).toBe(true);
    expect(isOn(second)).toBe(true);
  });
});

describe("US-QS-32 · SG-CTRL-02 the switches of the groups are switch rows (SG-CTRL-05)", () => {
  it("US-QS-32 · SG-CTRL-05 the privacy group has three switch rows worded so that on means it happens, each with one line", () => {
    render(<PrivacyGroup saver={saverWith(vi.fn())} />);
    const rows = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    for (const [label, help] of [
      ["Alles privat", /Freigaben/],
      ["Empfehlungen zeigen", /Nur du/],
      ["Meine Sammlung in die Seltenheit in PflanzenDéx einrechnen", /nie wer/],
    ] as const) {
      const toggle = screen.getByRole("switch", { name: label });
      const described = toggle
        .getAttribute("aria-describedby")
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
      expect(described).toMatch(help);
    }
    // No switch is worded as a negation, apart from the one exception "Alles privat".
    expect(screen.queryByRole("switch", { name: /^Keine / })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("US-QS-32 · SG-CTRL-05 'Empfehlungen zeigen' is on when recommendations are not switched off and saves the opposite", async () => {
    const save = vi.fn<ProfileSaver["save"]>(async (next) => ({ ok: true, value: next }));
    const user = userEvent.setup();
    render(<PrivacyGroup saver={saverWith(save)} />);
    const toggle = screen.getByRole("switch", { name: "Empfehlungen zeigen" });
    expect(isOn(toggle)).toBe(true);
    await user.click(toggle);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ noRecommendations: true });
  });

  it("US-QS-32 the notifications group has one switch row per occasion, each with one line, and no checkbox", () => {
    render(<NotificationsGroup saver={saverWith(vi.fn())} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    for (const name of ["Pflegephasen", "Behandlungen", "Messungen", "Gießen", "Geräte-Prüfung"]) {
      const toggle = screen.getByRole("switch", { name });
      expect(isOn(toggle)).toBe(true);
      expect(toggle.getAttribute("aria-describedby")).toBeTruthy();
    }
  });

  it("US-QS-30 · US-QS-32 offline the switches keep their state and the reason stands once below the group", async () => {
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const save = vi.fn<ProfileSaver["save"]>(async (next) => ({ ok: true, value: next }));
    const user = userEvent.setup();
    render(<PrivacyGroup saver={saverWith(save)} />);
    await user.click(screen.getByRole("switch", { name: "Alles privat" }));
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Du bist offline. Das geht erst wieder mit Verbindung."),
    ).toHaveLength(1);
    expect(screen.getByRole("switch", { name: "Alles privat" }).getAttribute("aria-disabled")).toBe(
      "true",
    );
  });
});
