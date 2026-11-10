// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { CollectorRank, ProgressRow } from "./collector-rank";

afterEach(cleanup);

describe("US-POK-10 collector rank and progress", () => {
  it("US-POK-10 shows rank, caught count, progress bar and the species missing until the next rank", () => {
    render(<CollectorRank caught={12} />);
    expect(screen.getByText("Setzling")).toBeTruthy();
    expect(screen.getByText("12 / unbekannt Arten gefangen")).toBeTruthy();
    expect(screen.getByText("Noch 3 bis „Jungpflanze“")).toBeTruthy();
    const bar = screen.getByRole("progressbar", { name: "Fortschritt bis Jungpflanze" });
    expect(bar.getAttribute("aria-valuenow")).toBe("70");
  });

  it("US-POK-10 without a tree it says the totals and orders are unknown and why (P-08, P-10)", () => {
    render(<CollectorRank caught={0} />);
    expect(screen.getByText("Keimling")).toBeTruthy();
    expect(screen.getByText(/Ordnungen: unbekannt/)).toBeTruthy();
    expect(screen.getByText(/Baum der Arten ist noch nicht aufgebaut/)).toBeTruthy();
  });

  it("US-POK-10 with a tree it shows N / M (P %) and k of K orders", () => {
    render(
      <CollectorRank
        caught={30}
        tree={{ speciesTotal: 600, speciesCaught: 30, orderTotal: 42, ordersDiscovered: 7 }}
      />,
    );
    expect(screen.getByText("30 / 600 Arten gefangen (5 %)")).toBeTruthy();
    expect(screen.getByText("7 von 42 Ordnungen entdeckt")).toBeTruthy();
    expect(screen.queryByText(/noch nicht aufgebaut/)).toBeNull();
    expect(screen.queryByText(/zählt noch nicht, weil/)).toBeNull();
  });

  it("US-POK-10 a caught species outside the tree is named as not counted yet, and N and P count the tree only (owner decision 2026-11-07)", () => {
    render(
      <CollectorRank
        caught={6}
        tree={{ speciesTotal: 4, speciesCaught: 4, orderTotal: 2, ordersDiscovered: 2 }}
      />,
    );
    expect(screen.getByText("4 / 4 Arten gefangen (100 %)")).toBeTruthy();
    expect(
      screen.getByText(
        "2 gefangene Arten zählen noch nicht, weil sie nicht im Baum der Arten stehen.",
      ),
    ).toBeTruthy();
  });

  it("US-POK-10 one caught species outside the tree is named in the singular", () => {
    render(
      <CollectorRank
        caught={3}
        tree={{ speciesTotal: 4, speciesCaught: 2, orderTotal: 2, ordersDiscovered: 2 }}
      />,
    );
    expect(screen.getByText("2 / 4 Arten gefangen (50 %)")).toBeTruthy();
    expect(
      screen.getByText("1 gefangene Art zählt noch nicht, weil sie nicht im Baum der Arten steht."),
    ).toBeTruthy();
  });

  it("US-POK-10 the top rank has no next rank", () => {
    render(<CollectorRank caught={100} />);
    expect(screen.getByText("Botaniker")).toBeTruthy();
    expect(screen.getByText("Höchster Rang erreicht")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});

describe("US-POK-10 the progress row reads as a button (issue 1045)", () => {
  it("US-POK-10 the row is an outline button that opens the layer, not a grey pill", () => {
    render(
      <MemoryRouter>
        <ProgressRow caught={3} uncounted={0} />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: /gefangen/ });
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.className).toContain("text-primary");
    expect(button.className).not.toContain("border-border");
  });
});
