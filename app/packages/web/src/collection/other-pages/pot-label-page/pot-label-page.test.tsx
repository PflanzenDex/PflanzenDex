// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS, type Specimen } from "@pflanzendex/core";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { PotLabelPage } from "./pot-label-page";
import { expectOneLoadingStatus } from "@/shared/ui/skeleton.loading-contract";
import table from "./pot-label-page.de.json";
import { PotLabelSkeleton } from "./pot-label-page.skeleton";
import { filledIn, hasOwnBorder, isPlain, isTinted } from "@/shared/ui/button.roles";

const json = (status: number, body: unknown) => Response.json(body, { status });
const TOKEN = async () => "tok";
const API = "http://api";

const specimen = (over: Partial<Specimen> = {}): Specimen => ({
  id: "e1",
  speciesId: "s1",
  name: "Aloe vera",
  marker: null,
  locationId: null,
  status: "plant",
  caughtAt: null,
  createdAt: null,
  archivedAt: null,
  archivedReason: null,
  measurements: [],
  treatments: [],
  ...over,
});

type Call = { method: string; path: string; body: unknown };
/** Answers by "METHOD path"; a request without a route answers the unknown-plant refusal. Every call is recorded. */
function server(routes: Record<string, () => Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      const method = init?.method ?? "GET";
      calls.push({
        method,
        path: u.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      // The label reads the plant's fertilizing too (US-MON-09): nothing is logged unless a test says otherwise.
      const fertilizing = method === "GET" && u.pathname.endsWith("/fertilizing");
      const make =
        routes[`${method} ${u.pathname}`] ??
        (fertilizing ? () => json(200, { lastFertilizedOn: null }) : undefined);
      return make ? make() : json(404, { error: { code: "specimen.not_found", text: "x" } });
    }),
  );
  return calls;
}

const measurementView = {
  specimenId: "e1",
  growthMeasure: "height",
  etiolationSigns: null,
  measurements: [],
  last: null,
  lastRating: null,
  growth: { count: 0, ratePerYear: null, trend: null, signal: null },
};

function Address() {
  const at = useLocation();
  return <p data-testid="address">{`${at.pathname}${at.search}`}</p>;
}

