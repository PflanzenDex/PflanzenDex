// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { newsEntries } from "../news-lines.mjs";
import { markNewsSeen, NEWS_COUNT, NEWS_ENTRIES, unseenNow } from "../whats-new";
import { WhatsNewList, WhatsNewPage } from "./whats-new-page";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** The entries of plain lines, as the page gets them (no fragments, no versions). */
const entriesOf = (lines: string[]) => newsEntries({ unreleased: lines, versions: [] }, []);

/** The text of every line on the page; a long line's button and a heading are not part of the line. */
const lineTexts = () =>
  screen.getAllByRole("listitem").map((li) => li.querySelector("p.m-0")?.textContent);

describe("US-DEV-06 the page Neu in PflanzenDéx", () => {
  it("US-DEV-06 lists the lines newest first and shows the version", () => {
    const lines = ["Neu: zuerst", "Fix: danach"];
    render(
      <MemoryRouter>
        <WhatsNewList entries={entriesOf(lines)} version="1.2.3" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
    expect(lineTexts()).toEqual(lines);
  });

  it("US-DEV-06 a version is shown under its heading with its number and date, after the unreleased lines", () => {
    const entries = newsEntries(
      {
        unreleased: ["Noch offen"],
        versions: [{ version: "1.2.0", date: "2026-11-06", lines: ["Schon draußen"] }],
      },
      [],
    );
    render(
      <MemoryRouter>
        <WhatsNewList entries={entries} version="1.2.0" />
      </MemoryRouter>,
    );
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Noch nicht veröffentlicht", "Version 1.2.0 vom 06.11.2026"]);
    expect(lineTexts()).toEqual(["Noch offen", "Schon draußen"]);
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
    const all = NEWS_ENTRIES.map((entry) => entry.text);
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.length).toBeLessThan(all.length);
    expect(shown).toEqual(all.slice(0, shown.length));
    expect(screen.getByText(`Seite 1 von ${Math.ceil(all.length / shown.length)}`)).toBeTruthy();
  });

  it("US-DEV-06 the pager reaches the older lines, page by page and by address", async () => {
    render(
      <MemoryRouter>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    const all = NEWS_ENTRIES.map((entry) => entry.text);
    const first = lineTexts();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(lineTexts()).toEqual(all.slice(first.length, first.length * 2));
    await userEvent.click(screen.getByRole("button", { name: "Zurück" }));
    expect(lineTexts()).toEqual(first);
    cleanup();

    // The last page holds the oldest line: its first entry is in the address, so the last page opens directly.
    const pages = Math.ceil(all.length / first.length);
    render(
      <MemoryRouter initialEntries={[`/account/news?from=${(pages - 1) * first.length}`]}>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText(`Seite ${pages} von ${pages}`)).toBeTruthy();
    expect(lineTexts().at(-1)).toBe(all.at(-1));
    expect(screen.getByRole("button", { name: "Weiter" }).hasAttribute("disabled")).toBe(true);
  });

  it("US-DEV-06 a long line shows its start, and Mehr anzeigen shows all of it (P-10)", async () => {
    const long = Array(40).fill("Wort").join(" ");
    render(
      <MemoryRouter>
        <WhatsNewList entries={entriesOf([long])} version="1.2.3" />
      </MemoryRouter>,
    );
    const more = screen.getByRole("button", { name: "Mehr anzeigen" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(more);
    const less = screen.getByRole("button", { name: "Weniger anzeigen" });
    expect(less.getAttribute("aria-expanded")).toBe("true");
    expect(lineTexts()).toEqual([long]);
  });

  it("US-DEV-06 shows the version as unknown when the build did not set one (P-08)", () => {
    vi.stubEnv("VITE_APP_VERSION", "");
    render(
      <MemoryRouter>
        <WhatsNewList entries={entriesOf(["Eine Zeile"])} version={undefined} />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version unbekannt")).toBeTruthy();
  });

  it("US-DEV-06 an empty list says what is new and offers the way to Heute (P-09)", async () => {
    render(
      <MemoryRouter initialEntries={["/account/news"]}>
        <Routes>
          <Route path="/account/news" element={<WhatsNewList entries={[]} version="1.2.3" />} />
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
    expect(unseenNow(NEWS_COUNT)).toBe(0);
  });
});
