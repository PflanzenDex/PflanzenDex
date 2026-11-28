// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WateringDueRow } from "../../../api/reminders-api";
import { Rows } from "./due-rows";

afterEach(cleanup);

const row: WateringDueRow = {
  specimenId: "s1",
  name: "Echte Aloe – Zweiter Ableger",
  intervalDays: 42,
  lastWateredOn: null,
  daysSince: 0,
};

const classesOf = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(" ");

const show = () =>
  render(
    <MemoryRouter>
      <Rows
        rows={[row]}
        held={new Map()}
        busy={false}
        water={vi.fn()}
        undoPlant={vi.fn()}
        bulk={null}
      />
    </MemoryRouter>,
  );

// US-QS-15 (issue 1903, SG-TYPE-04, SG-TYPE-05): at 200 % text a due row keeps its name readable. The text column has a basis in
// rem (it grows with the text size), so "Gegossen" moves below the name when both do not fit one line, instead of squeezing
// the name to one letter per line. A basis of 0 (`flex-1`) kept the button on the first line in every width.
describe("US-QS-15 a due watering row keeps its name beside the mark at 200 % text (issue 1903)", () => {
  it("US-QS-15 the text column of the row grows from a rem basis, not from 0, so the button wraps below it", () => {
    show();
    const label = screen.getByRole("checkbox", { name: /Echte Aloe/ }).closest("label");
    expect(classesOf(label)).toEqual(expect.arrayContaining(["min-w-0", "grow", "basis-36"]));
    expect(classesOf(label)).not.toContain("flex-1");
    expect(classesOf(label?.parentElement)).toContain("flex-wrap");
  });

  it("US-QS-15 the name breaks at a syllable with a hyphen when one word is wider than the column", () => {
    show();
    const name = screen.getByText(row.name);
    expect(classesOf(name)).toEqual(expect.arrayContaining(["break-words", "hyphens-auto"]));
  });

  it("US-QS-15 the button 'Gegossen' keeps its size at the trailing edge of its own line when the row wraps", () => {
    show();
    const button = screen.getByRole("button", { name: `${row.name} als gegossen eintragen` });
    expect(classesOf(button)).toEqual(
      expect.arrayContaining(["shrink-0", "ml-auto", "max-w-full"]),
    );
  });
});
