// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Input } from "./input";

afterEach(cleanup);

describe("Input (US-QS-07, DS-15, DS-19, DS-38)", () => {
  it("US-QS-07 · DS-19 passes type, inputmode and autocomplete through", () => {
    render(<Input aria-label="Menge" type="text" inputMode="decimal" autoComplete="off" />);
    const el = screen.getByRole("textbox", { name: "Menge" });
    expect(el.getAttribute("inputmode")).toBe("decimal");
    expect(el.getAttribute("autocomplete")).toBe("off");
  });

  it("US-QS-07 · DS-51 keeps a date as the YYYY-MM-DD string it was given", () => {
    const onChange = vi.fn();
    render(<Input aria-label="Gefangen am" type="date" value="2026-03-09" onChange={onChange} />);
    const el = screen.getByLabelText("Gefangen am") as HTMLInputElement;
    expect(el.value).toBe("2026-03-09");
    fireEvent.change(el, { target: { value: "2026-12-31" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 · DS-36 forwards the ref and merges caller classes last", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Name" className="min-h-16" />);
    expect(ref.current).toBe(screen.getByLabelText("Name"));
    expect(ref.current?.className).toContain("min-h-16");
    expect(ref.current?.className).not.toContain("min-h-[44px]");
  });

  it("US-QS-07 · DS-38 an invalid field is exposed with aria-invalid and its error text", () => {
    render(
      <>
        <Input aria-label="Name" invalid aria-describedby="e" />
        <p id="e">Bitte einen Namen eingeben.</p>
      </>,
    );
    const el = screen.getByRole("textbox", { name: "Name" });
    expect(el.getAttribute("aria-invalid")).toBe("true");
    expect(el.getAttribute("aria-describedby")).toBe("e");
    expect(screen.getByText("Bitte einen Namen eingeben.")).toBeTruthy();
  });

  it("US-QS-07 · DS-39 a disabled field cannot be edited", () => {
    render(<Input aria-label="Name" disabled />);
    expect((screen.getByLabelText("Name") as HTMLInputElement).disabled).toBe(true);
  });

  it("US-QS-07 · DS-15 keeps a 44 px hit area, 16 px text on phone and the focus ring", () => {
    render(<Input aria-label="Name" />);
    const cls = screen.getByLabelText("Name").className;
    expect(cls).toContain("min-h-[44px]");
    expect(cls).toContain("text-base");
    expect(cls).toContain("focus-visible:ring-2");
  });
});
