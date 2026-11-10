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
    const expectOnlyTheInput = (container: HTMLElement, text: string, inputs: number) => {
      // The native input is the one focusable control: no decoy button sits outside the Tab order.
      expect(container.querySelector("button")).toBeNull();
      const focusable = container.querySelectorAll(
        "a[href], button, input, select, textarea, [tabindex]",
      );
      expect(focusable).toHaveLength(inputs);
      for (const control of focusable) expect(control.tagName).toBe("INPUT");
      // The visible label names the picker and is hidden from assistive technology (the input carries the name).
      const label = within(container).getByText(text);
      expect(label.closest('[aria-hidden="true"]')).toBe(label);
    };
    const photo = render(<FileField id="photo" accept="image/jpeg,image/png" />);
    expectOnlyTheInput(photo.container, "Foto wählen", 2);
    const file = render(<FileField id="file" accept=".csv,text/csv" />);
    expectOnlyTheInput(file.container, "Datei wählen", 1);
  });

  it("US-QS-12 the file picker input has a boundary and its label carries the focus in forced colors (issue 1730)", () => {
    const { container } = render(<FileField id="photo" accept="image/jpeg,image/png" />);
    // The input lies over the label: it has the label's border, so a control without a border is never reported.
    const input = container.querySelector("input#photo");
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

  it("US-QS-07 a photo field offers the camera with a second button on touch devices (issue 1820)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <FileField id="p" accept="image/jpeg,image/png" onChange={onChange} />,
    );
    const camera = screen.getByLabelText("Foto aufnehmen") as HTMLInputElement;
    expect(camera.type).toBe("file");
    expect(camera.getAttribute("capture")).toBe("environment");
    expect(camera.accept).toBe("image/jpeg,image/png");
    // The picker for an existing photo stays and asks for no camera.
    const picker = container.querySelector("input#p") as HTMLInputElement;
    expect(picker.hasAttribute("capture")).toBe(false);
    // Touch devices only: with a fine pointer the browser opens the same file dialog for both.
    const box = camera.parentElement as HTMLElement;
    expect(box.classList).toContain("hidden");
    expect(box.classList).toContain("pointer-coarse:inline-flex");
    // A photo taken reaches the same handler and is named like a chosen one.
    const shot = new File(["x"], "IMG_0001.jpg", { type: "image/jpeg" });
    fireEvent.change(camera, { target: { files: [shot] } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByText("IMG_0001.jpg")).toBeTruthy();
  });

  it("US-QS-07 a field for other files has no camera button", () => {
    render(<FileField id="f" accept=".csv,text/csv" />);
    expect(screen.queryByLabelText("Foto aufnehmen")).toBeNull();
    expect(screen.queryByText("Foto aufnehmen")).toBeNull();
  });
});
