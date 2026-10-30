// @vitest-environment jsdom
import { cleanup, render as plainRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TodayPage } from "./today-page";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
const token = async () => "tok";
const item = (kind: string, target: string, name: string, text: string, nextAction: string) => ({
  id: `${kind}:${name}`,
  kind,
  specimenId: name,
  specimenName: name,
  text,
  nextAction,
  target,
});

function fakeServer(reply: () => Promise<Response>) {
  const fetchFn = vi.fn<typeof fetch>(async (url) =>
    new URL(String(url)).pathname === "/today" ? reply() : response(404, {}),
  );
  vi.stubGlobal("fetch", fetchFn);
  return fetchFn;
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const render = (ui: React.ReactElement, path = "/today") =>
  plainRender(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

beforeAll(() => {
  Element.prototype.setPointerCapture ??= () => undefined;
  // jsdom has no matchMedia; the layer reads it.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
});

const OVERDUE = item(
  "treatment_overdue",
  "treatments",
  "Aloe",
  "„Aloe“: Läuse – überfällig seit 10 Tagen.",
  "Hake den Termin ab.",
);
const PHASE = item(
  "phase_deviation",
  "care_phases",
  "Efeu",
  "„Efeu“ steht nicht am Soll-Standort.",
  "Stelle es um.",
);
const INCOMPLETE = item(
  "specimen_incomplete",
  "hints",
  "Zeder",
  "„Zeder“ hat noch keinen Standort.",
  "Weise einen Standort zu.",
);

describe("US-QS-18 the most urgent item of Heute", () => {
  it("US-QS-18 shows the date, the single most urgent item with a short chip and its action, the rest behind one opener", async () => {
    fakeServer(() =>
      response(200, { date: "2026-10-03", upcoming: 2, items: [OVERDUE, PHASE, INCOMPLETE] }),
    );
    const onOpen = vi.fn();
    render(<TodayPage api="http://api" token={token} onOpen={onOpen} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    // One compact row; the summary line already counts, so no repeated sentence or heading (US-QS-18).
    expect(await screen.findByText("Stand: 03.10.2026")).toBeTruthy();
    expect(screen.queryByText("3 Dinge stehen an.")).toBeNull();
    expect(screen.queryByText("Jetzt dran")?.className).toBe("sr-only");
    // The chip says the state, number and unit joined by a non-breaking space; no heading and no repeated sentence.
    const chip = screen.getByText("10 Tage überfällig");
    expect(chip.textContent).toBe("10\u00a0Tage überfällig");
    expect(screen.queryByText("Überfällig")).toBeNull();
    expect(screen.queryByText(/überfällig seit/)).toBeNull();
    expect(screen.queryByText("Efeu")).toBeNull();
    // The further tasks and the later treatments share one row (US-QS-18).
    expect(screen.getByRole("button", { name: /Weitere Aufgaben.*2 Termine später/ })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zu Behandlung: Aloe" }));
    expect(onOpen).toHaveBeenCalledWith("treatments");
  });

  it("US-QS-18 · TE-07 P-09 the further items open as a layer by address, each with its state word and its way", async () => {
    fakeServer(() =>
      response(200, { date: "2026-10-03", upcoming: 0, items: [OVERDUE, PHASE, INCOMPLETE] }),
    );
    const onOpen = vi.fn();
    render(<TodayPage api="http://api" token={token} onOpen={onOpen} />, "/today?sheet=tasks");
    const layer = await screen.findByRole("dialog", { name: "Weitere Aufgaben" });
    for (const word of ["Abweichung", "Angaben fehlen"])
      expect(within(layer).getByText(word)).toBeTruthy();
    await userEvent.click(within(layer).getByRole("button", { name: "Zu Pflegephasen: Efeu" }));
    expect(onOpen).toHaveBeenCalledWith("care_phases");
  });

  it("US-QS-18 the opener of the layer opens it", async () => {
    fakeServer(() => response(200, { date: "2026-10-03", upcoming: 0, items: [OVERDUE, PHASE] }));
    render(<TodayPage api="http://api" token={token} onOpen={() => undefined} />);
    await userEvent.click(await screen.findByRole("button", { name: /Weitere Aufgaben/ }));
    expect(await screen.findByRole("dialog", { name: "Weitere Aufgaben" })).toBeTruthy();
  });

  it("US-QS-18 · A-02 the further tasks are compact rows: the action sentence is not repeated on every row, four per page on a phone", async () => {
    const more = Array.from({ length: 5 }, (_, i) =>
      item(
        "phase_deviation",
        "care_phases",
        `Pflanze ${i + 1}`,
        `„Pflanze ${i + 1}“ steht nicht am Soll-Standort.`,
        "Stelle es um.",
      ),
    );
    fakeServer(() => response(200, { date: "2026-10-03", upcoming: 0, items: [OVERDUE, ...more] }));
    render(
      <TodayPage api="http://api" token={token} onOpen={() => undefined} />,
      "/today?sheet=tasks",
    );
    const layer = await screen.findByRole("dialog", { name: "Weitere Aufgaben" });
    expect(within(layer).queryAllByText("Stelle es um.")).toHaveLength(0);
    expect(within(layer).getAllByRole("listitem")).toHaveLength(4);
    expect(within(layer).getByText("Seite 1 von 2")).toBeTruthy();
    expect(within(layer).getByRole("button", { name: "Zu Pflegephasen: Pflanze 1" })).toBeTruthy();
  });

  it("US-QS-04 · US-QS-18 an etiolated measurement and a zone below the buffer show their state word and lead to their place", async () => {
    fakeServer(() =>
      response(200, {
        date: "2026-10-03",
        upcoming: 0,
        items: [
          item(
            "measurement_etiolated",
            "measurements",
            "Aloe",
            "„Aloe“: Die letzte Messung vom 01.10.2026 ist vergeilt/dünn.",
            "Stelle die Pflanze heller.",
          ),
          {
            ...item(
              "buffer_low",
              "wishlist",
              "x",
              "Nachschub nötig: Lampe 3 (0 offene Kandidaten)",
              "Erfasse einen Wunsch.",
            ),
            specimenId: null,
            specimenName: null,
          },
        ],
      }),
    );
    const onOpen = vi.fn();
    const first = render(<TodayPage api="http://api" token={token} onOpen={onOpen} />);
    expect(await screen.findByText("Vergeilt")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zum Messen: Aloe" }));
    expect(onOpen).toHaveBeenLastCalledWith("measurements");
    first.unmount();
    render(<TodayPage api="http://api" token={token} onOpen={onOpen} />, "/today?sheet=tasks");
    const layer = await screen.findByRole("dialog", { name: "Weitere Aufgaben" });
    expect(within(layer).getByText("Nachschub")).toBeTruthy();
    await userEvent.click(
      within(layer).getByRole("button", {
        name: "Zur Wunschliste: Nachschub nötig: Lampe 3 (0 offene Kandidaten)",
      }),
    );
    expect(onOpen).toHaveBeenLastCalledWith("wishlist");
  });

  it("US-QS-18 · TE-07 P-10 an empty list says that nothing is due, names what is ahead and offers the collection", async () => {
    fakeServer(() => response(200, { date: "2026-10-03", upcoming: 1, items: [] }));
    const onOpen = vi.fn();
    render(<TodayPage api="http://api" token={token} onOpen={onOpen} />);
    expect(await screen.findByText("Heute steht nichts an.")).toBeTruthy();
    expect(screen.getByText("Ein weiterer Behandlungstermin steht später an.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zur Sammlung" }));
    expect(onOpen).toHaveBeenCalledWith("collection");
  });

  it("US-QS-18 · P-10 the summary and the tiles stay when the list fails, and the error has a retry", async () => {
    fakeServer(() =>
      response(500, { error: { code: "server.error", text: "Der Server antwortet nicht." } }),
    );
    render(
      <TodayPage
        api="http://api"
        token={token}
        onOpen={() => undefined}
        summary={<p>Zusammenfassung</p>}
        tiles={<p>Kacheln</p>}
      />,
    );
    expect(await screen.findByText("Der Server antwortet nicht.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(screen.getByText("Zusammenfassung")).toBeTruthy();
    expect(screen.getByText("Kacheln")).toBeTruthy();
    expect(screen.queryByText("Heute steht nichts an.")).toBeNull();
  });
});
