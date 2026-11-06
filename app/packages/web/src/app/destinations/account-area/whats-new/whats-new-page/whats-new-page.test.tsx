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

const itemTexts = () => screen.getAllByRole("listitem").map((li) => li.textContent);

describe("US-DEV-06 the page Neu in PflanzenDéx", () => {
  it("US-DEV-06 lists the lines newest first and shows the version", () => {
    const lines = ["Neu: zuerst", "Fix: danach", "Älteste Zeile"];
    render(
      <MemoryRouter>
        <WhatsNewList lines={lines} version="1.2.3" />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version 1.2.3")).toBeTruthy();
    expect(itemTexts()).toEqual(lines);
  });

  it("US-DEV-06 the page lists every line of the changelog in the file's order", () => {
    vi.stubEnv("VITE_APP_VERSION", "2.0.0");
    render(
      <MemoryRouter>
        <WhatsNewPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Version 2.0.0")).toBeTruthy();
    expect(itemTexts()).toEqual([...NEWS_LINES]);
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
