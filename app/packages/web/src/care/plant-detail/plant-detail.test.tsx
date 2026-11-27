// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { GrowthTrend, MeasurementRow, MeasurementView, PhasesRow } from "@pflanzendex/core";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { hasOwnBorder, isPlain, isTinted } from "@/shared/ui/button.roles";
import { LayerScope } from "@/shared/ui/layer-scope";
import { PlantCare } from "./plant-care/plant-care";
import { PlantGrowth } from "./plant-growth/plant-growth";
import { PlantHistory } from "./plant-history/plant-history";

const json = (status: number, body: unknown) => Response.json(body, { status });
const TOKEN = async () => "tok";
const API = "http://api";

const row = (n: number, extra: Partial<MeasurementRow> = {}): MeasurementRow => ({
  id: `m${n}`,
  specimenId: "e1",
  date: `2026-10-${String(n).padStart(2, "0")}`,
  value: 10 + n,
  quality: "healthy",
  note: null,
  ratedBy: "keeper",
  photo: null,
  ...extra,
});
const view = (extra: Partial<MeasurementView> = {}): MeasurementView => ({
  specimenId: "e1",
  status: "plant",
  growthMeasure: "rosette_diameter",
  etiolationSigns: null,
  measurements: [],
  last: null,
  lastRating: null,
  growth: { count: 0, ratePerYear: null, trend: null, signal: null },
  ...extra,
});

type Posts = { path: string; body: unknown }[];
function server(routes: Record<string, () => Response>): Posts {
  const posts: Posts = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url, init) => {
      const u = new URL(String(url));
      if (init?.method === "POST")
        posts.push({ path: u.pathname, body: JSON.parse(String(init.body ?? "{}")) });
      const make = routes[`${init?.method ?? "GET"} ${u.pathname}`];
      return make ? make() : json(404, { error: { code: "input.invalid", text: "x" } });
    }),
  );
  return posts;
}
const Where = () => <span data-testid="address">{useLocation().search}</span>;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setViewportWidth(360);
});

