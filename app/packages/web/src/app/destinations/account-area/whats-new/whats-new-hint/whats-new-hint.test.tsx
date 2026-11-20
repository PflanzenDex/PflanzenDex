// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NEWS_ENTRIES, unseenEntries } from "../whats-new";
import { lineKey } from "../news-keys";
import { WhatsNewPage } from "../whats-new-page/whats-new-page";
import { WhatsNewHint } from "./whats-new-hint";

const SEEN = "pflanzendex.news-seen-lines";
const ALL_KEYS = NEWS_ENTRIES.map((entry) => lineKey(entry.text));
const token = async () => "tok";

/** The seen set with exactly the lines at `unseen` (positions in the list) not seen (US-DEV-06). */
function unseenAt(unseen: readonly number[]) {
  window.localStorage.setItem(
    SEEN,
    JSON.stringify(ALL_KEYS.filter((_key, index) => !unseen.includes(index))),
  );
}

/** The answer of the calm mode setting (US-ACH-08): one JSON answer for every request. */
const calmAnswer = (calmMode: boolean) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ calmMode }), { status: 200 })),
  );

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubEnv("VITE_APP_VERSION", "1.2.3");
  calmAnswer(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** "Heute" with the banner, the view's heading (the place the focus returns to) and the page "Neu" as a route. */
function renderHint() {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route
          path="/today"
          element={
            <main id="inhalt">
              <h1>Heute</h1>
              <WhatsNewHint api="http://api" token={token} />
            </main>
          }
        />
        <Route path="/account/news" element={<WhatsNewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const bannerTitle = () => screen.queryByText("Neu in PflanzenDéx", { selector: "p" });
const summary = (count: number) =>
  screen.queryByText(`Version 1.2.3: ${count} ${count === 1 ? "Neuerung" : "Neuerungen"}`);
const textsOf = (entries: readonly { text: string }[]) => entries.map((entry) => entry.text);

/** Lets the calm mode request settle and the effects run (the banner decides after it). */
async function settle() {
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("US-QS-27 the banner on Heute after an update (US-DEV-06)", () => {
  it("US-QS-27 a first visit of a device shows nothing and records every line as seen", async () => {
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    expect(unseenEntries()).toEqual([]);
  });

  it("US-QS-27 shows the banner Neu in PflanzenDéx once after an update, with the version and the count of the new lines", async () => {
    unseenAt([0, 1, 2]);
    renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    expect(summary(3)).toBeTruthy();
  });

  it("US-QS-27 says one Neuerung in the singular", async () => {
    unseenAt([0]);
    renderHint();
    expect(await screen.findByText("Version 1.2.3: 1 Neuerung")).toBeTruthy();
  });

  it("US-QS-27 shows nothing when no line is unseen", async () => {
    unseenAt([]);
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 the banner's trigger names the dialog it opens and says nothing about being expanded", async () => {
    unseenAt([0]);
    renderHint();
    const trigger = await screen.findByRole("button", { name: "Neuerungen ansehen" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger.hasAttribute("aria-expanded")).toBe(false);
  });

  it("US-QS-27 in the session in which it first shows, the banner shows again when Heute is opened again", async () => {
    unseenAt([0, 1, 2]);
    const first = renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    first.unmount();
    renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    expect(summary(3)).toBeTruthy();
  });

  it("US-QS-27 a visit that ends before the calm mode setting is known does not use the lines up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)),
    );
    unseenAt([0, 1, 2]);
    renderHint();
    expect(bannerTitle()).toBeNull();
    cleanup();
    expect(unseenEntries()).toHaveLength(3);
  });

  it("US-QS-27 the lines count as seen only when the banner ends, not when it first shows", async () => {
    unseenAt([0, 1, 2]);
    renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    expect(unseenEntries()).toHaveLength(3);
  });

  it("US-QS-27 Neuerungen ansehen opens the new lines in a dialog with the link to the full page, and ends the banner at once", async () => {
    unseenAt([0, 1]);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    const dialog = await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    const items = within(dialog).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(
      textsOf(NEWS_ENTRIES.slice(0, 2)),
    );
    expect(
      within(dialog).getByRole("link", { name: "Alle Neuigkeiten" }).getAttribute("href"),
    ).toBe("/account/news");
    expect(bannerTitle()).toBeNull();
    expect(unseenEntries()).toEqual([]);
  });

  it("US-QS-27 the dialog shows the unseen lines themselves, not the first lines of the list", async () => {
    unseenAt([10, 11]);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    const dialog = await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    const shown = within(dialog)
      .getAllByRole("listitem")
      .map((item) => item.querySelector("p")?.textContent);
    expect(shown).toEqual(textsOf(NEWS_ENTRIES.slice(10, 12)));
    expect(shown).not.toContain(NEWS_ENTRIES[0]?.text);
  });

  it("US-QS-27 closing the dialog returns the focus to the start of the view, as the banner is gone", async () => {
    unseenAt([0]);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Heute" })),
    );
  });

  it("US-QS-27 the link of the dialog leads to the page Neu in PflanzenDéx, which marks every line as seen", async () => {
    unseenAt([0]);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    const dialog = await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    await userEvent.click(within(dialog).getByRole("link", { name: "Alle Neuigkeiten" }));
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
    expect(unseenEntries()).toEqual([]);
  });

  it("US-QS-27 Hinweis ausblenden ends the banner at once, and it does not return on a later visit or session", async () => {
    unseenAt([0, 1, 2]);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Hinweis ausblenden" }));
    expect(bannerTitle()).toBeNull();
    cleanup();
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    window.sessionStorage.clear();
    cleanup();
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 a batch shown in an earlier session counts as seen and does not return, even when it was never closed", async () => {
    unseenAt([0, 1, 2]);
    const first = renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    first.unmount();
    window.sessionStorage.clear(); // a later session
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    expect(unseenEntries()).toEqual([]);
  });

  it("US-QS-27 a line that arrived after the shown batch shows in the next session", async () => {
    unseenAt([0, 1, 2]);
    const first = renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    first.unmount();
    window.sessionStorage.clear();
    unseenAt([0, 1, 2, 7]);
    renderHint();
    expect(await screen.findByText("Version 1.2.3: 1 Neuerung")).toBeTruthy();
  });

  it("US-QS-27 in calm mode shows no banner and counts the lines as seen at once (US-ACH-08, US-ONB-07)", async () => {
    calmAnswer(true);
    unseenAt([0, 1, 2]);
    renderHint();
    await waitFor(() => expect(unseenEntries()).toEqual([]));
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 while the calm mode setting cannot be read, it shows nothing and counts nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 })),
    );
    unseenAt([0, 1, 2]);
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    expect(unseenEntries()).toHaveLength(3);
  });

  it("US-DEV-06 shows nothing and does not break when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    expect(screen.getByText("Heute")).toBeTruthy();
  });
});
