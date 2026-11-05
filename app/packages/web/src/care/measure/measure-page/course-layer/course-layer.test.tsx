// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { MeasurementRow, MeasurementView } from "@pflanzendex/core";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseLayer } from "./course-layer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const row = (
  id: string,
  date: string,
  value: number,
  extra: Partial<MeasurementRow> = {},
): MeasurementRow => ({
  id,
  specimenId: "e1",
  date,
  value,
  quality: "healthy",
  note: null,
  ratedBy: "keeper",
  photo: null,
  ...extra,
});
/** The course as the server sends it: newest first. */
const course = [row("c", "2026-03-01", 30), row("b", "2026-02-01", 20), row("a", "2026-01-01", 10)];

function view(measurements: MeasurementRow[]): MeasurementView {
  return {
    specimenId: "e1",
    status: "plant",
    growthMeasure: "height",
    etiolationSigns: null,
    measurements,
    last: measurements[0] ?? null,
    lastRating: measurements.length ? "healthy" : null,
    growth: { count: measurements.length, ratePerYear: null, trend: null, signal: null },
  };
}

const PHOTO = { api: "http://api", token: async () => "tok", specimenId: "e1" };

/** Shows the address next to the layer, so a test can read the part in it. */
function Address() {
  const location = useLocation();
  return <p data-testid="address">{location.search}</p>;
}

function show(measurements: MeasurementRow[], at = "/collection?view=plants&sheet=verlauf-e1") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <CourseLayer
        id="verlauf-e1"
        name="Bogenhanf"
        view={view(measurements)}
        photo={PHOTO}
        onPhotoSaved={() => undefined}
      />
      <Address />
    </MemoryRouter>,
  );
}

/** Renders the layer and waits until its dialog has mounted: the dialog part loads lazily. */
async function showReady(measurements: MeasurementRow[], at?: string) {
  const result = show(measurements, at);
  await screen.findByText("Verlauf: Bogenhanf");
  return result;
}

const pressed = (name: string) =>
  screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true";

describe("US-QS-15 · US-WAC-01 the Verlauf layer in three parts", () => {
  it("US-QS-15 · US-WAC-01 starts on Überblick: the facts, no chart and no list", async () => {
    await showReady(course);
    expect(pressed("Überblick")).toBe(true);
    expect(screen.getByText("Was messen?")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /^Verlauf:/ })).toBeNull();
    expect(screen.queryByRole("list", { name: "Messungen und Fotos" })).toBeNull();
  });

  it("US-QS-15 · US-WAC-01 Kurve shows the growth chart of the course", async () => {
    await showReady(course);
    await userEvent.click(screen.getByRole("button", { name: "Kurve" }));
    expect(pressed("Kurve")).toBe(true);
    expect(screen.getByRole("img", { name: /^Verlauf: 3 Messungen/ })).toBeTruthy();
    expect(screen.queryByText("Was messen?")).toBeNull();
  });

  it("US-QS-15 · US-WAC-01 Kurve gives an honest hint, not an empty chart, with one measurement", async () => {
    await showReady([course[0] as MeasurementRow]);
    await userEvent.click(screen.getByRole("button", { name: "Kurve" }));
    expect(screen.getByText(/Ab der 2\. Messung/)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /^Verlauf:/ })).toBeNull();
  });

  it("US-QS-15 · US-WAC-01 Messungen lists the entries newest first, paged and marked for the free height", async () => {
    await showReady(course, "/collection?sheet=verlauf-e1&teil=messungen");
    const list = screen.getByRole("list", { name: "Messungen und Fotos" });
    expect(list.hasAttribute("data-page-fit")).toBe(true);
    const first = within(list).getAllByRole("heading", { level: 3 })[0];
    expect(first?.textContent).toMatch(/^30\scm/);
    expect(screen.getByText("Seite 1 von 3")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(screen.getByText("Seite 2 von 3")).toBeTruthy();
    const second = within(list).getAllByRole("heading", { level: 3 })[0];
    expect(second?.textContent).toMatch(/^20\scm/);
  });

  it("US-QS-15 · US-WAC-01 an unknown or absent part shows Überblick", async () => {
    await showReady(course, "/collection?sheet=verlauf-e1&teil=unbekannt");
    expect(pressed("Überblick")).toBe(true);
    expect(screen.getByText("Was messen?")).toBeTruthy();
  });

  it("US-QS-15 · US-WAC-01 the chosen part is in the address and keeps the layer open", async () => {
    await showReady(course);
    await userEvent.click(screen.getByRole("button", { name: "Messungen" }));
    const address = screen.getByTestId("address").textContent ?? "";
    expect(address).toContain("teil=messungen");
    expect(address).toContain("sheet=verlauf-e1");
  });

  it("US-QS-15 · US-WAC-01 a reload with teil=kurve opens Kurve", async () => {
    await showReady(course, "/collection?sheet=verlauf-e1&teil=kurve");
    expect(pressed("Kurve")).toBe(true);
    expect(screen.getByRole("img", { name: /^Verlauf: 3 Messungen/ })).toBeTruthy();
  });

  it("US-QS-15 · US-WAC-01 an entry with a photo shows the compact picture, so one entry fits a phone", async () => {
    // A photo that never arrives shows the skeleton of its size.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
    await showReady(
      [row("a", "2026-01-01", 10, { photo: "p.webp" })],
      "/collection?sheet=verlauf-e1&teil=messungen",
    );
    await waitFor(() => expect(document.querySelector('[role="status"] .h-20')).not.toBeNull());
    expect(document.querySelector('[role="status"] .h-40')).toBeNull();
  });

  it("US-QS-15 · US-WAC-01 an empty course shows the facts and one empty state, no parts", async () => {
    await showReady([]);
    expect(screen.getByText("Was messen?")).toBeTruthy();
    expect(screen.getAllByText("Noch keine Messung")).toHaveLength(1);
    expect(screen.queryByRole("group", { name: "Teile des Verlaufs" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Messwert eintragen" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