describe("US-QS-23 the growth trend of the overview", () => {
  const growth = (extra: Partial<GrowthTrend>): GrowthTrend => ({
    count: 3,
    ratePerYear: 36.5,
    trend: "stable",
    signal: null,
    ...extra,
  });
  const show = () => render(<PlantGrowth api={API} token={TOKEN} specimenId="e1" />);

  it("US-QS-23 · P-08 shows rate and trend from the own history only, never against a species average", async () => {
    server({ "GET /specimens/e1/measurements": () => json(200, view({ growth: growth({}) })) });
    show();
    expect(await screen.findByText("Wachstum: 36,5 cm/Jahr")).toBeTruthy();
    expect(screen.getByText("Trend: stabil")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Durchschnitt der Art|Artdurchschnitt/);
  });

  it("US-QS-23 etiolated growth is never a success", async () => {
    server({
      "GET /specimens/e1/measurements": () =>
        json(200, view({ growth: growth({ trend: "faster", signal: "etiolated" }) })),
    });
    show();
    expect(await screen.findByText(/trotz Wachstum kein Erfolgssignal/)).toBeTruthy();
  });

  it("US-QS-23 · P-08 without a measurement the trend reads unbekannt", async () => {
    server({ "GET /specimens/e1/measurements": () => json(200, view()) });
    show();
    expect(await screen.findByText("Trend: unbekannt")).toBeTruthy();
    expect(screen.getByText("Wachstum: noch keine Messung")).toBeTruthy();
  });

  it("US-QS-32 the dot of the growth line sticks to the trend, so a line never ends with ' ·'", async () => {
    server({ "GET /specimens/e1/measurements": () => json(200, view({ growth: growth({}) })) });
    show();
    const trend = await screen.findByText("Trend: stabil");
    // The dot is part of the trend's element (with a no-break space), so a line break can come before it, never after it.
    expect(trend.textContent).toBe("· Trend: stabil");
  });

  it("US-QS-23 · P-10 a failed load says so and offers a retry", async () => {
    server({});
    show();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

describe("US-QS-23 Verlauf", () => {
  const measurements = [7, 6, 5, 4, 3, 2, 1].map((n) => row(n));
  // `inLayer`: the history in a sheet or a dialog is one scrolling list as on a page (US-QS-15, SG-LIST-01, issue 2418).
  const show = (onMeasure?: () => void, inLayer = false) =>
    render(
      <MemoryRouter>
        <LayerScope.Provider value={inLayer}>
          <PlantHistory
            api={API}
            token={TOKEN}
            specimenId="e1"
            {...(onMeasure ? { onMeasure } : {})}
          />
        </LayerScope.Provider>
        <Where />
      </MemoryRouter>,
    );

  it("US-QS-15 · SG-LIST-01 on a page the measurements are one scrolling list, newest first, with no pages and no position in the address", async () => {
    setViewportWidth(1024);
    server({ "GET /specimens/e1/measurements": () => json(200, view({ measurements })) });
    show();
    const list = await screen.findByRole("list", { name: "Messungen und Fotos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
    expect(screen.getByTestId("address").textContent).toBe("");
  });

  it("US-QS-23 · US-QS-15 in a layer the measurements are one scrolling list too, newest first, with no pages and no position in the address (issue 2418)", async () => {
    setViewportWidth(1024);
    server({ "GET /specimens/e1/measurements": () => json(200, view({ measurements })) });
    show(undefined, true);
    const list = await screen.findByRole("list", { name: "Messungen und Fotos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(7);
    expect(
      within(list)
        .getAllByText(/\d\d\.10\.2026/)
        .slice(0, 4)
        .map((e) => e.textContent?.replaceAll("\u00a0", " ")),
    ).toEqual([
      "17 cm · 07.10.2026",
      "16 cm · 06.10.2026",
      "15 cm · 05.10.2026",
      "14 cm · 04.10.2026",
    ]);
    expect(screen.queryByText(/^Seite \d+ von \d+$/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^(Zurück|Weiter)$/ })).toBeNull();
    expect(screen.getByTestId("address").textContent).toBe("");
  });

  it("US-QS-23 the photos of the measurements are fetched privately and shown in the page", async () => {
    server({
      "GET /specimens/e1/measurements": () =>
        json(200, view({ measurements: [row(2, { photo: "p.webp" }), row(1)] })),
      "GET /specimens/e1/measurements/m2/photo": () => new Response(new Uint8Array([1])),
    });
    URL.createObjectURL = vi.fn(() => "blob:m2");
    show();
    expect(
      await screen.findByRole("img", { name: "Foto der Messung vom 02.10.2026" }),
    ).toBeTruthy();
  });

  it("US-QS-23 · P-09 without a measurement the tab names the next step", async () => {
    server({ "GET /specimens/e1/measurements": () => json(200, view()) });
    const onMeasure = vi.fn();
    show(onMeasure);
    await userEvent.click(await screen.findByRole("button", { name: "Messung erfassen" }));
    expect(onMeasure).toHaveBeenCalledOnce();
  });

  it("US-QS-23 · P-10 a failed load says so and offers a retry", async () => {
    server({});
    show();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
  });
});

describe("US-QS-23 Pflege", () => {
  const open = (id: string, specimenId: string, reason: string) => ({
    id,
    specimenId,
    specimenName: specimenId === "e1" ? "Aloe" : "Ficus",
    reason,
    agent: null,
    dueAt: "2026-10-30",
    status: { kind: "soon", days: 1, text: "in 1 Tag" },
  });
  const phase: PhasesRow = {
    specimenId: "e1",
    name: "Aloe",
    marker: null,
    speciesName: "Aloe",
    speciesId: "a1",
    phase: "dormancy",
    locationId: "s1",
    targetLocationId: "s2",
    nextChange: null,
    photo: null,
  };
  const base = {
    "GET /treatments": () =>
      json(200, { treatments: [open("t1", "e1", "Neem"), open("t2", "e2", "Schmierseife")] }),
    "GET /treatments/history": () =>
      json(200, {
        treatments: [
          {
            id: "t0",
            specimenId: "e1",
            reason: "Wollläuse",
            agent: null,
            dueAt: "2026-09-01",
            done: true,
            doneAt: "2026-09-02",
            courseId: null,
          },
        ],
      }),
    "GET /care-phases": () => json(200, { phases: [] }),
    "GET /locations": () =>
      json(200, {
        locations: [
          { id: "s1", name: "Fensterbank", lightZoneId: null, kind: "room" },
          { id: "s2", name: "Regal", lightZoneId: null, kind: "room" },
        ],
      }),
  };
  const show = () =>
    render(
      <MemoryRouter>
        <PlantCare api={API} token={TOKEN} specimen={{ id: "e1", name: "Aloe" }} />
        <Where />
      </MemoryRouter>,
    );

  it("US-QS-23 lists the open treatments of this plant only, the done ones as history", async () => {
    server(base);
    show();
    const open = await screen.findByRole("list", { name: "Offene Behandlungen" });
    expect(within(open).getAllByRole("listitem")).toHaveLength(1);
    expect(within(open).getByText("Neem")).toBeTruthy();
    expect(screen.queryByText("Schmierseife")).toBeNull();
    expect(await screen.findByText(/Wollläuse · erledigt am 02\.09\.2026/)).toBeTruthy();
  });

  it("US-QS-32 · US-QS-23 Abhaken ticks the treatment off through the existing operation and says so", async () => {
    const posts = server({
      ...base,
      "POST /treatments/t1/complete": () =>
        json(200, { treatment: { ...open("t1", "e1", "Neem"), done: true, doneAt: "2026-10-29" } }),
    });
    show();
    const tick = await screen.findByRole("button", { name: "Neem bei Aloe als erledigt abhaken" });
    expect(tick.textContent).toBe("Abhaken");
    await userEvent.click(tick);
    expect((await screen.findByRole("status")).textContent).toContain("als erledigt eingetragen");
    expect(posts.map((p) => p.path)).toContain("/treatments/t1/complete");
  });

  it("US-QS-23 Behandlung planen opens the form with this plant ticked and plans through the existing operation", async () => {
    const posts = server({
      ...base,
      "POST /treatments": () => json(201, { treatments: [{ ...open("t3", "e1", "Neem") }] }),
    });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Behandlung planen" }));
    expect((screen.getByRole("checkbox", { name: "Aloe" }) as HTMLInputElement).checked).toBe(true);
    await userEvent.type(screen.getByLabelText("Grund"), "Neem");
    await userEvent.click(screen.getByRole("button", { name: "Behandlung sichern" }));
    await vi.waitFor(() => expect(posts.some((p) => p.path === "/treatments")).toBe(true));
    expect(posts.find((p) => p.path === "/treatments")?.body).toMatchObject({
      specimenIds: ["e1"],
      reason: "Neem",
    });
  });

  it("US-QS-32 · SG-BTN-01 Behandlung planen is tinted; while the form is open the same button reads 'Planen abbrechen' and is plain", async () => {
    server(base);
    show();
    const plan = await screen.findByRole("button", { name: "Behandlung planen" });
    expect(isTinted(plan)).toBe(true);
    expect(hasOwnBorder(plan)).toBe(false);
    await userEvent.click(plan);
    const cancel = screen.getByRole("button", { name: "Planen abbrechen" });
    expect(isPlain(cancel)).toBe(true);
    expect(hasOwnBorder(cancel)).toBe(false);
  });

  it("US-QS-23 · P-08 a plant without a care phase says unbekannt and where to enter it", async () => {
    server(base);
    show();
    expect(await screen.findByText(/Pflegephase: unbekannt/)).toBeTruthy();
  });

  it("US-QS-32 'Ruhephase eintragen' opens the own care-profile layer of the plant, the one the Pflegeprofil part opens", async () => {
    server(base);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Ruhephase eintragen" }));
    expect(screen.getByTestId("address").textContent).toBe("?sheet=profil-e1");
  });

  it("US-QS-23 the care phase shows with Umstellen, which confirms through the existing operation", async () => {
    const posts = server({
      ...base,
      "GET /care-phases": () => json(200, { phases: [phase] }),
      "POST /care-phases/confirm": () => json(200, { specimens: [] }),
    });
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Umstellen: Aloe" }));
    await vi.waitFor(() => expect(posts.some((p) => p.path === "/care-phases/confirm")).toBe(true));
    expect(posts.find((p) => p.path === "/care-phases/confirm")?.body).toMatchObject({
      specimenIds: ["e1"],
    });
  });

  it("US-QS-23 · P-10 a failed part says so with a retry and does not hide the others", async () => {
    server({
      ...base,
      "GET /treatments": () => json(500, { error: { code: "server.error", text: "x" } }),
    });
    show();
    expect(await screen.findByRole("button", { name: "Erneut versuchen" })).toBeTruthy();
    expect(await screen.findByText(/Wollläuse/)).toBeTruthy();
  });
});
