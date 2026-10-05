// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DifficultyPage } from "./DifficultyPage";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const zone = { id: "z2", name: "Lampe 2", luxCeiling: 15000, ppfd: 300, sortOrder: 1 };
const row = (extra: Record<string, unknown> = {}) => ({
  speciesId: "sp1",
  speciesName: "Bogenhanf",
  botanicalName: "Dracaena trifasciata",
  zone,
  wateringHint: "alle 10 Tage",
  substrate: "Humus",
  pruning: "selten",
  successCriteria: "Neue Blätter wachsen aufrecht.",
  difficulty: 1,
  ...extra,
});
const cellsOf = (i: number) =>
  [...(screen.getAllByRole("row")[i] as HTMLElement).querySelectorAll("th,td")].map(
    (c) => c.textContent,
  );
const serverError = { error: { code: "server.error", text: "Der Server antwortet nicht." } };

function fakeServer(rows: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    new URL(String(url)).pathname === "/specimens/difficulty" ? rows() : response(404, {}),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const token = async () => "tok";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-05 page of the difficulty overview", () => {
  it("US-BES-05 shows the columns and one row per species with the difficulty as a word", async () => {
    fakeServer(() => response(200, { rows: [row(), row({ speciesId: "sp2", difficulty: 3 })] }));
    render(<DifficultyPage api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    await screen.findByRole("table");
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toEqual([
      "Art",
      "Botanischer Name",
      "Lichtzone",
      "Gießregel",
      "Substrat",
      "Schnitt",
      "Erfolgskriterium",
      "Schwierigkeit",
    ]);
    const cells = cellsOf(1);
    expect(cells).toEqual([
      "Bogenhanf",
      "Dracaena trifasciata",
      "Lampe 2",
      "alle 10 Tage",
      "Humus",
      "selten",
      "Neue Blätter wachsen aufrecht.",
      "Leicht",
    ]);
    expect(screen.getByText("Schwer")).toBeTruthy();
  });

  it("US-BES-05 maps 2 to Mittel and shows unknown values as unbekannt (P-08)", async () => {
    fakeServer(() =>
      response(200, {
        rows: [
          row({ difficulty: 2, zone: null, wateringHint: null, substrate: null, pruning: null }),
        ],
      }),
    );
    render(<DifficultyPage api="http://api" token={token} />);
    await screen.findByRole("table");
    const cells = cellsOf(1);
    expect(cells[2]).toBe("unbekannt");
    expect(cells[3]).toBe("unbekannt");
    expect(cells[4]).toBe("unbekannt");
    expect(cells[5]).toBe("unbekannt");
    expect(cells[7]).toBe("Mittel");
  });

  it("US-BES-05 keeps the order delivered by the server", async () => {
    fakeServer(() =>
      response(200, {
        rows: [
          row({ speciesId: "a", speciesName: "Erste" }),
          row({ speciesId: "b", speciesName: "Zweite" }),
        ],
      }),
    );
    render(<DifficultyPage api="http://api" token={token} />);
    await screen.findByRole("table");
    const text = screen
      .getAllByRole("row")
      .slice(1)
      .map((r) => r.textContent);
    expect(text[0]).toContain("Erste");
    expect(text[1]).toContain("Zweite");
  });

  it("US-BES-05 says what to do without a species (P-09)", async () => {
    fakeServer(() => response(200, { rows: [] }));
    render(<DifficultyPage api="http://api" token={token} />);
    expect((await screen.findByText(/Noch keine Art/)).textContent).toContain("Exemplar");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("US-BES-05 keeps an error visible and reloads on request (P-10)", async () => {
    let attempt = 0;
    fakeServer(() =>
      ++attempt === 1 ? response(500, serverError) : response(200, { rows: [row()] }),
    );
    render(<DifficultyPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut laden" }));
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-BES-05 without sign-in nothing is queried", async () => {
    const fetchFn = fakeServer(() => response(200, { rows: [] }));
    render(<DifficultyPage api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("US-BES-05 layout of the wide table (issue 293)", () => {
  const css = readFileSync("src/collection/collection.css", "utf8");

  it("US-BES-05 the frame keeps its width, so the navigation does not re-lay out when switching tabs", () => {
    // Measured in Chromium at 375, 768 to 1280 and 1440 px: navigation 720 px on every tab, no sideways page scroll.
    expect(css).not.toMatch(/\.frame:has\(\.difficulty-page\)/);
    expect(css).toMatch(
      /\.difficulty-page \.table-scroll \{[^}]*min\(1200px, calc\(100vw - 48px\)\)/,
    );
  });

  it("US-BES-05 the scrolling table shows a visible keyboard focus (3 px, project convention)", () => {
    expect(css).toMatch(/\.table-scroll:focus-visible \{\s*outline: 3px solid var\(--text\);/);
  });
});
