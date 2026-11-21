// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { ToastProvider } from "@/shared/patterns/states/toast/toast-provider/toast-provider";
import { LayerSheet } from "@/shared/patterns/responsive/layer-sheet/layer-sheet";
import { useInvalidate, useQueryClient, type QueryClient } from "@/shared/data";
import { AnniversaryLayer, AnniversaryTile } from "@/achievements";
import { TREATMENTS } from "@/care";
import { TODAY_LIST_KEY } from "@/today";
import { TodayArea } from "./today-area";

const response = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

const treatment = (id: string, name: string, kind: string, text: string) => ({
  id,
  specimenId: `s-${id}`,
  specimenName: name,
  reason: `Grund ${id}`,
  agent: null,
  dueAt: "2026-10-01",
  status: { kind, text },
});
/** A hint about incomplete specimens, as the API lists it under Fehlt noch (`SpecimenHint`). */
const noLocation = {
  kind: "location_missing",
  specimenId: "e1",
  specimenName: "Bogenhanf",
  locationId: null,
  text: "„Bogenhanf“ hat noch keinen Standort.",
  nextAction: "Weise der Pflanze einen Standort zu.",
};
/** The same missing location on the list of "Heute": kind `specimen_incomplete`, id `hint:<specimen>:<kind>` (core `todayStatus`). */
const noLocationItem = {
  id: "hint:e1:location_missing",
  kind: "specimen_incomplete",
  specimenId: "e1",
  specimenName: "Bogenhanf",
  text: noLocation.text,
  nextAction: noLocation.nextAction,
  target: "hints",
};
/** The overdue treatment "a" of Aloe on the list of "Heute": id `treatment:<id>` (core `treatmentItem`). */
const todayItem = {
  id: "treatment:a",
  kind: "treatment_overdue",
  specimenId: "s-a",
  specimenName: "Aloe",
  text: "„Aloe“: Läuse – überfällig seit 2 Tagen.",
  nextAction: "Hake den Termin ab.",
  target: "treatments",
};

/** Four further tasks below the tiles (not treatments): the fitted list of "Heute" that shares the address (F-0351). */
const FURTHER_TASKS = [
  {
    id: "f1",
    kind: "specimen_incomplete",
    specimenId: "s-f1",
    specimenName: "Bogenhanf",
    text: "„Bogenhanf“ hat noch keinen Standort.",
    nextAction: "Weise der Pflanze einen Standort zu.",
    target: "hints",
  },
  {
    id: "f2",
    kind: "phase_deviation",
    specimenId: "s-f2",
    specimenName: "Efeu",
    text: "„Efeu“ steht nicht am Soll-Standort.",
    nextAction: "Stelle es um.",
    target: "care_phases",
  },
  {
    id: "f3",
    kind: "measurement_etiolated",
    specimenId: "s-f3",
    specimenName: "Farn",
    text: "„Farn“: Die letzte Messung ist vergeilt/dünn.",
    nextAction: "Stelle die Pflanze heller.",
    target: "measurements",
  },
  {
    id: "f4",
    kind: "specimen_incomplete",
    specimenId: "s-f4",
    specimenName: "Zeder",
    text: "„Zeder“ hat noch keine Lichtzone.",
    nextAction: "Weise eine Lichtzone zu.",
    target: "hints",
  },
];

/** Ten plants due to be watered (US-MON-05): the layer Gießen pages three per page on a phone (issue 2070). */
const TEN_DUE = Array.from({ length: 10 }, (_, i) => ({
  specimenId: `w${i + 1}`,
  name: `Gieß ${i + 1}`,
  intervalDays: 7,
  lastWateredOn: "2026-09-30",
  daysSince: 8 + i,
}));

type Setup = {
  treatments?: unknown[];
  hints?: unknown[];
  specimens?: unknown[];
  /** The cards of the planning form: name and location of every plant (US-BEH-01). */
  cards?: unknown[];
  hintsStatus?: number;
  items?: unknown[];
  /** The anniversaries of US-ACH-06 due today; without it the endpoint is not there (no card). */
  anniversaries?: unknown;
  /** The plants due to be watered today (US-MON-05, US-QS-26). */
  due?: unknown[];
};

const SPECIMENS = [{ id: "s-a", name: "Aloe", status: "plant" }];
const CARDS = [{ id: "s-a", name: "Aloe", location: "Fensterbank" }];
// The first page and the summary of the plants, as the API answers them (FR-BES-23).
const pageOf = (list: readonly unknown[]) => ({
  cards: list,
  total: list.length,
  next: null,
});
const summaryOf = (list: readonly unknown[]) => ({
  total: list.length,
  unplaced: (list as { location: string | null }[]).filter((c) => c.location === null).length,
  groups: [],
  lastLocation: null,
  anyMeasured: false,
});
/** Five plants on two pages on a phone, with two locations and one plant without one (US-BEH-01). */
const FIVE = [
  { id: "p1", name: "Aloe", location: "Fensterbank" },
  { id: "p2", name: "Basilikum", location: "Fensterbank" },
  { id: "p3", name: "Cyclamen", location: "Balkon" },
  { id: "p4", name: "Dill", location: null },
  { id: "p5", name: "Efeu", location: "Balkon" },
];
const LOCATIONS = [{ id: "l1", name: "Regal", lightZoneId: null }];

