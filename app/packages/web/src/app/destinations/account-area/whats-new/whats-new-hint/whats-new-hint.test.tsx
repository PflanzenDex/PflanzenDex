// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markNewsSeen, NEWS_COUNT, NEWS_ENTRIES, unseenNow } from "../whats-new";
import { WhatsNewPage } from "../whats-new-page/whats-new-page";
import { WhatsNewHint } from "./whats-new-hint";

const TOTAL = NEWS_COUNT;
const token = async () => "tok";

/** The answer of the calm mode setting (US-ACH-08): one JSON answer for every request. */
const calmAnswer = (calmMode: boolean) =>
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ calmMode }), { status: 200 })),
  );

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("VITE_APP_VERSION", "1.2.3");
  calmAnswer(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The banner on "Heute", with the page "Neu" as a route so the link of the dialog can be followed. */
function renderHint() {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route
          path="/today"
          element={
            <>
              <WhatsNewHint api="http://api" token={token} />
              <p>Heute-Inhalt</p>
            </>
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
const openButton = () => screen.queryByRole("button", { name: "Neuerungen ansehen" });

/** Waits until the calm mode answer has arrived and the banner is shown or the request has settled. */
async function settle() {
  await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("US-QS-27 the banner on Heute after an update (US-DEV-06)", () => {
  it("US-DEV-06 never shows on the very first visit of a device, and records the count", async () => {
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    expect(screen.getByText("Heute-Inhalt")).toBeTruthy();
    // The count is recorded: the next visit counts only lines added later.
    expect(unseenNow(TOTAL + 2)).toBe(2);
  });

  it("US-QS-27 shows the banner Neu in PflanzenDéx once after an update, with the version and the count", async () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    expect(summary(3)).toBeTruthy();
    // Shown once: the lines count as seen now, so a later visit finds nothing new.
    expect(unseenNow(TOTAL)).toBe(0);
  });

  it("US-QS-27 says one Neuerung in the singular", async () => {
    markNewsSeen(TOTAL - 1);
    renderHint();
    expect(await screen.findByText("Version 1.2.3: 1 Neuerung")).toBeTruthy();
  });

  it("US-QS-27 shows nothing when no line is unseen", async () => {
    markNewsSeen(TOTAL);
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 opens the new lines in a dialog, newest first, with the link to the full page", async () => {
    markNewsSeen(TOTAL - 2);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    const dialog = await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    const items = within(dialog).getAllByRole("listitem");
    expect(items.map((item) => item.querySelector("p")?.textContent)).toEqual(
      NEWS_ENTRIES.slice(0, 2).map((entry) => entry.text),
    );
    const link = within(dialog).getByRole("link", { name: "Alle Neuigkeiten" });
    expect(link.getAttribute("href")).toBe("/account/news");
  });

  it("US-QS-27 closing the dialog keeps the banner and returns the focus to the button that opened it", async () => {
    markNewsSeen(TOTAL - 2);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(summary(2)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(openButton()));
  });

  it("US-QS-27 the link of the dialog leads to the page Neu in PflanzenDéx", async () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Neuerungen ansehen" }));
    const dialog = await screen.findByRole("dialog", { name: "Neu in PflanzenDéx" });
    await userEvent.click(within(dialog).getByRole("link", { name: "Alle Neuigkeiten" }));
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
  });

  it("US-QS-27 hides the banner for the rest of the session when it is closed", async () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    await userEvent.click(await screen.findByRole("button", { name: "Hinweis ausblenden" }));
    expect(bannerTitle()).toBeNull();
    cleanup();
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 does not come back on a later start, even when it was never closed", async () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    expect(await screen.findByText("Neu in PflanzenDéx", { selector: "p" })).toBeTruthy();
    cleanup();
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 in calm mode shows no banner and counts the lines as seen at once (US-ACH-08, US-ONB-07)", async () => {
    calmAnswer(true);
    markNewsSeen(TOTAL - 3);
    renderHint();
    await waitFor(() => expect(unseenNow(TOTAL)).toBe(0));
    expect(bannerTitle()).toBeNull();
  });

  it("US-QS-27 while the calm mode setting cannot be read, shows nothing and counts nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("{}", { status: 500 })),
    );
    markNewsSeen(TOTAL - 3);
    renderHint();
    await settle();
    expect(bannerTitle()).toBeNull();
    expect(unseenNow(TOTAL)).toBe(3);
  });

  it("US-QS-27 keeps the banner away while the calm mode setting is still loading", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined)),
    );
    markNewsSeen(TOTAL - 3);
    renderHint();
    expect(bannerTitle()).toBeNull();
    expect(unseenNow(TOTAL)).toBe(3);
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
    expect(screen.getByText("Heute-Inhalt")).toBeTruthy();
  });
});
