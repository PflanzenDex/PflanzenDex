// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/shared/states/toast/toast-provider/toast-provider";
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
const noLocation = {
  kind: "location_missing",
  specimenId: "e1",
  specimenName: "Bogenhanf",
  locationId: null,
  text: "„Bogenhanf“ hat noch keinen Standort.",
  nextAction: "Weise der Pflanze einen Standort zu.",
};
const todayItem = {
  id: "t1",
  kind: "treatment_overdue",
  specimenId: "s-a",
  specimenName: "Aloe",
  text: "„Aloe“: Läuse – überfällig seit 2 Tagen.",
  nextAction: "Hake den Termin ab.",
  target: "treatments",
};

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
};

const SPECIMENS = [{ id: "s-a", name: "Aloe", status: "plant" }];
const CARDS = [{ id: "s-a", name: "Aloe", location: "Fensterbank" }];
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
  let open = setup.treatments ?? [treatment("a", "Aloe", "overdue", "überfällig seit 2 Tagen")];
  const posts: string[] = [];
  const hints = () =>
    setup.hintsStatus && setup.hintsStatus !== 200
      ? response(setup.hintsStatus, { error: { code: "server.error", text: "x" } })
      : response(200, { hints: setup.hints ?? [noLocation] });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const path = new URL(String(url)).pathname;
      const post = init?.method === "POST";
      if (post) posts.push(path);
      const answers: Record<string, () => Promise<Response>> = {
        "/today": () =>
          response(200, { date: "2026-10-03", upcoming: 0, items: setup.items ?? [] }),
        "/treatments": () =>
          post ? response(201, { treatments: [{}] }) : response(200, { treatments: open }),
        "/watering/due": () => response(200, { due: [] }),
        "/specimens/count": () => response(200, { count: 1, archived: 0 }),
        "/onboarding/hints": () => response(200, { hint: null, guideEnded: false }),
        "/specimens": () => response(200, { specimens: setup.specimens ?? SPECIMENS }),
        "/specimens/cards": () => response(200, { cards: setup.cards ?? setup.specimens ?? CARDS }),
        "/specimens/hints": hints,
        "/locations": () => response(200, { locations: LOCATIONS }),
        "/specimens/e1/location": () => response(200, {}),
        "/achievements/anniversaries": () =>
          response(200, setup.anniversaries ?? { calmMode: true }),
      };
      if (/^\/treatments\/[^/]+\/complete$/.test(path)) {
        open = [];
        return response(200, { treatment: { id: "a", done: true, doneAt: "2026-10-03" } });
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
});

