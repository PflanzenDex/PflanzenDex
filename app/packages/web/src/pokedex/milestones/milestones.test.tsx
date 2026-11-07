// @vitest-environment jsdom
import type { ReactElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CaughtSpecies, MilestoneTree } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { Milestones } from "./milestones";

afterEach(cleanup);

/** Renders in a router, because the open milestones are paged by the address (US-QS-22). */
const view = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

const group = (name: string, german: string | null, species: string[]) => ({
  name,
  german,
  species: species.map((s) => ({ latin: s, german: `${s} de` })),
});
const tree: MilestoneTree = {
  families: [group("Cactaceae", "Kakteen", ["A a", "A b", "A c", "A d"])],
  genera: [],
  orders: [],
};
const caught = (species: string, date: string | null) =>
  ({ species, caughtDate: { date, source: date ? "caught_at" : "unknown" } }) as CaughtSpecies;

describe("US-POK-11 milestones with an instruction for action", () => {
  it("US-POK-11 without a tree it says why there are no milestones (P-08, P-10)", () => {
    view(<Milestones caught={[]} />);
    expect(screen.getByText(/Meilensteine brauchen den Baum der Arten/)).toBeTruthy();
  });

  it("US-POK-11 an open milestone shows the remainder, a bar and up to 3 missing species in German and Latin", () => {
    view(<Milestones caught={[caught("A a", "2026-01-02")]} tree={tree} />);
    expect(screen.getByText("Kakteen: Vollständig")).toBeTruthy();
    expect(screen.getByText("Noch 3: A b de (A b), A c de (A c), A d de (A d)")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Fortschritt Kakteen: Vollständig" });
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
  });

  it("US-POK-11 reached milestones are collapsed with their date, or no date when it is unknown", () => {
    view(
      <Milestones
        caught={[caught("A a", "2026-01-02"), caught("A b", "2026-02-03")]}
        tree={tree}
      />,
    );
    expect(screen.getByText("2 Meilensteine erreicht")).toBeTruthy();
    expect(screen.getByText("Kakteen: Entdeckt (2026-01-02)")).toBeTruthy();
    expect(screen.getByText("Kakteen: Kenner (2026-02-03)")).toBeTruthy();
  });

  it("US-POK-11 the open milestones come two per page, so the layer fits one screen (DS-58, starting value)", async () => {
    view(<Milestones caught={[]} tree={tree} />);
    expect(screen.getByText("Seite 1 von 2")).toBeTruthy();
    expect(screen.getByText("Kakteen: Entdeckt")).toBeTruthy();
    expect(screen.getByText("Kakteen: Kenner")).toBeTruthy();
    expect(screen.queryByText("Kakteen: Vollständig")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByText("Kakteen: Vollständig")).toBeTruthy();
    expect(screen.queryByText("Kakteen: Entdeckt")).toBeNull();
  });

  it("US-POK-11 without open milestones the section says so instead of an empty list (P-09)", () => {
    const solo: MilestoneTree = {
      families: [group("Solo", null, ["S s"])],
      genera: [],
      orders: [],
    };
    view(<Milestones caught={[caught("S s", "2026-03-04")]} tree={solo} />);
    const section = screen.getByRole("region", { name: "Meilensteine" });
    expect(within(section).getByText("Keine offenen Meilensteine.")).toBeTruthy();
    expect(within(section).getByText("1 Meilenstein erreicht")).toBeTruthy();
  });
});