/** A server for the three sections; it returns what is posted. */
function fakeServer(setup: Setup = {}) {
  // The rows the server holds: a write takes its row away or adds one, so the next read shows the change (SG-FEED-01).
  let open: unknown[] = setup.treatments ?? [
    treatment("a", "Aloe", "overdue", "überfällig seit 2 Tagen"),
  ];
  let today: unknown[] = [...(setup.items ?? [])];
  let hintRows: unknown[] = [...(setup.hints ?? [noLocation])];
  const posts: string[] = [];
  const hints = () =>
    setup.hintsStatus && setup.hintsStatus !== 200
      ? response(setup.hintsStatus, { error: { code: "server.error", text: "x" } })
      : response(200, { hints: hintRows });
  const names = (setup.cards ?? setup.specimens ?? CARDS) as { id: string; name: string }[];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const post = init?.method === "POST";
      if (post) posts.push(path);
      const located = /^\/specimens\/([^/]+)\/location$/.exec(path);
      if (post && located) {
        const id = located[1];
        hintRows = hintRows.filter((h) => (h as { specimenId?: string }).specimenId !== id);
        today = today.filter((i) => (i as { id?: string }).id !== `hint:${id}:location_missing`);
        return response(200, {});
      }
      const answers: Record<string, () => Promise<Response>> = {
        "/today": () => response(200, { date: "2026-10-03", upcoming: 0, items: today }),
        "/treatments": () => {
          if (!post) return response(200, { treatments: open });
          const body = JSON.parse(String(init?.body)) as {
            specimenIds: string[];
            reason: string;
            agent?: string;
            date: string;
          };
          const nameOf = (specimenId: string) =>
            names.find((n) => n.id === specimenId)?.name ?? specimenId;
          const rows = body.specimenIds.map((specimenId) => ({
            id: `new-${specimenId}`,
            specimenId,
            specimenName: nameOf(specimenId),
            reason: body.reason,
            agent: body.agent ?? null,
            dueAt: body.date,
            status: { kind: "today", text: "heute fällig" },
          }));
          open = [...open, ...rows];
          // The server lists a treatment due today on the first card of Heute, as `treatment:<id>` (SG-FEED-01).
          today = [
            ...today,
            ...rows.map((r) => ({
              id: `treatment:${r.id}`,
              kind: "treatment_due",
              specimenId: r.specimenId,
              specimenName: r.specimenName,
              text: `„${r.specimenName}“: ${r.reason} – heute fällig.`,
              nextAction: "Behandle die Pflanze und hake den Termin als erledigt ab.",
              target: "treatments",
            })),
          ];
          return response(201, { treatments: [{}] });
        },
        "/watering/due": () => response(200, { due: setup.due ?? [] }),
        "/specimens/count": () => response(200, { count: 1, archived: 0 }),
        "/onboarding/hints": () => response(200, { hint: null, guideEnded: false }),
        "/specimens": () => response(200, { specimens: setup.specimens ?? SPECIMENS }),
        "/specimens/cards": () => response(200, pageOf(setup.cards ?? setup.specimens ?? CARDS)),
        "/specimens/cards/summary": () =>
          response(200, summaryOf(setup.cards ?? setup.specimens ?? CARDS)),
        "/specimens/treatable": () =>
          response(200, { specimens: setup.cards ?? setup.specimens ?? CARDS }),
        "/specimens/hints": hints,
        "/locations": () => response(200, { locations: LOCATIONS }),
        "/achievements/anniversaries": () =>
          response(200, setup.anniversaries ?? { calmMode: true }),
      };
      const completed = /^\/treatments\/([^/]+)\/complete$/.exec(path);
      if (completed) {
        const id = completed[1];
        open = open.filter((r) => (r as { id?: string }).id !== id);
        today = today.filter((i) => (i as { id?: string }).id !== `treatment:${id}`);
        return response(200, {
          treatment: { id, done: true, doneAt: "2026-10-03" },
          changed: true,
        });
      }
      return (answers[path] ?? (() => response(404, {})))();
    }),
  );
  return posts;
}

const area = (onOpen: (v: string) => void = () => undefined) => (
  <TodayArea api="http://api" token={async () => "tok"} onOpen={onOpen as never} />
);
function Address() {
  const { pathname, search, hash } = useLocation();
  return <output data-testid="address">{`${pathname}${search}${hash}`}</output>;
}
const address = () => screen.getByTestId("address").textContent;
const show = (path = "/today", onOpen?: (v: string) => void) =>
  render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        {area(onOpen)}
        <Address />
      </MemoryRouter>
    </ToastProvider>,
  );
const dialog = (name: string) => screen.findByRole("dialog", { name });

/**
 * Gives every fitted list (`data-page-fit`) a region of `height` px with rows of `row` px: jsdom has no layout, and the page
 * size of a fitted list comes from its region (US-QS-19). Returns the restore of the spy.
 */
function stubFittedRegion(height: number, row = height): () => void {
  const measured = Element.prototype.getBoundingClientRect;
  const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (
    this: Element,
  ) {
    const region = this.tagName === "UL" && this.hasAttribute("data-page-fit");
    const fittedRow =
      this.tagName === "LI" && this.parentElement?.hasAttribute("data-page-fit") === true;
    if (!region && !fittedRow) return measured.call(this);
    const h = region ? height : row;
    return { height: h, width: 0, top: 0, left: 0, right: 0, bottom: h, x: 0, y: 0 } as DOMRect;
  });
  return () => spy.mockRestore();
}

/**
 * The "Seite n von m" texts outside the layer: the lists of the screen behind it stay in the document while the layer is
 * open, so a page change in the layer must leave them where they are (issue 2070).
 */
function positionsBehind(layer: HTMLElement): (string | null)[] {
  return screen
    .getAllByText(/^Seite \d+ von \d+$/)
    .filter((el) => !layer.contains(el))
    .map((el) => el.textContent);
}