describe("US-QS-18 Heute fits one screen", () => {
  it("US-QS-18 the overview shows one h1, the summary, the most urgent item and one tile per category with its count", async () => {
    fakeServer({ items: [todayItem] });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Heute" })).toBeTruthy();
    expect(await screen.findByText(/1 Behandlung offen, davon 1 überfällig/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Zu Behandlung/ })).toBeTruthy();
    const tiles = within(screen.getByRole("list", { name: "Themen" }));
    expect((await tiles.findByRole("button", { name: /^1Behandeln$/ })).textContent).toBe(
      "1Behandeln",
    );
    expect(tiles.getByRole("button", { name: /^0Gießen$/ })).toBeTruthy();
    expect(tiles.getByRole("button", { name: /^1Fehlt noch$/ })).toBeTruthy();
    // The topics are layers: no section of them stands on the page.
    expect(screen.queryByRole("heading", { level: 2, name: "Behandlungen" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("US-QS-18 a tile opens its items as a layer by address; Back-able and with the layer heading", async () => {
    fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: /Behandeln$/ }));
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

  it("US-QS-18 · TE-07 Zu Behandlung in Jetzt dran opens the layer Behandlungen", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Zu Behandlung: Aloe" }));
    expect(await dialog("Behandlungen")).toBeTruthy();
    expect(address()).toBe("/today?sheet=treatments");
  });

  it("US-QS-18 · TE-07 the other actions of Jetzt dran still open their view", async () => {
    fakeServer({
      items: [{ ...todayItem, id: "p", kind: "phase_deviation", target: "care_phases" }],
    });
    const open = vi.fn();
    const user = userEvent.setup();
    show("/today", open);
    await user.click(await screen.findByRole("button", { name: "Zu Pflegephasen: Aloe" }));
    expect(open).toHaveBeenCalledWith("carePhases");
  });

  it("US-QS-18 nothing open says so with the next step, and the tiles stay", async () => {
    fakeServer({ treatments: [], hints: [] });
    show();
    expect(await screen.findByText("Heute steht nichts an.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Zur Sammlung" }).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: /^0Behandeln$/ })).toBeTruthy();
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

  it("US-QS-18 the anniversary card is a row of the content column, never a column beside it (#1027)", async () => {
    fakeServer({ anniversaries: ANNIVERSARY });
    const { container } = show();
    const card = await screen.findByRole("region", { name: "Jubiläen" });
    const { content, pane } = columns(container);
    expect(content.contains(card)).toBe(true);
    expect(pane.contains(card)).toBe(false);
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
  it("US-QS-18 · US-BEH-03 Erledigt works in the layer Behandlungen, says what was ticked off and the tile count follows", async () => {
    const posts = fakeServer();
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect((await screen.findByText(/als erledigt eingetragen/)).textContent).toContain("Aloe");
    expect(posts).toEqual(["/treatments/a/complete"]);
    expect(await screen.findByText("Keine offenen Behandlungen.")).toBeTruthy();
  });

  it("US-QS-18 · US-BEH-02 the open treatments stand by urgency with a short chip and are paged", async () => {
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
    // Four plants per page on a phone, the position in text, search and location filter above the list.
    expect(within(form).getByRole("list", { name: "Pflanzen" }).children).toHaveLength(4);
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
    const save = within(form).getByRole("button", { name: "Behandlung speichern" });
    expect(document.getElementById(save.getAttribute("form") ?? "")?.tagName).toBe("FORM");
    await user.click(within(form).getByRole("button", { name: "Behandlung speichern" }));
    await waitFor(() => expect(posts).toContain("/treatments"));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Behandlung planen" })).toBeNull(),
    );
    expect(address()).toBe("/today?sheet=treatments");
    expect(await screen.findByText(/Termin.* geplant/)).toBeTruthy();
  });

  it("US-BEH-01 · A-04 an invalid plan opens the view of the first missing entry: no plant, then no reason", async () => {
    fakeServer({ cards: FIVE });
    const user = userEvent.setup();
    show("/today?sheet=treatments");
    await user.click(await screen.findByRole("button", { name: "Behandlung planen" }));
    const form = await dialog("Behandlung planen");
    await user.click(within(form).getByRole("button", { name: "Behandlung speichern" }));
    expect(await within(form).findByText(/Wähle mindestens eine Pflanze/)).toBeTruthy();
    expect(
      within(form).getByRole("button", { name: "Pflanzen (0)" }).getAttribute("aria-pressed"),
    ).toBe("true");
    // A plant is chosen, the reason is missing: the view moves to the reason and names it.
    await user.click(within(form).getByRole("checkbox", { name: /^Aloe/ }));
    await user.click(within(form).getByRole("button", { name: "Behandlung speichern" }));
    expect(await within(form).findByText(/Bitte nenne einen Grund/)).toBeTruthy();
    expect(within(form).getByRole("button", { name: "Termin" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(form).getByLabelText(/Grund/)).toBe(document.activeElement);
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
    expect(
      await screen.findByRole("heading", { level: 3, name: "Heute nichts zu gießen" }),
    ).toBeTruthy();
  });
});

describe("US-QS-18 every category keeps its next action (P-09, P-10)", () => {
  it("US-QS-18 · US-BES-08 no hints say so with the way to the collection", async () => {
    fakeServer({ hints: [] });
    const open = vi.fn();
    const user = userEvent.setup();
    show("/today?sheet=hints", open);
    const empty = await screen.findByRole("heading", { level: 3, name: "Keine Hinweise" });
    await user.click(
      within(empty.parentElement as HTMLElement).getByRole("button", { name: "Zur Sammlung" }),
    );
    expect(open).toHaveBeenCalledWith("collection");
  });

  it("US-QS-18 · US-BEH-02 no open treatment offers planning one", async () => {
    fakeServer({ treatments: [] });
    show("/today?sheet=treatments");
    const empty = await screen.findByRole("heading", {
      level: 3,
      name: "Keine offenen Behandlungen.",
    });
    expect(
      within(empty.parentElement as HTMLElement).getByRole("button", { name: "Behandlung planen" }),
    ).toBeTruthy();
  });

  it("US-QS-18 · US-BEH-01 without a plant the treatments point to the collection", async () => {
    fakeServer({ treatments: [], specimens: [] });
    show("/today?sheet=treatments");
    const empty = await screen.findByRole("heading", {
      level: 3,
      name: "Keine offenen Behandlungen.",
    });
    expect(
      within(empty.parentElement as HTMLElement)
        .getByRole("link", { name: "Zur Sammlung" })
        .getAttribute("href"),
    ).toBe("/collection");
  });

  it("US-QS-18 · P-10 a failing category says so on its tile and in its layer; the other tiles stay usable", async () => {
    fakeServer({ hintsStatus: 500 });
    const user = userEvent.setup();
    show();
    const tiles = within(await screen.findByRole("list", { name: "Themen" }));
    expect(await tiles.findByRole("button", { name: /^nicht geladenFehlt noch$/ })).toBeTruthy();
    expect(screen.getByText(/Fehlt noch: nicht geladen|Hinweise: nicht geladen/)).toBeTruthy();
    await user.click(tiles.getByRole("button", { name: /Fehlt noch$/ }));
    const alert = await within(await dialog("Fehlt noch")).findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});
