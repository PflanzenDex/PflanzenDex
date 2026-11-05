// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { localMonth, MonthField, monthText } from "./month-field";

afterEach(cleanup);

describe("MonthField (US-QS-24)", () => {
  it("US-QS-24 offers German month names, newest first, value YYYY-MM", () => {
    render(<MonthField aria-label="Monat" max="2026-10" value="2026-10" onChange={() => {}} />);
    const select = screen.getByLabelText("Monat") as HTMLSelectElement;
    expect(select.value).toBe("2026-10");
    expect(select.options[0]?.textContent).toBe("Oktober 2026");
    expect(select.options[1]?.textContent).toBe("September 2026");
    expect(select.options[10]?.textContent).toBe("Dezember 2025");
  });

  it("US-QS-24 keeps a value outside the range selectable; the month is the local one", () => {
    render(<MonthField aria-label="Monat" max="2026-10" value="2020-03" onChange={() => {}} />);
    expect((screen.getByLabelText("Monat") as HTMLSelectElement).value).toBe("2020-03");
    expect(monthText("2020-03")).toBe("März 2020");
    expect(localMonth(new Date(2026, 9, 31, 23, 59))).toBe("2026-10");
  });
});
