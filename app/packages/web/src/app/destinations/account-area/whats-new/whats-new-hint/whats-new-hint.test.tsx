// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markNewsSeen, NEWS_COUNT, unseenNow } from "../whats-new";
import { WhatsNewPage } from "../whats-new-page/whats-new-page";
import { WhatsNewHint } from "./whats-new-hint";

const TOTAL = NEWS_COUNT;

beforeEach(() => {
  window.localStorage.clear();
  vi.stubEnv("VITE_APP_VERSION", "1.2.3");
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The hint on "Heute", with the page "Neu" as a route so the link can be followed. */
function renderHint() {
  return render(
    <MemoryRouter initialEntries={["/today"]}>
      <Routes>
        <Route
          path="/today"
          element={
            <>
              <WhatsNewHint />
              <p>Heute-Inhalt</p>
            </>
          }
        />
        <Route path="/account/news" element={<WhatsNewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const hintText = (count: number) =>
  screen.queryByText(`Neu in Version 1.2.3: ${count} ${count === 1 ? "Neuerung" : "Neuerungen"}`);

describe("US-DEV-06 the one-time hint on Heute", () => {
  it("US-DEV-06 never shows on the very first visit of a device, and records the count", () => {
    renderHint();
    expect(screen.queryByText(/Neu in Version/)).toBeNull();
    expect(screen.getByText("Heute-Inhalt")).toBeTruthy();
    // The count is recorded: the next visit counts only lines added later.
    expect(unseenNow(TOTAL + 2)).toBe(2);
  });

  it("US-DEV-06 shows the count and the version of lines unseen after a previous visit, with a link to the page", () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    expect(hintText(3)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Neuerungen ansehen" }).getAttribute("href")).toBe(
      "/account/news",
    );
  });

  it("US-DEV-06 says one Neuerung in the singular", () => {
    markNewsSeen(TOTAL - 1);
    renderHint();
    expect(hintText(1)).toBeTruthy();
  });

  it("US-DEV-06 shows nothing when no line is unseen", () => {
    markNewsSeen(TOTAL);
    renderHint();
    expect(screen.queryByText(/Neu in Version/)).toBeNull();
  });

  it("US-DEV-06 disappears for good once it is dismissed", async () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    await userEvent.click(screen.getByRole("button", { name: "Hinweis ausblenden" }));
    expect(screen.queryByText(/Neu in Version/)).toBeNull();
    cleanup();
    renderHint();
    expect(screen.queryByText(/Neu in Version/)).toBeNull();
  });

  it("US-DEV-06 disappears for good once the page Neu was opened", async () => {
    markNewsSeen(TOTAL - 3);
    renderHint();
    expect(hintText(3)).toBeTruthy();
    await userEvent.click(screen.getByRole("link", { name: "Neuerungen ansehen" }));
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
    cleanup();
    renderHint();
    expect(screen.queryByText(/Neu in Version/)).toBeNull();
  });

  it("US-DEV-06 shows nothing and does not break when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderHint();
    expect(screen.queryByText(/Neu in Version/)).toBeNull();
    expect(screen.getByText("Heute-Inhalt")).toBeTruthy();
  });
});
