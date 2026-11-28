// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { TreatmentListRow } from "@pflanzendex/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { plain } from "@/shared/testing/plain-text";
import { setViewportWidth } from "@/shared/testing/viewport-mock";
import { filledIn, hasOwnBorder, isTinted } from "@/shared/ui/button.roles";
import { Row } from "./treatment-row";

afterEach(cleanup);

const row: TreatmentListRow = {
  id: "t1",
  specimenId: "s1",
  specimenName: "Birkenfeige",
  reason: "Wollläuse",
  agent: "Neemöl",
  dueAt: "2026-11-17",
  status: { kind: "overdue", days: 3, text: "3 Tage überfällig" },
};

const classesOf = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(" ");

describe("US-QS-32 a treatment row wraps its action beside the name (issue 2322, SG-LIST-03)", () => {
  it("US-QS-32 the row may wrap, and its text column keeps 9 rem beside Abhaken (rem, so it grows with the text)", () => {
    render(<Row row={row} running={false} onDone={vi.fn()} host={false} />);
    const root = screen.getByRole("heading", { name: "Birkenfeige" }).closest(".rounded-card");
    expect(classesOf(root)).toContain("flex-wrap");
    const text = screen.getByRole("heading", { name: "Birkenfeige" }).parentElement;
    expect(classesOf(text)).toEqual(expect.arrayContaining(["min-w-0", "basis-36"]));
  });

  it("US-QS-32 Abhaken is a shrink-0 action at the trailing edge of its own line when the row wraps", () => {
    render(<Row row={row} running={false} onDone={vi.fn()} host={false} />);
    const abhaken = screen.getByRole("button", { name: /als erledigt abhaken/ });
    expect(classesOf(abhaken)).toEqual(
      expect.arrayContaining(["shrink-0", "ml-auto", "max-w-full"]),
    );
  });

  it("US-QS-32 the held row keeps its name beside 'Erledigt · Rückgängig', and the undo row is a shrink-0 action box", () => {
    render(
      <Row
        row={row}
        running={false}
        onDone={vi.fn()}
        host={false}
        held={{
          result: "Erledigt",
          subject: "Wollläuse bei Birkenfeige",
          busy: false,
          onUndo: vi.fn(),
        }}
      />,
    );
    const root = screen.getByRole("heading", { name: "Birkenfeige" }).closest(".rounded-card");
    expect(classesOf(root)).toContain("flex-wrap");
    const text = screen.getByRole("heading", { name: "Birkenfeige" }).parentElement;
    expect(classesOf(text)).toEqual(expect.arrayContaining(["min-w-0", "basis-36"]));
    const undoBox = screen.getByText("Erledigt").closest("p")?.parentElement;
    expect(classesOf(undoBox)).toEqual(
      expect.arrayContaining(["shrink-0", "ml-auto", "max-w-full"]),
    );
    expect(screen.getByRole("button", { name: /Rückgängig/ })).toBeTruthy();
  });
});

describe("US-QS-32 · SG-BTN-02 a treatment row acts in place with one tinted button (FX-39 sweep 3)", () => {
  it("US-QS-32 · SG-BTN-02 'Abhaken' is the one tinted button of the row, without a border, and the row has no filled button", () => {
    const { container } = render(<Row row={row} running={false} onDone={vi.fn()} host={false} />);
    const tick = screen.getByRole("button", { name: /als erledigt abhaken/ });
    expect(isTinted(tick)).toBe(true);
    expect(hasOwnBorder(tick)).toBe(false);
    expect(filledIn(container)).toEqual([]);
  });
});

describe("US-QS-15 SG-TYPE-05 the line 'reason · agent' of a treatment row breaks only between its parts (issue 2640)", () => {
  const metaOf = (r: TreatmentListRow) => {
    setViewportWidth(360);
    render(<Row row={r} running={false} onDone={vi.fn()} host={false} />);
    return screen.getByRole("heading", { name: r.specimenName }).nextElementSibling as HTMLElement;
  };
  const partsOf = (line: HTMLElement) =>
    Array.from(line.querySelectorAll<HTMLElement>("[data-meta-part]"));

  it("US-QS-15 at 360 px the reason and the agent are one part each, and the text of the line is the same", () => {
    const line = metaOf(row);
    expect(partsOf(line).map((p) => plain(p.textContent))).toEqual(["Wollläuse ·", "Neemöl"]);
    expect(plain(line.textContent)).toBe("Wollläuse · Neemöl");
    expect(classesOf(line)).toEqual(
      expect.arrayContaining(["text-label", "text-muted-foreground"]),
    );
  });

  it("US-QS-15 a treatment without an agent reads 'kein Mittel' as its own part", () => {
    const line = metaOf({ ...row, agent: null });
    expect(partsOf(line).map((p) => plain(p.textContent))).toEqual(["Wollläuse ·", "kein Mittel"]);
    expect(plain(line.textContent)).toBe("Wollläuse · kein Mittel");
  });
});
