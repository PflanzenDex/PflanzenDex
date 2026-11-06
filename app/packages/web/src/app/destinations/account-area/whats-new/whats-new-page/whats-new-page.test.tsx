// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markNewsSeen, NEWS_LINES, unseenNow } from "../whats-new";
import { WhatsNewList, WhatsNewPage } from "./whats-new-page";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The text of every line on the page; a long line's button is not part of the line. */
const lineTexts = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector("p")?.textContent);

describe("US-DEV-06 the page Neu in PflanzenDéx", () => {
  it("US-DEV-06 lists the lines newest first and shows the version", () => {
    const lines = ["Neu: zuerst", "Fix: danach"];
    render(
      <MemoryRouter>
        <WhatsNewList lines={lines} version="1.2.3" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
    expect(lineTexts()).toEqual(lines);
  });

  it("US-DEV-06 shows only the newest page of the lines, not all of them at once (US-QS-15)", () => {
    vi.stubEnv("VITE_APP_VERSION", "2.0.0");
    render(
      <MemoryRouter>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version 2.0.0")).toBeTruthy();
    const shown = lineTexts();
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(NEWS_LINES.length);
    expect(shown).toEqual(NEWS_LINES.slice(0, shown.length));
    expect(
      screen.getByText(`Seite 1 von ${Math.ceil(NEWS_LINES.length / shown.length)}`),
    ).toBeTruthy();
  });

  it("US-DEV-06 the pager reaches the older lines, page by page and by address", async () => {
    render(
      <MemoryRouter>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    const first = lineTexts();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(lineTexts()).toEqual(NEWS_LINES.slice(first.length, first.length * 2));
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(lineTexts()).toEqual(first);
    cleanup();

    // The last page holds the oldest line: its first entry is in the address, so the last page opens directly.
    const pages = Math.ceil(NEWS_LINES.length / first.length);
    render(
      <MemoryRouter initialEntries={[`/account/news?from=${(pages - 1) * first.length}`]}>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(`Seite ${pages} von ${pages}`)).toBeTruthy();
    expect(lineTexts().at(-1)).toBe(NEWS_LINES.at(-1));
    expect(screen.getByRole("button", { name: "Weiter" }).hasAttribute("disabled")).toBe(true);
  });

  it("US-DEV-06 a long line shows its start, and Mehr anzeigen shows all of it (P-10)", async () => {
    const long = Array(40).fill("Wort").join(" ");
    render(
      <MemoryRouter>
        <WhatsNewList lines={[long]} version="1.2.3" />
      </MemoryRouter>,
    );
    const more = screen.getByRole("button", { name: "Mehr anzeigen" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(more);
    const less = screen.getByRole("button", { name: "Weniger anzeigen" });
    expect(less.getAttribute("aria-expanded")).toBe("true");
    expect(lineTexts()).toEqual([long]);
  });

  it("US-DEV-06 US-QS-12 a long line is marked as clamped until Mehr anzeigen opens it, a short line is not", async () => {
    const long = Array(40).fill("Wort").join(" ");
    render(
      <MemoryRouter>
        <WhatsNewList lines={[long, "Kurz"]} version="1.2.3" />
      </MemoryRouter>,
    );
    const clamped = (index: number) =>
      screen.getAllByRole("listitem")[index]?.querySelector("p")?.hasAttribute("data-clamped");
    expect(clamped(0)).toBe(true);
    expect(clamped(1)).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Mehr anzeigen" }));
    expect(clamped(0)).toBe(false);
    expect(
      screen.getByRole("button", { name: "Weniger anzeigen" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("US-DEV-06 shows the version as unknown when the build did not set one (P-08)", () => {
    vi.stubEnv("VITE_APP_VERSION", "");
    render(
      <MemoryRouter>
        <WhatsNewList lines={["Eine Zeile"]} version={undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version unbekannt")).toBeTruthy();
  });

  it("US-DEV-06 an empty list says what is new and offers the way to Heute (P-09)", async () => {
    render(
      <MemoryRouter initialEntries={["/account/news"]}>
        <Routes>
          <Route path="/account/news" element={<WhatsNewList lines={[]} version="1.2.3" />} />
          <Route path="/today" element={<p>Heute-Ziel</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Noch nichts Neues" })).toBeTruthy();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Zu Heute" }));
    expect(screen.getByText("Heute-Ziel")).toBeTruthy();
  });

  it("US-DEV-06 opening the page marks every line as seen on this device", () => {
    markNewsSeen(0);
    render(
      <MemoryRouter>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    expect(unseenNow(NEWS_LINES.length)).toBe(0);
  });
});
