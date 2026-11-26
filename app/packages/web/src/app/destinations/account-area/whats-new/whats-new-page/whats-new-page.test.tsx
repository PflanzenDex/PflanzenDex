// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { newsEntries } from "../news-lines.mjs";
import { NEWS_ENTRIES, unseenEntries } from "../whats-new";
import { WhatsNewList, WhatsNewPage } from "./whats-new-page";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setViewportWidth(360);
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

  it("US-DEV-06 · US-QS-15 the lines stand on one scrolling list, newest first, at every width: no pages, no Weiter", () => {
    vi.stubEnv("VITE_APP_VERSION", "2.0.0");
    for (const width of [360, 1024]) {
      setViewportWidth(width);
      render(
        <MemoryRouter>
          <WhatsNewPage />
        </MemoryRouter>,
      );
      expect(screen.getByText("Version 2.0.0")).toBeTruthy();
      const all = NEWS_ENTRIES.map((entry) => entry.text);
      expect(lineTexts()).toEqual(all);
      expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
      expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
      cleanup();
    }
  });

  it("US-DEV-06 · US-QS-15 · SG-LIST-01 a long changelog shows its first 40 lines and loads 40 more when the end of the list comes near", () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const lines = Array.from({ length: 100 }, (_, i) => `Zeile ${i + 1}`);
    render(
      <MemoryRouter>
        <WhatsNewList entries={entriesOf(lines)} version="1.0.0" />
      </MemoryRouter>,
    );
    expect(lineTexts()).toHaveLength(40);
    expect(screen.queryByText("Das waren alle 100")).toBeNull();
    const reach = () =>
      act(() => {
        for (const callback of callbacks)
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
      });
    reach();
    expect(lineTexts()).toHaveLength(80);
    reach();
    expect(lineTexts()).toEqual(lines);
  });

  it("US-DEV-06 · SG-NAV-02 an old position in the address (?from=) is dropped: the list starts with the newest line", async () => {
    setViewportWidth(1024);
    function Address() {
      return <span data-testid="address">{useLocation().search}</span>;
    }
    render(
      <MemoryRouter initialEntries={["/account/news?from=24"]}>
        <WhatsNewPage />
        <Address />
      </MemoryRouter>,
    );
    expect(lineTexts()[0]).toBe(NEWS_ENTRIES[0]?.text);
    await vi.waitFor(() => expect(screen.getByTestId("address").textContent).toBe(""));
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

  it("US-DEV-06 US-QS-12 a long line is marked as clamped until Mehr anzeigen opens it, a short line is not", async () => {
    const long = Array(40).fill("Wort").join(" ");
    render(
      <MemoryRouter>
        <WhatsNewList entries={entriesOf([long, "Kurz"])} version="1.2.3" />
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
    window.localStorage.setItem("pflanzendex.news-seen-lines", "[]");
    expect(unseenEntries()).toHaveLength(NEWS_ENTRIES.length);
    render(
      <MemoryRouter>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    expect(unseenEntries()).toEqual([]);
  });
});