beforeAll(async () => {
  Element.prototype.setPointerCapture ??= () => undefined;
  // jsdom has no matchMedia, the responsive modal reads it.
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
  // The sections are lazy parts: loading them first keeps the waits below on the data (#444).
  await Promise.all([
    import("@/today/today-page/today-page"),
    import("@/care/treatments/treatments-page/treatments-page"),
    import("@/collection/other-pages/hints-page/hints-page"),
    import("@/monitoring/watering/watering-list/watering-list"),
    import("@/achievements"),
  ]);
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

describe("US-QS-18 Heute fits one screen", () => {
  it("US-QS-18 with an urgent treatment first, exactly one control opens the treatments layer: it names the count and the overdue ones, and no treatments tile exists", async () => {
    fakeServer({ items: [todayItem] });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    const entry = await screen.findByRole("button", { name: /^Behandlungen 1 · 1.überfällig$/ });
    expect(entry.textContent).toBe("Behandlungen 1 · 1\u00a0überfällig");
    // The action of the row is the entry; the summary line no longer carries the treatments.
    expect(screen.queryByRole("button", { name: /^Zu Behandlung/ })).toBeNull();
    expect(screen.queryByText(/Behandlung offen/)).toBeNull();
    const tiles = within(screen.getByRole("list", { name: "Themen" }));
    expect(tiles.queryByRole("button", { name: /Behandeln|Behandlungen/ })).toBeNull();
    expect(tiles.getAllByRole("listitem")).toHaveLength(2);
    expect(tiles.getByRole("button", { name: /^0 Gießen$/ })).toBeTruthy();
    expect(tiles.getByRole("button", { name: /^1 Fehlt noch$/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Behandlungen/ })).toHaveLength(1);
    // The topics are layers: no section of them stands on the page.
    expect(screen.queryByRole("heading", { level: 2, name: "Behandlungen" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-18 with another item first and open treatments, the Behandlungen tile exists once and the summary names the treatments", async () => {
    fakeServer({
      items: [{ ...todayItem, id: "p", kind: "phase_deviation", target: "care_phases" }],
    });
    show();
    const tiles = within(await screen.findByRole("list", { name: "Themen" }));
    expect((await tiles.findByRole("button", { name: /^1 Behandlung$/ })).textContent).toBe(
      "1 Behandlung",
    );
    expect(tiles.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Behandlung(en)?$/ })).toHaveLength(1);
    expect(screen.getByText(/1 Behandlung offen, davon 1 überfällig/)).toBeTruthy();
  });

  it("US-QS-18 · P-10 a treatments load that is still running or failed stays visible on the entry or tile", async () => {
    fakeServer({ items: [todayItem] });
    const fetchFn = vi.mocked(fetch);
    const base = fetchFn.getMockImplementation();
    fetchFn.mockImplementation(async (url, init) =>
      new URL(String(url)).pathname === "/treatments"
        ? response(500, { error: { code: "server.error", text: "x" } })
        : (base as typeof fetch)(url, init),
    );
    show();
    const entry = await screen.findByRole("button", { name: /^Behandlungen/ });
    await waitFor(() => expect(entry.textContent).toContain("nicht geladen"));
  });

  it("US-QS-18 the category tiles stand three in a row while a label fits and stack when the text is larger (issue 1019)", async () => {
    fakeServer({ items: [todayItem] });
    show();
    const list = await screen.findByRole("list", { name: "Themen" });
    expect(list.className).toContain("grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))]");
  });

  it("US-QS-18 · issue 1156 tiles of other modules stand after the categories, drawn the same way, and open their layer", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/today"]}>
          <TodayArea
            api="http://api"
            token={async () => "tok"}
            onOpen={() => undefined}
            tiles={[
              {
                id: "news",
                tile: (draw) => draw(2, "Neu bei Freunden", "news"),
                layer: (
                  <LayerSheet id="news" title="Neu bei Freunden">
                    <p>Clara: 2 × Glücksfeder</p>
                  </LayerSheet>
                ),
              },
              { id: "locked", tile: () => null, layer: null },
            ]}
          />
          <Address />
        </MemoryRouter>
      </ToastProvider>,
    );
    const tiles = await screen.findByRole("list", { name: "Themen" });
    const names = within(tiles)
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names.at(-1)).toBe("2 Neu bei Freunden");
    // The most urgent item is a treatment: its entry stands on the row, so the tiles are the two categories and the news.
    expect(names).toHaveLength(3);
    await user.click(within(tiles).getByRole("button", { name: /Neu bei Freunden$/ }));
    expect(await dialog("Neu bei Freunden")).toBeTruthy();
    expect(address()).toBe("/today?sheet=news");
  });

  it("US-QS-18 a tile opens its items as a layer by address; Back-able and with the layer heading", async () => {
    fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: /Behandlung(en)?$/ }));
    const layer = await dialog("Behandlungen");
    expect(address()).toBe("/today?sheet=treatments");
    expect(
      await within(layer).findByRole("heading", { level: 3, name: "Offene Behandlungen" }),
    ).toBeTruthy();
  });

  it.each([
    ["treatments", "Behandlungen"],
    ["watering", "Gießen"],
    ["hints", "Fehlt noch"],
  ])("US-QS-18 /today?sheet=%s opens the layer %s", async (sheet, name) => {
    fakeServer();
    show(`/today?sheet=${sheet}`);
    expect(await dialog(name)).toBeTruthy();
  });

  it.each([
    ["#behandlungen", "Behandlungen", "treatments"],
    ["#giessen", "Gießen", "watering"],
    ["#fehlt-noch", "Fehlt noch", "hints"],
  ])(
    "US-QS-18 the former address /today%s opens the layer %s and the address is replaced",
    async (hash, name, sheet) => {
      fakeServer();
      show(`/today${hash}`);
      expect(await dialog(name)).toBeTruthy();
      expect(address()).toBe(`/today?sheet=${sheet}`);
    },
  );

  it("US-QS-18 an unknown anchor changes nothing", async () => {
    fakeServer();
    show("/today#gibt-es-nicht");
    await screen.findByRole("heading", { level: 1, name: "Heute" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(address()).toBe("/today#gibt-es-nicht");
  });

  it("US-QS-18 · TE-07 the Behandlungen entry in Jetzt dran opens the layer Behandlungen", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: /^Behandlungen/ }));
    expect(await dialog("Behandlungen")).toBeTruthy();
    expect(address()).toBe("/today?sheet=treatments");
  });

  it("US-QS-32 · TE-07 the other actions of Jetzt dran are links to their view", async () => {
    fakeServer({
      items: [{ ...todayItem, id: "p", kind: "phase_deviation", target: "care_phases" }],
    });
    const open = vi.fn();
    show("/today", open);
    const link = await screen.findByRole("link", { name: /^Abweichung/ });
    expect(link.getAttribute("href")).toBe("/collection?view=plants&group=phase");
    expect(open).not.toHaveBeenCalled();
  });

  it("US-QS-18 nothing open says so with the next step, and the tiles stay", async () => {
    fakeServer({ treatments: [], hints: [] });
    show();
    expect(await screen.findByText("Heute steht nichts an")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Zur Sammlung" }).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /^0 Behandlungen$/ })).toBeTruthy();
  });
});

