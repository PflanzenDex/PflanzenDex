// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Label } from "./label";

afterEach(cleanup);

describe("Label (US-QS-07, DS-36)", () => {
  it("US-QS-07 · DS-36 names the input it belongs to", () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <input id="name" />
      </>,
    );
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("US-QS-07 · DS-36 forwards the ref and merges caller classes last", () => {
    const ref = createRef<HTMLLabelElement>();
    render(
      <Label ref={ref} htmlFor="x" className="text-lg">
        Größe
      </Label>,
    );
    expect(ref.current).toBe(screen.getByText("Größe"));
    expect(ref.current?.className).toContain("text-lg");
    expect(ref.current?.className).not.toContain("text-sm");
  });

  it("US-QS-07 · DS-38 a required label marks the field in text and hides the asterisk from screen readers", () => {
    render(
      <>
        <Label htmlFor="r" required>
          Art
        </Label>
        <input id="r" required />
      </>,
    );
    expect((screen.getByLabelText(/^Art/) as HTMLInputElement).required).toBe(true);
    expect(screen.getByText("*").getAttribute("aria-hidden")).toBe("true");
  });

  it("US-QS-07 · DS-39 dims itself next to a disabled control", () => {
    render(<Label htmlFor="d">Gesperrt</Label>);
    expect(screen.getByText("Gesperrt").className).toContain("peer-disabled:opacity-50");
  });
});
