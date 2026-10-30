// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
