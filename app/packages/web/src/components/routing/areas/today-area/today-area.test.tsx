// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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
  nextAction: "Weise dem Exemplar einen Standort zu.",
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
  hintsStatus?: number;
  items?: unknown[];
};

const SPECIMENS = [{ id: "s-a", name: "Aloe", status: "plant" }];
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
        "/specimens": () => response(200, { specimens: setup.specimens ?? SPECIMENS }),
        "/specimens/hints": hints,
        "/locations": () => response(200, { locations: LOCATIONS }),
        "/specimens/e1/location": () => response(200, {}),
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
const show = (path = "/today", onOpen?: (v: string) => void) =>
  render(<MemoryRouter initialEntries={[path]}>{area(onOpen)}</MemoryRouter>);

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
    import("@/care/TreatmentsPage"),
    import("@/collection/HintsPage"),
  ]);
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-QS-14 Heute with its sections", () => {
  it("US-QS-14 one h1 and the sections Jetzt dran, Behandlungen, Fehlt noch as h2 in this order", async () => {
    fakeServer();
    show();
    await screen.findByText(noLocation.text);
    const main = document.body;
    expect(
      within(main)
        .getAllByRole("heading", { level: 1 })
        .map((h) => h.textContent),
    ).toEqual(["Heute"]);
    const h2 = within(main).getAllByRole("heading", { level: 2 });
    expect(h2.map((h) => h.textContent)).toEqual(["Jetzt dran", "Behandlungen", "Fehlt noch"]);
    // The module headings inside the sections are one level lower.
    expect(
      within(main).getByRole("heading", { level: 3, name: "Offene Behandlungen" }),
    ).toBeTruthy();
    expect(
      within(main).getByRole("heading", { level: 3, name: "Erledigte Behandlungen" }),
    ).toBeTruthy();
  });

  it("US-QS-14 · US-BEH-02 the sections show a skeleton with one loading status each before the data is there", () => {
    fakeServer();
    show();
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { level: 2, name: "Behandlungen" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Fehlt noch" })).toBeTruthy();
  });

  it("US-QS-14 · US-BEH-03 Erledigt works in the section Behandlungen and says what was ticked off", async () => {
    const posts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(
      await screen.findByRole("button", { name: "Grund a bei Aloe als erledigt abhaken" }),
    );
    expect((await screen.findByText(/als erledigt eingetragen/)).textContent).toContain("Aloe");
    expect(posts).toEqual(["/treatments/a/complete"]);
    expect(await screen.findByText("Keine offenen Behandlungen.")).toBeTruthy();
  });

  it("US-QS-14 · US-BEH-01 the planning form opens in a dialog from the section and closes after saving", async () => {
    const posts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Behandlung planen" }));
    const dialog = await screen.findByRole("dialog", { name: "Behandlung planen" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Aloe" }));
    await user.type(within(dialog).getByLabelText(/Grund/), "Läuse");
    await user.click(within(dialog).getByRole("button", { name: "Behandlung speichern" }));
    await waitFor(() => expect(posts).toContain("/treatments"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText(/Termin.* geplant/)).toBeTruthy();
  });

  it("US-QS-14 · US-BEH-03 the history per plant stays reachable in the section", async () => {
    fakeServer();
    show();
    expect(await screen.findByLabelText("Exemplar für den Verlauf")).toBeTruthy();
  });

  it("US-QS-14 · US-PHA-03 a plant without a location gets one inline in the section Fehlt noch", async () => {
    const posts = fakeServer();
    const user = userEvent.setup();
    show();
    await user.selectOptions(await screen.findByLabelText("Standort für „Bogenhanf“"), "l1");
    await user.click(screen.getByRole("button", { name: "Standort setzen: Bogenhanf" }));
    await waitFor(() => expect(posts).toContain("/specimens/e1/location"));
  });
});

describe("US-QS-14 every section keeps its next action (P-09)", () => {
  it("US-QS-14 · US-BES-08 no hints say so with the way to the collection; the other sections stay", async () => {
    fakeServer({ hints: [] });
    const open = vi.fn();
    const user = userEvent.setup();
    show("/today", open);
    const empty = await screen.findByRole("heading", { level: 3, name: "Keine Hinweise" });
    await user.click(
      within(empty.parentElement as HTMLElement).getByRole("button", { name: "Zum Bestand" }),
    );
    expect(open).toHaveBeenCalledWith("collection");
    expect(screen.getByRole("heading", { level: 2, name: "Behandlungen" })).toBeTruthy();
  });

  it("US-QS-14 · US-BEH-02 no open treatment offers planning one", async () => {
    fakeServer({ treatments: [] });
    show();
    const empty = await screen.findByRole("heading", {
      level: 3,
      name: "Keine offenen Behandlungen.",
    });
    expect(
      within(empty.parentElement as HTMLElement).getByRole("button", { name: "Behandlung planen" }),
    ).toBeTruthy();
  });

  it("US-QS-14 · US-BEH-01 without a plant the treatments point to the collection", async () => {
    fakeServer({ treatments: [], specimens: [] });
    show();
    const empty = await screen.findByRole("heading", {
      level: 3,
      name: "Keine offenen Behandlungen.",
    });
    expect(
      within(empty.parentElement as HTMLElement)
        .getByRole("link", { name: "Zum Bestand" })
        .getAttribute("href"),
    ).toBe("/collection");
  });

  it("US-QS-14 · P-10 a failing section shows its error with a retry; the other sections still show", async () => {
    fakeServer({ hintsStatus: 500 });
    show();
    const alert = await screen.findByRole("alert");
    expect(within(alert).getByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(await screen.findByLabelText("Exemplar für den Verlauf")).toBeTruthy();
  });
});

describe("US-QS-14 the address points at a section", () => {
  it.each([
    ["#behandlungen", "Behandlungen"],
    ["#fehlt-noch", "Fehlt noch"],
  ])("US-QS-14 /today%s focuses the heading %s", async (hash, name) => {
    fakeServer();
    show(`/today${hash}`);
    const heading = screen.getByRole("heading", { level: 2, name });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("US-QS-14 an unknown anchor changes nothing", async () => {
    fakeServer();
    show("/today#gibt-es-nicht");
    await screen.findByText(noLocation.text);
    expect(document.activeElement).toBe(document.body);
  });

  it("US-QS-14 · TE-07 Zu Behandlung in Jetzt dran moves the focus to the section Behandlungen on the same page", async () => {
    fakeServer({ items: [todayItem] });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Zu Behandlung: Aloe" }));
    const heading = screen.getByRole("heading", { level: 2, name: "Behandlungen" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("US-QS-14 · TE-07 the other actions of Jetzt dran still open their view", async () => {
    fakeServer({
      items: [{ ...todayItem, id: "p", kind: "phase_deviation", target: "care_phases" }],
    });
    const open = vi.fn();
    const user = userEvent.setup();
    show("/today", open);
    await user.click(await screen.findByRole("button", { name: "Zu Pflegephasen: Aloe" }));
    expect(open).toHaveBeenCalledWith("carePhases");
  });
});
