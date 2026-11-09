// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileField } from "./file-field";

afterEach(cleanup);

describe("FileField (US-QS-24)", () => {
  it("US-QS-24 shows a German button and no English native texts", () => {
    const onChange = vi.fn();
    render(<FileField id="p" accept="image/jpeg,image/png" onChange={onChange} />);
    expect(screen.getByText("Foto wählen")).toBeTruthy();
    expect(screen.getByText("Kein Foto gewählt")).toBeTruthy();
    const input = document.getElementById("p") as HTMLInputElement;
    expect(input.type).toBe("file");
    const file = new File(["x"], "monstera.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByText("monstera.jpg")).toBeTruthy();
  });

  it("US-QS-08 the file picker has no control outside the tab order (issue 1730)", () => {
    const expectOnlyTheInput = (container: HTMLElement, text: string) => {
      // The native input is the one focusable control: no decoy button sits outside the Tab order.
      expect(container.querySelector("button")).toBeNull();
      const focusable = container.querySelectorAll(
        "a[href], button, input, select, textarea, [tabindex]",
      );
      expect(focusable).toHaveLength(1);
      expect(focusable[0]?.tagName).toBe("INPUT");
      // The visible label names the picker and is hidden from assistive technology (the input carries the name).
      const label = within(container).getByText(text);
      expect(label.closest('[aria-hidden="true"]')).toBe(label);
    };
    const photo = render(<FileField id="photo" accept="image/jpeg,image/png" />);
    expectOnlyTheInput(photo.container, "Foto wählen");
    const file = render(<FileField id="file" accept=".csv,text/csv" />);
    expectOnlyTheInput(file.container, "Datei wählen");
  });

  it("US-QS-12 the file picker input has a boundary and its label carries the focus in forced colors (issue 1730)", () => {
    const { container } = render(<FileField id="photo" accept="image/jpeg,image/png" />);
    // The input lies over the label: it has the label's border, so a control without a border is never reported.
    const input = container.querySelector("input");
    expect(input?.classList).toContain("border");
    expect(input?.classList).toContain("border-input");
    expect(input?.classList).toContain("rounded-control");
    // Forced colors drop the ring (a box shadow), so the visible label draws a system-coloured outline on keyboard focus.
    const label = within(container).getByText("Foto wählen");
    for (const cls of [
      "forced-colors:peer-focus-visible:outline-2",
      "forced-colors:peer-focus-visible:outline-offset-2",
      "forced-colors:peer-focus-visible:outline-[color:Highlight]",
      "forced-colors:peer-focus-visible:outline-solid",
      "peer-focus-visible:ring-2",
    ]) {
      expect(label.classList).toContain(cls);
    }
  });
});
