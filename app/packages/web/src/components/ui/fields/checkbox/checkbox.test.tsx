// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

afterEach(cleanup);

describe("Checkbox (US-QS-07, DS-15, DS-38)", () => {
  it("US-QS-07 · DS-15 the label text names the checkbox and clicking it toggles", async () => {
    const onChange = vi.fn();
    render(<Checkbox onChange={onChange}>Erinnerung senden</Checkbox>);
    const box = screen.getByRole("checkbox", { name: "Erinnerung senden" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await userEvent.click(screen.getByText("Erinnerung senden"));
    expect(box.checked).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("US-QS-07 · DS-15 the whole row is the 44 px target", () => {
    render(<Checkbox>Erinnerung senden</Checkbox>);
    const row = screen.getByText("Erinnerung senden").closest("label");
    expect(row?.className).toContain("min-h-[44px]");
  });

  it("US-QS-07 · DS-36 forwards the ref to the input and merges caller classes last", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Checkbox ref={ref} className="size-6">
        Eins
      </Checkbox>,
    );
    expect(ref.current).toBe(screen.getByRole("checkbox"));
    expect(ref.current?.className).toContain("size-6");
    expect(ref.current?.className).not.toContain("size-5");
  });

  it("US-QS-07 · DS-38 an invalid checkbox is exposed with aria-invalid and its error text", () => {
    render(
      <>
        <Checkbox invalid aria-describedby="e">
          Bedingungen
        </Checkbox>
        <p id="e">Bitte zustimmen.</p>
      </>,
    );
    const box = screen.getByRole("checkbox", { name: "Bedingungen" });
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(box.getAttribute("aria-describedby")).toBe("e");
  });

  it("US-QS-07 · DS-39 a disabled checkbox cannot be toggled", async () => {
    const onChange = vi.fn();
    render(
      <Checkbox disabled onChange={onChange}>
        Gesperrt
      </Checkbox>,
    );
    await userEvent.click(screen.getByText("Gesperrt"));
    expect(onChange).not.toHaveBeenCalled();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  });

  it("US-QS-07 · DS-37 shows the focus ring on the box", () => {
    render(<Checkbox>Eins</Checkbox>);
    expect(screen.getByRole("checkbox").className).toContain("focus-visible:ring-2");
  });
});
