// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Select } from "./select";

afterEach(cleanup);

const options = (
  <>
    <option value="">Bitte wählen</option>
    <option value="1">Zone 1</option>
    <option value="2">Zone 2</option>
  </>
);

describe("Select (US-QS-07, ADR 0007, DS-15, DS-38)", () => {
  it("US-QS-07 · ADR 0007 is a native select with its options and a name", () => {
    render(<Select aria-label="Lichtzone">{options}</Select>);
    expect(screen.getByRole("combobox", { name: "Lichtzone" })).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("US-QS-07 · ADR 0007 reports the chosen value to the caller", async () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Lichtzone" onChange={onChange}>
        {options}
      </Select>,
    );
    await userEvent.selectOptions(screen.getByLabelText("Lichtzone"), "2");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText("Lichtzone") as HTMLSelectElement).value).toBe("2");
    fireEvent.change(screen.getByLabelText("Lichtzone"), { target: { value: "1" } });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("US-QS-07 · DS-36 forwards the ref and merges caller classes last", () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="Lichtzone" className="h-20">
        {options}
      </Select>,
    );
    expect(ref.current).toBe(screen.getByLabelText("Lichtzone"));
    expect(ref.current?.className).toContain("h-20");
  });

  it("US-QS-07 · DS-38 an invalid select is exposed with aria-invalid and its error text", () => {
    render(
      <>
        <Select aria-label="Lichtzone" invalid aria-describedby="e">
          {options}
        </Select>
        <p id="e">Bitte wählen.</p>
      </>,
    );
    const el = screen.getByLabelText("Lichtzone");
    expect(el.getAttribute("aria-invalid")).toBe("true");
    expect(el.getAttribute("aria-describedby")).toBe("e");
  });

  it("US-QS-07 · DS-39 a disabled select cannot be changed", () => {
    render(
      <Select aria-label="Lichtzone" disabled>
        {options}
      </Select>,
    );
    expect((screen.getByLabelText("Lichtzone") as HTMLSelectElement).disabled).toBe(true);
  });

  it("US-QS-07 · DS-15 keeps a 44 px hit area, 16 px text on phone and the focus ring", () => {
    render(<Select aria-label="Lichtzone">{options}</Select>);
    const cls = screen.getByLabelText("Lichtzone").className;
    expect(cls).toContain("min-h-[44px]");
    expect(cls).toContain("text-base");
    expect(cls).toContain("focus-visible:ring-2");
  });
});
