// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { LeafLogView, LeafRow } from "@pflanzendex/core";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturesProvider } from "@/shared/data";
import { PlantCourse } from "./plant-course";

const json = (body: unknown) => Response.json(body, { status: 200 });
const TOKEN = async () => "tok";
const API = "http://api";
const GROUP = "Was der Verlauf zeigt";

const measurement = {
  id: "m1",
  specimenId: "e1",
  date: "2026-10-03",
  value: 12,
  quality: "healthy",
  note: "Neuer Trieb",
  ratedBy: "keeper",
  photo: null,
};
const leaf: LeafRow = {
  id: "00000000-0000-4000-8000-000000000003",
  specimenId: "e1",
  date: "2026-10-03",
  lengthMm: null,
  widthMm: null,
  note: null,
  createdAt: "2026-10-03T08:00:00.000000Z",
};
const leafView: LeafLogView = {
  specimenId: "e1",
  keeperOff: false,
  count: 1,
  comparison: null,
  leaves: [leaf],
};

/** Answers the two lists of the course; any other address is unknown (404). */
function stubApi(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (url) => {
      const path = new URL(String(url)).pathname;
      if (path === "/specimens/e1/measurements")
        return json({ specimenId: "e1", measurements: [measurement] });
      if (path === "/specimens/e1/leaves") return json(leafView);
      return Response.json({ error: { code: "specimen.not_found", text: "x" } }, { status: 404 });
    }),
  );
}

/** Shows the address, so a test can read the search parameter of the choice. */
function Address() {
  return <output aria-label="Adresse">{useLocation().search}</output>;
}

const show = (path: string, on = true) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <FeaturesProvider features={{ leaf_log: on }}>
        <PlantCourse api={API} token={TOKEN} specimenId="e1" />
      </FeaturesProvider>
      <Address />
    </MemoryRouter>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("US-WAC-07 the course of a plant: the switch Messungen | Blätter", () => {
  it("US-WAC-07 shows the measurements by default, and the switch names Messungen and Blätter", async () => {
    stubApi();
    show("/collection");
    expect(await screen.findByText("Neuer Trieb")).toBeTruthy();
    const group = screen.getByRole("group", { name: GROUP });
    expect(
      within(group).getByRole("button", { name: "Messungen" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(group).getByRole("button", { name: "Blätter" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(screen.queryByRole("heading", { name: "Neue Blätter" })).toBeNull();
  });

  it("US-WAC-07 choosing Blätter shows the leaf log and hides the measurements", async () => {
    stubApi();
    const user = userEvent.setup();
    show("/collection");
    await screen.findByText("Neuer Trieb");
    await user.click(screen.getByRole("button", { name: "Blätter" }));
    expect(await screen.findByRole("heading", { name: "Neue Blätter" })).toBeTruthy();
    expect(screen.queryByText("Neuer Trieb")).toBeNull();
    expect(screen.getByRole("button", { name: "Blätter" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("US-WAC-07 the focus stays on the switch after a change", async () => {
    stubApi();
    const user = userEvent.setup();
    show("/collection");
    await screen.findByText("Neuer Trieb");
    const leaves = screen.getByRole("button", { name: "Blätter" });
    await user.click(leaves);
    await screen.findByRole("heading", { name: "Neue Blätter" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Blätter" }));
  });

  it("US-WAC-07 the address keeps the choice: a click writes course=leaves, and such an address opens the leaves", async () => {
    stubApi();
    const user = userEvent.setup();
    const first = show("/collection");
    await screen.findByText("Neuer Trieb");
    await user.click(screen.getByRole("button", { name: "Blätter" }));
    await screen.findByRole("heading", { name: "Neue Blätter" });
    expect(screen.getByLabelText("Adresse").textContent).toContain("course=leaves");
    first.unmount();
    show("/collection?course=leaves");
    expect(await screen.findByRole("heading", { name: "Neue Blätter" })).toBeTruthy();
    expect(screen.queryByText("Neuer Trieb")).toBeNull();
  });

  it("US-WAC-07 with the keeper switch off there is no switch, and the measurements show as before", async () => {
    stubApi();
    show("/collection?course=leaves", false);
    expect(await screen.findByText("Neuer Trieb")).toBeTruthy();
    expect(screen.queryByRole("group", { name: GROUP })).toBeNull();
    expect(screen.queryByRole("button", { name: "Blätter" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Neue Blätter" })).toBeNull();
  });
});
