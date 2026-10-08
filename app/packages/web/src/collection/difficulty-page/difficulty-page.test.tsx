// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { DifficultyPage } from "./difficulty-page";

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

beforeEach(() => setViewportWidth(1024));
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
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
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

describe("US-BES-05 DS-24 layout of the wide table (issue 293)", () => {
  it("US-BES-05 from md the real table, whose own container scrolls, so the page never scrolls sideways", async () => {
    fakeServer(() => response(200, { rows: [row()] }));
    render(<DifficultyPage api="http://api" token={token} />);
    const table = await screen.findByRole("table", { name: "Artenvergleich" });
    expect(table.parentElement?.className).toContain("overflow-x-auto");
  });

  it("US-BES-05 on a phone one card per species with label and value pairs, same texts as the table", async () => {
    setViewportWidth(360);
    fakeServer(() => response(200, { rows: [row(), row({ speciesId: "sp2", difficulty: 3 })] }));
    render(<DifficultyPage api="http://api" token={token} />);
    const list = await screen.findByRole("list", { name: "Artenvergleich" });
    expect(screen.queryByRole("table")).toBeNull();
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(2);
    expect(cards[0]?.textContent).toContain("SchwierigkeitLeicht");
    expect(list.textContent).toContain("Dracaena trifasciata");
  });
});

describe("US-QS-14 · US-BES-05 the comparison hosted by the Sammlung", () => {
  it("US-QS-14 · US-BES-05 with a host it has no main heading, names its section and reports the count line", async () => {
    fakeServer(() => response(200, { rows: [row(), row({ speciesId: "sp2", difficulty: 3 })] }));
    const onCaption = vi.fn();
    const view = render(<DifficultyPage api="http://api" token={token} host={{ onCaption }} />);
    await screen.findByRole("table");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Artenvergleich" })).toBeTruthy();
    expect(onCaption).toHaveBeenLastCalledWith("2 Arten im Vergleich");
    view.unmount();
    expect(onCaption).toHaveBeenLastCalledWith(null);
  });
});
