// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

afterEach(cleanup);

describe("Textarea (US-QS-07, DS-15, DS-38)", () => {
  it("US-QS-07 · DS-19 passes native props through and forwards the ref", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="Notiz" rows={5} maxLength={200} autoComplete="off" />);
    const el = screen.getByRole("textbox", { name: "Notiz" }) as HTMLTextAreaElement;
    expect(ref.current).toBe(el);
    expect(el.rows).toBe(5);
    expect(el.maxLength).toBe(200);
  });

  it("US-QS-07 · DS-36 merges caller classes last", () => {
    render(<Textarea aria-label="Notiz" className="min-h-40" />);
    const cls = screen.getByLabelText("Notiz").className;
    expect(cls).toContain("min-h-40");
    expect(cls).not.toContain("min-h-[88px]");
  });

  it("US-QS-07 · DS-38 an invalid field is exposed with aria-invalid and its error text", () => {
    render(
      <>
        <Textarea aria-label="Notiz" invalid aria-describedby="e" />
        <p id="e">Zu lang.</p>
      </>,
    );
    const el = screen.getByLabelText("Notiz");
    expect(el.getAttribute("aria-invalid")).toBe("true");
    expect(el.getAttribute("aria-describedby")).toBe("e");
  });

  it("US-QS-07 · DS-39 a disabled field cannot be edited", () => {
    render(<Textarea aria-label="Notiz" disabled />);
    expect((screen.getByLabelText("Notiz") as HTMLTextAreaElement).disabled).toBe(true);
  });

  it("US-QS-07 · DS-15 keeps 16 px text on phone and the focus ring", () => {
    render(<Textarea aria-label="Notiz" />);
    const cls = screen.getByLabelText("Notiz").className;
    expect(cls).toContain("text-base");
    expect(cls).toContain("focus-visible:ring-2");
  });
});