/** Two plants due to be watered today (US-MON-05). */
const DUE = [
  { specimenId: "w1", name: "Ficus", intervalDays: 7, lastWateredOn: "2026-10-03", daysSince: 7 },
  { specimenId: "w2", name: "Basilikum", intervalDays: 3, lastWateredOn: null, daysSince: 3 },
];
const FILTER_NOTICE = "Nur Gießen ist angezeigt.";
const HIDDEN_NOTICE = "Behandlungen und fehlende Angaben sind ausgeblendet.";

describe("US-QS-26 Heute narrowed to the watering tasks by its address", () => {
  it("US-QS-26 /today?tasks=watering shows only the watering tasks: a notice names the filter and what stays hidden, and no category or treatment shows", async () => {
    fakeServer({ due: DUE, items: [todayItem] });
    show("/today?tasks=watering");
    expect(await screen.findByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    expect(screen.getByText(FILTER_NOTICE)).toBeTruthy();
    expect(screen.getByText(HIDDEN_NOTICE)).toBeTruthy();
    expect(await screen.findByText("Ficus")).toBeTruthy();
    expect(screen.getByText("Basilikum")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Themen" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Behandlungen/ })).toBeNull();
    expect(screen.queryByText(/überfällig seit 2 Tagen/)).toBeNull();
    expect(address()).toBe("/today?tasks=watering");
  });

  it('US-QS-26 each watering row keeps its action: "Gegossen" stays on the row of the filtered list', async () => {
    fakeServer({ due: DUE });
    show("/today?tasks=watering");
    expect(
      await screen.findByRole("button", { name: "Ficus als gegossen eintragen" }),
    ).toBeTruthy();
  });

  it('US-QS-26 the button "Alle Aufgaben zeigen" clears the filter: the address loses it and the whole day with its tiles shows again', async () => {
    fakeServer({ due: DUE, items: [todayItem] });
    const user = userEvent.setup();
    show("/today?tasks=watering");
    await user.click(await screen.findByRole("button", { name: "Alle Aufgaben zeigen" }));
    expect(address()).toBe("/today");
    const tiles = within(await screen.findByRole("list", { name: "Themen" }));
    expect(tiles.getByRole("button", { name: /^2 Gießen$/ })).toBeTruthy();
    expect(screen.queryByText(FILTER_NOTICE)).toBeNull();
  });

  it("US-QS-26 with nothing due the filtered page still says what it shows and why the list is empty (P-09, P-10)", async () => {
    fakeServer({ due: [] });
    show("/today?tasks=watering");
    expect(await screen.findByText(/^Heute nichts zu gießen\./)).toBeTruthy();
    expect(screen.getByText(FILTER_NOTICE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Alle Aufgaben zeigen" })).toBeTruthy();
  });

  it("US-QS-26 an unknown tasks value shows the whole day without a notice", async () => {
    fakeServer({ due: DUE, items: [todayItem] });
    show("/today?tasks=treatments");
    expect(await screen.findByRole("list", { name: "Themen" })).toBeTruthy();
    expect(screen.queryByText(FILTER_NOTICE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Alle Aufgaben zeigen" })).toBeNull();
  });
});

describe("US-QS-18 Heute stays one column, with or without an anniversary", () => {
  const ANNIVERSARY = {
    calmMode: false,
    items: [
      {
        specimenId: "s-a",
        name: "Aloe",
        months: 12,
        date: "2026-10-03",
        caughtOn: "2025-10-03",
        first: null,
        latest: null,
      },
    ],
  };
  /** The frame of Heute: its content column is the first child, the pane column the second one (US-QS-15). */
  const columns = (container: HTMLElement) => {
    const frame = container.querySelector("[data-layer-host]") as HTMLElement;
    return {
      content: frame.firstElementChild as HTMLElement,
      pane: frame.lastElementChild as HTMLElement,
    };
  };

  it("US-ACH-06 the anniversaries are a tile in the content column, never a column beside it (#1027, issue 1662)", async () => {
    fakeServer({ anniversaries: ANNIVERSARY });
    const { container } = render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/today"]}>
          <TodayArea
            api="http://api"
            token={async () => "tok"}
            onOpen={(() => undefined) as never}
            tiles={[
              {
                id: "anniversaries",
                tile: (draw) => (
                  <AnniversaryTile api="http://api" token={async () => "tok"} tile={draw} />
                ),
                layer: <AnniversaryLayer api="http://api" token={async () => "tok"} />,
              },
            ]}
          />
        </MemoryRouter>
      </ToastProvider>,
    );
    const tile = await screen.findByRole("button", { name: "1 Jubiläum" });
    const { content, pane } = columns(container);
    expect(content.contains(tile)).toBe(true);
    expect(pane.contains(tile)).toBe(false);
    expect(pane.childElementCount).toBe(0);
  });

  it("US-QS-18 Heute without an anniversary has the same two columns: the pane column stays empty (#1027)", async () => {
    fakeServer();
    const { container } = show();
    await screen.findByRole("heading", { level: 1, name: "Heute" });
    const { content, pane } = columns(container);
    expect(content.contains(screen.getByRole("heading", { level: 1, name: "Heute" }))).toBe(true);
    expect(pane.childElementCount).toBe(0);
  });
});

describe("US-QS-18 the layers keep the actions of their items", () => {
  it("US-QS-18 · US-BEH-03 Erledigt works in the layer Behandlungen, says what was ticked off and the row keeps its undo", async () => {
    const posts = fakeServer();
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect(
      await screen.findByRole("button", { name: "Rückgängig: Grund a bei Aloe" }),
    ).toBeTruthy();
    expect(posts).toEqual(["/treatments/a/complete"]);
  });

  it("US-QS-18 · US-BEH-02 the open treatments stand by urgency with a short chip and are paged", async () => {
    // Paging starts at 768 px; the layer stays a sheet below 1024 px (a pane there has no dialog role).
    setViewportWidth(768);
    fakeServer({
      treatments: [
        treatment("a", "Aloe", "overdue", "überfällig seit 10 Tagen"),
        treatment("b", "Efeu", "overdue", "überfällig seit 3 Tagen"),
        treatment("c", "Farn", "today", "heute fällig"),
        treatment("d", "Gummibaum", "soon", "in 2 Tagen"),
      ],
    });
    show("/today?sheet=treatments");
    const layer = await dialog("Behandlungen");
    const list = await within(layer).findByRole("list", { name: "Offene Behandlungen" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("10 Tage überfällig").textContent).toBe(
      "10\u00a0Tage überfällig",
    );
    expect(within(layer).getByText("Seite 1 von 2")).toBeTruthy();
  });

  it("US-QS-18 · F-0351 ten open treatments, two per page, beside the fitted further tasks of Heute: Weiter moves one page each time to page 5 of 5", async () => {
    // Paging starts at 768 px; the layer stays a sheet below 1024 px (a pane there has no dialog role).
    setViewportWidth(768);
    const ten = Array.from({ length: 10 }, (_, i) =>
      treatment(`t${i}`, `Pflanze ${i + 1}`, "overdue", `überfällig seit ${i + 1} Tagen`),
    );
    // Four further tasks under the tiles: a fitted list of one row per page on the same screen (US-QS-19).
    fakeServer({ treatments: ten, items: [todayItem, ...FURTHER_TASKS] });
    const restore = stubFittedRegion(100);
    try {
      const user = userEvent.setup();
      show("/today?sheet=treatments");
      const layer = await dialog("Behandlungen");
      const list = await within(layer).findByRole("list", { name: "Offene Behandlungen" });
      const names = () =>
        within(list)
          .getAllByRole("heading", { level: 4 })
          .map((h) => h.textContent);
      const position = () => within(layer).getByText(/^Seite \d+ von \d+$/).textContent;
      const pages: string[][] = [];
      for (let page = 1; page <= 5; page++) {
        expect(position()).toBe(`Seite ${page} von 5`);
        pages.push(names());
        if (page < 5) await user.click(within(layer).getByRole("button", { name: "Weiter" }));
      }
      expect(pages).toEqual([
        ["Pflanze 1", "Pflanze 2"],
        ["Pflanze 3", "Pflanze 4"],
        ["Pflanze 5", "Pflanze 6"],
        ["Pflanze 7", "Pflanze 8"],
        ["Pflanze 9", "Pflanze 10"],
      ]);
      expect(within(layer).getByRole("button", { name: "Weiter" }).hasAttribute("disabled")).toBe(
        true,
      );
      // The further tasks behind the layer keep their page: the two lists do not share the address (issue 2070).
      expect(positionsBehind(layer)).toEqual(["Seite 1 von 4"]);
    } finally {
      restore();
    }
  });

  it("US-QS-18 · US-QS-19 · F-0351 ten due plants, three per page, in the layer Gießen beside the fitted further tasks of Heute: Weiter reaches page 4 of 4 and the further tasks keep their page", async () => {
    // Paging starts at 768 px; the layer stays a sheet below 1024 px (a pane there has no dialog role).
    setViewportWidth(768);
    fakeServer({ items: [todayItem, ...FURTHER_TASKS], due: TEN_DUE });
    const restore = stubFittedRegion(100);
    try {
      const user = userEvent.setup();
      show("/today?sheet=watering");
      const layer = await dialog("Gießen");
      const list = await within(layer).findByRole("list", { name: "Zu gießen" });
      const names = () =>
        within(list)
          .getAllByText(/^Gieß \d+$/)
          .map((el) => el.textContent);
      const position = () => within(layer).getByText(/^Seite \d+ von \d+$/).textContent;
      const pages: string[][] = [];
      for (let page = 1; page <= 4; page++) {
        expect(position()).toBe(`Seite ${page} von 4`);
        pages.push(names());
        expect(positionsBehind(layer)).toEqual(["Seite 1 von 4"]);
        if (page < 4) await user.click(within(layer).getByRole("button", { name: "Weiter" }));
      }
      expect(pages).toEqual([
        ["Gieß 1", "Gieß 2", "Gieß 3"],
        ["Gieß 4", "Gieß 5", "Gieß 6"],
        ["Gieß 7", "Gieß 8", "Gieß 9"],
        ["Gieß 10"],
      ]);
      expect(within(layer).getByRole("button", { name: "Weiter" }).hasAttribute("disabled")).toBe(
        true,
      );
    } finally {
      restore();
    }
  });

  it("US-QS-18 · A-05 the layer Behandlungen switches between Offen and Erledigt; the history shows only under Erledigt", async () => {
    fakeServer();
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    const layer = await dialog("Behandlungen");
    const group = within(layer).getByRole("group", { name: "Behandlungen anzeigen" });
    expect(within(group).getByRole("button", { name: "Offen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(layer).queryByLabelText("Pflanze für den Verlauf")).toBeNull();
    await user.click(within(group).getByRole("button", { name: "Erledigt" }));
    expect(await within(layer).findByLabelText("Pflanze für den Verlauf")).toBeTruthy();
    expect(within(layer).queryByRole("button", { name: /als erledigt abhaken/ })).toBeNull();
    // The heading of the history is no bigger than the layer title: it is only for screen readers (US-QS-18).
    expect(
      within(layer).getByRole("heading", { level: 3, name: "Erledigte Behandlungen" }).className,
    ).toContain("sr-only");
  });

  it("US-BEH-01 · A-04 the planning is a layer with search, a location filter and pages of plants; saving returns to Behandlungen", async () => {
    const posts = fakeServer({ cards: FIVE });
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    await user.click(await screen.findByRole("button", { name: "Behandlung planen" }));
    const form = await dialog("Behandlung planen");
    // A list in a layer keeps its pages on a phone (SG-LIST-01: only the lists of pages scroll; issue 1861 owns the layers):
    // three plants per page, the position in text, search and location filter above the list.
    expect(within(form).getByRole("list", { name: "Pflanzen" }).children).toHaveLength(3);
    expect(within(form).getByText("Seite 1 von 2")).toBeTruthy();
    await user.type(within(form).getByRole("searchbox", { name: "Pflanze suchen" }), "EFE");
    expect(within(form).queryByRole("checkbox", { name: /^Aloe/ })).toBeNull();
    expect(within(form).getByRole("checkbox", { name: /^Efeu/ })).toBeTruthy();
    await user.clear(within(form).getByRole("searchbox", { name: "Pflanze suchen" }));
    await user.selectOptions(within(form).getByRole("combobox", { name: "Standort" }), "Balkon");
    const balcony = within(form).getByRole("list", { name: "Pflanzen" });
    expect(within(balcony).getAllByRole("listitem")).toHaveLength(2);
    expect(within(form).queryByText("Seite 1 von 2")).toBeNull();
    await user.selectOptions(within(form).getByRole("combobox", { name: "Standort" }), "");
    await user.click(within(form).getByRole("checkbox", { name: /^Aloe/ }));
    // The date and the reason are one view further; the save button stays in the layer's footer.
    await user.click(within(form).getByRole("button", { name: "Termin" }));
    await user.type(within(form).getByLabelText(/Grund/), "Läuse");
    // The save button sits in the footer outside the scrolling list and submits the form by its id (sticky footer).
    const save = within(form).getByRole("button", { name: "Behandlung sichern" });
    expect(document.getElementById(save.getAttribute("form") ?? "")?.tagName).toBe("FORM");
    await user.click(within(form).getByRole("button", { name: "Behandlung sichern" }));
    await waitFor(() => expect(posts).toContain("/treatments"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Behandlung planen" })).toBeNull(),
    );
    expect(address()).toBe("/today?sheet=treatments");
    expect(await screen.findByText(/Termin.* geplant/)).toBeTruthy();
  });

  it("US-BEH-01 · A-04 · US-QS-32 an invalid plan opens the view of the first missing entry: no plant, then no reason", async () => {
    fakeServer({ cards: FIVE });
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    await user.click(await screen.findByRole("button", { name: "Behandlung planen" }));
    const form = await dialog("Behandlung planen");
    await user.click(within(form).getByRole("button", { name: "Behandlung sichern" }));
    expect(await within(form).findByText("Wähle mindestens eine Pflanze.")).toBeTruthy();
    expect(
      within(form)
        .getByRole("button", { name: "Pflanzen (0), 1 Angabe fehlt" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // A plant is chosen, the reason is missing: the view moves to the reason and names it.
    await user.click(within(form).getByRole("checkbox", { name: /^Aloe/ }));
    await user.click(within(form).getByRole("button", { name: "Behandlung sichern" }));
    expect(
      await within(form).findByText("Nenne einen Grund, zum Beispiel Wollläuse."),
    ).toBeTruthy();
    expect(
      within(form)
        .getByRole("button", { name: "Termin, 1 Angabe fehlt" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    // The text is committed before the view moves and the reason takes the focus, one commit later: wait for the focus.
    await waitFor(() => expect(within(form).getByLabelText(/Grund/)).toBe(document.activeElement));
  });

  it("US-QS-18 · US-BEH-03 the history per plant stays reachable in the layer under Erledigt", async () => {
    fakeServer();
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    await user.click(await screen.findByRole("button", { name: "Erledigt" }));
    expect(await screen.findByLabelText("Pflanze für den Verlauf")).toBeTruthy();
  });

  it("US-QS-18 · US-PHA-03 a plant without a location gets one inline in the layer Fehlt noch", async () => {
    const posts = fakeServer();
    const user = userEvent.setup();
    show("/today?sheet=hints");
    await user.selectOptions(await screen.findByLabelText("Standort für „Bogenhanf“"), "l1");
    await user.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    await waitFor(() => expect(posts).toContain("/specimens/e1/location"));
  });

  it("US-QS-18 · US-MON-05 the layer Gießen shows the empty state with its next step", async () => {
    fakeServer();
    show("/today?sheet=watering");
    expect(await screen.findByText(/^Heute nichts zu gießen\./)).toBeTruthy();
  });
});

describe("US-QS-18 every category keeps its next action (P-09, P-10)", () => {
  it("US-QS-18 · US-BES-08 no hints say so with the way to the collection", async () => {
    fakeServer({ hints: [] });
    const open = vi.fn();
    const user = userEvent.setup();
    show("/today?sheet=hints", open);
    const empty = await screen.findByRole("heading", { level: 3, name: "Nichts fehlt" });
    await user.click(
      within(empty.parentElement as HTMLElement).getByRole("button", { name: "Zur Sammlung" }),
    );
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-QS-18 · US-BEH-02 · issue 2233 no open treatment offers planning one, once: the empty line does not repeat it", async () => {
    fakeServer({ treatments: [] });
    show("/today?sheet=treatments");
    const layer = await dialog("Behandlungen");
    const empty = await within(layer).findByText(/^Keine offenen Behandlungen\.$/);
    expect(await within(layer).findAllByRole("button", { name: "Behandlung planen" })).toHaveLength(
      1,
    );
    expect(
      within(empty.parentElement as HTMLElement).queryByRole("button", {
        name: "Behandlung planen",
      }),
    ).toBeNull();
  });

  it("US-QS-18 · US-BEH-01 without a plant the treatments offer Pflanze anlegen", async () => {
    fakeServer({ treatments: [], specimens: [] });
    show("/today?sheet=treatments");
    const empty = await screen.findByText(/^Keine offenen Behandlungen\.$/);
    expect(
      within(empty.parentElement as HTMLElement)
        .getByRole("link", { name: "Pflanze anlegen" })
        .getAttribute("href"),
    ).toBe("/collection/new");
  });

  it("US-QS-18 · P-10 a failing category says so on its tile and in its layer; the other tiles stay usable", async () => {
    fakeServer({ hintsStatus: 500 });
    const user = userEvent.setup();
    show();
    const tiles = within(await screen.findByRole("list", { name: "Themen" }));
    expect(await tiles.findByRole("button", { name: /^nicht geladen Fehlt noch$/ })).toBeTruthy();
    expect(screen.getByText(/Fehlt noch: nicht geladen|Hinweise: nicht geladen/)).toBeTruthy();
    await user.click(tiles.getByRole("button", { name: /Fehlt noch$/ }));
    const alert = await within(await dialog("Fehlt noch")).findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

/** Holds the answer of one path until the returned function is called (US-QS-14 issue 1697). */
function holdPath(path: string): () => void {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((done) => {
    release = done;
  });
  const fetchFn = vi.mocked(fetch);
  const base = fetchFn.getMockImplementation() as typeof fetch;
  fetchFn.mockImplementation(async (url, init) => {
    if (new URL(String(url)).pathname === path) await gate;
    return base(url, init);
  });
  return release;
}

/** The loading statuses of the page: the status texts that say a part is loading (DS-56), not the messages. */
const loadingStatuses = () =>
  screen.queryAllByRole("status").filter((s) => /geladen|lädt/.test(s.textContent ?? ""));

describe("US-QS-14 issue 1697 · Heute loads its counts behind one skeleton", () => {
  it("US-QS-14 issue 1697 · a slow count shows one skeleton for the region, then its tiles and summary once, never a tile of its own", async () => {
    fakeServer({ items: [todayItem] });
    const release = holdPath("/watering/due");
    show();
    await waitFor(() => expect(loadingStatuses()).toHaveLength(1));
    expect(screen.queryByRole("list", { name: "Themen" })).toBeNull();
    expect(screen.queryByText("lädt …")).toBeNull();
    release();
    const tiles = within(await screen.findByRole("list", { name: "Themen" }));
    expect(tiles.getByRole("button", { name: /^0 Gießen$/ })).toBeTruthy();
    expect(loadingStatuses()).toHaveLength(0);
  });

  it("US-QS-14 issue 1697 · a fast load of the counts shows no loading status at all", async () => {
    fakeServer({ items: [todayItem] });
    show();
    expect(await screen.findByRole("list", { name: "Themen" })).toBeTruthy();
    expect(loadingStatuses()).toHaveLength(0);
  });
});

/** How many GET requests the test server got for `path`: the server is the global fetch mock. */
const requestsTo = (path: string) =>
  vi
    .mocked(fetch)
    .mock.calls.filter(
      ([url, init]) => new URL(String(url)).pathname === path && (init?.method ?? "GET") === "GET",
    ).length;

/**
 * A tick-off made outside the sheets of Heute, the way the plant detail's care path makes one: it completes the treatment
 * and invalidates the treatments with the key of the open list (`useInvalidate(TREATMENTS)`, SG-FEED-01).
 */
function OutsideTickOff() {
  const invalidate = useInvalidate(TREATMENTS);
  return (
    <button
      type="button"
      onClick={() => {
        void fetch("http://api/treatments/a/complete", { method: "POST" }).then(() => invalidate());
      }}
    >
      Außerhalb abhaken
    </button>
  );
}

describe("US-QS-18 SG-FEED-01 a write in a sheet of Heute changes the first card of the day", () => {
  it("US-QS-18 · SG-FEED-01 after a tick-off in the layer Behandlungen the first card no longer names that treatment", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(/Läuse/)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^Behandlungen/ }));
    const layer = await dialog("Behandlungen");
    await user.click(
      await within(layer).findByRole("button", {
        name: "Grund a bei Aloe als erledigt abhaken",
      }),
    );
    expect(
      await within(layer).findByRole("button", { name: "Rückgängig: Grund a bei Aloe" }),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Läuse/)).toBeNull());
  });

  it("US-QS-18 · SG-FEED-01 after a location is set from Fehlt noch the first card no longer asks for it", async () => {
    fakeServer({ items: [noLocationItem] });
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(/keinen\s+Standort/)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^1 Fehlt noch$/ }));
    const layer = await dialog("Fehlt noch");
    await user.selectOptions(await within(layer).findByLabelText("Standort für „Bogenhanf“"), "l1");
    await user.click(within(layer).getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    expect(
      await within(layer).findByRole("heading", { level: 3, name: "Nichts fehlt" }),
    ).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/keinen\s+Standort/)).toBeNull());
  });

  it("US-QS-18 · SG-FEED-01 a planned treatment is listed in Offen of the layer Behandlungen at once, without a reload", async () => {
    fakeServer({ treatments: [] });
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    const layer = await dialog("Behandlungen");
    const empty = await within(layer).findByText(/^Keine offenen Behandlungen\.$/);
    expect(empty).toBeTruthy();
    // The one "Behandlung planen" of the layer; the empty line does not repeat it (SG-STATE-01, issue 2233).
    await user.click(await within(layer).findByRole("button", { name: "Behandlung planen" }));
    const form = await dialog("Behandlung planen");
    await user.click(await within(form).findByRole("checkbox", { name: /^Aloe/ }));
    await user.click(within(form).getByRole("button", { name: "Termin" }));
    await user.type(within(form).getByLabelText(/Grund/), "Läuse");
    await user.click(within(form).getByRole("button", { name: "Behandlung sichern" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Behandlung planen" })).toBeNull(),
    );
    const open = within(await dialog("Behandlungen"));
    const list = await open.findByRole("list", { name: "Offene Behandlungen" });
    expect(open.queryByText(/^Keine offenen Behandlungen\.$/)).toBeNull();
    expect(within(list).getByRole("heading", { level: 4, name: "Aloe" })).toBeTruthy();
    expect(within(list).getByText(/Läuse/)).toBeTruthy();
  });

  it("US-QS-18 · SG-FEED-01 a treatment planned for today is the first card of Heute at once, with the tiles", async () => {
    fakeServer({ treatments: [], items: [] });
    const user = userEvent.setup();
    show("/today");
    expect(await screen.findByText("Heute steht nichts an")).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^0 Behandlungen$/ }));
    const layer = await dialog("Behandlungen");
    const empty = await within(layer).findByText(/^Keine offenen Behandlungen\.$/);
    expect(empty).toBeTruthy();
    // The one "Behandlung planen" of the layer; the empty line does not repeat it (SG-STATE-01, issue 2233).
    await user.click(await within(layer).findByRole("button", { name: "Behandlung planen" }));
    const form = await dialog("Behandlung planen");
    await user.click(await within(form).findByRole("checkbox", { name: /^Aloe/ }));
    await user.click(within(form).getByRole("button", { name: "Termin" }));
    await user.type(within(form).getByLabelText(/Grund/), "Läuse");
    await user.click(within(form).getByRole("button", { name: "Behandlung sichern" }));
    // The card of Heute names the planned treatment as due today, without a reload.
    expect(await screen.findByText("Heute fällig")).toBeTruthy();
    expect(screen.queryByText("Heute steht nichts an")).toBeNull();
  });

  it("US-QS-18 · SG-FEED-01 a planned treatment shows in Offen when the answer of the list comes after the layer opened again", async () => {
    const posts = fakeServer({ treatments: [] });
    const fetchFn = vi.mocked(fetch);
    const base = fetchFn.getMockImplementation() as typeof fetch;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((done) => {
      release = done;
    });
    let held = false;
    fetchFn.mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      if (
        path === "/treatments" &&
        init?.method !== "POST" &&
        posts.includes("/treatments") &&
        !held
      ) {
        held = true;
        await gate;
      }
      return base(url, init);
    });
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    const layer = await dialog("Behandlungen");
    const empty = await within(layer).findByText(/^Keine offenen Behandlungen\.$/);
    expect(empty).toBeTruthy();
    // The one "Behandlung planen" of the layer; the empty line does not repeat it (SG-STATE-01, issue 2233).
    await user.click(await within(layer).findByRole("button", { name: "Behandlung planen" }));
    const form = await dialog("Behandlung planen");
    await user.click(await within(form).findByRole("checkbox", { name: /^Aloe/ }));
    await user.click(within(form).getByRole("button", { name: "Termin" }));
    await user.type(within(form).getByLabelText(/Grund/), "Läuse");
    await user.click(within(form).getByRole("button", { name: "Behandlung sichern" }));
    await waitFor(() => expect(held).toBe(true));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Behandlung planen" })).toBeNull(),
    );
    const reopened = within(await dialog("Behandlungen"));
    release();
    const list = await reopened.findByRole("list", { name: "Offene Behandlungen" });
    expect(within(list).getByText(/Läuse/)).toBeTruthy();
  });

  it("US-QS-18 · SG-FEED-01 a tick-off outside the sheets (the plant detail's care path invalidates the treatments) changes the first card of Heute", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/today"]}>
          {area()}
          <OutsideTickOff />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(await screen.findByText(/Läuse/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Außerhalb abhaken" }));
    await waitFor(() => expect(screen.queryByText(/Läuse/)).toBeNull());
  });

  it("US-QS-18 · SG-FEED-01 a watering does not load the first card of Heute again, because no kind of the list derives from it", async () => {
    const posts = fakeServer({ due: DUE, items: [todayItem] });
    const user = userEvent.setup();
    show("/today?sheet=watering");
    expect(await screen.findByText(/Läuse/)).toBeTruthy();
    const watering = await screen.findByRole("button", { name: "Ficus als gegossen eintragen" });
    const todayBefore = requestsTo("/today");
    const dueBefore = requestsTo("/watering/due");
    await user.click(watering);
    await waitFor(() => expect(posts).toContain("/watering"));
    // The watering list loads again after its write; the card of Heute does not.
    await waitFor(() => expect(requestsTo("/watering/due")).toBeGreaterThan(dueBefore));
    expect(requestsTo("/today")).toBe(todayBefore);
  });

  it("US-QS-18 · SG-FEED-01 once Heute is closed it no longer follows the writes of the app", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    let client: QueryClient | undefined;
    function Harness() {
      const [open, setOpen] = useState(true);
      client = useQueryClient();
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            Heute schließen
          </button>
          {open && area()}
          <OutsideTickOff />
        </>
      );
    }
    render(
      <ToastProvider>
        <MemoryRouter initialEntries={["/today"]}>
          <Harness />
        </MemoryRouter>
      </ToastProvider>,
    );
    expect(await screen.findByText(/Läuse/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Heute schließen" }));
    await user.click(screen.getByRole("button", { name: "Außerhalb abhaken" }));
    // The write reached the cache (the treatments are invalidated); the list of Heute must not hear of it.
    await waitFor(() =>
      expect(
        client?.getQueryCache().find({ queryKey: ["care", "treatments", "open"], exact: true })
          ?.state.isInvalidated,
      ).toBe(true),
    );
    const list = client?.getQueryCache().find({ queryKey: TODAY_LIST_KEY, exact: true });
    expect(list).toBeDefined();
    expect(list?.state.isInvalidated).toBe(false);
  });
});