const show = (id = "e1", on = true) =>
  render(
    <MemoryRouter initialEntries={[`/label/${id}`]}>
      <FeaturesProvider features={{ pot_labels: on }}>
        <Routes>
          <Route path="/label/:id" element={<PotLabelPage api={API} token={TOKEN} />} />
          <Route path="/collection" element={<Address />} />
          <Route path="/collection/new" element={<Address />} />
        </Routes>
      </FeaturesProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("US-BES-17 a scanned pot label opens the plant with quick actions", () => {
  it("US-BES-17 an own active plant shows its name, the large actions Gegossen and Messen, and a link to its normal view", async () => {
    server({ "GET /specimens/e1": () => json(200, specimen()) });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Aloe vera" })).toBeTruthy();
    const water = screen.getByRole("button", { name: "Gegossen" });
    const measure = screen.getByRole("button", { name: "Messen" });
    expect(water.className).toContain("min-h-[48px]");
    expect(measure.className).toContain("min-h-[48px]");
    const link = screen.getByRole("link", { name: "Zur Pflanze" });
    expect(link.getAttribute("href")).toBe("/collection?view=plants&sheet=plant-e1");
  });

  it("US-BES-17 Gegossen writes the watering once for today and confirms it", async () => {
    const calls = server({
      "GET /specimens/e1": () => json(200, specimen()),
      "POST /watering": () => json(200, { date: "2026-11-06", specimens: ["e1"], created: 1 }),
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Gegossen" }));
    expect((await screen.findByRole("status")).textContent).toBe("Heute als gegossen eingetragen.");
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ path: "/watering", body: { specimenIds: ["e1"] } });
    expect(writes[0]?.body).toHaveProperty("timeZone");
  });

  it("US-BES-17 a refused watering shows the German text of its code, never the raw server text (P-10)", async () => {
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "POST /watering": () =>
        json(409, { error: { code: "specimen.archived", text: "raw server text" } }),
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Gegossen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(ERROR_TEXTS["specimen.archived"]);
    expect(alert.textContent).not.toContain("raw server text");
  });

  it("US-BES-17 Messen opens the measurement form of that plant, with the same form as the collection", async () => {
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/measurements": () => json(200, measurementView),
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Messen" }));
    expect(await screen.findByRole("heading", { name: "Messen" })).toBeTruthy();
    // The form waits for the measurement view (its skeleton shows until then).
    expect(await screen.findByLabelText(/Messwert/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Messung sichern" })).toBeTruthy();
  });

  it("US-BES-17 a foreign and an unknown label look exactly the same: the same not-found view, without the plant", async () => {
    server({});
    const { container: foreign } = show("fremd");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Etikett ohne Pflanze" }),
    ).toBeTruthy();
    const foreignHtml = foreign.innerHTML;
    expect(screen.queryByRole("button", { name: "Gegossen" })).toBeNull();
    cleanup();
    const { container: unknownLabel } = show("unbekannt");
    expect(
      await screen.findByRole("heading", { level: 2, name: "Etikett ohne Pflanze" }),
    ).toBeTruthy();
    expect(unknownLabel.innerHTML).toBe(foreignHtml);
    expect(within(unknownLabel).queryByText(/fremd|unbekannt/)).toBeNull();
  });

  it("US-QS-32 the not-found label says what it means in one line, with its own mark and the way on (SG-STATE-03, SG-COPY-06)", async () => {
    server({});
    const { container } = show("unbekannt");
    await screen.findByRole("heading", { level: 2, name: "Etikett ohne Pflanze" });
    expect(screen.getByText(table["notFoundCause"])).toBeTruthy();
    expect(table["notFoundCause"]).toBe(
      "Zu diesem Etikett gibt es in deinem Konto keine Pflanze. Vielleicht wurde sie gelöscht, oder das Etikett gehört zu einem anderen Konto.",
    );
    expect(container.querySelector("svg.lucide-tag")).not.toBeNull();
    expect(container.querySelector("svg.lucide-sprout")).toBeNull();
    expect(container.querySelector("svg.lucide-circle-alert")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("US-QS-32 the not-found label offers Pflanze anlegen filled and Zur Sammlung plain, and both lead on", async () => {
    server({});
    const user = userEvent.setup();
    show("unbekannt");
    const create = await screen.findByRole("button", { name: "Pflanze anlegen" });
    expect(create.className.split(/\s+/)).toContain("bg-primary");
    const plain = screen.getByRole("button", { name: "Zur Sammlung" });
    expect(plain.className.split(/\s+/)).toContain("text-primary");
    await user.click(create);
    expect((await screen.findByTestId("address")).textContent).toBe("/collection/new");
  });

  it("US-QS-32 Zur Sammlung on the not-found label leads to the collection", async () => {
    server({});
    const user = userEvent.setup();
    show("unbekannt");
    await user.click(await screen.findByRole("button", { name: "Zur Sammlung" }));
    expect((await screen.findByTestId("address")).textContent).toBe("/collection");
  });

  it("US-QS-32 the scanned label is one screen (DS-61): its frame fits the window and scrolls inside, also for the not-found view", async () => {
    server({});
    const { container } = show("unbekannt");
    await screen.findByRole("heading", { level: 2, name: "Etikett ohne Pflanze" });
    const frame = container.querySelector("[data-fit-screen][data-fit-fill]");
    expect(frame).not.toBeNull();
    expect(frame?.className).toContain("min-h-0");
  });

  it("US-QS-32 an archived plant opens read-only: Archiviert am on top, its reason and catch date, and Pflanze wiederherstellen as its one tinted action", async () => {
    server({
      "GET /specimens/e1": () =>
        json(
          200,
          specimen({
            status: "archived",
            archivedAt: "2026-10-01",
            archivedReason: "verschenkt",
            caughtAt: "2026-03-04",
          }),
        ),
    });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Aloe vera" })).toBeTruthy();
    expect(screen.getByText("Archiviert am 01.10.2026")).toBeTruthy();
    expect(screen.getByText("Grund: verschenkt")).toBeTruthy();
    expect(screen.getByText("Fangdatum: 04.03.2026")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gegossen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Messen" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Zur Sammlung" })).toBeNull();
    const restore = screen.getByRole("button", { name: "Pflanze wiederherstellen" });
    expect(restore.className.split(/\s+/)).toContain("bg-accent");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("US-QS-32 an archived plant with no catch date says Fangdatum: unbekannt (P-08)", async () => {
    server({
      "GET /specimens/e1": () =>
        json(200, specimen({ status: "archived", archivedAt: "2026-10-01", archivedReason: "x" })),
    });
    show();
    expect(await screen.findByText("Fangdatum: unbekannt")).toBeTruthy();
  });

  it("US-QS-32 Pflanze wiederherstellen restores the plant, and the label then shows the active plant", async () => {
    let restored = false;
    const calls = server({
      "GET /specimens/e1": () =>
        restored
          ? json(200, specimen())
          : json(
              200,
              specimen({ status: "archived", archivedAt: "2026-10-01", archivedReason: "x" }),
            ),
      "POST /specimens/e1/restore": () => {
        restored = true;
        return json(200, specimen());
      },
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Pflanze wiederherstellen" }));
    expect(await screen.findByRole("button", { name: "Gegossen" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pflanze wiederherstellen" })).toBeNull();
    expect(
      calls.filter((c) => c.method === "POST" && c.path === "/specimens/e1/restore"),
    ).toHaveLength(1);
  });

  it("US-QS-32 a refused restore shows the German text of its code, never the raw server text (P-10)", async () => {
    server({
      "GET /specimens/e1": () =>
        json(200, specimen({ status: "archived", archivedAt: "2026-10-01", archivedReason: "x" })),
      "POST /specimens/e1/restore": () =>
        json(409, { error: { code: "specimen.not_found", text: "raw server text" } }),
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Pflanze wiederherstellen" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(ERROR_TEXTS["specimen.not_found"]);
    expect(alert.textContent).not.toContain("raw server text");
  });

  it("US-BES-17 with the keeper switch for pot labels off the scan opens the plant's normal view without quick actions (P-12)", async () => {
    const calls = server({ "GET /specimens/e1": () => json(200, specimen()) });
    show("e1", false);
    expect((await screen.findByTestId("address")).textContent).toBe(
      "/collection?view=plants&sheet=plant-e1",
    );
    expect(calls.filter((c) => c.path === "/specimens/e1")).toHaveLength(0);
  });
});

describe("US-MON-09 Gedüngt on a scanned pot label", () => {
  it("US-MON-09 Gedüngt writes the fertilizing once for today in the keeper's zone and confirms it", async () => {
    const calls = server({
      "GET /specimens/e1": () => json(200, specimen()),
      "POST /fertilizing": () => json(200, { date: "2026-11-07", specimenId: "e1", created: 1 }),
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Gedüngt" }));
    expect((await screen.findByRole("status")).textContent).toBe("Als gedüngt eingetragen.");
    const writes = calls.filter((c) => c.method === "POST");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ path: "/fertilizing", body: { specimenId: "e1" } });
    expect(writes[0]?.body).toHaveProperty("timeZone");
  });

  it("US-MON-09 the label shows the date of the latest fertilizing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/fertilizing": () => json(200, { lastFertilizedOn: "2026-11-02" }),
    });
    show();
    expect(await screen.findByText("Zuletzt gedüngt: 02.11.2026")).toBeTruthy();
  });

  it("US-QS-32 the label says 'Zuletzt gedüngt: heute' on the day of the fertilizing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/fertilizing": () => json(200, { lastFertilizedOn: "2026-11-02" }),
    });
    show();
    expect(await screen.findByText("Zuletzt gedüngt: heute")).toBeTruthy();
  });

  it("US-QS-32 the label says 'Zuletzt gedüngt: vor 3 Tagen' within 7 days", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T12:00:00Z"));
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/fertilizing": () => json(200, { lastFertilizedOn: "2026-11-02" }),
    });
    show();
    expect(await screen.findByText("Zuletzt gedüngt: vor 3 Tagen")).toBeTruthy();
  });

  it("US-MON-09 the label says 'noch nie' while no fertilizing is logged (P-08, P-09)", async () => {
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/fertilizing": () => json(200, { lastFertilizedOn: null }),
    });
    show();
    expect(await screen.findByText("Zuletzt gedüngt: noch nie")).toBeTruthy();
  });

  it("US-MON-09 after Gedüngt the line shows the new date", async () => {
    let logged: string | null = null;
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/fertilizing": () => json(200, { lastFertilizedOn: logged }),
      "POST /fertilizing": () => {
        logged = "2026-11-07";
        return json(200, { date: "2026-11-07", specimenId: "e1", created: 1 });
      },
    });
    const user = userEvent.setup();
    show();
    expect(await screen.findByText("Zuletzt gedüngt: noch nie")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Gedüngt" }));
    expect(await screen.findByText("Zuletzt gedüngt: 07.11.2026")).toBeTruthy();
  });

  it("US-MON-09 a failed read shows its text and a retry, not a blank (P-10)", async () => {
    let reads = 0;
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "GET /specimens/e1/fertilizing": () => {
        reads += 1;
        return reads === 1
          ? json(503, { error: { code: "system.database_unavailable", text: "raw server text" } })
          : json(200, { lastFertilizedOn: "2026-11-02" });
      },
    });
    const user = userEvent.setup();
    show();
    expect(await screen.findByText(ERROR_TEXTS["system.database_unavailable"])).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(await screen.findByText("Zuletzt gedüngt: 02.11.2026")).toBeTruthy();
  });

  it("US-MON-09 a refused Gedüngt shows the German text of its code, never the raw server text (P-10)", async () => {
    server({
      "GET /specimens/e1": () => json(200, specimen()),
      "POST /fertilizing": () =>
        json(409, { error: { code: "specimen.archived", text: "raw server text" } }),
    });
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Gedüngt" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(ERROR_TEXTS["specimen.archived"]);
    expect(alert.textContent).not.toContain("raw server text");
  });

  it("US-MON-09 an archived plant offers no Gedüngt and no fertilizing line (P-09, P-10)", async () => {
    server({
      "GET /specimens/e1": () =>
        json(
          200,
          specimen({ status: "archived", archivedAt: "2026-10-01", archivedReason: "verschenkt" }),
        ),
    });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Aloe vera" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gedüngt" })).toBeNull();
    expect(screen.queryByText(/Zuletzt gedüngt/)).toBeNull();
  });

  it("US-MON-09 with the keeper switch for pot labels off the scan logs nothing and shows no Gedüngt (P-12)", async () => {
    const calls = server({ "GET /specimens/e1": () => json(200, specimen()) });
    show("e1", false);
    expect(await screen.findByTestId("address")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gedüngt" })).toBeNull();
    expect(calls.filter((c) => c.path.endsWith("/fertilizing"))).toHaveLength(0);
  });
});

describe("US-QS-14 issue 1697 · the pot label show their shaped skeleton once", () => {
  it("US-QS-14 issue 1697 · a slow load shows one status with the loading text, and nothing before the delay", () =>
    expectOneLoadingStatus(<PotLabelSkeleton label={table["loading"]} />, table["loading"]));
});

describe("US-QS-32 · SG-BTN-01 the pot label: no outline button (FX-39 sweep 4)", () => {
  it("US-QS-32 · SG-BTN-01 'Gegossen' is the one filled button, 'Gedüngt' is tinted, 'Messen' (it opens the form) is plain", async () => {
    server({ "GET /specimens/e1": () => json(200, specimen()) });
    const { container } = show();
    const water = await screen.findByRole("button", { name: "Gegossen" });
    const fertilize = screen.getByRole("button", { name: "Gedüngt" });
    const measure = screen.getByRole("button", { name: "Messen" });
    expect(filledIn(container)).toEqual([water]);
    expect(isTinted(fertilize)).toBe(true);
    expect(isPlain(measure)).toBe(true);
    for (const button of [fertilize, measure]) expect(hasOwnBorder(button)).toBe(false);
  });
});
