// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { CaughtSpecies, MilestoneTree } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { Milestones } from "./milestones";

afterEach(cleanup);

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
    render(<Milestones caught={[]} />);
    expect(screen.getByText(/Meilensteine brauchen den Baum der Arten/)).toBeTruthy();
  });

  it("US-POK-11 an open milestone shows the remainder, a bar and up to 3 missing species in German and Latin", () => {
    render(<Milestones caught={[caught("A a", "2026-01-02")]} tree={tree} />);
    expect(screen.getByText("Kakteen: Vollständig")).toBeTruthy();
    expect(screen.getByText("Noch 3: A b de (A b), A c de (A c), A d de (A d)")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Fortschritt Kakteen: Vollständig" });
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
  });

  it("US-POK-11 reached milestones are collapsed with their date, or no date when it is unknown", () => {
    render(
      <Milestones
        caught={[caught("A a", "2026-01-02"), caught("A b", "2026-02-03")]}
        tree={tree}
      />,
    );
    expect(screen.getByText("2 Meilensteine erreicht")).toBeTruthy();
    expect(screen.getByText("Kakteen: Entdeckt (2026-01-02)")).toBeTruthy();
    expect(screen.getByText("Kakteen: Kenner (2026-02-03)")).toBeTruthy();
  });
});
