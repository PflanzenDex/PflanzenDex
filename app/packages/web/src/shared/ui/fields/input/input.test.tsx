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

  it("FR-BES-04 · DS-51 a date field names its format for browsers that show a plain text field instead (#306)", () => {
    render(<Input aria-label="Fangdatum" type="date" />);
    const el = screen.getByLabelText("Fangdatum");
    expect(el.getAttribute("placeholder")).toBe("JJJJ-MM-TT");
    expect(el.getAttribute("pattern")).toBe("\\d{4}-\\d{2}-\\d{2}");
  });

  it("FR-BES-04 a text field gets no date hint, and a caller's own placeholder wins", () => {
    render(
      <>
        <Input aria-label="Name" />
        <Input aria-label="Tag" type="date" placeholder="z. B. 2026-03-09" />
      </>,
    );
    expect(screen.getByLabelText("Name").hasAttribute("placeholder")).toBe(false);
    expect(screen.getByLabelText("Tag").getAttribute("placeholder")).toBe("z. B. 2026-03-09");
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

  it("US-QS-32 · SG-FORM-01 a suffix shows the unit at the right edge of the field and keeps the caller's description", () => {
    render(
      <>
        <Input aria-label="Durchmesser" suffix="cm" aria-describedby="hint" />
        <p id="hint">Ganze Zahl.</p>
      </>,
    );
    const el = screen.getByLabelText("Durchmesser");
    const suffix = screen.getByText("cm");
    expect(el.parentElement?.contains(suffix)).toBe(true);
    expect(suffix.className).toContain("end-0");
    const described = el.getAttribute("aria-describedby")?.split(" ") ?? [];
    expect(described).toEqual(["hint", suffix.id]);
    // The unit's room is a CSS variable that the class reads (DS-32); the class falls back to the normal padding.
    expect(el.getAttribute("style")).toContain("--unit-room");
    expect(el.className).toContain("pe-[var(--unit-room,0.75rem)]");
  });

  it("US-QS-32 · SG-FORM-01 without a suffix the field renders as before, no wrapper and no reserved room", () => {
    render(<Input aria-label="Name" />);
    const el = screen.getByLabelText("Name");
    expect(el.parentElement?.tagName).not.toBe("SPAN");
    expect(el.getAttribute("style")).toBeNull();
  });

  it("US-QS-32 · SG-FORM-01 a short unit reserves less room at the end of the field than a long one", () => {
    render(
      <>
        <Input aria-label="Leistung" suffix="W" />
        <Input aria-label="Ausbeute" suffix="µmol/m²/s" />
      </>,
    );
    const room = (label: string) =>
      Number(
        /calc\(([\d.]+)ch/.exec(screen.getByLabelText(label).getAttribute("style") ?? "")?.[1],
      );
    expect(room("Leistung")).toBeGreaterThan(0);
    expect(room("Leistung")).toBeLessThan(room("Ausbeute"));
  });

  it("US-QS-14 · Greenhouse look: control radius on the card surface", () => {
    render(<Input aria-label="Name" />);
    const cls = screen.getByLabelText("Name").className;
    expect(cls).toContain("rounded-control");
    expect(cls).toContain("bg-card");
  });
});
