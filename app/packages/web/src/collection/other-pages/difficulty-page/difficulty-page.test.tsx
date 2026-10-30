// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/lib/viewport-mock";
import { DifficultyPage } from "./difficulty-page";

/** Renders in a router, because layers and pages live in the address (US-QS-22); `url` opens a layer. */
const view = (ui: ReactElement, url = "/") =>
  render(<MemoryRouter initialEntries={[url]}>{ui}</MemoryRouter>);

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
/** The comparison values of the layer of one species as label and value pairs (US-QS-22). */
const valuesOf = async (name: string) => {
  const layer = await screen.findByRole("dialog", { name });
  const dl = layer.querySelector("dl") as HTMLElement;
  return new Map(
    [...dl.querySelectorAll("dt")].map((dt) => [
      dt.textContent,
      dt.nextElementSibling?.textContent,
    ]),
  );
};
// The layers are dialogs and drawers; jsdom lacks pointer capture, which they use.
Element.prototype.setPointerCapture ??= () => undefined;
Element.prototype.releasePointerCapture ??= () => undefined;
const serverError = { error: { code: "server.error", text: "Der Server antwortet nicht." } };

function fakeServer(rows: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    new URL(String(url)).pathname === "/specimens/difficulty" ? rows() : response(404, {}),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
const token = async () => "tok";

beforeEach(() => setViewportWidth(360));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-BES-05 page of the difficulty overview", () => {
  it("US-BES-05 · US-QS-22 shows one compact entry per species with the difficulty as a word and the zone", async () => {
    fakeServer(() =>
      response(200, {
        rows: [row(), row({ speciesId: "sp2", speciesName: "Gummibaum", difficulty: 3 })],
      }),
    );
    view(<DifficultyPage api="http://api" token={token} />);
    expect(screen.getByRole("status").textContent).toContain("geladen");
    const list = await screen.findByRole("list", { name: "Artenvergleich" });
    const entries = within(list).getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[0]?.textContent).toContain("Bogenhanf");
    expect(entries[0]?.textContent).toContain("Leicht · Lampe 2");
    expect(entries[1]?.textContent).toContain("Schwer");
  });

  it("US-BES-05 · US-QS-22 the layer of a species shows all columns of the comparison", async () => {
    fakeServer(() => response(200, { rows: [row()] }));
    view(<DifficultyPage api="http://api" token={token} />, "/?sheet=compare-sp1");
    const values = await valuesOf("Bogenhanf");
    expect([...values.entries()]).toEqual([
      ["Botanischer Name", "Dracaena trifasciata"],
      ["Lichtzone", "Lampe 2"],
      ["Gießregel", "alle 10 Tage"],
      ["Substrat", "Humus"],
      ["Schnitt", "selten"],
      ["Erfolgskriterium", "Neue Blätter wachsen aufrecht."],
      ["Schwierigkeit", "Leicht"],
    ]);
  });

  it("US-BES-05 maps 2 to Mittel and shows unknown values as unbekannt (P-08)", async () => {
    fakeServer(() =>
      response(200, {
        rows: [
          row({ difficulty: 2, zone: null, wateringHint: null, substrate: null, pruning: null }),
        ],
      }),
    );
    view(<DifficultyPage api="http://api" token={token} />, "/?sheet=compare-sp1");
    const values = await valuesOf("Bogenhanf");
    expect(values.get("Lichtzone")).toBe("unbekannt");
    expect(values.get("Gießregel")).toBe("unbekannt");
    expect(values.get("Substrat")).toBe("unbekannt");
    expect(values.get("Schnitt")).toBe("unbekannt");
    expect(values.get("Schwierigkeit")).toBe("Mittel");
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
    view(<DifficultyPage api="http://api" token={token} />);
    const entries = within(
      await screen.findByRole("list", { name: "Artenvergleich" }),
    ).getAllByRole("listitem");
    expect(entries[0]?.textContent).toContain("Erste");
    expect(entries[1]?.textContent).toContain("Zweite");
  });

  it("US-BES-05 · US-BES-09 shows my care-profile zone and watering and says where they come from (#306)", async () => {
    fakeServer(() =>
      response(200, {
        rows: [
          row({ zoneSource: "profile", ownWatering: { growthDays: 7, dormancyDays: 21 } }),
          row({
            speciesId: "sp2",
            botanicalName: "Aloe vera",
            zoneSource: "species",
            ownWatering: { growthDays: 5, dormancyDays: null },
          }),
        ],
      }),
    );
    view(<DifficultyPage api="http://api" token={token} />, "/?sheet=compare-sp1");
    const values = await valuesOf("Bogenhanf");
    expect(values.get("Lichtzone")).toBe("Lampe 2 (dein Pflegeprofil)");
    expect(values.get("Gießregel")).toBe(
      "alle 7\u00a0Tage, in der Ruhe alle 21\u00a0Tage (dein Pflegeprofil)",
    );
  });

  it("US-BES-05 without a care profile the catalog values stand without a note", async () => {
    fakeServer(() => response(200, { rows: [row({ zoneSource: "species", ownWatering: null })] }));
    view(<DifficultyPage api="http://api" token={token} />, "/?sheet=compare-sp1");
    const values = await valuesOf("Bogenhanf");
    expect(values.get("Gießregel")).toBe("alle 10 Tage");
    expect(screen.queryByText(/dein Pflegeprofil/)).toBeNull();
  });

  it("US-BES-05 says what to do without a species (P-09)", async () => {
    fakeServer(() => response(200, { rows: [] }));
    view(<DifficultyPage api="http://api" token={token} />);
    expect((await screen.findByText(/Noch keine Art/)).textContent).toContain("Pflanze");
    expect(screen.queryByRole("list", { name: "Artenvergleich" })).toBeNull();
  });

  it("US-BES-05 · P-10 names the species that are missing because they cannot be read", async () => {
    fakeServer(() => response(200, { rows: [row()], unreadable: 2 }));
    view(<DifficultyPage api="http://api" token={token} />);
    await screen.findByRole("list", { name: "Artenvergleich" });
    expect(screen.getByText(/2 Arten deiner Pflanzen kannst du nicht mehr lesen/)).toBeTruthy();
  });

  it("US-BES-05 · P-10 without readable species the empty state still names the missing ones", async () => {
    fakeServer(() => response(200, { rows: [], unreadable: 1 }));
    view(<DifficultyPage api="http://api" token={token} />);
    expect(
      await screen.findByText(/1 Art deiner Pflanzen kannst du nicht mehr lesen/),
    ).toBeTruthy();
  });

  it("US-BES-05 without unreadable species there is no note", async () => {
    fakeServer(() => response(200, { rows: [row()], unreadable: 0 }));
    view(<DifficultyPage api="http://api" token={token} />);
    await screen.findByRole("list", { name: "Artenvergleich" });
    expect(screen.queryByText(/nicht mehr lesen/)).toBeNull();
  });

  it("US-BES-05 keeps an error visible and reloads on request (P-10)", async () => {
    let attempt = 0;
    fakeServer(() =>
      ++attempt === 1 ? response(500, serverError) : response(200, { rows: [row()] }),
    );
    view(<DifficultyPage api="http://api" token={token} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Der Server antwortet nicht.");
    await userEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByRole("list", { name: "Artenvergleich" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-BES-05 without sign-in nothing is queried", async () => {
    const fetchFn = fakeServer(() => response(200, { rows: [] }));
    view(<DifficultyPage api="http://api" token={async () => undefined} />);
    expect((await screen.findByRole("alert")).textContent).toContain("Bitte melde dich neu an.");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("US-QS-22 the comparison fits one screen", () => {
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) => row({ speciesId: `s${i}`, speciesName: `Art ${i + 1}` }));

  it("US-QS-22 the species are paged: four entries on a phone, then the next page", async () => {
    setViewportWidth(360);
    fakeServer(() => response(200, { rows: many(6) }));
    view(<DifficultyPage api="http://api" token={token} />);
    const list = await screen.findByRole("list", { name: "Artenvergleich" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByText("Art 5")).toBeTruthy();
  });

  it("US-QS-22 there is no table and no sideways scroll: the values of a species are in its layer", async () => {
    fakeServer(() => response(200, { rows: [row()] }));
    view(<DifficultyPage api="http://api" token={token} />);
    await screen.findByRole("list", { name: "Artenvergleich" });
    expect(screen.queryByRole("table")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Vergleichswerte: Bogenhanf" }));
    expect(await screen.findByRole("dialog", { name: "Bogenhanf" })).toBeTruthy();
  });
});

describe("US-QS-14 · US-BES-05 the comparison hosted by the Sammlung", () => {
  it("US-QS-14 · US-BES-05 with a host it has no main heading, names its section and reports the count line", async () => {
    fakeServer(() => response(200, { rows: [row(), row({ speciesId: "sp2", difficulty: 3 })] }));
    const onCaption = vi.fn();
    const shown = view(<DifficultyPage api="http://api" token={token} host={{ onCaption }} />);
    await screen.findByRole("list", { name: "Artenvergleich" });
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Artenvergleich" })).toBeTruthy();
    expect(onCaption).toHaveBeenLastCalledWith("2 Arten im Vergleich");
    shown.unmount();
    expect(onCaption).toHaveBeenLastCalledWith(null);
  });
});
