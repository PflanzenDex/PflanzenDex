// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ERROR_TEXTS, type Specimen } from "@pflanzendex/core";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { PotLabelPage } from "./pot-label-page";

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
      const make = routes[`${method} ${u.pathname}`];
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
        </Routes>
      </FeaturesProvider>
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
    expect(await screen.findByRole("heading", { name: "Messen: Aloe vera" })).toBeTruthy();
    // The form waits for the measurement view (its skeleton shows until then).
    expect(await screen.findByLabelText(/Messwert/)).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Messung speichern" })).toBeTruthy();
  });

  it("US-BES-17 a foreign and an unknown label look exactly the same: the same not-found view, without the plant", async () => {
    server({});
    const { container: foreign } = show("fremd");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pflanze nicht gefunden" }),
    ).toBeTruthy();
    const foreignHtml = foreign.innerHTML;
    expect(screen.queryByRole("button", { name: "Gegossen" })).toBeNull();
    cleanup();
    const { container: unknownLabel } = show("unbekannt");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Pflanze nicht gefunden" }),
    ).toBeTruthy();
    expect(unknownLabel.innerHTML).toBe(foreignHtml);
    expect(within(unknownLabel).queryByText(/fremd|unbekannt/)).toBeNull();
  });

  it("US-BES-17 an archived plant says it is archived and offers no quick actions (P-09, P-10)", async () => {
    server({
      "GET /specimens/e1": () =>
        json(
          200,
          specimen({ status: "archived", archivedAt: "2026-10-01", archivedReason: "verschenkt" }),
        ),
    });
    show();
    expect(await screen.findByRole("heading", { level: 1, name: "Aloe vera" })).toBeTruthy();
    expect(screen.getByText(ERROR_TEXTS["specimen.archived"])).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Gegossen" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Messen" })).toBeNull();
    expect(screen.getByRole("link", { name: "Zur Sammlung" })).toBeTruthy();
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
