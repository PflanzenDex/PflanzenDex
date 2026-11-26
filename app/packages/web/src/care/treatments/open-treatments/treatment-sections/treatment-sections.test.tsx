// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { TreatmentListRow } from "@pflanzendex/core";
import { afterEach, describe, expect, it } from "vitest";
import { sectionsOf, TreatmentSections } from "./treatment-sections";

afterEach(cleanup);

type Kind = TreatmentListRow["status"]["kind"];

/** An open treatment in the state `kind`, due `days` days from the local day (negative: overdue). */
const row = (id: string, kind: Kind, days: number, text: string): TreatmentListRow =>
  ({
    id,
    specimenId: `s-${id}`,
    specimenName: `Pflanze ${id}`,
    reason: "Läuse",
    agent: null,
    dueAt: "2026-10-03",
    status: { kind, days: Math.abs(days), text },
  }) as TreatmentListRow;

const ROWS = [
  row("a", "overdue", -3, "überfällig seit 3 Tagen"),
  row("b", "overdue", -1, "überfällig seit 1 Tag"),
  row("c", "today", 0, "heute fällig"),
  row("d", "soon", 2, "in 2 Tagen"),
  row("e", "later", 9, "12.10.2026"),
];

describe("US-QS-15 · SG-LIST-10 the due items are grouped under Überfällig, Heute and Später", () => {
  it("US-QS-15 · SG-LIST-10 the sections come in this order, and 'in 2 Tagen' and later dates stand under Später", () => {
    const groups = sectionsOf(ROWS);
    expect(groups.map((g) => [g.key, g.label, g.items.map((r) => r.id)])).toEqual([
      ["overdue", "Überfällig", ["a", "b"]],
      ["today", "Heute", ["c"]],
      ["later", "Später", ["d", "e"]],
    ]);
  });

  it("US-QS-15 · SG-LIST-10 each section keeps the order of the server: the longest overdue first", () => {
    expect(sectionsOf(ROWS)[0]?.items.map((r) => r.status.text)).toEqual([
      "überfällig seit 3 Tagen",
      "überfällig seit 1 Tag",
    ]);
  });

  it("US-QS-15 · SG-LIST-10 a section without a row is not shown (an open set), and the count says what it holds", () => {
    const groups = sectionsOf([row("c", "today", 0, "heute fällig")]);
    expect(groups.map((g) => g.key)).toEqual(["today"]);
    expect(groups[0]?.countText).toBe("1 Termin");
    expect(sectionsOf([])).toEqual([]);
  });

  it("US-QS-15 · SG-LIST-08 every section is a heading with its count, and the list needs no chips for two or three sections", () => {
    render(
      <MemoryRouter>
        <TreatmentSections
          rows={ROWS}
          rowOf={(r) => <p>{`${r.specimenName}: ${r.status.text}`}</p>}
          level={3}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Überfällig · 2 Termine",
      "Heute · 1 Termin",
      "Später · 2 Termine",
    ]);
    const later = screen.getByRole("region", { name: /^Später/ });
    expect(within(later).getAllByRole("listitem")).toHaveLength(2);
    expect(within(later).getByText("Pflanze d: in 2 Tagen")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("group")).toBeNull();
  });
});
